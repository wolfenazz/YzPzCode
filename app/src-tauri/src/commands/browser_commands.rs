use serde::{Deserialize, Serialize};
use tauri::{State, Webview};

use crate::browser::{
    BrowserBounds, BrowserManager, BrowserPageStateCommandPayload, BrowserSelectedElementPayload,
    BrowserSnapshotCommandPayload, BrowserViewState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureBrowserViewRequest {
    pub workspace_id: String,
    pub url: String,
    pub bounds: BrowserBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBoundsRequest {
    pub workspace_id: String,
    pub bounds: BrowserBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserNavigationRequest {
    pub workspace_id: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserWorkspaceRequest {
    pub workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInspectModeRequest {
    pub workspace_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserZoomRequest {
    pub workspace_id: String,
    pub zoom_factor: f64,
}

#[tauri::command]
pub async fn ensure_browser_view(
    manager: State<'_, BrowserManager>,
    request: EnsureBrowserViewRequest,
) -> Result<BrowserViewState, String> {
    manager
        .ensure_view(&request.workspace_id, &request.url, request.bounds)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_browser_view(
    manager: State<'_, BrowserManager>,
    request: BrowserBoundsRequest,
) -> Result<(), String> {
    manager
        .resize_view(&request.workspace_id, request.bounds)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn navigate_browser_view(
    manager: State<'_, BrowserManager>,
    request: BrowserNavigationRequest,
) -> Result<BrowserViewState, String> {
    manager
        .navigate(&request.workspace_id, &request.url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reload_browser_view(
    manager: State<'_, BrowserManager>,
    request: BrowserWorkspaceRequest,
) -> Result<(), String> {
    manager
        .reload(&request.workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_browser_view_visibility(
    manager: State<'_, BrowserManager>,
    workspace_id: String,
    visible: bool,
) -> Result<(), String> {
    manager
        .set_visibility(&workspace_id, visible)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_browser_view(
    manager: State<'_, BrowserManager>,
    request: BrowserWorkspaceRequest,
) -> Result<(), String> {
    manager.close(&request.workspace_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_browser_inspect_mode(
    manager: State<'_, BrowserManager>,
    request: BrowserInspectModeRequest,
) -> Result<(), String> {
    manager
        .set_inspect_mode(&request.workspace_id, request.enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_browser_zoom(
    manager: State<'_, BrowserManager>,
    request: BrowserZoomRequest,
) -> Result<(), String> {
    manager
        .set_zoom(&request.workspace_id, request.zoom_factor)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_go_back(
    manager: State<'_, BrowserManager>,
    request: BrowserWorkspaceRequest,
) -> Result<(), String> {
    manager
        .go_back(&request.workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_go_forward(
    manager: State<'_, BrowserManager>,
    request: BrowserWorkspaceRequest,
) -> Result<(), String> {
    manager
        .go_forward(&request.workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn request_browser_snapshot(
    manager: State<'_, BrowserManager>,
    request: BrowserWorkspaceRequest,
) -> Result<(), String> {
    manager
        .request_snapshot(&request.workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_element_selected(
    webview: Webview,
    manager: State<'_, BrowserManager>,
    payload: BrowserSelectedElementPayload,
) -> Result<(), String> {
    manager
        .handle_element_selected(webview.label(), payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_inspect_cancelled(
    webview: Webview,
    manager: State<'_, BrowserManager>,
) -> Result<(), String> {
    manager
        .handle_inspect_cancelled(webview.label())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_page_state_changed(
    webview: Webview,
    manager: State<'_, BrowserManager>,
    payload: BrowserPageStateCommandPayload,
) -> Result<(), String> {
    manager
        .handle_page_state_changed(webview.label(), payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_snapshot_exported(
    webview: Webview,
    manager: State<'_, BrowserManager>,
    payload: BrowserSnapshotCommandPayload,
) -> Result<(), String> {
    manager
        .handle_snapshot_exported(webview.label(), payload)
        .map_err(|e| e.to_string())
}
