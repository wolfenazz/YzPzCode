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
    pub shell: Option<String>,
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
            request.shell,
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
    if let Err(e) = manager.kill_sessions_by_workspace(&request.workspace_id) {
        eprintln!("Warning: failed to kill existing sessions: {}", e);
    }

    let sessions = manager
        .create_sessions(
            request.workspace_id,
            request.workspace_path,
            request.count,
            request.agent_fleet.allocation,
            request.shell,
        )
        .map_err(|e| e.to_string())?;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellOption {
    pub name: String,
    pub path: String,
    pub is_available: bool,
}

#[tauri::command]
pub async fn get_available_shells() -> Result<Vec<ShellOption>, String> {
    let mut shells = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let candidates = vec![
            ("PowerShell 7", "pwsh"),
            ("PowerShell", "powershell"),
            ("Command Prompt", "cmd"),
            ("Git Bash", "bash"),
        ];
        for (name, binary) in candidates {
            let path = which::which(binary)
                .ok()
                .map(|p| p.to_string_lossy().to_string());
            shells.push(ShellOption {
                name: name.to_string(),
                path: path.clone().unwrap_or_default(),
                is_available: path.is_some(),
            });
        }
    }

    #[cfg(target_os = "macos")]
    {
        let candidates = vec![
            ("zsh", "/bin/zsh"),
            ("bash", "/bin/bash"),
            ("fish", "/opt/homebrew/bin/fish"),
            ("fish (alt)", "/usr/local/bin/fish"),
        ];
        for (name, path) in candidates {
            let available = std::path::Path::new(path).exists() || which::which(name).is_ok();
            let resolved = which::which(name)
                .ok()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or(path.to_string());
            shells.push(ShellOption {
                name: name.to_string(),
                path: resolved,
                is_available: available,
            });
        }
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let candidates = vec![
            ("bash", "/bin/bash"),
            ("zsh", "/usr/bin/zsh"),
            ("fish", "/usr/bin/fish"),
            ("sh", "/bin/sh"),
        ];
        for (name, path) in candidates {
            let available = std::path::Path::new(path).exists() || which::which(name).is_ok();
            let resolved = which::which(name)
                .ok()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or(path.to_string());
            shells.push(ShellOption {
                name: name.to_string(),
                path: resolved,
                is_available: available,
            });
        }
    }

    Ok(shells)
}
