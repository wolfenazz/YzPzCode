use std::path::Path;

use super::run_git_hidden;
use crate::types::{GitFileChange, GitFileStatus};

pub fn get_git_status(workspace_path: &str) -> Result<Vec<GitFileStatus>, String> {
    let root = Path::new(workspace_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", workspace_path));
    }

    let git_dir = root.join(".git");
    if !git_dir.exists() {
        return Ok(Vec::new());
    }

    let stdout = run_git_hidden(
        &["status", "--porcelain=v1", "--no-renames"],
        workspace_path,
    )
    .unwrap_or_default();

    let mut statuses: Vec<GitFileStatus> = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.len() < 4 {
            continue;
        }

        let xy = &line[..2];
        let file_path = &line[3..];

        let change = parse_git_xy(xy);

        let full_path = root.join(file_path);
        statuses.push(GitFileStatus {
            path: full_path.to_string_lossy().to_string(),
            change,
        });
    }

    Ok(statuses)
}

fn parse_git_xy(xy: &str) -> GitFileChange {
    let x = xy.chars().next().unwrap_or(' ');
    let y = xy.chars().nth(1).unwrap_or(' ');

    if x == '?' && y == '?' {
        GitFileChange::Untracked
    } else if x == 'D' || y == 'D' {
        GitFileChange::Deleted
    } else if (x == 'A' || x == 'C') || (y == 'A' || y == 'C') {
        GitFileChange::Added
    } else {
        GitFileChange::Modified
    }
}
