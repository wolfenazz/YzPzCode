use std::time::{SystemTime, UNIX_EPOCH};

use tauri::ipc::Channel;
use tauri::State;

use crate::android::avd::{list_avds, AvdInfo};
use crate::android::emulator::{
    EmulatorInfo, ScreenEvent, ScreenStreamInfo, StartOptions, TouchPoint,
};
use crate::android::flutter::{self, FlutterDevice, FlutterRunRequest, FlutterRunState};
use crate::android::proto::KeyEventType;
use crate::android::setup::{self, SetupReport};
use crate::android::skin::{self, DeviceSkin};
use crate::android::{EmulatorManager, FlutterRunManager, FlutterSetupManager};

// ── Environment setup ────────────────────────────────────────────────────

#[tauri::command]
pub async fn android_setup_check(
    setup: State<'_, FlutterSetupManager>,
) -> Result<SetupReport, String> {
    Ok(setup::check(setup.running_step()).await)
}

#[tauri::command]
pub fn android_setup_run(
    setup: State<'_, FlutterSetupManager>,
    steps: Vec<String>,
) -> Result<(), String> {
    setup.start(steps)
}

#[tauri::command]
pub fn android_setup_cancel(setup: State<'_, FlutterSetupManager>) {
    setup.cancel();
}

// ── Emulator ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn android_list_avds() -> Vec<AvdInfo> {
    list_avds()
}

/// The AVD's device frame from its SDK skin, if it has one.
#[tauri::command]
pub async fn android_avd_skin(avd_name: String) -> Result<Option<DeviceSkin>, String> {
    tokio::task::spawn_blocking(move || skin::skin_for_avd(&avd_name))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn android_list_emulators(
    emulators: State<'_, EmulatorManager>,
) -> Result<Vec<EmulatorInfo>, String> {
    let emulators = emulators.inner().clone();
    tokio::task::spawn_blocking(move || emulators.list())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn android_start_emulator(
    emulators: State<'_, EmulatorManager>,
    avd_name: String,
    options: Option<StartOptions>,
) -> Result<EmulatorInfo, String> {
    emulators.start(avd_name, options.unwrap_or_default()).await
}

#[tauri::command]
pub async fn android_stop_emulator(
    emulators: State<'_, EmulatorManager>,
    serial: String,
) -> Result<(), String> {
    emulators.stop(&serial).await
}

#[tauri::command]
pub fn android_dismiss_emulator(emulators: State<'_, EmulatorManager>, serial: String) {
    emulators.dismiss(&serial);
}

#[tauri::command]
pub async fn android_emulator_stream_start(
    emulators: State<'_, EmulatorManager>,
    serial: String,
    width: u32,
    height: u32,
    channel: Channel<ScreenEvent>,
) -> Result<ScreenStreamInfo, String> {
    emulators
        .start_stream(&serial, width, height, channel)
        .await
}

#[tauri::command]
pub fn android_emulator_stream_stop(emulators: State<'_, EmulatorManager>, stream_id: String) {
    emulators.stop_stream(&stream_id);
}

#[tauri::command]
pub async fn android_emulator_touch(
    emulators: State<'_, EmulatorManager>,
    serial: String,
    points: Vec<TouchPoint>,
) -> Result<(), String> {
    emulators.touch(&serial, points).await
}

#[tauri::command]
pub async fn android_emulator_scroll(
    emulators: State<'_, EmulatorManager>,
    serial: String,
    from: (f64, f64),
    to: (f64, f64),
) -> Result<(), String> {
    emulators.scroll(&serial, from, to).await
}

#[tauri::command]
pub async fn android_emulator_key(
    emulators: State<'_, EmulatorManager>,
    serial: String,
    key: String,
    event_type: Option<String>,
) -> Result<(), String> {
    let event = match event_type.as_deref() {
        Some("down") => KeyEventType::Keydown,
        Some("up") => KeyEventType::Keyup,
        _ => KeyEventType::Keypress,
    };
    emulators.key(&serial, key, event).await
}

/// Types text into the device; returns false when it went to the device
/// clipboard instead (long text).
#[tauri::command]
pub async fn android_emulator_text(
    emulators: State<'_, EmulatorManager>,
    serial: String,
    text: String,
) -> Result<bool, String> {
    emulators.text(&serial, text).await
}

#[tauri::command]
pub async fn android_emulator_rotate(
    emulators: State<'_, EmulatorManager>,
    serial: String,
    clockwise: bool,
) -> Result<(), String> {
    emulators.rotate(&serial, clockwise).await
}

/// Saves a full-resolution PNG to Pictures/YzPzCode and returns its path.
#[tauri::command]
pub async fn android_emulator_screenshot(
    emulators: State<'_, EmulatorManager>,
    serial: String,
) -> Result<String, String> {
    let png = emulators.screenshot_png(&serial).await?;
    let dir = crate::android::sdk::home_dir()
        .join("Pictures")
        .join("YzPzCode");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("{serial}-{stamp}.png"));
    tokio::fs::write(&path, png)
        .await
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// ── Flutter ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn flutter_list_devices() -> Result<Vec<FlutterDevice>, String> {
    flutter::list_devices().await
}

#[tauri::command]
pub async fn flutter_run_start(
    runs: State<'_, FlutterRunManager>,
    workspace_id: String,
    request: FlutterRunRequest,
) -> Result<FlutterRunState, String> {
    runs.start(workspace_id, request).await
}

#[tauri::command]
pub async fn flutter_run_reload(
    runs: State<'_, FlutterRunManager>,
    workspace_id: String,
    full: bool,
) -> Result<(), String> {
    runs.reload(&workspace_id, full).await
}

#[tauri::command]
pub async fn flutter_run_stop(
    runs: State<'_, FlutterRunManager>,
    workspace_id: String,
) -> Result<(), String> {
    runs.stop(&workspace_id).await
}

#[tauri::command]
pub fn flutter_run_state(
    runs: State<'_, FlutterRunManager>,
    workspace_id: String,
) -> Option<FlutterRunState> {
    runs.state(&workspace_id)
}

#[tauri::command]
pub async fn flutter_pub_get(
    runs: State<'_, FlutterRunManager>,
    workspace_id: String,
    cwd: String,
) -> Result<(), String> {
    runs.pub_get(workspace_id, cwd).await
}
