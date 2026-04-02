use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

static FS_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
use std::sync::LazyLock;

static LAST_EMIT: LazyLock<Mutex<Instant>> = LazyLock::new(|| Mutex::new(Instant::now()));
const DEBOUNCE_INTERVAL: Duration = Duration::from_millis(300);

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
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to start watching: {}", e))?;

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

    if let Some(mut watcher) = guard.take() {
        watcher.unwatch(PathBuf::new().as_path()).unwrap_or(());
    }

    Ok(())
}
