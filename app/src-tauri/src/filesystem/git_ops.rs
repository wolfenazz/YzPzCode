//! Deeper git operations: per-file unified diff, commit, discard, log, branches.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use super::{git_repository_root, run_git_hidden};
use crate::types::{GitBranchInfo, GitCommitInfo, GitFileDiff, GitRemoteInfo};

/// Resolve a possibly-absolute file path to a repo-relative path (git arg).
fn rel_path(workspace_path: &str, file_path: &str) -> String {
    let file = Path::new(file_path);
    let rel = file.strip_prefix(workspace_path).unwrap_or(file);
    // Git always wants forward slashes, even on Windows.
    rel.to_string_lossy().replace('\\', "/")
}

/// Serialize app mutations for each working tree, including branch changes.
fn with_repository_lock<T>(
    workspace_path: &str,
    action: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    type RepositoryLocks = Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>;
    static LOCKS: OnceLock<RepositoryLocks> = OnceLock::new();
    let root = run_git_hidden(&["rev-parse", "--show-toplevel"], workspace_path)?;
    let root = std::fs::canonicalize(root.trim()).map_err(|e| e.to_string())?;
    let lock = LOCKS
        .get_or_init(Mutex::default)
        .lock()
        .map_err(|e| e.to_string())?
        .entry(root)
        .or_default()
        .clone();
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    action()
}

fn current_branch(workspace_path: &str) -> Result<String, String> {
    // symbolic-ref also works before the first commit, unlike rev-parse HEAD.
    run_git_hidden(
        &["symbolic-ref", "--quiet", "--short", "HEAD"],
        workspace_path,
    )
    .map(|branch| branch.trim().to_string())
    .map_err(|_| "Detached HEAD — switch to a branch before committing or syncing.".to_string())
}

fn require_branch(workspace_path: &str, expected_branch: &str) -> Result<String, String> {
    let current = current_branch(workspace_path)?;
    if current != expected_branch {
        return Err(format!("The branch changed from {expected_branch} to {current}. Refresh source control and try again."));
    }
    Ok(current)
}

fn file_argument(workspace_path: &str, file_path: &str) -> Result<String, String> {
    let rel = rel_path(workspace_path, file_path);
    if rel.is_empty()
        || Path::new(&rel)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("File must be inside the current workspace.".to_string());
    }
    Ok(format!(":(literal){rel}"))
}

/// Unified diff (working tree vs HEAD) plus both contents for a file.
/// Untracked files have no HEAD version, so the diff is the whole file.
pub fn git_file_diff(workspace_path: &str, file_path: &str) -> Result<GitFileDiff, String> {
    let repository = git_repository_root(workspace_path)?;
    let workspace_path = repository.as_str();
    let root = Path::new(workspace_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", workspace_path));
    }
    if !root.join(".git").exists() {
        return Err("Not a git repository".to_string());
    }

    let rel = rel_path(workspace_path, file_path);
    let full = root.join(&rel);

    let current = if full.exists() {
        std::fs::read_to_string(&full).map_err(|e| format!("Cannot read file: {e}"))?
    } else {
        String::new()
    };

    // If the file is untracked (not in HEAD, not staged), original is empty.
    let original = run_git_hidden(&["show", format!("HEAD:{rel}").as_str()], workspace_path)
        .unwrap_or_default();

    let pathspec = file_argument(workspace_path, file_path)?;
    let patch = match run_git_hidden(
        &["diff", "HEAD", "--no-prefix", "--", &pathspec],
        workspace_path,
    ) {
        Ok(patch) if !patch.trim().is_empty() => patch,
        _ => {
            // Untracked or staged-only: fabricate a patch so the UI always
            // has something to render from original → current.
            let mut patch = String::new();
            patch.push_str(&format!("--- a/{rel}\n+++ b/{rel}\n"));
            if original.is_empty() {
                for line in current.lines() {
                    patch.push_str(&format!("+{line}\n"));
                }
            }
            patch
        }
    };

    Ok(GitFileDiff {
        path: rel,
        diff: patch,
        original,
        current,
    })
}

/// Commit the selected files (or explicitly all files for the compact panel).
pub fn git_commit(
    workspace_path: &str,
    message: &str,
    expected_branch: &str,
    files: Option<&[String]>,
) -> Result<(), String> {
    let repository = git_repository_root(workspace_path)?;
    let workspace_path = repository.as_str();
    let message = message.trim();
    if message.is_empty() {
        return Err("Commit message cannot be empty".to_string());
    }
    with_repository_lock(workspace_path, || {
        require_branch(workspace_path, expected_branch)?;
        let paths = files
            .map(|files| {
                files
                    .iter()
                    .map(|file| file_argument(workspace_path, file))
                    .collect::<Result<Vec<_>, _>>()
            })
            .transpose()?;
        if paths.as_ref().is_some_and(Vec::is_empty) {
            return Err("Select at least one file to commit.".to_string());
        }
        let mut add = vec!["add", "-A"];
        let mut commit = vec!["commit", "-m", message];
        if let Some(paths) = &paths {
            add.push("--");
            add.extend(paths.iter().map(String::as_str));
            // Exclude other files that may already be staged in a terminal.
            commit.extend(["--only", "--"]);
            commit.extend(paths.iter().map(String::as_str));
        }
        run_git_hidden(&add, workspace_path)?;
        require_branch(workspace_path, expected_branch)?;
        run_git_hidden(&commit, workspace_path)?;
        Ok(())
    })
}

/// Discard working-tree changes for one file (`git restore`).
pub fn git_discard_file(workspace_path: &str, file_path: &str) -> Result<(), String> {
    let repository = git_repository_root(workspace_path)?;
    let workspace_path = repository.as_str();
    with_repository_lock(workspace_path, || {
        let rel = rel_path(workspace_path, file_path);
        let pathspec = file_argument(workspace_path, file_path)?;
        let stdout = run_git_hidden(
            &["status", "--porcelain=v1", "--", &pathspec],
            workspace_path,
        )?;
        if stdout.is_empty() {
            return Ok(());
        }
        // New files have no committed version, even if already staged.
        if run_git_hidden(&["cat-file", "-e", &format!("HEAD:{rel}")], workspace_path).is_err() {
            if !stdout.starts_with("??") {
                run_git_hidden(&["rm", "--cached", "-f", "--", &pathspec], workspace_path)?;
            }
            let full = Path::new(workspace_path).join(&rel);
            if full.is_dir() {
                return Err("Discard individual files instead of a directory.".to_string());
            } else if full.exists() {
                std::fs::remove_file(&full).map_err(|e| format!("Cannot remove file: {e}"))?;
            }
            return Ok(());
        }
        run_git_hidden(
            &[
                "restore",
                "--source=HEAD",
                "--staged",
                "--worktree",
                "--",
                &pathspec,
            ],
            workspace_path,
        )?;
        Ok(())
    })
}

/// Recent commits (hash, short hash, subject, author, ISO date).
pub fn git_log(workspace_path: &str, limit: usize) -> Result<Vec<GitCommitInfo>, String> {
    if run_git_hidden(&["rev-parse", "--verify", "HEAD"], workspace_path).is_err() {
        // A valid repository with an unborn branch has no history yet.
        run_git_hidden(&["rev-parse", "--git-dir"], workspace_path)?;
        return Ok(Vec::new());
    }
    let stdout = run_git_hidden(
        &[
            "log",
            &format!("-{limit}"),
            "--pretty=format:%H%x09%h%x09%an%x09%aI%x09%s",
        ],
        workspace_path,
    )?;

    let mut commits = Vec::new();
    for line in stdout.lines() {
        let mut parts = line.splitn(5, '\t');
        let (Some(hash), Some(short_hash), Some(author), Some(date), Some(message)) = (
            parts.next(),
            parts.next(),
            parts.next(),
            parts.next(),
            parts.next(),
        ) else {
            continue;
        };
        commits.push(GitCommitInfo {
            hash: hash.to_string(),
            short_hash: short_hash.to_string(),
            message: message.to_string(),
            author: author.to_string(),
            date: date.to_string(),
        });
    }
    Ok(commits)
}

/// Current branch + all local branches.
pub fn git_branches(workspace_path: &str) -> Result<GitBranchInfo, String> {
    let current = current_branch(workspace_path).unwrap_or_else(|_| "HEAD".to_string());
    let stdout = run_git_hidden(&["branch", "--format=%(refname:short)"], workspace_path)?;
    let mut branches: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    if current != "HEAD" && !branches.contains(&current) {
        branches.insert(0, current.clone());
    }
    Ok(GitBranchInfo {
        current,
        branches,
        repository_path: git_repository_root(workspace_path)?,
    })
}

/// Switch branches, refusing when there are staged or unstaged changes.
pub fn git_checkout(
    workspace_path: &str,
    branch: &str,
    expected_branch: &str,
) -> Result<(), String> {
    with_repository_lock(workspace_path, || {
        let current = git_branches(workspace_path)?.current;
        if current != expected_branch {
            return Err("The branch changed. Refresh source control and try again.".to_string());
        }
        run_git_hidden(
            &["show-ref", "--verify", &format!("refs/heads/{branch}")],
            workspace_path,
        )?;
        let status = run_git_hidden(&["status", "--porcelain=v1"], workspace_path)?;
        if !status.trim().is_empty() {
            return Err(
            "You have uncommitted changes — commit, stash, or discard them before switching branches."
                .to_string(),
        );
        }
        // switch cannot silently detach HEAD on a tag or revision.
        run_git_hidden(&["switch", "--", branch], workspace_path)?;
        Ok(())
    })
}

/// Resolve the actual upstream, or a publication target for a new branch.
pub fn git_remote_info(workspace_path: &str) -> Result<Option<GitRemoteInfo>, String> {
    let remotes = run_git_hidden(&["remote"], workspace_path)?;
    let remotes: Vec<&str> = remotes.lines().filter(|name| !name.is_empty()).collect();
    if remotes.is_empty() {
        return Ok(None);
    }
    let current = current_branch(workspace_path).unwrap_or_else(|_| "HEAD".to_string());
    let configured_remote = run_git_hidden(
        &["config", "--get", &format!("branch.{current}.remote")],
        workspace_path,
    )
    .unwrap_or_default();
    let merge = run_git_hidden(
        &["config", "--get", &format!("branch.{current}.merge")],
        workspace_path,
    )
    .unwrap_or_default();
    let has_upstream = !configured_remote.trim().is_empty() && !merge.trim().is_empty();
    let (name, remote_branch) = if has_upstream {
        let name = configured_remote.trim();
        if !remotes.contains(&name) {
            return Err(format!("The upstream remote '{name}' is not configured. Configure the branch upstream before syncing."));
        }
        let branch = merge
            .trim()
            .strip_prefix("refs/heads/")
            .filter(|branch| !branch.is_empty())
            .ok_or_else(|| "The upstream must be a single remote branch.".to_string())?;
        (name.to_string(), branch.to_string())
    } else {
        let name = if remotes.contains(&"origin") {
            "origin"
        } else if remotes.len() == 1 {
            remotes[0]
        } else {
            return Err(
                "Multiple remotes are configured. Set a branch upstream before syncing."
                    .to_string(),
            );
        };
        (name.to_string(), current.clone())
    };
    let url = run_git_hidden(
        &["remote", "get-url", "--push", "--", &name],
        workspace_path,
    )?
    .trim()
    .to_string();
    let tracking = if has_upstream {
        "@{upstream}".to_string()
    } else {
        format!("refs/remotes/{name}/{remote_branch}")
    };
    let mut ahead = 0;
    let mut behind = 0;
    if current != "HEAD" {
        if let Ok(out) = run_git_hidden(
            &[
                "rev-list",
                "--left-right",
                "--count",
                &format!("HEAD...{tracking}"),
            ],
            workspace_path,
        ) {
            let mut parts = out.split_whitespace();
            // HEAD is on the left: local-only commits are ahead, remote-only behind.
            ahead = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
            behind = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
        } else if !has_upstream {
            ahead = run_git_hidden(&["rev-list", "--count", "HEAD"], workspace_path)
                .ok()
                .and_then(|out| out.trim().parse().ok())
                .unwrap_or(0);
        }
    }
    Ok(Some(GitRemoteInfo {
        name,
        url,
        current_branch: current,
        remote_branch,
        has_upstream,
        ahead,
        behind,
    }))
}

fn require_remote(
    workspace_path: &str,
    expected_remote: &str,
    expected_remote_branch: &str,
) -> Result<GitRemoteInfo, String> {
    let remote =
        git_remote_info(workspace_path)?.ok_or_else(|| "No remote configured.".to_string())?;
    if remote.name != expected_remote || remote.remote_branch != expected_remote_branch {
        return Err(
            "The sync destination changed. Refresh source control and try again.".to_string(),
        );
    }
    Ok(remote)
}

/// Fetch the displayed remote without changing the working tree.
pub fn git_fetch(workspace_path: &str) -> Result<(), String> {
    with_repository_lock(workspace_path, || {
        let remote =
            git_remote_info(workspace_path)?.ok_or_else(|| "No remote configured.".to_string())?;
        run_git_hidden(&["fetch", "--", &remote.name], workspace_path)?;
        Ok(())
    })
}

/// Push only the displayed branch to its displayed destination. Explicit full
/// refs override push.default and remote push refspecs; publishing sets upstream.
pub fn git_push(
    workspace_path: &str,
    expected_branch: &str,
    expected_remote: &str,
    expected_remote_branch: &str,
) -> Result<(), String> {
    with_repository_lock(workspace_path, || {
        let current = require_branch(workspace_path, expected_branch)?;
        let remote = require_remote(workspace_path, expected_remote, expected_remote_branch)?;
        let refspec = format!("refs/heads/{current}:refs/heads/{}", remote.remote_branch);
        let mirror_override = format!("remote.{}.mirror=false", remote.name);
        let mut args = vec![
            "-c",
            &mirror_override,
            "push",
            "--no-follow-tags",
            "--no-mirror",
        ];
        if !remote.has_upstream {
            args.push("--set-upstream");
        }
        args.extend(["--", &remote.name, &refspec]);
        run_git_hidden(&args, workspace_path)?;
        Ok(())
    })
}

/// Pull only the displayed upstream, refusing implicit merges or rebases.
pub fn git_pull(
    workspace_path: &str,
    expected_branch: &str,
    expected_remote: &str,
    expected_remote_branch: &str,
) -> Result<(), String> {
    with_repository_lock(workspace_path, || {
        require_branch(workspace_path, expected_branch)?;
        let remote = require_remote(workspace_path, expected_remote, expected_remote_branch)?;
        if !remote.has_upstream {
            return Err("Publish this branch before pulling.".to_string());
        }
        let status = run_git_hidden(&["status", "--porcelain=v1"], workspace_path)?;
        if !status.is_empty() {
            return Err("Commit, stash, or discard your changes before pulling.".to_string());
        }
        run_git_hidden(
            &[
                "pull",
                "--ff-only",
                "--no-rebase",
                "--",
                &remote.name,
                &format!("refs/heads/{}", remote.remote_branch),
            ],
            workspace_path,
        )?;
        Ok(())
    })
}

#[cfg(test)]
#[path = "git_ops_tests.rs"]
mod integration_tests;

#[cfg(test)]
mod tests {
    use super::rel_path;

    #[test]
    fn resolves_absolute_paths_to_relative() {
        #[cfg(windows)]
        assert_eq!(
            rel_path("C:\\repo", "C:\\repo\\src\\main.rs"),
            "src/main.rs"
        );
        assert_eq!(rel_path("/repo", "/repo/docs/a.md"), "docs/a.md");
        assert_eq!(rel_path("/repo", "docs/a.md"), "docs/a.md");
    }
}
