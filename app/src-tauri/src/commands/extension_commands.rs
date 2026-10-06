use crate::extension_host::{ExtensionHostManager, ExtensionInfo, PanelBounds};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_supported_extensions(
    app: AppHandle,
    manager: State<'_, ExtensionHostManager>,
) -> Result<Vec<ExtensionInfo>, String> {
    manager.catalog(&app).map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn check_extension_updates(
    app: AppHandle,
    manager: State<'_, ExtensionHostManager>,
) -> Result<std::collections::HashMap<String, String>, String> {
    manager
        .latest_versions(&app)
        .await
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn install_workspace_extension(
    app: AppHandle,
    manager: State<'_, ExtensionHostManager>,
    extension_id: String,
) -> Result<(), String> {
    manager
        .install(&app, &extension_id)
        .await
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn start_extension_panel(
    app: AppHandle,
    manager: State<'_, ExtensionHostManager>,
    panel_id: String,
    workspace_id: String,
    workspace_path: String,
    extension_id: String,
) -> Result<(), String> {
    manager
        .start_panel(
            &app,
            &panel_id,
            &workspace_id,
            &workspace_path,
            &extension_id,
        )
        .await
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn sync_extension_panel(
    app: AppHandle,
    manager: State<'_, ExtensionHostManager>,
    panel_id: String,
    bounds: PanelBounds,
    visible: bool,
) -> Result<(), String> {
    manager
        .sync_panel(&app, &panel_id, bounds, visible)
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn close_extension_panel(
    app: AppHandle,
    manager: State<'_, ExtensionHostManager>,
    panel_id: String,
) -> Result<(), String> {
    manager
        .close_panel(&app, &panel_id)
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn close_workspace_extension_panels(
    app: AppHandle,
    manager: State<'_, ExtensionHostManager>,
    workspace_id: String,
) -> Result<(), String> {
    manager
        .close_workspace(&app, &workspace_id)
        .map_err(|error| format!("{error:#}"))
}

/// Hands a prompt to the panel's assistant chat. The outcome arrives as an
/// `extension-panel-prompt-result` event carrying `request_id`.
#[tauri::command]
pub async fn send_extension_panel_prompt(
    app: AppHandle,
    manager: State<'_, ExtensionHostManager>,
    panel_id: String,
    request_id: String,
    text: String,
    submit: bool,
) -> Result<(), String> {
    manager
        .send_prompt(&app, &panel_id, &request_id, &text, submit)
        .map_err(|error| format!("{error:#}"))
}
