use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

struct WorkspaceWatcher {
    workspace_path: String,
    _watcher: RecommendedWatcher,
}

static FS_WATCHER: Mutex<Option<WorkspaceWatcher>> = Mutex::new(None);
const BATCH_INTERVAL: Duration = Duration::from_millis(100);

/// Ignore generated descendants, not similarly named ancestors of the workspace.
/// Directory creation/removal itself still updates the Explorer's parent listing.
fn should_ignore_path(path: &Path, workspace: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(workspace) else {
        return true;
    };
    let parts: Vec<_> = relative.components().collect();
    if parts.first().is_some_and(|part| part.as_os_str() == ".git") {
        let git_path = relative.to_string_lossy().replace('\\', "/");
        return !(matches!(
            git_path.as_str(),
            ".git/HEAD" | ".git/index" | ".git/config"
        ) || git_path.starts_with(".git/refs/"));
    }
    parts.iter().enumerate().any(|(index, part)| {
        let name = part.as_os_str().to_string_lossy().to_ascii_lowercase();
        name == ".git"
            || (index + 1 < parts.len()
                && matches!(
                    name.as_str(),
                    "node_modules"
                        | "target"
                        | "dist"
                        | "build"
                        | ".next"
                        | ".nuxt"
                        | "coverage"
                        | ".turbo"
                ))
    })
}

fn event_paths(result: Result<Event, notify::Error>, workspace: &Path) -> Vec<String> {
    match result {
        // Recover from overflow/backend errors with a complete reconciliation.
        Err(_) => vec![workspace.to_string_lossy().to_string()],
        Ok(event) if event.need_rescan() => vec![workspace.to_string_lossy().to_string()],
        // Reads from the editor must not trigger another read/refresh loop.
        Ok(event) if matches!(event.kind, EventKind::Access(_)) => Vec::new(),
        Ok(event) => {
            if event.paths.is_empty() {
                return vec![workspace.to_string_lossy().to_string()];
            }
            event
                .paths
                .iter()
                .filter(|path| !should_ignore_path(path, workspace))
                .map(|path| path.to_string_lossy().to_string())
                .collect()
        }
    }
}

fn create_workspace_watcher(
    workspace_path: String,
    emit: impl Fn(Vec<String>) + Send + 'static,
) -> Result<WorkspaceWatcher, String> {
    let root = PathBuf::from(&workspace_path);
    let (sender, receiver) = mpsc::channel();
    let callback_root = root.clone();
    let mut watcher = RecommendedWatcher::new(
        move |event| {
            let paths = event_paths(event, &callback_root);
            if !paths.is_empty() {
                let _ = sender.send(paths);
            }
        },
        Config::default(),
    )
    .map_err(|error| format!("Failed to create file watcher: {error}"))?;
    // Watch directories, not file handles: atomic save/replace and newly created
    // or renamed directory trees continue to be watched after the first event.
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| format!("Failed to watch {}: {error}", root.display()))?;
    std::thread::spawn(move || {
        let mut pending = HashSet::new();
        let mut deadline: Option<Instant> = None;
        loop {
            let result = match deadline {
                Some(time) => receiver.recv_timeout(time.saturating_duration_since(Instant::now())),
                None => receiver
                    .recv()
                    .map_err(|_| mpsc::RecvTimeoutError::Disconnected),
            };
            match result {
                Ok(paths) => {
                    pending.extend(paths);
                    // Fixed deadline bounds latency even while an agent writes continuously.
                    deadline.get_or_insert_with(|| Instant::now() + BATCH_INTERVAL);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let mut paths: Vec<String> = pending.drain().collect();
                    paths.sort();
                    emit(paths);
                    deadline = None;
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
    Ok(WorkspaceWatcher {
        workspace_path,
        _watcher: watcher,
    })
}

pub fn start_fs_watcher(app_handle: AppHandle, workspace_path: String) -> Result<(), String> {
    if !Path::new(&workspace_path).is_dir() {
        return Err(format!("Directory does not exist: {workspace_path}"));
    }
    let mut guard = FS_WATCHER.lock().map_err(|error| error.to_string())?;
    if guard
        .as_ref()
        .is_some_and(|watcher| watcher.workspace_path == workspace_path)
    {
        return Ok(());
    }
    let event_workspace = workspace_path.clone();
    let watcher = create_workspace_watcher(workspace_path, move |paths| {
        let _ = app_handle.emit(
            "file-system-changed",
            serde_json::json!({
                "workspacePath": event_workspace, "paths": paths,
            }),
        );
    })?;
    // Keep the previous watcher alive if starting the replacement fails.
    *guard = Some(watcher);
    Ok(())
}

pub fn stop_fs_watcher(workspace_path: &str) -> Result<(), String> {
    let mut guard = FS_WATCHER.lock().map_err(|error| error.to_string())?;
    // An old workspace's async cleanup cannot stop the new workspace's watcher.
    if guard
        .as_ref()
        .is_some_and(|watcher| watcher.workspace_path == workspace_path)
    {
        guard.take();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_only_generated_descendants_inside_the_workspace() {
        let root = Path::new("/tmp/project");
        assert!(!should_ignore_path(
            Path::new("/tmp/project/src/file.ts"),
            root
        ));
        assert!(!should_ignore_path(
            Path::new("/tmp/project/node_modules"),
            root
        ));
        assert!(should_ignore_path(
            Path::new("/tmp/project/node_modules/lib/file.js"),
            root
        ));
        assert!(should_ignore_path(
            Path::new("/tmp/project/.git/objects/hash"),
            root
        ));
        assert!(should_ignore_path(Path::new("/tmp/other/file.ts"), root));
    }

    #[test]
    fn real_watcher_keeps_bursts_new_directories_and_atomic_replacements() {
        let root = std::env::temp_dir().join(format!("yzpz-watch-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let (sender, receiver) = mpsc::channel();
        let watcher = create_workspace_watcher(root.to_string_lossy().to_string(), move |paths| {
            let _ = sender.send(paths);
        })
        .unwrap();
        let mut expected = HashSet::new();
        for index in 0..12 {
            let path = root.join(format!("file-{index}.txt"));
            std::fs::write(&path, "burst").unwrap();
            expected.insert(path.to_string_lossy().to_string());
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while !expected.is_empty() && Instant::now() < deadline {
            for path in receiver
                .recv_timeout(Duration::from_secs(1))
                .unwrap_or_default()
            {
                expected.remove(&path);
            }
        }
        assert!(expected.is_empty(), "lost burst paths: {expected:?}");
        let nested = root.join("new/deep");
        std::fs::create_dir_all(&nested).unwrap();
        let file = nested.join("agent.txt");
        std::fs::write(&file, "first").unwrap();
        let wait_for_file = |receiver: &mpsc::Receiver<Vec<String>>| {
            let deadline = Instant::now() + Duration::from_secs(5);
            while Instant::now() < deadline {
                if receiver
                    .recv_timeout(Duration::from_secs(1))
                    .unwrap_or_default()
                    .iter()
                    .any(|path| Path::new(path) == file.as_path())
                {
                    return;
                }
            }
            panic!("no event for {}", file.display());
        };
        wait_for_file(&receiver);
        let replacement = nested.join("replacement.tmp");
        std::fs::write(&replacement, "replacement").unwrap();
        std::fs::remove_file(&file).unwrap();
        std::fs::rename(&replacement, &file).unwrap();
        wait_for_file(&receiver);
        std::fs::write(&file, "after replacement").unwrap();
        wait_for_file(&receiver);
        std::fs::remove_file(&file).unwrap();
        wait_for_file(&receiver);
        drop(watcher);
        assert!(root.is_absolute() && root.parent() == Some(std::env::temp_dir().as_path()));
        std::fs::remove_dir_all(root).unwrap();
    }
}
