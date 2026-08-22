use anyhow::{Context, Result};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::agent_cli::get_provider;
use crate::terminal::TerminalManager;
use crate::types::AgentType;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CliLaunchStatus {
    NotLaunched,
    Starting,
    Running,
    AuthenticationRequired,
    Error,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliLaunchState {
    pub session_id: String,
    pub agent: AgentType,
    pub status: CliLaunchStatus,
    pub error: Option<String>,
    pub version: Option<String>,
}

#[derive(Clone)]
pub struct CliLauncher {
    terminal_manager: TerminalManager,
    launch_states: Arc<Mutex<Vec<CliLaunchState>>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

impl CliLauncher {
    pub fn new(terminal_manager: TerminalManager) -> Self {
        CliLauncher {
            terminal_manager,
            launch_states: Arc::new(Mutex::new(Vec::new())),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        let mut app = self.app_handle.lock().unwrap();
        *app = Some(handle);
    }

    pub fn launch_cli(&self, session_id: &str, agent: AgentType) -> Result<()> {
        // Prevent double launch if already starting or running
        {
            let states = self.launch_states.lock().unwrap();
            if let Some(s) = states.iter().find(|s| s.session_id == session_id) {
                if s.status == CliLaunchStatus::Starting || s.status == CliLaunchStatus::Running {
                    return Ok(()); // Already launching or running
                }
            }
        }

        let binary_name = crate::agent_cli::CliLauncher::get_binary_name(agent);
        let launch_command = if agent == AgentType::CommandCode {
            format!("{} --yolo", binary_name)
        } else {
            binary_name.to_string()
        };

        // The PTY session is spawned with a fully-populated PATH (see
        // terminal::session::PtySession::create), so the agent binary resolves
        // exactly like it would in a native shell window. Launch it with the
        // plain binary name — no environment setup prefix required.
        let state = CliLaunchState {
            session_id: session_id.to_string(),
            agent,
            status: CliLaunchStatus::Starting,
            error: None,
            version: None,
        };

        // Wait a bit for the shell to be ready to receive input
        let tm = self.terminal_manager.clone();
        let launcher = self.clone();
        let sid = session_id.to_string();
        let mut state_clone = state.clone();

        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(2000));
            println!(
                "[CLI] Attempting to launch '{}' in session {}",
                launch_command, sid
            );
            match tm.write_to_session(&sid, &launch_command) {
                Ok(()) => {
                    // Send Enter in a separate PTY write. Interactive TUIs
                    // such as OpenCode and Kilo can ignore an initial submit
                    // when it arrives in the same byte frame as the command.
                    std::thread::sleep(std::time::Duration::from_millis(120));
                    if let Err(e) = tm.write_to_session(&sid, "\r") {
                        eprintln!(
                            "[CLI] Failed to submit launch command in session {}: {}",
                            sid, e
                        );
                        state_clone.status = CliLaunchStatus::Error;
                        state_clone.error = Some(e.to_string());
                        {
                            let mut states = launcher.launch_states.lock().unwrap();
                            if let Some(s) = states.iter_mut().find(|s| s.session_id == sid) {
                                *s = state_clone.clone();
                            }
                        }
                        launcher.emit_state_change(&state_clone);
                        return;
                    }
                    println!("[CLI] Successfully wrote launch command to session {}", sid);
                    state_clone.status = CliLaunchStatus::Running;
                    {
                        let mut states = launcher.launch_states.lock().unwrap();
                        if let Some(s) = states.iter_mut().find(|s| s.session_id == sid) {
                            *s = state_clone.clone();
                        }
                    }
                    launcher.emit_state_change(&state_clone);
                }
                Err(e) => {
                    eprintln!("[CLI] Failed to write to session {}: {}", sid, e);
                    state_clone.status = CliLaunchStatus::Error;
                    state_clone.error = Some(e.to_string());
                    {
                        let mut states = launcher.launch_states.lock().unwrap();
                        if let Some(s) = states.iter_mut().find(|s| s.session_id == sid) {
                            *s = state_clone.clone();
                        }
                    }
                    launcher.emit_state_change(&state_clone);
                }
            }
        });

        {
            let mut states = self.launch_states.lock().unwrap();
            states.retain(|s| s.session_id != session_id);
            states.push(state.clone());
        }

        self.emit_state_change(&state);

        Ok(())
    }

    pub fn stop_cli(&self, session_id: &str) -> Result<()> {
        self.terminal_manager
            .write_to_session(session_id, "\x03")
            .context("Failed to send Ctrl+C to terminal")?;

        {
            let mut states = self.launch_states.lock().unwrap();
            if let Some(state) = states.iter_mut().find(|s| s.session_id == session_id) {
                state.status = CliLaunchStatus::NotLaunched;
                self.emit_state_change(state);
            }
        }

        Ok(())
    }

    pub fn restart_cli(&self, session_id: &str) -> Result<()> {
        let agent = {
            let states = self.launch_states.lock().unwrap();
            states
                .iter()
                .find(|s| s.session_id == session_id)
                .map(|s| s.agent)
        };

        if let Some(agent) = agent {
            self.stop_cli(session_id)?;
            std::thread::sleep(std::time::Duration::from_millis(100));
            self.launch_cli(session_id, agent)?;
        }

        Ok(())
    }

    pub fn get_launch_state(&self, session_id: &str) -> Option<CliLaunchState> {
        let states = self.launch_states.lock().unwrap();
        states.iter().find(|s| s.session_id == session_id).cloned()
    }

    pub fn get_all_launch_states(&self) -> Vec<CliLaunchState> {
        let states = self.launch_states.lock().unwrap();
        states.clone()
    }

    fn emit_state_change(&self, state: &CliLaunchState) {
        if let Some(app) = self.app_handle.lock().unwrap().as_ref() {
            let _ = app.emit("cli-launch-state-changed", state);
        }
    }

    pub fn get_binary_name(agent: AgentType) -> &'static str {
        get_provider(agent).binary_name()
    }
}
