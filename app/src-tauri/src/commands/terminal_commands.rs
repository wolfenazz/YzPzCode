use serde::{Deserialize, Serialize};
use tauri::State;

use crate::terminal::{ManagedCommandManager, ManagedCommandState, TerminalManager};
use crate::types::{AgentType, CreateSessionsRequest, TerminalSession};

#[tauri::command]
pub async fn get_project_run_targets(
    cwd: String,
) -> Result<Vec<crate::terminal::project_run::ProjectRunTarget>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::terminal::project_run::detect_targets(&cwd))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

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

    Ok(session)
}

/// One terminal in a batch launch. Mirrors the single-session request so the
/// launcher can mix agents and shells in a single action.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSpec {
    pub agent: Option<AgentType>,
    pub shell: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionBatchRequest {
    pub workspace_id: String,
    pub workspace_path: String,
    pub start_index: usize,
    pub specs: Vec<SessionSpec>,
}

/// A batch never fails wholesale: sessions that started are returned even when
/// their siblings could not be created, so the caller can show what worked.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionBatchResult {
    pub sessions: Vec<TerminalSession>,
    pub errors: Vec<String>,
}

/// Upper bound for one launch action; keeps a mistyped count from spawning
/// dozens of PTY sessions at once. The launcher's own limit
/// (`MAX_LAUNCH_SESSIONS`, 16) is deliberately lower, so this is a backstop.
const MAX_BATCH_SESSIONS: usize = 24;

/// Adds `specs` to a workspace as sessions numbered from `start_index`.
/// Failures are collected per slot instead of aborting the whole batch, so a
/// single bad spec cannot silently drop the terminals after it.
fn create_batch(
    manager: &TerminalManager,
    workspace_id: &str,
    workspace_path: &str,
    start_index: usize,
    specs: &[SessionSpec],
) -> CreateSessionBatchResult {
    let mut sessions = Vec::with_capacity(specs.len());
    let mut errors = Vec::new();

    for (offset, spec) in specs.iter().enumerate() {
        let index = start_index + offset;
        match manager.create_single_session(
            workspace_id.to_string(),
            workspace_path.to_string(),
            index,
            spec.agent,
            spec.shell.clone(),
        ) {
            Ok(session) => sessions.push(session),
            Err(error) => errors.push(format!("Terminal {} failed: {}", index + 1, error)),
        }
    }

    CreateSessionBatchResult { sessions, errors }
}

/// Adds terminals to a workspace without touching the sessions already there.
/// `create_terminal_sessions` replaces a workspace's sessions, which the
/// launcher must not do when the user is adding to a running grid.
#[tauri::command]
pub async fn create_terminal_session_batch(
    manager: State<'_, TerminalManager>,
    request: CreateSessionBatchRequest,
) -> Result<CreateSessionBatchResult, String> {
    if request.specs.len() > MAX_BATCH_SESSIONS {
        return Err(format!(
            "Cannot open {} terminals at once (limit is {})",
            request.specs.len(),
            MAX_BATCH_SESSIONS
        ));
    }

    Ok(create_batch(
        manager.inner(),
        &request.workspace_id,
        &request.workspace_path,
        request.start_index,
        &request.specs,
    ))
}

#[tauri::command]
pub async fn create_terminal_sessions(
    manager: State<'_, TerminalManager>,
    managed_manager: State<'_, ManagedCommandManager>,
    request: CreateSessionsRequest,
) -> Result<Vec<TerminalSession>, String> {
    if let Err(e) = manager.kill_sessions_by_workspace(&request.workspace_id) {
        eprintln!("Warning: failed to kill existing sessions: {}", e);
    }
    if let Err(e) = managed_manager.stop_commands_by_workspace(&request.workspace_id) {
        eprintln!(
            "Warning: failed to stop managed commands for workspace {}: {}",
            request.workspace_id, e
        );
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

    // The frontend starts assigned agents only after it has mounted xterm and
    // subscribed to this session's output. Launching here races that setup on
    // app restore, so the first full-screen TUI frame can be emitted before a
    // terminal exists to render it (most visible on macOS).
    Ok(sessions)
}

#[tauri::command]
pub async fn write_to_terminal(
    manager: State<'_, TerminalManager>,
    managed_manager: State<'_, ManagedCommandManager>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    let managed_manager = managed_manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if managed_manager.is_active(&session_id) {
            managed_manager.write_input(&session_id, &input)
        } else {
            manager.write_to_session(&session_id, &input)
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_terminal(
    manager: State<'_, TerminalManager>,
    managed_manager: State<'_, ManagedCommandManager>,
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
        .map_err(|e| e.to_string())?;
    managed_manager
        .resize(
            &session_id,
            portable_pty::PtySize {
                cols: cols.max(2),
                rows: rows.max(2),
                pixel_width: pw.max(1),
                pixel_height: ph.max(1),
            },
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_session(
    manager: State<'_, TerminalManager>,
    managed_manager: State<'_, ManagedCommandManager>,
    session_id: String,
) -> Result<(), String> {
    managed_manager
        .stop_command(&session_id)
        .map_err(|e| e.to_string())?;
    manager.kill_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_workspace_sessions(
    manager: State<'_, TerminalManager>,
    managed_manager: State<'_, ManagedCommandManager>,
    workspace_id: String,
) -> Result<(), String> {
    managed_manager
        .stop_commands_by_workspace(&workspace_id)
        .map_err(|e| e.to_string())?;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunManagedTerminalCommandRequest {
    pub session_id: String,
    pub workspace_id: String,
    pub cwd: String,
    pub command: String,
}

#[tauri::command]
pub async fn run_managed_terminal_command(
    manager: State<'_, ManagedCommandManager>,
    terminal_manager: State<'_, TerminalManager>,
    request: RunManagedTerminalCommandRequest,
) -> Result<(), String> {
    if request.command.trim().is_empty() {
        return Err("Enter a command to run".into());
    }
    let size = terminal_manager
        .session_size(&request.session_id)
        .map_err(|e| e.to_string())?;
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        manager.run_command(
            &request.session_id,
            &request.workspace_id,
            &request.cwd,
            &request.command,
            size,
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_managed_terminal_input(
    manager: State<'_, ManagedCommandManager>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.write_input(&session_id, &input))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn stop_managed_terminal_command(
    manager: State<'_, ManagedCommandManager>,
    session_id: String,
) -> Result<(), String> {
    manager.stop_command(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_managed_terminal_command_state(
    manager: State<'_, ManagedCommandManager>,
    session_id: String,
) -> Result<Option<ManagedCommandState>, String> {
    Ok(manager.get_state(&session_id))
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

#[cfg(test)]
mod tests {
    use super::{CreateSessionBatchRequest, SessionSpec};
    use crate::types::AgentType;

    /// The launcher posts one spec per terminal, so the camelCase contract and
    /// the mixed agent/shell shape both have to survive deserialization.
    #[test]
    fn batch_request_accepts_mixed_agent_and_shell_specs() {
        let request: CreateSessionBatchRequest = serde_json::from_value(serde_json::json!({
            "workspaceId": "workspace-test",
            "workspacePath": "C:/workspace",
            "startIndex": 2,
            "specs": [
                { "agent": "claude", "shell": "C:/Windows/System32/cmd.exe" },
                { "agent": "claude", "shell": null },
                { "agent": null, "shell": null }
            ]
        }))
        .expect("batch launch payload must deserialize");

        assert_eq!(request.start_index, 2);
        assert_eq!(request.specs.len(), 3);
        assert_eq!(request.specs[0].agent, Some(AgentType::Claude));
        assert_eq!(request.specs[2].agent, None);
    }

    /// A spec with no agent is a plain shell; it must not require the field.
    #[test]
    fn session_spec_defaults_missing_agent_to_none() {
        let spec: SessionSpec = serde_json::from_value(serde_json::json!({ "shell": null }))
            .expect("a spec without an agent is a plain shell");

        assert_eq!(spec.agent, None);
        assert_eq!(spec.shell, None);
    }
}

/// Spawns real PTY sessions, so it follows the platform gate used by the other
/// terminal integration tests (see `terminal::session`).
#[cfg(all(test, target_os = "windows"))]
mod launch_tests {
    use super::{create_batch, SessionSpec};
    use crate::terminal::TerminalManager;

    fn plain_shell() -> SessionSpec {
        SessionSpec {
            agent: None,
            shell: None,
        }
    }

    /// The launcher's whole point: several terminals in one action, numbered
    /// from where the grid left off, with running terminals left untouched.
    #[test]
    fn batch_adds_terminals_without_touching_running_ones() {
        let manager = TerminalManager::default();
        let workspace_path = env!("CARGO_MANIFEST_DIR").to_string();

        let existing = manager
            .create_single_session(
                "ws-batch".to_string(),
                workspace_path.clone(),
                0,
                None,
                None,
            )
            .expect("create the terminal that is already open");

        let result = create_batch(
            &manager,
            "ws-batch",
            &workspace_path,
            1,
            &[plain_shell(), plain_shell(), plain_shell()],
        );

        assert!(
            result.errors.is_empty(),
            "every spec should have opened, got {:?}",
            result.errors
        );
        assert_eq!(result.sessions.len(), 3);

        let indices: Vec<usize> = result.sessions.iter().map(|s| s.index).collect();
        assert_eq!(indices, vec![1, 2, 3]);

        let mut ids: Vec<&str> = result.sessions.iter().map(|s| s.id.as_str()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 3, "each terminal needs its own session id");

        let open = manager.get_all_sessions();
        assert_eq!(open.len(), 4, "the batch must not replace the open grid");
        assert!(
            open.iter().any(|s| s.id == existing.id),
            "the terminal that was already open disappeared"
        );

        manager
            .kill_sessions_by_workspace("ws-batch")
            .expect("clean up the batch workspace");
        assert!(manager.get_all_sessions().is_empty());
    }

    /// An empty batch is a no-op rather than an error, so a launch with nothing
    /// queued cannot leave the caller with a spurious failure.
    #[test]
    fn empty_batch_creates_nothing() {
        let manager = TerminalManager::default();
        let result = create_batch(&manager, "ws-empty", env!("CARGO_MANIFEST_DIR"), 0, &[]);

        assert!(result.sessions.is_empty());
        assert!(result.errors.is_empty());
        assert!(manager.get_all_sessions().is_empty());
    }
}
