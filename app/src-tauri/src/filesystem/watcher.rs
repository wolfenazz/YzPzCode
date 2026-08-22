use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::event::CreateKind;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

static FS_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
use std::sync::LazyLock;

static LAST_EMIT: LazyLock<Mutex<Instant>> = LazyLock::new(|| Mutex::new(Instant::now()));
const DEBOUNCE_INTERVAL: Duration = Duration::from_millis(300);

fn should_ignore_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    const IGNORED_SEGMENTS: &[&str] = &[
        "/.git/",
        "/node_modules/",
        "/dist/",
        "/build/",
        "/target/",
        "/.next/",
        "/.nuxt/",
        "/coverage/",
        "/tmp/",
        "/temp/",
        "/.turbo/",
    ];

    IGNORED_SEGMENTS
        .iter()
        .any(|segment| normalized.contains(segment))
}

/// Returns true when `child` is a direct child of `root` (compared
/// case-insensitively to be safe on Windows).
fn is_top_level_child(child: &Path, root: &Path) -> bool {
    let Some(parent) = child.parent() else {
        return false;
    };
    if parent == root {
        return true;
    }
    // Fall back to a normalized string comparison (handles trailing slashes
    // and casing differences).
    let parent_norm = parent.to_string_lossy().to_ascii_lowercase();
    let root_norm = root.to_string_lossy().to_ascii_lowercase();
    parent_norm.trim_end_matches(['/', '\\']) == root_norm.trim_end_matches(['/', '\\'])
}

pub fn start_fs_watcher(app_handle: AppHandle, workspace_path: String) -> Result<(), String> {
    let path = PathBuf::from(&workspace_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", workspace_path));
    }

    stop_fs_watcher()?;

    let handle = app_handle.clone();
    let watcher_path = workspace_path.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            let event = match res {
                Ok(e) => e,
                Err(_) => return,
            };

            // Re-watch newly created top-level directories so deep changes
            // inside them keep producing events. The static FS_WATCHER is
            // already populated by the time events start arriving, and we only
            // hold the lock for the duration of the (cheap) watch() call.
            if matches!(event.kind, EventKind::Create(CreateKind::Folder)) {
                for path in &event.paths {
                    let display = path.to_string_lossy().to_string();
                    if should_ignore_path(&display) {
                        continue;
                    }
                    if is_top_level_child(path, Path::new(&watcher_path)) {
                        if let Ok(mut guard) = FS_WATCHER.lock() {
                            if let Some(w) = guard.as_mut() {
                                let _ = w.watch(path, RecursiveMode::Recursive);
                            }
                        }
                    }
                }
            }

            let now = Instant::now();
            if let Ok(mut last) = LAST_EMIT.lock() {
                if now.duration_since(*last) < DEBOUNCE_INTERVAL {
                    return;
                }
                *last = now;
            }

            let changed_paths: Vec<String> = event
                .paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .filter(|path| !should_ignore_path(path))
                .collect();

            if changed_paths.is_empty() {
                return;
            }

            let _ = handle.emit(
                "file-system-changed",
                serde_json::json!({
                    "workspacePath": watcher_path,
                    "paths": changed_paths,
                }),
            );
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to start watching workspace root: {}", e))?;

    if let Ok(entries) = std::fs::read_dir(&path) {
        for entry in entries.flatten() {
            let child_path = entry.path();
            let child_display = child_path.to_string_lossy().to_string();

            if should_ignore_path(&child_display) {
                continue;
            }

            let mode = if child_path.is_dir() {
                RecursiveMode::Recursive
            } else {
                RecursiveMode::NonRecursive
            };

            watcher
                .watch(&child_path, mode)
                .map_err(|e| format!("Failed to watch path {}: {}", child_display, e))?;
        }
    }

    let mut guard = FS_WATCHER
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    *guard = Some(watcher);

    Ok(())
}

pub fn stop_fs_watcher() -> Result<(), String> {
    let mut guard = FS_WATCHER
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let _ = guard.take();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // Platform-neutral cases (forward-slash relative paths) must hold on every
    // OS. Windows-only `C:\`-style assertions are gated behind `#[cfg(windows)]`
    // because a backslash is NOT a separator on Unix — `Path::new(r"C:\a\b")`
    // is a single component there, which made these tests fail on macOS/Linux.

    #[test]
    fn detects_direct_children() {
        let root = Path::new("workspace");
        assert!(is_top_level_child(Path::new("workspace/src"), root));
        assert!(is_top_level_child(
            Path::new("workspace/package.json"),
            root
        ));

        #[cfg(windows)]
        {
            let win_root = Path::new(r"C:\workspace");
            assert!(is_top_level_child(Path::new(r"C:\workspace\src"), win_root));
            assert!(is_top_level_child(
                Path::new(r"C:\workspace\package.json"),
                win_root
            ));
        }
    }

    #[test]
    fn rejects_nested_paths_and_root_itself() {
        let root = Path::new("workspace");
        assert!(!is_top_level_child(Path::new("workspace/src/deep"), root));
        assert!(!is_top_level_child(Path::new("workspace"), root));
        assert!(!is_top_level_child(Path::new("other"), root));

        #[cfg(windows)]
        {
            let win_root = Path::new(r"C:\workspace");
            assert!(!is_top_level_child(
                Path::new(r"C:\workspace\src\deep"),
                win_root
            ));
            assert!(!is_top_level_child(Path::new(r"C:\workspace"), win_root));
            assert!(!is_top_level_child(Path::new(r"C:\other"), win_root));
        }
    }

    #[test]
    fn handles_trailing_separator_and_case() {
        let root = Path::new("workspace");
        // Trailing-separator spelling of the root itself is NOT a child.
        assert!(!is_top_level_child(Path::new("workspace/"), root));
        // Case differences are normalized away (Windows-safety fallback).
        assert!(is_top_level_child(Path::new("WORKSPACE/SRC"), root));

        #[cfg(windows)]
        {
            let win_root = Path::new(r"C:\workspace");
            assert!(!is_top_level_child(Path::new(r"C:\workspace\"), win_root));
            assert!(is_top_level_child(Path::new(r"C:\WORKSPACE\SRC"), win_root));
        }
    }
}
