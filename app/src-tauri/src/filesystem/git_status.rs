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
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--no-renames",
        ],
        workspace_path,
    )?;

    Ok(parse_porcelain_status(&stdout, root))
}

/// Parse NUL-delimited porcelain records without trimming them. The first two
/// bytes are fixed Git status columns, and the third byte is a separator, so
/// removing leading whitespace shifts both the status and the file path.
fn parse_porcelain_status(stdout: &str, root: &Path) -> Vec<GitFileStatus> {
    stdout
        .split_terminator('\0')
        .filter_map(|record| {
            if record.len() < 4 || record.as_bytes().get(2) != Some(&b' ') {
                return None;
            }

            let xy = &record[..2];
            let file_path = &record[3..];
            let full_path = root.join(file_path);

            Some(GitFileStatus {
                path: full_path.to_string_lossy().to_string(),
                change: parse_git_xy(xy),
            })
        })
        .collect()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_unstaged_status_column_and_dotfile_path() {
        let root = Path::new("workspace");
        let statuses = parse_porcelain_status(" M .commandcode/settings.json\0", root);

        assert_eq!(statuses.len(), 1);
        assert_eq!(
            statuses[0].path,
            root.join(".commandcode/settings.json")
                .to_string_lossy()
                .to_string()
        );
        assert_eq!(statuses[0].change, GitFileChange::Modified);
    }

    #[test]
    fn preserves_spaces_and_reports_each_untracked_file() {
        let root = Path::new("workspace");
        let statuses = parse_porcelain_status(
            "?? new folder/first file.txt\0?? new folder/second.txt\0",
            root,
        );

        assert_eq!(statuses.len(), 2);
        assert_eq!(
            statuses[0].path,
            root.join("new folder/first file.txt")
                .to_string_lossy()
                .to_string()
        );
        assert_eq!(statuses[0].change, GitFileChange::Untracked);
    }
}

pub fn git_stage_file(workspace_path: &str, file_path: &str) -> Result<(), String> {
    let root = std::path::Path::new(workspace_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", workspace_path));
    }

    let rel_path = if let Some(rel) = file_path.strip_prefix(workspace_path) {
        rel.trim_start_matches('/').trim_start_matches('\\')
    } else {
        file_path
    };

    super::run_git_hidden(&["add", "--", rel_path], workspace_path)?;
    Ok(())
}

pub fn git_unstage_file(workspace_path: &str, file_path: &str) -> Result<(), String> {
    let root = std::path::Path::new(workspace_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", workspace_path));
    }

    let rel_path = if let Some(rel) = file_path.strip_prefix(workspace_path) {
        rel.trim_start_matches('/').trim_start_matches('\\')
    } else {
        file_path
    };

    super::run_git_hidden(&["reset", "--", rel_path], workspace_path)?;
    Ok(())
}
