use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::terminal::spawn_output_reader;
use crate::utils::process::get_npm_global_prefix;

const MANAGED_COMMAND_STATE_EVENT: &str = "managed-command-state-changed";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ManagedCommandStatus {
    Idle,
    Starting,
    Running,
    Stopping,
    Stopped,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCommandState {
    pub session_id: String,
    pub workspace_id: String,
    pub command: String,
    pub status: ManagedCommandStatus,
    pub pid: Option<u32>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

struct ManagedProcess {
    workspace_id: String,
    child: Arc<Mutex<Child>>,
    stop_requested: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct ManagedCommandManager {
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    processes: Arc<Mutex<HashMap<String, ManagedProcess>>>,
    states: Arc<Mutex<HashMap<String, ManagedCommandState>>>,
}

impl ManagedCommandManager {
    pub fn new() -> Self {
        Self {
            app_handle: Arc::new(Mutex::new(None)),
            processes: Arc::new(Mutex::new(HashMap::new())),
            states: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        let mut app = self.app_handle.lock().unwrap();
        *app = Some(handle);
    }

    pub fn run_command(
        &self,
        session_id: &str,
        workspace_id: &str,
        cwd: &str,
        command: &str,
    ) -> Result<()> {
        self.stop_command(session_id).ok();

        let app = self.app_handle()?;
        let workspace_id_owned = workspace_id.to_string();
        let command_owned = command.to_string();
        self.emit_terminal_output(
            &app,
            session_id,
            "\x1bc\r\n[managed] starting command inside app\r\n",
        );

        let mut state = ManagedCommandState {
            session_id: session_id.to_string(),
            workspace_id: workspace_id_owned.clone(),
            command: command_owned.clone(),
            status: ManagedCommandStatus::Starting,
            pid: None,
            exit_code: None,
            error: None,
        };
        self.set_state(state.clone());

        let mut cmd = build_managed_command(cwd, &command_owned)?;
        let mut child = cmd
            .spawn()
            .with_context(|| format!("Failed to spawn managed command: {}", command_owned))?;

        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let child = Arc::new(Mutex::new(child));
        let stop_requested = Arc::new(AtomicBool::new(false));

        state.status = ManagedCommandStatus::Running;
        state.pid = Some(pid);
        self.set_state(state.clone());

        self.processes.lock().unwrap().insert(
            session_id.to_string(),
            ManagedProcess {
                workspace_id: workspace_id_owned.clone(),
                child: child.clone(),
                stop_requested: stop_requested.clone(),
            },
        );

        let (output_tx, output_rx) = mpsc::sync_channel(256);
        spawn_output_reader(app.clone(), session_id.to_string(), output_rx);

        if let Some(stdout) = stdout {
            spawn_stream_reader(stdout, output_tx.clone());
        }
        if let Some(stderr) = stderr {
            spawn_stream_reader(stderr, output_tx.clone());
        }

        let manager = self.clone();
        let session_id_owned = session_id.to_string();
        let waiter_workspace_id = workspace_id_owned.clone();
        let waiter_command = command_owned.clone();
        thread::spawn(move || {
            let exit_status = child.lock().unwrap().wait();
            drop(output_tx);

            let mut final_state = manager
                .states
                .lock()
                .unwrap()
                .get(&session_id_owned)
                .cloned()
                .unwrap_or(ManagedCommandState {
                    session_id: session_id_owned.clone(),
                    workspace_id: waiter_workspace_id,
                    command: waiter_command,
                    status: ManagedCommandStatus::Idle,
                    pid: Some(pid),
                    exit_code: None,
                    error: None,
                });

            manager.processes.lock().unwrap().remove(&session_id_owned);

            match exit_status {
                Ok(status) => {
                    final_state.exit_code = status.code();
                    if stop_requested.load(Ordering::Relaxed) {
                        final_state.status = ManagedCommandStatus::Stopped;
                    } else if status.success() {
                        final_state.status = ManagedCommandStatus::Completed;
                    } else {
                        final_state.status = ManagedCommandStatus::Failed;
                        final_state.error = Some(format!(
                            "Managed command exited with status {:?}",
                            status.code()
                        ));
                    }
                }
                Err(err) => {
                    final_state.status = ManagedCommandStatus::Failed;
                    final_state.error = Some(err.to_string());
                }
            }

            manager.set_state(final_state.clone());
            if let Some(app) = manager.app_handle.lock().unwrap().as_ref() {
                let trailer = match final_state.status {
                    ManagedCommandStatus::Completed => {
                        "\r\n[managed] command completed successfully\r\n".to_string()
                    }
                    ManagedCommandStatus::Stopped => {
                        "\r\n[managed] command stopped\r\n".to_string()
                    }
                    ManagedCommandStatus::Failed => format!(
                        "\r\n[managed] command failed{}\r\n",
                        final_state
                            .error
                            .as_ref()
                            .map(|err| format!(": {}", err))
                            .unwrap_or_default()
                    ),
                    _ => "\r\n[managed] command finished\r\n".to_string(),
                };
                let _ = app.emit(&format!("terminal-output:{}", session_id_owned), &trailer);
            }
        });

        Ok(())
    }

    pub fn stop_command(&self, session_id: &str) -> Result<()> {
        let process = {
            let processes = self.processes.lock().unwrap();
            processes.get(session_id).map(|process| ManagedProcess {
                workspace_id: process.workspace_id.clone(),
                child: process.child.clone(),
                stop_requested: process.stop_requested.clone(),
            })
        };

        let Some(process) = process else {
            return Ok(());
        };

        process.stop_requested.store(true, Ordering::Relaxed);
        if let Some(mut state) = self.states.lock().unwrap().get(session_id).cloned() {
            state.status = ManagedCommandStatus::Stopping;
            self.set_state(state);
        }

        kill_child_process(&process.child)
    }

    pub fn stop_commands_by_workspace(&self, workspace_id: &str) -> Result<()> {
        let session_ids: Vec<String> = {
            let processes = self.processes.lock().unwrap();
            processes
                .iter()
                .filter(|(_, process)| process.workspace_id == workspace_id)
                .map(|(session_id, _)| session_id.clone())
                .collect()
        };

        for session_id in session_ids {
            self.stop_command(&session_id)?;
        }

        Ok(())
    }

    pub fn stop_all(&self) -> Result<()> {
        let session_ids: Vec<String> = self.processes.lock().unwrap().keys().cloned().collect();
        for session_id in session_ids {
            self.stop_command(&session_id)?;
        }
        Ok(())
    }

    pub fn get_state(&self, session_id: &str) -> Option<ManagedCommandState> {
        self.states.lock().unwrap().get(session_id).cloned()
    }

    fn app_handle(&self) -> Result<AppHandle> {
        self.app_handle
            .lock()
            .unwrap()
            .as_ref()
            .cloned()
            .context("App handle not set")
    }

    fn set_state(&self, state: ManagedCommandState) {
        self.states
            .lock()
            .unwrap()
            .insert(state.session_id.clone(), state.clone());
        if let Some(app) = self.app_handle.lock().unwrap().as_ref() {
            let _ = app.emit(MANAGED_COMMAND_STATE_EVENT, &state);
        }
    }

    fn emit_terminal_output(&self, app: &AppHandle, session_id: &str, output: &str) {
        let _ = app.emit(&format!("terminal-output:{}", session_id), output);
    }
}

impl Default for ManagedCommandManager {
    fn default() -> Self {
        Self::new()
    }
}

fn spawn_stream_reader<R>(mut reader: R, output_tx: SyncSender<Vec<u8>>)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => match output_tx.try_send(buf[..n].to_vec()) {
                    Ok(()) => {}
                    Err(TrySendError::Full(_)) => {}
                    Err(TrySendError::Disconnected(_)) => break,
                },
                Err(_) => break,
            }
        }
    });
}

fn build_managed_command(cwd: &str, command: &str) -> Result<Command> {
    let path = std::path::Path::new(cwd);
    if !path.exists() || !path.is_dir() {
        return Err(anyhow::anyhow!("Workspace path is not a valid directory: {}", cwd));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let shell = std::env::var("COMSPEC")
            .unwrap_or_else(|_| "C:\\Windows\\System32\\cmd.exe".to_string());
        let mut cmd = Command::new(shell);
        cmd.args(["/D", "/C", command])
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);

        let path_value = build_windows_path();
        cmd.env("PATH", path_value);
        if let Ok(appdata) = std::env::var("APPDATA") {
            cmd.env("APPDATA", appdata);
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            cmd.env("LOCALAPPDATA", local);
        }
        if let Ok(home) = std::env::var("USERPROFILE") {
            cmd.env("USERPROFILE", home.clone());
            cmd.env("HOME", home);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        return Ok(cmd);
    }

    #[cfg(target_os = "macos")]
    {
        use std::os::unix::process::CommandExt;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut cmd = Command::new(shell);
        cmd.args(["-lc", command])
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .process_group(0);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        return Ok(cmd);
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        use std::os::unix::process::CommandExt;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut cmd = Command::new(shell);
        cmd.args(["-lc", command])
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .process_group(0);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        return Ok(cmd);
    }
}

#[cfg(target_os = "windows")]
fn build_windows_path() -> String {
    let mut path = std::env::var("PATH").unwrap_or_default();
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let userprofile = std::env::var("USERPROFILE").unwrap_or_default();
    let program_files = std::env::var("ProgramFiles").unwrap_or_default();
    let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();

    if !program_files.is_empty() {
        path = format!("{};{}", path, program_files);
    }
    if !program_files_x86.is_empty() {
        path = format!("{};{}", path, program_files_x86);
    }
    if !local_appdata.is_empty() {
        path = format!(
            "{};{}\\npm;{}\\Microsoft\\WindowsApps;{}\\Programs",
            path, local_appdata, local_appdata, local_appdata
        );
    }
    if !appdata.is_empty() {
        path = format!(
            "{};{}\\Python\\Scripts;{}\\npm\\node_modules\\.bin",
            path, appdata, appdata
        );
    }
    if let Some(prefix) = get_npm_global_prefix() {
        if !prefix.is_empty() {
            path = format!("{};{}\\bin;{}\\node_modules\\.bin", path, prefix, prefix);
        }
    }
    if !userprofile.is_empty() {
        path = format!(
            "{};{}\\.cargo\\bin;{}\\.nvm;{}\\.nvm\\current;{}\\.npm-global\\bin",
            path, userprofile, userprofile, userprofile, userprofile
        );
    }
    if let Ok(system_root) = std::env::var("SystemRoot") {
        path = format!("{};{}\\System32", path, system_root);
    }
    path
}

fn kill_child_process(child: &Arc<Mutex<Child>>) -> Result<()> {
    let pid = child.lock().unwrap().id();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .with_context(|| format!("Failed to stop managed command pid {}", pid))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .ok();
        child.lock().unwrap().kill().ok();
        return Ok(());
    }
}
