use anyhow::Result;
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

use super::validation::validate_no_path_traversal;

pub fn rename_entry(old_path: &str, new_name: &str) -> Result<()> {
    validate_no_path_traversal(old_path)?;
    validate_no_path_traversal(new_name)?;
    // A name may contain separators ("src/lib/util.ts" creates the folders,
    // as in VS Code) but must stay relative to the entry's own folder.
    if new_name.trim().is_empty()
        || !Path::new(new_name)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
    {
        return Err(anyhow::anyhow!("Invalid name: {}", new_name));
    }
    let old = Path::new(old_path);
    if !old.exists() {
        return Err(anyhow::anyhow!("Source path does not exist: {}", old_path));
    }
    let parent = old
        .parent()
        .ok_or_else(|| anyhow::anyhow!("No parent directory"))?;
    let new_path = parent.join(new_name);

    // On case-insensitive file systems a case-only rename ("readme.md" ->
    // "README.md") resolves to the entry itself, which is not a conflict.
    if new_path.exists() && !is_same_entry(old, &new_path) {
        return Err(anyhow::anyhow!(
            "A file or directory with that name already exists"
        ));
    }

    if let Some(new_parent) = new_path.parent() {
        if new_parent != parent {
            fs::create_dir_all(new_parent)?;
        }
    }
    fs::rename(old, &new_path)?;
    Ok(())
}

fn is_same_entry(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

pub fn move_entry(source_path: &str, destination_dir: &str) -> Result<()> {
    validate_no_path_traversal(source_path)?;
    validate_no_path_traversal(destination_dir)?;
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(anyhow::anyhow!(
            "Source path does not exist: {}",
            source_path
        ));
    }
    let dest_dir = Path::new(destination_dir);
    if !dest_dir.is_dir() {
        return Err(anyhow::anyhow!(
            "Destination is not a directory: {}",
            destination_dir
        ));
    }
    let file_name = source
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Invalid source path"))?;
    let dest_path = dest_dir.join(file_name);

    if dest_path.exists() {
        return Err(anyhow::anyhow!(
            "Destination already exists: {}",
            dest_path.display()
        ));
    }

    rename_or_copy(source, &dest_path)
}

/// `fs::rename`, falling back to copy + delete when the destination is on
/// another drive or volume (a rename cannot cross devices).
fn rename_or_copy(source: &Path, dest: &Path) -> Result<()> {
    match fs::rename(source, dest) {
        Ok(()) => Ok(()),
        Err(err) if is_cross_device(&err) => {
            copy_path(source, dest)?;
            if source.is_dir() {
                fs::remove_dir_all(source)?;
            } else {
                fs::remove_file(source)?;
            }
            Ok(())
        }
        Err(err) => Err(err.into()),
    }
}

fn is_cross_device(err: &std::io::Error) -> bool {
    // ERROR_NOT_SAME_DEVICE on Windows, EXDEV on Unix.
    err.kind() == std::io::ErrorKind::CrossesDevices
        || err.raw_os_error() == Some(if cfg!(windows) { 17 } else { 18 })
}

pub fn create_file(path: &str) -> Result<()> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    if p.exists() {
        return Err(anyhow::anyhow!("File already exists: {}", path));
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::File::create(p)?;
    Ok(())
}

pub fn create_directory(path: &str) -> Result<()> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    if p.exists() {
        return Err(anyhow::anyhow!("Directory already exists: {}", path));
    }
    fs::create_dir_all(p)?;
    Ok(())
}

pub fn delete_entry(path: &str) -> Result<()> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    if !p.exists() {
        return Err(anyhow::anyhow!("Path does not exist: {}", path));
    }

    // Soft-delete: move into the workspace `.yzpzcode/trash` when the entry
    // lives under an app workspace so the explorer undo can restore it WITH
    // its content. Falls back to a permanent delete outside workspaces.
    if let Some(workspace) = find_workspace_root(p) {
        let ws = workspace.to_string_lossy().to_string();
        let target = p.to_string_lossy().to_string();
        if super::history::trash_entry(&ws, &target).is_ok() {
            return Ok(());
        }
    }

    if p.is_dir() {
        fs::remove_dir_all(p)?;
    } else {
        fs::remove_file(p)?;
    }
    Ok(())
}

/// Walk up from `path` to the nearest directory that carries a `.yzpzcode`
/// marker (the app's per-workspace container).
fn find_workspace_root(path: &Path) -> Option<std::path::PathBuf> {
    let mut current = path.parent();
    while let Some(dir) = current {
        if dir.join(".yzpzcode").is_dir() {
            return Some(dir.to_path_buf());
        }
        current = dir.parent();
    }
    None
}

pub fn reveal_in_file_manager(path: &str) -> Result<()> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    let target = if p.is_file() || !p.exists() {
        p.parent().unwrap_or(p)
    } else {
        p
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(target).spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(target)
            .spawn()?;
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(target).spawn()?;
    }

    Ok(())
}

pub fn duplicate_entry(path: &str) -> Result<String> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    if !p.exists() {
        return Err(anyhow::anyhow!("Path does not exist: {}", path));
    }

    let parent = p
        .parent()
        .ok_or_else(|| anyhow::anyhow!("No parent directory"))?;

    let stem = p
        .file_stem()
        .ok_or_else(|| anyhow::anyhow!("Invalid file name"))?
        .to_string_lossy()
        .to_string();

    let extension = p.extension().map(|e| format!(".{}", e.to_string_lossy()));

    let mut new_name = format!("{}-copy{}", stem, extension.as_deref().unwrap_or(""));
    let mut new_path = parent.join(&new_name);
    let mut counter = 1;

    while new_path.exists() {
        new_name = format!(
            "{}-copy-{}{}",
            stem,
            counter,
            extension.as_deref().unwrap_or("")
        );
        new_path = parent.join(&new_name);
        counter += 1;
    }

    if p.is_dir() {
        copy_dir_recursive(p, &new_path)?;
    } else {
        fs::copy(p, &new_path)?;
    }

    Ok(new_path.to_string_lossy().to_string())
}

fn copy_path(src: &Path, dst: &Path) -> Result<()> {
    if src.is_dir() {
        copy_dir_recursive(src, dst)
    } else {
        fs::copy(src, dst)?;
        Ok(())
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if file_type.is_symlink() && src_path.is_dir() {
            // Recreate directory links instead of following them: a link back
            // to an ancestor would otherwise recurse forever.
            copy_dir_link(&src_path, &dst_path);
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Best effort: creating links can need extra privileges on Windows, and a
/// missing link is better than a failed copy.
fn copy_dir_link(src: &Path, dst: &Path) {
    let Ok(target) = fs::read_link(src) else {
        return;
    };
    #[cfg(unix)]
    let result = std::os::unix::fs::symlink(&target, dst);
    #[cfg(windows)]
    let result = std::os::windows::fs::symlink_dir(&target, dst);
    if let Err(err) = result {
        eprintln!("Skipped directory link {}: {}", src.display(), err);
    }
}

/// `name.ext`, else `name (1).ext`, `name (2).ext`, ... inside `dest_dir`.
fn unique_copy_target(source: &Path, dest_dir: &Path) -> Result<PathBuf> {
    let file_name = source
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Invalid source path: {}", source.display()))?;
    let dest_path = dest_dir.join(file_name);
    if !dest_path.exists() {
        return Ok(dest_path);
    }
    let (stem, ext) = if source.is_dir() {
        (file_name.to_string_lossy().to_string(), String::new())
    } else {
        (
            source
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default(),
            source
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default(),
        )
    };
    Ok((1..)
        .map(|n| dest_dir.join(format!("{} ({}){}", stem, n, ext)))
        .find(|candidate| !candidate.exists())
        .expect("an unused file name always exists"))
}

/// True when `dir` is `folder` itself or lies somewhere inside it.
fn is_within(dir: &Path, folder: &Path) -> bool {
    match (dir.canonicalize(), folder.canonicalize()) {
        (Ok(dir), Ok(folder)) => dir.starts_with(folder),
        _ => false,
    }
}

pub fn copy_entry(source_path: &str, destination_dir: &str) -> Result<String> {
    validate_no_path_traversal(source_path)?;
    let mut imported = import_entries(&[source_path.to_string()], destination_dir)?;
    imported.pop().ok_or_else(|| {
        anyhow::anyhow!(
            "Could not copy entry (source does not exist): {}",
            source_path
        )
    })
}

pub fn import_entries(source_paths: &[String], destination_dir: &str) -> Result<Vec<String>> {
    validate_no_path_traversal(destination_dir)?;
    let dest_dir = Path::new(destination_dir);
    if !dest_dir.is_dir() {
        return Err(anyhow::anyhow!(
            "Destination is not a directory: {}",
            destination_dir
        ));
    }

    let mut imported = Vec::new();

    for source_path in source_paths {
        let source = Path::new(source_path);
        if !source.exists() {
            continue;
        }
        if source.is_dir() && is_within(dest_dir, source) {
            return Err(anyhow::anyhow!(
                "Cannot copy a folder into itself: {}",
                source_path
            ));
        }
        let dest_path = unique_copy_target(source, dest_dir)?;
        copy_path(source, &dest_path)?;
        imported.push(dest_path.to_string_lossy().to_string());
    }

    Ok(imported)
}

/// Result of pasting one entry, so a partial failure still reports (and can
/// undo) the entries that did land.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PasteOutcome {
    pub source: String,
    /// Where the entry now lives; `None` when it failed or was skipped.
    pub path: Option<String>,
    pub error: Option<String>,
    /// A cut pasted into the folder it already lives in: nothing to do.
    pub skipped: bool,
}

/// Copies (or, for a cut, moves) every source into `destination_dir`.
/// Copies get a free name (`name (1).ext`); moves never overwrite.
pub fn paste_entries(
    source_paths: &[String],
    destination_dir: &str,
    cut: bool,
) -> Result<Vec<PasteOutcome>> {
    validate_no_path_traversal(destination_dir)?;
    let dest_dir = Path::new(destination_dir);
    if !dest_dir.is_dir() {
        return Err(anyhow::anyhow!(
            "Destination is not a directory: {}",
            destination_dir
        ));
    }

    Ok(source_paths
        .iter()
        .map(|source_path| {
            let mut outcome = PasteOutcome {
                source: source_path.clone(),
                path: None,
                error: None,
                skipped: false,
            };
            match paste_one(source_path, dest_dir, cut) {
                Ok(Some(path)) => outcome.path = Some(path),
                Ok(None) => outcome.skipped = true,
                Err(err) => outcome.error = Some(err.to_string()),
            }
            outcome
        })
        .collect())
}

fn paste_one(source_path: &str, dest_dir: &Path, cut: bool) -> Result<Option<String>> {
    validate_no_path_traversal(source_path)?;
    let source = Path::new(source_path);
    let name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| source_path.to_string());
    if !source.exists() {
        return Err(anyhow::anyhow!("{} no longer exists", name));
    }
    if source.is_dir() && is_within(dest_dir, source) {
        return Err(anyhow::anyhow!("Cannot paste {} into itself", name));
    }

    if cut {
        if source
            .parent()
            .is_some_and(|parent| is_same_entry(parent, dest_dir))
        {
            return Ok(None);
        }
        let dest_path = dest_dir.join(source.file_name().unwrap_or_default());
        if dest_path.exists() {
            return Err(anyhow::anyhow!("{} already exists in this folder", name));
        }
        rename_or_copy(source, &dest_path)?;
        return Ok(Some(dest_path.to_string_lossy().to_string()));
    }

    let dest_path = unique_copy_target(source, dest_dir)?;
    copy_path(source, &dest_path)?;
    Ok(Some(dest_path.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yzpz-ops-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn s(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }

    #[test]
    fn copy_paste_picks_a_free_name() {
        let root = temp_dir();
        fs::write(root.join("a.txt"), b"hi").unwrap();
        fs::create_dir_all(root.join("pkg")).unwrap();
        let out = paste_entries(
            &[s(&root.join("a.txt")), s(&root.join("pkg"))],
            &s(&root),
            false,
        )
        .unwrap();
        assert_eq!(out[0].path, Some(s(&root.join("a (1).txt"))));
        assert_eq!(out[1].path, Some(s(&root.join("pkg (1)"))));
        assert_eq!(fs::read(root.join("a (1).txt")).unwrap(), b"hi");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn folder_cannot_be_pasted_into_itself() {
        let root = temp_dir();
        let folder = root.join("src");
        fs::create_dir_all(folder.join("inner")).unwrap();
        for cut in [false, true] {
            let out = paste_entries(&[s(&folder)], &s(&folder.join("inner")), cut).unwrap();
            assert!(out[0].error.as_deref().unwrap().contains("into itself"));
        }
        assert!(import_entries(&[s(&folder)], &s(&folder)).is_err());
        assert!(!folder.join("inner").join("src").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn cut_paste_moves_skips_same_folder_and_never_overwrites() {
        let root = temp_dir();
        let dest = root.join("dest");
        fs::create_dir_all(&dest).unwrap();
        fs::write(root.join("a.txt"), b"a").unwrap();
        fs::write(root.join("b.txt"), b"b").unwrap();
        fs::write(dest.join("b.txt"), b"existing").unwrap();

        let out = paste_entries(
            &[
                s(&root.join("a.txt")),
                s(&root.join("b.txt")),
                s(&dest.join("b.txt")),
            ],
            &s(&dest),
            true,
        )
        .unwrap();
        assert_eq!(out[0].path, Some(s(&dest.join("a.txt"))));
        assert!(!root.join("a.txt").exists());
        assert!(out[1].error.as_deref().unwrap().contains("already exists"));
        assert_eq!(fs::read(dest.join("b.txt")).unwrap(), b"existing");
        assert!(out[2].skipped);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rename_creates_nested_folders_and_rejects_escapes() {
        let root = temp_dir();
        fs::write(root.join("untitled"), b"").unwrap();
        rename_entry(&s(&root.join("untitled")), "src/lib/util.ts").unwrap();
        assert!(root.join("src").join("lib").join("util.ts").is_file());

        fs::write(root.join("x"), b"").unwrap();
        assert!(rename_entry(&s(&root.join("x")), "../escape").is_err());
        let absolute = if cfg!(windows) {
            "C:\\escape"
        } else {
            "/escape"
        };
        assert!(rename_entry(&s(&root.join("x")), absolute).is_err());
        assert!(rename_entry(&s(&root.join("x")), "  ").is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn case_only_rename_is_allowed() {
        let root = temp_dir();
        fs::write(root.join("readme.md"), b"").unwrap();
        rename_entry(&s(&root.join("readme.md")), "README.md").unwrap();
        let names: Vec<String> = fs::read_dir(&root)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["README.md".to_string()]);
        fs::remove_dir_all(&root).unwrap();
    }
}
