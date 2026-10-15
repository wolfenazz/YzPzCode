//! The "Hardware acceleration" appearance setting.
//!
//! The app renders inside WebView2 on Windows, where GPU use is decided by
//! browser arguments at webview creation. Two WebView2 rules shape this
//! module:
//!
//! - the arguments must be known before the first webview exists, so the
//!   preference is stored as a small JSON file beside the app's configuration
//!   instead of the UI's localStorage;
//! - every webview sharing the app's user-data folder must be created with
//!   identical arguments, so the file is read once per process ([`load`]) and
//!   every builder applies [`active`] through [`apply_to_webview_window`] or
//!   [`apply_to_webview`].
//!
//! As in Discord, changing the setting takes effect on the next launch.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

/// Browser arguments that turn GPU rendering off. They replace wry's defaults,
/// so wry's feature-disables are repeated here; without them the WebView2 mini
/// menu and SmartScreen come back.
#[cfg(target_os = "windows")]
const DISABLED_BROWSER_ARGS: &str =
    "--disable-gpu --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

const SETTINGS_FILE: &str = "hardware-acceleration.json";

/// Whether this platform can turn the GPU renderer on or off at all.
pub const SUPPORTED: bool = cfg!(target_os = "windows");

/// The value every webview created by this process must use.
static ENABLED: OnceLock<bool> = OnceLock::new();

#[derive(serde::Deserialize, serde::Serialize)]
struct StoredPreference {
    enabled: bool,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(SETTINGS_FILE))
        .map_err(|e| format!("Could not locate the app configuration folder: {e}"))
}

/// Anything unreadable (missing file, edits gone wrong) means the default:
/// acceleration on, the way the app has always rendered.
fn read_enabled(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<StoredPreference>(&raw).ok())
        .map(|stored| stored.enabled)
        .unwrap_or(true)
}

fn write_enabled(path: &Path, enabled: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create {}: {e}", parent.display()))?;
    }
    let raw =
        serde_json::to_string_pretty(&StoredPreference { enabled }).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

/// Reads the stored preference once; call before creating the first webview.
pub fn load(app: &AppHandle) {
    let _ = ENABLED.get_or_init(|| {
        settings_path(app)
            .map(|path| read_enabled(&path))
            .unwrap_or(true)
    });
}

/// The value decided at startup: what every webview in this process uses.
pub fn active() -> bool {
    ENABLED.get().copied().unwrap_or(true)
}

/// The value that will apply after the next restart.
pub fn stored(app: &AppHandle) -> bool {
    settings_path(app)
        .map(|path| read_enabled(&path))
        .unwrap_or(true)
}

/// Saves the preference. It takes effect on the next launch.
pub fn store(app: &AppHandle, enabled: bool) -> Result<(), String> {
    write_enabled(&settings_path(app)?, enabled)
}

/// Adds the GPU-disabling browser arguments when the user turned hardware
/// acceleration off. No-op while acceleration is on, or off Windows.
pub fn apply_to_webview_window<R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'_, R, M>,
) -> tauri::WebviewWindowBuilder<'_, R, M> {
    #[cfg(target_os = "windows")]
    if !active() {
        return builder.additional_browser_args(DISABLED_BROWSER_ARGS);
    }
    builder
}

/// [`apply_to_webview_window`] for webviews embedded into an existing window.
pub fn apply_to_webview<R: tauri::Runtime>(
    builder: tauri::webview::WebviewBuilder<R>,
) -> tauri::webview::WebviewBuilder<R> {
    #[cfg(target_os = "windows")]
    if !active() {
        return builder.additional_browser_args(DISABLED_BROWSER_ARGS);
    }
    builder
}

#[cfg(test)]
mod tests {
    use super::{read_enabled, write_enabled};
    use std::path::PathBuf;

    fn unique_path(tag: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("yzpz-hardware-acceleration-{tag}-{stamp}.json"))
    }

    #[test]
    fn missing_file_means_enabled() {
        assert!(read_enabled(&unique_path("missing")));
    }

    #[test]
    fn malformed_file_means_enabled() {
        let path = unique_path("malformed");
        std::fs::write(&path, "{not json").expect("write malformed settings");
        assert!(read_enabled(&path));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn round_trips_the_preference() {
        let path = unique_path("round-trip");
        write_enabled(&path, false).expect("write disabled");
        assert!(!read_enabled(&path));
        write_enabled(&path, true).expect("write enabled");
        assert!(read_enabled(&path));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn writes_through_new_directories() {
        let dir = unique_path("nested-dir");
        let path = dir.join("nested").join("hardware-acceleration.json");
        write_enabled(&path, false).expect("write through nested dirs");
        assert!(!read_enabled(&path));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
