//! Deeper git operations: per-file unified diff, commit, discard, log, branches.

use std::path::Path;

use super::run_git_hidden;
use crate::types::{GitBranchInfo, GitCommitInfo, GitFileDiff, GitRemoteInfo};

/// Resolve a possibly-absolute file path to a repo-relative path (git arg).
fn rel_path(workspace_path: &str, file_path: &str) -> String {
    let rel = if let Some(rel) = file_path.strip_prefix(workspace_path) {
        rel.trim_start_matches('/').trim_start_matches('\\')
    } else {
        file_path
    };
    // Git always wants forward slashes, even on Windows.
    rel.replace('\\', "/")
}

/// Unified diff (working tree vs HEAD) plus both contents for a file.
/// Untracked files have no HEAD version, so the diff is the whole file.
pub fn git_file_diff(workspace_path: &str, file_path: &str) -> Result<GitFileDiff, String> {
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

    let patch = match run_git_hidden(&["diff", "--no-prefix", "--", &rel], workspace_path) {
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

/// `created`: stage everything then commit with the given message.
pub fn git_commit(workspace_path: &str, message: &str) -> Result<(), String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("Commit message cannot be empty".to_string());
    }
    run_git_hidden(&["add", "-A"], workspace_path)?;
    run_git_hidden(&["commit", "-m", message], workspace_path)?;
    Ok(())
}

/// Discard working-tree changes for one file (`git restore`).
pub fn git_discard_file(workspace_path: &str, file_path: &str) -> Result<(), String> {
    let rel = rel_path(workspace_path, file_path);
    // Untracked files cannot be "restored" — delete them instead (with git rm
    // semantics so the change disappears from the status list).
    let stdout = run_git_hidden(&["status", "--porcelain=v1", "--", &rel], workspace_path)?;
    if stdout.starts_with("??") {
        let full = Path::new(workspace_path).join(&rel);
        if full.is_dir() {
            std::fs::remove_dir_all(&full).map_err(|e| format!("Cannot remove directory: {e}"))?;
        } else if full.exists() {
            std::fs::remove_file(&full).map_err(|e| format!("Cannot remove file: {e}"))?;
        }
        return Ok(());
    }
    run_git_hidden(&["restore", "--", &rel], workspace_path)?;
    Ok(())
}

/// Recent commits (hash, short hash, subject, author, ISO date).
pub fn git_log(workspace_path: &str, limit: usize) -> Result<Vec<GitCommitInfo>, String> {
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
    let current = run_git_hidden(&["rev-parse", "--abbrev-ref", "HEAD"], workspace_path)
        .unwrap_or_else(|_| "HEAD".to_string())
        .trim()
        .to_string();
    let stdout = run_git_hidden(&["branch", "--format=%(refname:short)"], workspace_path)?;
    let branches = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    Ok(GitBranchInfo { current, branches })
}

/// Switch branches, refusing when there are staged or unstaged changes.
pub fn git_checkout(workspace_path: &str, branch: &str) -> Result<(), String> {
    let status = run_git_hidden(&["status", "--porcelain=v1"], workspace_path)?;
    if !status.trim().is_empty() {
        return Err(
            "You have uncommitted changes — commit, stash, or discard them before switching branches."
                .to_string(),
        );
    }
    run_git_hidden(&["checkout", branch], workspace_path)?;
    Ok(())
}

/// The fetch/push URL of the primary remote (origin, or the first remote).
pub fn git_remote_info(workspace_path: &str) -> Result<Option<GitRemoteInfo>, String> {
    let stdout = run_git_hidden(&["remote"], workspace_path)?;
    let mut remotes: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    if remotes.is_empty() {
        return Ok(None);
    }

    let name = if remotes.contains(&"origin".to_string()) {
        "origin".to_string()
    } else {
        remotes.remove(0)
    };

    let url = run_git_hidden(&["remote", "get-url", &name], workspace_path)
        .unwrap_or_default()
        .trim()
        .to_string();

    let current = run_git_hidden(&["rev-parse", "--abbrev-ref", "HEAD"], workspace_path)
        .unwrap_or_else(|_| "HEAD".to_string())
        .trim()
        .to_string();

    // Count ahead/behind vs the remote-tracking branch, if any.
    let mut ahead = 0i64;
    let mut behind = 0i64;
    if current != "HEAD" {
        let tracking = format!("{}/{}", name, current);
        // A remote-tracking branch exists (earlier fetch) → count divergence.
        let upstream_ok = run_git_hidden(
            &["rev-parse", "--verify", "--quiet", &tracking],
            workspace_path,
        )
        .is_ok();
        if upstream_ok {
            let spec = format!("{}...{}", current, tracking);
            if let Ok(out) = run_git_hidden(
                &["rev-list", "--left-right", "--count", &spec],
                workspace_path,
            ) {
                let mut parts = out.split_whitespace();
                // `rev-list --left-right` prints "left<TAB>right".
                // left  = commits reachable from tracking (remote) but not current → behind.
                // right = commits reachable from current but not tracking (remote) → ahead.
                let left = parts
                    .next()
                    .and_then(|p| p.parse::<i64>().ok())
                    .unwrap_or(0);
                let right = parts
                    .next()
                    .and_then(|p| p.parse::<i64>().ok())
                    .unwrap_or(0);
                behind = left;
                ahead = right;
            }
        }
    }

    Ok(Some(GitRemoteInfo {
        name,
        url,
        ahead,
        behind,
    }))
}

/// Fetch the remote (origin) — updates remote-tracking refs only, no merge.
pub fn git_fetch(workspace_path: &str) -> Result<(), String> {
    run_git_hidden(&["fetch", "origin"], workspace_path)?;
    Ok(())
}

/// Push the current branch to its upstream. Uses `--set-upstream` so a branch
/// with no upstream is published on first push.
pub fn git_push(workspace_path: &str) -> Result<(), String> {
    let current = run_git_hidden(&["rev-parse", "--abbrev-ref", "HEAD"], workspace_path)
        .unwrap_or_else(|_| "HEAD".to_string())
        .trim()
        .to_string();
    if current == "HEAD" {
        return Err("Detached HEAD — cannot push.".to_string());
    }
    run_git_hidden(&["push", "-u", "origin", current.as_str()], workspace_path)?;
    Ok(())
}

/// Pull the current branch from its upstream (fetch + merge fast-forward).
pub fn git_pull(workspace_path: &str) -> Result<(), String> {
    run_git_hidden(&["pull"], workspace_path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::rel_path;

    #[test]
    fn resolves_absolute_paths_to_relative() {
        assert_eq!(
            rel_path("C:\\repo", "C:\\repo\\src\\main.rs"),
            "src/main.rs"
        );
        assert_eq!(rel_path("/repo", "/repo/docs/a.md"), "docs/a.md");
        assert_eq!(rel_path("/repo", "docs/a.md"), "docs/a.md");
    }
}
