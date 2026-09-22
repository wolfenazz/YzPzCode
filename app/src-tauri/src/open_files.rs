use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use crate::types::FileEntry;

/// Holds files passed to the process by an operating-system file association.
///
/// The queue is intentionally drained by the frontend instead of emitting the
/// paths directly during startup. Webview event listeners are not installed
/// yet on a cold launch, so an event-only implementation can silently lose the
/// file the user asked to open.
#[derive(Clone, Default)]
pub struct OpenFileManager {
    pending: Arc<Mutex<Vec<FileEntry>>>,
}

impl OpenFileManager {
    pub fn enqueue_candidates<I, P>(&self, candidates: I, cwd: &Path) -> usize
    where
        I: IntoIterator<Item = P>,
        P: AsRef<OsStr>,
    {
        let entries = candidates
            .into_iter()
            .filter_map(|candidate| file_entry_from_argument(candidate.as_ref(), cwd))
            .collect::<Vec<_>>();

        if entries.is_empty() {
            return 0;
        }

        let mut pending = self.pending.lock().unwrap();
        let mut known_paths = pending
            .iter()
            .map(|entry| path_key(Path::new(&entry.path)))
            .collect::<HashSet<_>>();
        let mut added = 0;

        for entry in entries {
            if known_paths.insert(path_key(Path::new(&entry.path))) {
                pending.push(entry);
                added += 1;
            }
        }

        added
    }

    pub fn take_pending(&self) -> Vec<FileEntry> {
        let mut pending = self.pending.lock().unwrap();
        std::mem::take(&mut *pending)
    }
}

fn file_entry_from_argument(argument: &OsStr, cwd: &Path) -> Option<FileEntry> {
    if argument.is_empty() || argument.to_string_lossy().starts_with('-') {
        return None;
    }

    let argument_path = PathBuf::from(argument);
    let absolute_path = if argument_path.is_absolute() {
        argument_path
    } else {
        cwd.join(argument_path)
    };
    let canonical_path = absolute_path.canonicalize().ok()?;
    let metadata = canonical_path.metadata().ok()?;

    if !metadata.is_file() {
        return None;
    }

    let name = canonical_path.file_name()?.to_string_lossy().into_owned();
    let extension = canonical_path
        .extension()
        .and_then(OsStr::to_str)
        .map(|value| value.to_lowercase());
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    Some(FileEntry {
        name,
        path: canonical_path.to_string_lossy().into_owned(),
        is_dir: false,
        size: metadata.len(),
        modified_at,
        extension,
    })
}

fn path_key(path: &Path) -> String {
    let value = path.to_string_lossy().into_owned();
    #[cfg(target_os = "windows")]
    {
        value.to_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn queues_only_existing_files_and_deduplicates_them() {
        let test_dir =
            std::env::temp_dir().join(format!("yzpzcode-open-file-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&test_dir).unwrap();
        let file_path = test_dir.join("example.tsx");
        fs::write(&file_path, "export default 1;").unwrap();

        let manager = OpenFileManager::default();
        assert_eq!(manager.enqueue_candidates([&file_path], &test_dir), 1);
        assert_eq!(manager.enqueue_candidates([&file_path], &test_dir), 0);
        assert_eq!(
            manager.enqueue_candidates([test_dir.join("missing.tsx")], &test_dir),
            0
        );

        let pending = manager.take_pending();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].name, "example.tsx");
        assert_eq!(pending[0].extension.as_deref(), Some("tsx"));
        assert!(manager.take_pending().is_empty());

        fs::remove_dir_all(test_dir).unwrap();
    }

    #[test]
    fn resolves_relative_arguments_against_the_launch_directory() {
        let test_dir =
            std::env::temp_dir().join(format!("yzpzcode-open-file-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&test_dir).unwrap();
        fs::write(test_dir.join("notes.md"), "# Notes").unwrap();

        let manager = OpenFileManager::default();
        assert_eq!(manager.enqueue_candidates(["notes.md"], &test_dir), 1);
        assert!(Path::new(&manager.take_pending()[0].path).is_absolute());

        fs::remove_dir_all(test_dir).unwrap();
    }
}
