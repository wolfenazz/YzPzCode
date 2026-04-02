use serde::{Deserialize, Serialize};
use tauri::State;

use crate::agent_cli::CliLauncher;
use crate::terminal::TerminalManager;
use crate::types::{AgentType, CreateSessionsRequest, TerminalSession};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSingleSessionRequest {
    pub workspace_id: String,
    pub workspace_path: String,
    pub index: usize,
    pub agent: Option<AgentType>,
}

#[tauri::command]
pub async fn create_single_terminal_session(
    manager: State<'_, TerminalManager>,
    launcher: State<'_, CliLauncher>,
    request: CreateSingleSessionRequest,
) -> Result<TerminalSession, String> {
    let session = manager
        .create_single_session(
            request.workspace_id,
            request.workspace_path,
            request.index,
            request.agent,
        )
        .map_err(|e| e.to_string())?;

    if let Some(agent) = request.agent {
        if let Err(e) = launcher.launch_cli(&session.id, agent) {
            eprintln!(
                "Warning: failed to launch CLI for session {}: {}",
                session.id, e
            );
        }
    }

    Ok(session)
}

#[tauri::command]
pub async fn create_terminal_sessions(
    manager: State<'_, TerminalManager>,
    launcher: State<'_, CliLauncher>,
    request: CreateSessionsRequest,
) -> Result<Vec<TerminalSession>, String> {
    // Kill only existing sessions for this workspace to ensure a clean state
    if let Err(e) = manager.kill_sessions_by_workspace(&request.workspace_id) {
        eprintln!("Warning: failed to kill existing sessions: {}", e);
    }

    let sessions = manager
        .create_sessions(
            request.workspace_id,
            request.workspace_path,
            request.count,
            request.agent_fleet.allocation,
        )
        .map_err(|e| e.to_string())?;

    // Automatically launch CLI for sessions that have an agent assigned
    // We do this after creating all sessions
    for session in &sessions {
        if let Some(agent) = session.agent {
            if let Err(e) = launcher.launch_cli(&session.id, agent) {
                eprintln!(
                    "Warning: failed to launch CLI for session {}: {}",
                    session.id, e
                );
            }
        }
    }

    Ok(sessions)
}

#[tauri::command]
pub async fn write_to_terminal(
    manager: State<'_, TerminalManager>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    manager
        .write_to_session(&session_id, &input)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_terminal(
    manager: State<'_, TerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
    pixel_width: Option<u16>,
    pixel_height: Option<u16>,
) -> Result<(), String> {
    let pw = pixel_width.unwrap_or(0);
    let ph = pixel_height.unwrap_or(0);
    manager
        .resize_session(&session_id, cols, rows, pw, ph)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_session(
    manager: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), String> {
    manager.kill_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_workspace_sessions(
    manager: State<'_, TerminalManager>,
    workspace_id: String,
) -> Result<(), String> {
    manager
        .kill_sessions_by_workspace(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_sessions(
    manager: State<'_, TerminalManager>,
) -> Result<Vec<TerminalSession>, String> {
    Ok(manager.get_all_sessions())
}

pub fn get_grid_dimensions(count: usize) -> (usize, usize) {
    match count {
        1 => (1, 1),
        2 => (2, 1),
        4 => (2, 2),
        6 => (3, 2),
        8 => (4, 2),
        _ => (1, 1),
    }
}
