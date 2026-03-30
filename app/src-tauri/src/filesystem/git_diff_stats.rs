use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use crate::types::GitDiffStat;

pub fn get_git_diff_stats(workspace_path: &str) -> Result<Vec<GitDiffStat>, String> {
    let root = Path::new(workspace_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", workspace_path));
    }

    let git_dir = root.join(".git");
    if !git_dir.exists() {
        return Ok(Vec::new());
    }

    let mut stats_map: HashMap<String, (u32, u32)> = HashMap::new();

    collect_numstat(
        workspace_path,
        &["diff", "--no-prefix", "--no-renames", "--numstat"],
        &mut stats_map,
    )?;
    collect_numstat(
        workspace_path,
        &[
            "diff",
            "--no-prefix",
            "--no-renames",
            "--cached",
            "--numstat",
        ],
        &mut stats_map,
    )?;

    collect_untracked_line_counts(workspace_path, root, &mut stats_map)?;

    let mut stats: Vec<GitDiffStat> = stats_map
        .into_iter()
        .map(|(path, (added, deleted))| GitDiffStat {
            path,
            lines_added: added,
            lines_deleted: deleted,
        })
        .collect();

    stats.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(stats)
}

fn run_git(args: &[&str], cwd: &Path) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("git")
            .args(args)
            .current_dir(cwd)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
    };

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("git").args(args).current_dir(cwd).output();

    let output = output.map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Ok(String::new());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn collect_numstat(
    workspace_path: &str,
    args: &[&str],
    stats_map: &mut HashMap<String, (u32, u32)>,
) -> Result<(), String> {
    let root = Path::new(workspace_path);
    let stdout = run_git(args, root)?;

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        if parts.len() < 3 {
            continue;
        }

        let added = parse_numstat_value(parts[0]);
        let deleted = parse_numstat_value(parts[1]);
        let file_path = parts[2];

        if file_path.starts_with("dev/null") {
            continue;
        }

        let full_path = root.join(file_path).to_string_lossy().to_string();

        let entry = stats_map.entry(full_path).or_insert((0, 0));
        entry.0 = entry.0.saturating_add(added);
        entry.1 = entry.1.saturating_add(deleted);
    }

    Ok(())
}

fn parse_numstat_value(s: &str) -> u32 {
    if s == "-" {
        return 0;
    }
    s.parse::<u32>().unwrap_or(0)
}

fn collect_untracked_line_counts(
    _workspace_path: &str,
    root: &Path,
    stats_map: &mut HashMap<String, (u32, u32)>,
) -> Result<(), String> {
    let stdout = run_git(&["status", "--porcelain=v1", "--no-renames"], root)?;

    for line in stdout.lines() {
        let line = line.trim();
        if line.len() < 4 {
            continue;
        }

        let xy = &line[..2];
        if xy != "??" {
            continue;
        }

        let file_path = &line[3..];
        let full_path = root.join(file_path);

        if !full_path.exists() || full_path.is_dir() {
            continue;
        }

        let full_path_str = full_path.to_string_lossy().to_string();

        if stats_map.contains_key(&full_path_str) {
            continue;
        }

        let line_count = count_file_lines(&full_path);
        stats_map.insert(full_path_str, (line_count, 0));
    }

    Ok(())
}

fn count_file_lines(path: &Path) -> u32 {
    std::fs::read_to_string(path)
        .map(|content| content.lines().count() as u32)
        .unwrap_or(0)
}

pub fn get_git_file_content(workspace_path: &str, file_path: &str) -> Result<String, String> {
    let root = Path::new(workspace_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", workspace_path));
    }

    let git_dir = root.join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    let rel_path = if let Some(rel) = file_path.strip_prefix(workspace_path) {
        rel.trim_start_matches('/').trim_start_matches('\\')
    } else {
        file_path
    };

    let stdout = run_git(&["show", &format!("HEAD:{}", rel_path)], root)?;

    if stdout.is_empty() {
        return Err(format!("File not found in git history: {}", rel_path));
    }

    Ok(stdout)
}
