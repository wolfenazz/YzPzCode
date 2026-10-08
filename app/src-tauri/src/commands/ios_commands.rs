use std::time::{SystemTime, UNIX_EPOCH};

use tauri::ipc::Channel;
use tauri::State;

use crate::android::emulator::{ScreenEvent, ScreenStreamInfo, StartOptions, TouchPoint};
use crate::ios::simulator::{IosSnapshot, SimulatorInstance};
use crate::ios::SimulatorManager;

// The iOS Simulator counterparts of the `android_*` device commands, with the
// same arguments, so the device panel calls one or the other by platform.

#[tauri::command]
pub async fn ios_list_simulators(
    simulators: State<'_, SimulatorManager>,
) -> Result<IosSnapshot, String> {
    Ok(simulators.snapshot().await)
}

#[tauri::command]
pub async fn ios_start_simulator(
    simulators: State<'_, SimulatorManager>,
    udid: String,
    options: Option<StartOptions>,
) -> Result<SimulatorInstance, String> {
    simulators
        .start(udid, options.unwrap_or_default().wipe_data)
        .await
}

#[tauri::command]
pub async fn ios_stop_simulator(
    simulators: State<'_, SimulatorManager>,
    serial: String,
) -> Result<(), String> {
    simulators.stop(&serial).await
}

#[tauri::command]
pub fn ios_dismiss_simulator(simulators: State<'_, SimulatorManager>, serial: String) {
    simulators.dismiss(&serial);
}

#[tauri::command]
pub async fn ios_simulator_stream_start(
    simulators: State<'_, SimulatorManager>,
    serial: String,
    width: u32,
    height: u32,
    channel: Channel<ScreenEvent>,
) -> Result<ScreenStreamInfo, String> {
    simulators
        .start_stream(&serial, width, height, channel)
        .await
}

#[tauri::command]
pub fn ios_simulator_stream_stop(simulators: State<'_, SimulatorManager>, stream_id: String) {
    simulators.stop_stream(&stream_id);
}

#[tauri::command]
pub async fn ios_simulator_touch(
    simulators: State<'_, SimulatorManager>,
    serial: String,
    points: Vec<TouchPoint>,
) -> Result<(), String> {
    simulators.touch(&serial, points).await
}

#[tauri::command]
pub async fn ios_simulator_scroll(
    simulators: State<'_, SimulatorManager>,
    serial: String,
    from: (f64, f64),
    to: (f64, f64),
) -> Result<(), String> {
    simulators.scroll(&serial, from, to).await
}

#[tauri::command]
pub async fn ios_simulator_key(
    simulators: State<'_, SimulatorManager>,
    serial: String,
    key: String,
    event_type: Option<String>,
) -> Result<(), String> {
    simulators.key(&serial, &key, event_type.as_deref()).await
}

/// Types text; returns false when it went to the simulator pasteboard instead.
#[tauri::command]
pub async fn ios_simulator_text(
    simulators: State<'_, SimulatorManager>,
    serial: String,
    text: String,
) -> Result<bool, String> {
    simulators.text(&serial, text).await
}

#[tauri::command]
pub async fn ios_simulator_rotate(
    simulators: State<'_, SimulatorManager>,
    serial: String,
    clockwise: bool,
) -> Result<(), String> {
    simulators.rotate(&serial, clockwise).await
}

/// Saves a full-resolution PNG to Pictures/YzPzCode and returns its path.
#[tauri::command]
pub async fn ios_simulator_screenshot(
    simulators: State<'_, SimulatorManager>,
    serial: String,
) -> Result<String, String> {
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
    let path = dir.join(format!("simulator-{stamp}.png"));
    simulators.screenshot(&serial, &path).await?;
    Ok(path.to_string_lossy().to_string())
}
