//! Content-level safety net: per-file snapshots (.yzpzcode/history/) and a
//! trash for deleted entries (.yzpzcode/trash/) so deletions can be undone
//! with their content intact.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const MAX_BACKUPS_PER_FILE: usize = 20;

fn workspace_meta_dir(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".yzpzcode")
}

fn rel_of(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Copy `file_path`'s current content into `.yzpzcode/history/...` (capped at
/// MAX_BACKUPS_PER_FILE per file) and return the backup's file name.
pub fn create_file_backup(workspace_path: &str, file_path: &str) -> Result<String, String> {
    let root = Path::new(workspace_path);
    let file = Path::new(file_path);
    if !file.exists() || !file.is_file() {
        return Err(String::from("File does not exist"));
    }

    let meta_dir = workspace_meta_dir(workspace_path);
    let history_dir = meta_dir.join("history");
    fs::create_dir_all(&history_dir).map_err(|e| format!("Cannot create history dir: {e}"))?;

    let rel = rel_of(root, file);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    // Encode the relative path so a restore can match it back.
    let encoded = rel.replace(['\\', '/', ':'], "_");
    let backup_name = format!("{timestamp}.{encoded}");
    let backup_path = history_dir.join(&backup_name);
    fs::copy(file, &backup_path).map_err(|e| format!("Cannot back up file: {e}"))?;

    prune_backups(&history_dir, &encoded);

    Ok(backup_name)
}

fn prune_backups(history_dir: &Path, encoded_rel: &str) {
    let mut backups: Vec<(u128, PathBuf)> = fs::read_dir(history_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            // Match `{timestamp}.{encoded}` and drop the timestamp prefix.
            let stamp: u128 = name.split('.').next()?.parse().ok()?;
            let encoded = name.split_once('.')?.1.to_string();
            (encoded == encoded_rel).then_some((stamp, path))
        })
        .collect::<Vec<_>>();

    backups.sort_by_key(|(stamp, _)| *stamp);
    let overflow = backups.len().saturating_sub(MAX_BACKUPS_PER_FILE);
    for (_, path) in backups.iter().take(overflow) {
        let _ = fs::remove_file(path);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileBackupInfo {
    pub name: String,
    pub file_name: String,
    pub timestamp_ms: u64,
    pub size: u64,
}

/// List available backups for a file, newest first.
pub fn list_file_backups(
    workspace_path: &str,
    file_path: &str,
) -> Result<Vec<FileBackupInfo>, String> {
    let root = Path::new(workspace_path);
    let rel = rel_of(root, Path::new(file_path));
    let encoded = rel.replace(['\\', '/', ':'], "_");
    let history_dir = workspace_meta_dir(workspace_path).join("history");

    let mut backups: Vec<FileBackupInfo> = fs::read_dir(&history_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            let (stamp, file_encoded) = name.split_once('.')?;
            if file_encoded != encoded {
                return None;
            }
            let timestamp_ms = stamp.parse::<u64>().ok()?;
            let size = fs::metadata(&path).ok()?.len();
            Some(FileBackupInfo {
                name,
                file_name: rel.rsplit('/').next().unwrap_or(&rel).to_string(),
                timestamp_ms,
                size,
            })
        })
        .collect();

    backups.sort_by_key(|b| std::cmp::Reverse(b.timestamp_ms));
    Ok(backups)
}

/// Restore the most recent (or a named) backup over `file_path`.
/// `backup_name` optional — when omitted the newest backup is used.
pub fn restore_file_backup(
    workspace_path: &str,
    file_path: &str,
    backup_name: Option<String>,
) -> Result<String, String> {
    let root = Path::new(workspace_path);
    let rel = rel_of(root, Path::new(file_path));
    let encoded = rel.replace(['\\', '/', ':'], "_");
    let history_dir = workspace_meta_dir(workspace_path).join("history");

    let backups = list_file_backups(workspace_path, file_path)?;
    let target = match backup_name {
        Some(name) => history_dir
            .join(&name)
            .canonicalize()
            .map_err(|e| format!("Backup not found: {e}"))?,
        None => {
            let name = backups.first().ok_or("No backup found for this file")?;
            history_dir.join(&name.name)
        }
    };
    let _ = encoded;

    let content = fs::read_to_string(&target).map_err(|e| format!("Cannot read backup: {e}"))?;
    if let Some(parent) = Path::new(file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent dir: {e}"))?;
    }
    fs::write(file_path, &content).map_err(|e| format!("Cannot restore file: {e}"))?;
    Ok(content)
}

// ── Trash (delete undo with content) ─────────────────────────────────

fn trash_dir(workspace_path: &str) -> PathBuf {
    workspace_meta_dir(workspace_path).join("trash")
}

/// Move an entry into `.yzpzcode/trash/` instead of deleting it, so the
/// explorer undo can bring it back with its contents intact.
pub fn trash_entry(workspace_path: &str, path: &str) -> Result<(), String> {
    let root = Path::new(workspace_path);
    let target = Path::new(path);
    if !target.exists() {
        return Err("Path does not exist".to_string());
    }

    let dir = trash_dir(workspace_path);
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create trash dir: {e}"))?;

    let rel = rel_of(root, target);
    let encoded = rel.replace(['\\', '/', ':'], "_");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = dir.join(format!("{timestamp}.{encoded}"));

    fs::rename(target, &dest).map_err(|e| format!("Cannot move to trash: {e}"))?;
    Ok(())
}

/// Restore the most recent trashed entry for the given original path.
pub fn restore_from_trash(workspace_path: &str, original_path: &str) -> Result<(), String> {
    let root = Path::new(workspace_path);
    let rel = rel_of(root, Path::new(original_path));
    let encoded = rel.replace(['\\', '/', ':'], "_");
    let dir = trash_dir(workspace_path);

    let mut candidates: Vec<(u128, PathBuf)> = fs::read_dir(&dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            let (stamp, file_encoded) = name.split_once('.')?;
            (file_encoded == encoded).then_some((stamp.parse::<u128>().ok()?, path))
        })
        .collect();

    if candidates.is_empty() {
        return Err("No trashed copy found for this entry".to_string());
    }
    candidates.sort_by_key(|(stamp, _)| *stamp);

    let (_, source) = candidates.pop().expect("non-empty");
    let dest = Path::new(original_path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent dir: {e}"))?;
    }
    fs::rename(&source, dest).map_err(|e| format!("Cannot restore entry: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_relative_paths_for_backup_names() {
        let root = Path::new("C:\\repo");
        let file = Path::new("C:\\repo\\src\\main.rs");
        assert_eq!(rel_of(root, file), "src/main.rs");
        assert_eq!("src/main.rs".replace(['\\', '/', ':'], "_"), "src_main.rs");
        assert_eq!(
            "app/src/index.ts".replace(['\\', '/', ':'], "_"),
            "app_src_index.ts"
        );
    }
}
