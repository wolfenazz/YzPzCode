use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use ignore::WalkBuilder;

use crate::types::FileEntry;

/// Heavy / generated directories to skip when listing the workspace tree for
/// the `@` mention picker — browsing or searching them is never useful.
const NOISE_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".output",
    ".cache",
    ".turbo",
    "coverage",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".gradle",
    "Pods",
];

fn is_noise_dir(name: &str) -> bool {
    name == ".git" || NOISE_DIRS.contains(&name)
}

pub fn list_directory_entries(dir_path: &str) -> Result<Vec<FileEntry>, String> {
    crate::filesystem::validation::validate_no_path_traversal(dir_path)
        .map_err(|e| e.to_string())?;
    let root = Path::new(dir_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let mut builder = WalkBuilder::new(root);
    builder
        .max_depth(Some(1))
        .hidden(false)
        .ignore(false)
        .parents(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name == ".git" {
                return false;
            }
            true
        });

    for result in builder.build().flatten() {
        let path = result.path();
        if path == root {
            continue;
        }

        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let is_dir = path.is_dir();

        let metadata = fs::metadata(path).ok();
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

        let modified_at = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let extension = if is_dir {
            None
        } else {
            path.extension()
                .map(|ext| ext.to_string_lossy().to_string())
        };

        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            size,
            modified_at,
            extension,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

pub fn list_all_files_recursive(dir_path: &str) -> Result<Vec<FileEntry>, String> {
    crate::filesystem::validation::validate_no_path_traversal(dir_path)
        .map_err(|e| e.to_string())?;
    let root = Path::new(dir_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(false)
        .ignore(false)
        .parents(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name == ".git" {
                return false;
            }
            true
        });

    for result in builder.build().flatten() {
        let path = result.path();
        if path == root || path.is_dir() {
            continue;
        }

        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let metadata = fs::metadata(path).ok();
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

        let modified_at = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let extension = path
            .extension()
            .map(|ext| ext.to_string_lossy().to_string());

        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: false,
            size,
            modified_at,
            extension,
        });
    }

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(entries)
}

/// Recursively list every file and directory under `dir_path` (excluding
/// noise directories like `node_modules`/`target`). Used by the agent `@`
/// mention picker for whole-workspace fuzzy search and directory drill-in.
pub fn list_all_entries_recursive(dir_path: &str) -> Result<Vec<FileEntry>, String> {
    crate::filesystem::validation::validate_no_path_traversal(dir_path)
        .map_err(|e| e.to_string())?;
    let root = Path::new(dir_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(false)
        .ignore(false)
        .parents(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if is_noise_dir(&name) {
                return false;
            }
            true
        });

    for result in builder.build().flatten() {
        let path = result.path();
        if path == root {
            continue;
        }

        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let is_dir = path.is_dir();

        let metadata = fs::metadata(path).ok();
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

        let modified_at = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let extension = if is_dir {
            None
        } else {
            path.extension()
                .map(|ext| ext.to_string_lossy().to_string())
        };

        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            size,
            modified_at,
            extension,
        });
    }

    entries.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));

    Ok(entries)
}
