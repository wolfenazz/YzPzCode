use tauri::AppHandle;

use crate::hardware_acceleration;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareAccelerationState {
    /// The stored preference; applied on the next launch.
    pub enabled: bool,
    /// What the running session actually renders with.
    pub active: bool,
    /// Whether the platform can turn the GPU renderer on or off.
    pub supported: bool,
    pub requires_restart: bool,
}

#[tauri::command]
pub async fn get_hardware_acceleration(
    app: AppHandle,
) -> Result<HardwareAccelerationState, String> {
    let enabled = hardware_acceleration::stored(&app);
    let active = hardware_acceleration::active();
    Ok(HardwareAccelerationState {
        enabled,
        active,
        supported: hardware_acceleration::SUPPORTED,
        requires_restart: enabled != active,
    })
}

#[tauri::command]
pub async fn set_hardware_acceleration(app: AppHandle, enabled: bool) -> Result<(), String> {
    hardware_acceleration::store(&app, enabled)
}
