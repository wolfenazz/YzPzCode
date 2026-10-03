use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::terminal::spawn_filtered_output_reader;
#[cfg(target_os = "windows")]
use crate::utils::process::get_npm_global_prefix;

const MANAGED_COMMAND_STATE_EVENT: &str = "managed-command-state-changed";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
// Variant names are part of the IPC contract and match ManagedCommandStatus in TypeScript.
pub enum ManagedCommandStatus {
    Idle,
    Starting,
    Running,
    Stopping,
    Stopped,
    Completed,
    Failed,
}

#[cfg(test)]
mod status_tests {
    use super::ManagedCommandStatus;

    #[test]
    fn managed_statuses_match_frontend_ipc_contract() {
        for (status, expected) in [
            (ManagedCommandStatus::Idle, "Idle"),
            (ManagedCommandStatus::Starting, "Starting"),
            (ManagedCommandStatus::Running, "Running"),
            (ManagedCommandStatus::Stopping, "Stopping"),
            (ManagedCommandStatus::Stopped, "Stopped"),
            (ManagedCommandStatus::Completed, "Completed"),
            (ManagedCommandStatus::Failed, "Failed"),
        ] {
            assert_eq!(
                serde_json::to_value(status).expect("serialized status"),
                expected
            );
        }
    }
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

#[derive(Clone)]
struct ManagedProcess {
    workspace_id: String,
    pid: u32,
    stop_requested: Arc<AtomicBool>,
    stdin: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    master: Arc<Mutex<Option<Box<dyn MasterPty + Send>>>>,
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
        size: PtySize,
    ) -> Result<()> {
        self.stop_command(session_id)
            .context("Failed to stop the previous managed command")?;

        let app = self.app_handle()?;
        let workspace_id_owned = workspace_id.to_string();
        let command_owned = command.to_string();
        let mut state = ManagedCommandState {
            session_id: session_id.to_string(),
            workspace_id: workspace_id_owned.clone(),
            command: command_owned.clone(),
            status: ManagedCommandStatus::Starting,
            pid: None,
            exit_code: None,
            error: None,
        };
        // Keep stop requests behind startup until the child has a PID in the
        // registry. Otherwise Ctrl+C during Starting can find no process and
        // report success while the server continues to launch.
        let mut processes = self.processes.lock().unwrap();
        self.set_state(state.clone());

        let launched = (|| {
            let cmd = build_managed_command(cwd, &command_owned)?;
            let pair = native_pty_system().openpty(size)?;
            let reader = pair.master.try_clone_reader()?;
            let writer = pair.master.take_writer()?;
            super::session::reset_ctrl_c_handling();
            let child = pair
                .slave
                .spawn_command(cmd)
                .with_context(|| format!("Failed to spawn managed command: {}", command_owned))?;
            drop(pair.slave);
            Ok::<_, anyhow::Error>((child, pair.master, reader, writer))
        })();
        let (mut child, master, reader, writer) = match launched {
            Ok(launched) => launched,
            Err(error) => {
                state.status = ManagedCommandStatus::Failed;
                state.error = Some(error.to_string());
                self.set_state(state);
                self.emit_terminal_output(
                    &app,
                    session_id,
                    &format!("\r\n[managed] command failed: {error}\r\n"),
                );
                return Err(error);
            }
        };

        let pid = child
            .process_id()
            .context("Managed command has no process ID")?;
        let stdin = Arc::new(Mutex::new(Some(writer)));
        let master = Arc::new(Mutex::new(Some(master)));
        let stop_requested = Arc::new(AtomicBool::new(false));

        processes.insert(
            session_id.to_string(),
            ManagedProcess {
                workspace_id: workspace_id_owned.clone(),
                pid,
                stop_requested: stop_requested.clone(),
                stdin: stdin.clone(),
                master: master.clone(),
            },
        );
        state.status = ManagedCommandStatus::Running;
        state.pid = Some(pid);
        self.set_state(state.clone());
        self.emit_terminal_output(
            &app,
            session_id,
            "\x1bc[managed] starting command inside app\r\n",
        );
        drop(processes);
        let (output_tx, output_rx) = mpsc::sync_channel(256);
        let output_manager = self.clone();
        let output_session = session_id.to_string();
        let output_app = app.clone();
        let output_thread = spawn_filtered_output_reader(output_rx, move |output| {
            let processes = output_manager.processes.lock().unwrap();
            if processes
                .get(&output_session)
                .is_some_and(|process| process.pid == pid)
            {
                output_manager.emit_terminal_output(&output_app, &output_session, output);
            }
        });
        let reader_thread = spawn_stream_reader(reader, output_tx);

        let manager = self.clone();
        let session_id_owned = session_id.to_string();
        let waiter_workspace_id = workspace_id_owned.clone();
        let waiter_command = command_owned.clone();
        thread::spawn(move || {
            // The waiter exclusively owns the Child handle. Holding a mutex
            // guard around Child::wait blocks the stop path for the entire
            // lifetime of a development server, so stop by PID/process group
            // instead and let this thread reap the process after termination.
            let exit_status = child.wait();
            // Close ConPTY while the other thread drains its final frame.
            // Joining the reader before closing ConPTY deadlocks on Windows.
            stdin.lock().unwrap().take();
            let closed_master = master.lock().unwrap().take();
            drop(closed_master);
            let _ = reader_thread.join();
            let _ = output_thread.join();

            // A replacement command can be launched for the same terminal as
            // soon as the old process tree has been terminated. Only the
            // waiter that still owns the session slot may remove/update it;
            // otherwise a late old waiter could erase the new command.
            let mut processes = manager.processes.lock().unwrap();
            let owns_session = processes
                .get(&session_id_owned)
                .is_some_and(|process| process.pid == pid);
            if !owns_session {
                return;
            }

            let mut final_state = {
                manager
                    .states
                    .lock()
                    .unwrap()
                    .get(&session_id_owned)
                    .cloned()
            }
            .unwrap_or(ManagedCommandState {
                session_id: session_id_owned.clone(),
                workspace_id: waiter_workspace_id,
                command: waiter_command,
                status: ManagedCommandStatus::Idle,
                pid: Some(pid),
                exit_code: None,
                error: None,
            });

            match exit_status {
                Ok(status) => {
                    final_state.exit_code = Some(status.exit_code() as i32);
                    if stop_requested.load(Ordering::Relaxed) {
                        final_state.status = ManagedCommandStatus::Stopped;
                    } else if status.success() {
                        final_state.status = ManagedCommandStatus::Completed;
                    } else {
                        final_state.status = ManagedCommandStatus::Failed;
                        final_state.error = Some(format!(
                            "Managed command exited with status {:?}",
                            status.exit_code()
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
            processes.remove(&session_id_owned);
        });

        Ok(())
    }

    pub fn write_input(&self, session_id: &str, input: &str) -> Result<()> {
        let stdin = self
            .processes
            .lock()
            .unwrap()
            .get(session_id)
            .map(|process| process.stdin.clone())
            .context("No application is running in this terminal")?;
        let mut guard = stdin.lock().unwrap();
        let writer = guard
            .as_mut()
            .context("This application does not accept input")?;
        writer
            .write_all(&super::session::encode_terminal_input(input.as_bytes()))
            .context("Failed to send application input")?;
        writer.flush().context("Failed to flush application input")
    }

    pub fn stop_command(&self, session_id: &str) -> Result<()> {
        let process = {
            let processes = self.processes.lock().unwrap();
            processes.get(session_id).cloned()
        };

        let Some(process) = process else {
            return Ok(());
        };

        process.stop_requested.store(true, Ordering::Relaxed);
        let current_state = {
            self.states
                .lock()
                .unwrap()
                .get(session_id)
                .filter(|state| state.pid == Some(process.pid))
                .cloned()
        };
        if let Some(mut state) = current_state {
            state.status = ManagedCommandStatus::Stopping;
            state.error = None;
            self.set_state(state);
        }

        if let Err(error) = terminate_process_tree(process.pid) {
            let still_current = self
                .processes
                .lock()
                .unwrap()
                .get(session_id)
                .is_some_and(|current| current.pid == process.pid);
            // The process may have exited naturally between our lookup and
            // taskkill/kill. Its waiter has already completed the state in
            // that case, so do not overwrite the terminal with a stale error.
            if !still_current {
                return Ok(());
            }

            let current_state = {
                self.states
                    .lock()
                    .unwrap()
                    .get(session_id)
                    .filter(|state| state.pid == Some(process.pid))
                    .cloned()
            };
            if let Some(mut state) = current_state {
                state.status = ManagedCommandStatus::Running;
                state.error = Some(error.to_string());
                self.set_state(state);
            }
            process.stop_requested.store(false, Ordering::Relaxed);
            return Err(error);
        }

        Ok(())
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

    pub fn is_active(&self, session_id: &str) -> bool {
        self.processes.lock().unwrap().contains_key(session_id)
    }

    pub(super) fn emit_shell_output(&self, app: &AppHandle, session_id: &str, output: &str) {
        // Keep ownership checks and emission together so a delayed shell or
        // replaced command cannot overwrite the new program's terminal frame.
        let processes = self.processes.lock().unwrap();
        if !processes.contains_key(session_id) {
            self.emit_terminal_output(app, session_id, output);
        }
    }

    pub fn resize(&self, session_id: &str, size: PtySize) -> Result<()> {
        let master = self
            .processes
            .lock()
            .unwrap()
            .get(session_id)
            .map(|process| process.master.clone());
        if let Some(master) = master {
            if let Some(master) = master.lock().unwrap().as_ref() {
                master.resize(size)?;
            }
        }
        Ok(())
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

fn spawn_stream_reader<R>(mut reader: R, output_tx: SyncSender<Vec<u8>>) -> thread::JoinHandle<()>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    // Preserve all bytes, including partial escape sequences.
                    if output_tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
    })
}

fn build_managed_command(cwd: &str, command: &str) -> Result<CommandBuilder> {
    let path = std::path::Path::new(cwd);
    if !path.is_dir() {
        anyhow::bail!("Workspace path is not a valid directory: {}", cwd);
    }
    let command_cwd = resolve_managed_command_cwd(path, command);
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let shell = std::env::var("COMSPEC")
            .unwrap_or_else(|_| "C:\\Windows\\System32\\cmd.exe".to_string());
        let mut cmd = CommandBuilder::new(shell);
        // CommandBuilder uses C-runtime quoting, which cmd.exe does not
        // understand. Environment expansion preserves embedded quotes and
        // shell operators without adding literal backslashes to the command.
        cmd.args(["/D", "/Q", "/V:OFF", "/C", "%YZPZ_MANAGED_COMMAND%"]);
        // A second cmd parses the original text so %VARIABLE% expansion and
        // shell operators behave just as they do in a native CMD terminal.
        let escaped: String = command
            .chars()
            .flat_map(|character| {
                if "^&|<>()\"".contains(character) {
                    vec!['^', character]
                } else {
                    vec![character]
                }
            })
            .collect();
        cmd.env(
            "YZPZ_MANAGED_COMMAND",
            format!("cmd.exe /D /Q /V:OFF /S /C ^\"{escaped}^\""),
        );
        cmd.env("PATH", build_windows_path());
        cmd
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let fallback = if cfg!(target_os = "macos") {
            "/bin/zsh"
        } else {
            "/bin/bash"
        };
        let shell = std::env::var("SHELL").unwrap_or_else(|_| fallback.to_string());
        let mut cmd = CommandBuilder::new(shell);
        cmd.args(["-lc", command]);
        cmd
    };
    cmd.cwd(super::project_run::normalize_shell_path(&command_cwd));
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    Ok(cmd)
}

/// Projects such as YzPzCode keep their frontend package in `app/` while the
/// workspace itself is opened at the repository root. Make managed JS dev
/// commands work from that root without affecting projects that already have
/// a root package or non-JavaScript commands.
fn resolve_managed_command_cwd(cwd: &std::path::Path, command: &str) -> std::path::PathBuf {
    let starts_js_command = matches!(
        command.split_whitespace().next(),
        Some("npm" | "npx" | "pnpm" | "yarn" | "bun" | "vite" | "next")
    );
    let app_dir = cwd.join("app");

    if starts_js_command
        && !cwd.join("package.json").is_file()
        && app_dir.join("package.json").is_file()
    {
        app_dir
    } else {
        cwd.to_path_buf()
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

fn terminate_process_tree(pid: u32) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .output()
            .with_context(|| format!("Failed to stop managed command pid {}", pid))?;

        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(anyhow::anyhow!(
                "Failed to stop managed command pid {} (taskkill exit {:?}){}",
                pid,
                output.status.code(),
                if detail.is_empty() {
                    String::new()
                } else {
                    format!(": {}", detail)
                }
            ));
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .with_context(|| format!("Failed to signal managed command group {}", pid))?;
        if !status.success() {
            return Err(anyhow::anyhow!(
                "Failed to signal managed command group {} (kill exit {:?})",
                pid,
                status.code()
            ));
        }
        return Ok(());
    }
}

#[cfg(test)]
mod stream_tests {
    use super::*;

    #[test]
    fn output_backpressure_preserves_every_byte() {
        let expected = "prompt without newline\r\nUnicode: café 🚀\r\n"
            .repeat(50_000)
            .into_bytes();
        let (tx, rx) = mpsc::sync_channel(1);
        let reader = spawn_stream_reader(std::io::Cursor::new(expected.clone()), tx);
        let actual: Vec<u8> = rx.into_iter().flatten().collect();
        reader.join().expect("reader finished");
        assert_eq!(actual, expected);
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    use portable_pty::Child;
    use std::time::{Duration, Instant};

    struct TestPty {
        child: Box<dyn Child + Send + Sync>,
        master: Option<Box<dyn MasterPty + Send>>,
        writer: Box<dyn Write + Send>,
        output: mpsc::Receiver<Vec<u8>>,
        reader: Option<thread::JoinHandle<()>>,
        text: String,
    }

    impl TestPty {
        fn start(cwd: &str, command: &str) -> Self {
            let cmd = build_managed_command(cwd, command).expect("command");
            Self::start_command(cmd)
        }

        fn start_command(cmd: CommandBuilder) -> Self {
            let pair = native_pty_system()
                .openpty(PtySize {
                    rows: 24,
                    cols: 100,
                    pixel_width: 800,
                    pixel_height: 384,
                })
                .expect("PTY");
            let reader = pair.master.try_clone_reader().expect("reader");
            let writer = pair.master.take_writer().expect("writer");
            super::super::session::reset_ctrl_c_handling();
            let child = pair.slave.spawn_command(cmd).expect("spawn");
            drop(pair.slave);
            let (tx, output) = mpsc::sync_channel(256);
            let reader = Some(spawn_stream_reader(reader, tx));
            Self {
                child,
                master: Some(pair.master),
                writer,
                output,
                reader,
                text: String::new(),
            }
        }

        fn read_until(&mut self, expected: &str) {
            let deadline = Instant::now() + Duration::from_secs(15);
            while !self.text.contains(expected) {
                let remaining = deadline.saturating_duration_since(Instant::now());
                let data = self.output.recv_timeout(remaining).unwrap_or_else(|error| {
                    panic!("Waiting for {expected:?}: {error}; output: {:?}", self.text)
                });
                self.text.push_str(&String::from_utf8_lossy(&data));
            }
        }

        fn input(&mut self, bytes: &[u8]) {
            self.writer
                .write_all(&super::super::session::encode_terminal_input(bytes))
                .expect("input");
            self.writer.flush().expect("flush");
        }

        fn finish(&mut self) -> portable_pty::ExitStatus {
            let deadline = Instant::now() + Duration::from_secs(30);
            let status = loop {
                if let Some(status) = self.child.try_wait().expect("child status") {
                    break status;
                }
                while let Ok(data) = self.output.try_recv() {
                    self.text.push_str(&String::from_utf8_lossy(&data));
                }
                assert!(
                    Instant::now() < deadline,
                    "Command did not exit: {:?}",
                    self.text
                );
                thread::sleep(Duration::from_millis(10));
            };
            self.master.take();
            for data in &self.output {
                self.text.push_str(&String::from_utf8_lossy(&data));
            }
            self.reader
                .take()
                .expect("reader thread")
                .join()
                .expect("drain output");
            status
        }
    }

    impl Drop for TestPty {
        fn drop(&mut self) {
            if self.child.try_wait().ok().flatten().is_none() {
                if let Some(pid) = self.child.process_id() {
                    let _ = terminate_process_tree(pid);
                }
                let _ = self.child.kill();
                let _ = self.child.wait();
            }
            self.master.take();
        }
    }

    fn fixture(name: &str, source: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("yzpz interactive {}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("fixture directory");
        std::fs::write(root.join(name), source).expect("fixture script");
        root
    }

    #[test]
    fn quoted_commands_show_prompt_before_input_and_accept_editing() {
        let root = fixture(
            "read & input.cmd",
            "@echo off\r\nset /p line=Enter value: \r\necho received:%line%\r\n",
        );
        let mut terminal = TestPty::start(
            root.to_str().expect("path"),
            &format!("\"{}\"", root.join("read & input.cmd").display()),
        );
        terminal.read_until("Enter value:");
        terminal.input(b"hello worlx\x7fd\r");
        assert!(terminal.finish().success(), "{}", terminal.text);
        assert!(
            terminal.text.contains("received:hello world"),
            "{}",
            terminal.text
        );
        drop(terminal);
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn failed_build_does_not_run_following_application() {
        let mut terminal = TestPty::start(
            std::env::temp_dir().to_str().expect("temp path"),
            "cmd /c exit 7 && echo APPLICATION_STARTED",
        );
        assert!(!terminal.finish().success());
        assert!(!terminal.text.contains("APPLICATION_STARTED"));
    }

    #[test]
    fn detected_python_shows_input_prompts_and_uses_console_stdio() {
        let root = fixture("hello world.py", "import sys\nprint('TTY:%s,%s,%s' % (sys.stdin.isatty(), sys.stdout.isatty(), sys.stderr.isatty()))\nage = int(input('what is your age ?'))\nprint('age:%d' % age)\nname = input('Your name: ')\nprint('hello:' + name)\nprint('stderr:done', file=sys.stderr)\n");
        let targets = crate::terminal::project_run::detect_targets(root.to_str().expect("path"))
            .expect("targets");
        let target = targets.first().expect("Python target");
        assert!(
            target.unavailable_reason.is_none(),
            "Python must be installed to run this regression test"
        );
        let mut terminal = TestPty::start(&target.cwd, &target.command);
        terminal.read_until("what is your age ?");
        assert!(
            terminal.text.contains("TTY:True,True,True"),
            "{}",
            terminal.text
        );
        terminal.input(b"25\r");
        terminal.read_until("Your name:");
        assert!(terminal.text.contains("age:25"), "{}", terminal.text);
        terminal.input(b"Sam\r");
        assert!(terminal.finish().success(), "{}", terminal.text);
        assert!(terminal.text.contains("hello:Sam"), "{}", terminal.text);
        assert!(terminal.text.contains("stderr:done"), "{}", terminal.text);
        drop(terminal);
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn ctrl_c_interrupts_python_waiting_for_input() {
        let root = fixture(
            "main.py",
            "input('WAITING_FOR_INPUT:')\nprint('UNEXPECTED_COMPLETION')\n",
        );
        let targets = crate::terminal::project_run::detect_targets(root.to_str().expect("path"))
            .expect("targets");
        let target = targets.first().expect("Python target");
        let mut terminal = TestPty::start(&target.cwd, &target.command);
        terminal.read_until("WAITING_FOR_INPUT:");
        thread::sleep(Duration::from_millis(150));
        terminal.input(b"\x03");
        assert!(!terminal.finish().success(), "{}", terminal.text);
        assert!(!terminal.text.contains("UNEXPECTED_COMPLETION"));
        drop(terminal);
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn terminate_process_tree_stops_a_long_running_command() {
        let mut terminal = TestPty::start(
            std::env::temp_dir().to_str().expect("temp path"),
            "ping -t 127.0.0.1",
        );
        terminal.read_until("127.0.0.1");
        terminate_process_tree(terminal.child.process_id().expect("PID"))
            .expect("stop process tree");
        assert!(!terminal.finish().success());
    }

    #[test]
    fn shell_environment_expansion_preserves_command_chaining() {
        let mut terminal = TestPty::start(
            std::env::temp_dir().to_str().expect("temp path"),
            "echo %COMSPEC% && echo ENVIRONMENT_EXPANDED",
        );
        assert!(terminal.finish().success(), "{}", terminal.text);
        assert!(
            terminal
                .text
                .contains(&std::env::var("COMSPEC").expect("COMSPEC")),
            "{}",
            terminal.text
        );
        assert!(terminal.text.contains("ENVIRONMENT_EXPANDED"));
    }

    #[test]
    fn detected_dotnet_project_shows_prompt_and_accepts_console_input() {
        if which::which("dotnet").is_err() {
            return;
        }
        let root = fixture(
            "App.csproj",
            r#"<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>"#,
        );
        std::fs::write(root.join("Program.cs"), r#"System.Console.WriteLine("redirected:" + System.Console.IsInputRedirected); System.Console.Write("Value:"); System.Console.WriteLine("csharp:" + System.Console.ReadLine());"#).expect("source");
        std::fs::write(
            root.join("NuGet.Config"),
            "<configuration><packageSources><clear /></packageSources></configuration>",
        )
        .expect("offline restore config");
        let targets = crate::terminal::project_run::detect_targets(root.to_str().expect("path"))
            .expect("targets");
        let target = targets.first().expect("C# target");
        let mut cmd = build_managed_command(&target.cwd, &target.command).expect("command");
        cmd.env("DOTNET_CLI_HOME", &root);
        cmd.env("DOTNET_CLI_TELEMETRY_OPTOUT", "1");
        cmd.env("DOTNET_SKIP_FIRST_TIME_EXPERIENCE", "1");
        let mut terminal = TestPty::start_command(cmd);
        terminal.read_until("Value:");
        assert!(
            terminal.text.contains("redirected:False"),
            "{}",
            terminal.text
        );
        terminal.input(b"console input\r");
        assert!(terminal.finish().success(), "{}", terminal.text);
        assert!(
            terminal.text.contains("csharp:console input"),
            "{}",
            terminal.text
        );
        drop(terminal);
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
