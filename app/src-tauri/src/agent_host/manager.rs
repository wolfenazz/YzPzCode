//! Sidecar process + WebSocket client internals for the YZPZ Agent host.

use anyhow::{anyhow, Result};
use flate2::read::GzDecoder;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Cursor};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, oneshot, Mutex as AsyncMutex};
use tokio_tungstenite::tungstenite::Message;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::protocol::{CommandMessage, SidecarMessage};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Build a node command that never allocates a console window.
/// The app is a GUI process without a console, so a console-subsystem
/// child (node.exe) would otherwise pop an empty terminal window.
#[cfg(target_os = "windows")]
fn new_node_command(node: &std::path::Path) -> Command {
    let mut cmd = Command::new(node);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(target_os = "windows"))]
fn new_node_command(node: &std::path::Path) -> Command {
    Command::new(node)
}

/// Async variant used for long-running node invocations (e.g. harness builds).
#[cfg(target_os = "windows")]
fn new_node_command_tokio(node: &std::path::Path) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(node);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(target_os = "windows"))]
fn new_node_command_tokio(node: &std::path::Path) -> tokio::process::Command {
    tokio::process::Command::new(node)
}

/// Node does not reliably support Windows extended-length (``\\?\``) paths
/// for its entry point or working directory. Those paths can be inherited
/// from a sandboxed process and make Node try to resolve the script as `C:`.
#[cfg(target_os = "windows")]
fn normalize_windows_process_path(path: &std::path::Path) -> std::path::PathBuf {
    let path = path.as_os_str().to_string_lossy();

    if let Some(unc_path) = path.strip_prefix("\\\\?\\UNC\\") {
        std::path::PathBuf::from(format!("\\\\{unc_path}"))
    } else if let Some(dos_path) = path.strip_prefix("\\\\?\\") {
        std::path::PathBuf::from(dos_path)
    } else {
        std::path::PathBuf::from(path.as_ref())
    }
}

#[cfg(not(target_os = "windows"))]
fn normalize_windows_process_path(path: &std::path::Path) -> std::path::PathBuf {
    path.to_path_buf()
}

const EVENT_PREFIX: &str = "yzpz-agent";
const CONNECT_ATTEMPTS: u32 = 8;
const CONNECT_RETRY_DELAY_MS: u64 = 400;
const QUICK_COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const NODE_MIN_MAJOR: u32 = 22;
const MANAGED_NODE_DIST_URL: &str = "https://nodejs.org/dist/latest-v22.x";

#[derive(Debug, Clone, PartialEq, Eq)]
struct NodeArchive {
    filename: String,
    executable: PathBuf,
    is_zip: bool,
}

#[derive(Debug)]
pub enum AgentHostError {
    Sidecar(String),
    NodeMissing(String),
    Disconnected,
    Timeout,
    Command { command: String, error: String },
}

impl std::fmt::Display for AgentHostError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentHostError::Sidecar(msg) => write!(f, "Agent sidecar: {msg}"),
            AgentHostError::NodeMissing(msg) => write!(f, "{msg}"),
            AgentHostError::Disconnected => write!(f, "Agent sidecar is not connected"),
            AgentHostError::Timeout => write!(f, "Agent sidecar command timed out"),
            AgentHostError::Command { command, error } => {
                write!(f, "Agent command '{command}' failed: {error}")
            }
        }
    }
}

impl std::error::Error for AgentHostError {}

impl From<AgentHostError> for String {
    fn from(value: AgentHostError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStatus {
    pub running: bool,
    pub connected: bool,
    pub port: Option<u16>,
    pub node_major: Option<u32>,
    pub sessions: usize,
}

type PendingCall = oneshot::Sender<Result<Value, String>>;

struct HostInner {
    state: Mutex<HostState>,
    pending: Mutex<HashMap<String, PendingCall>>,
    workspace_sessions: Mutex<HashMap<String, Vec<String>>>,
    send_tx: Mutex<Option<mpsc::UnboundedSender<Message>>>,
    next_id: AtomicU64,
    app_handle: Mutex<Option<AppHandle>>,
    start_lock: AsyncMutex<()>,
}

#[derive(Default)]
struct HostState {
    child: Option<Child>,
    port: Option<u16>,
    connected: bool,
    node_major: Option<u32>,
}

#[derive(Clone)]
pub struct AgentHostManager {
    inner: Arc<HostInner>,
}

impl AgentHostManager {
    pub fn new() -> Self {
        AgentHostManager {
            inner: Arc::new(HostInner {
                state: Mutex::new(HostState::default()),
                pending: Mutex::new(HashMap::new()),
                workspace_sessions: Mutex::new(HashMap::new()),
                send_tx: Mutex::new(None),
                next_id: AtomicU64::new(1),
                app_handle: Mutex::new(None),
                start_lock: AsyncMutex::new(()),
            }),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        let mut app = self.inner.app_handle.lock().unwrap();
        *app = Some(handle);
    }

    pub fn status(&self) -> HostStatus {
        let state = self.inner.state.lock().unwrap();
        HostStatus {
            running: state.child.is_some(),
            connected: state.connected,
            port: state.port,
            node_major: state.node_major,
            sessions: self
                .inner
                .workspace_sessions
                .lock()
                .unwrap()
                .values()
                .map(|v| v.len())
                .sum(),
        }
    }

    /// Ensure the sidecar process is running and the WS client connected.
    pub async fn ensure_running(&self) -> Result<HostStatus, AgentHostError> {
        {
            let connected = self.inner.state.lock().unwrap().connected;
            if connected {
                return Ok(self.status());
            }
        }

        // Serialize startup so concurrent callers don't spawn multiple sidecars.
        let _guard = self.inner.start_lock.lock().await;
        {
            let connected = self.inner.state.lock().unwrap().connected;
            if connected {
                return Ok(self.status());
            }
        }
        self.start_sidecar().await?;
        Ok(self.status())
    }

    async fn start_sidecar(&self) -> Result<(), AgentHostError> {
        // A previous sidecar may still be alive (a transient WS drop ends the
        // client loop without killing the process). Never spawn a second one on
        // top of it — kill the old process tree first so we don't leak Node
        // processes that keep holding their ports.
        let old_child = { self.inner.state.lock().unwrap().child.take() };
        if let Some(old) = old_child {
            kill_process_tree(old);
        }

        // Prefer a usable system Node installation, then bootstrap a private
        // Node 22 runtime when this is a fresh machine.
        let node = resolve_node_binary(&self.inner).await?;
        let node_major = node_major_version(&node)?;

        let harness_dir = normalize_windows_process_path(&locate_harness_dir(&self.inner)?);
        ensure_harness_ready(&self.inner, &node, &harness_dir).await?;

        let entry = harness_dir.join("dist").join("index.js");
        if !entry.exists() {
            return Err(AgentHostError::Sidecar(format!(
                "YZPZ Agent harness not built (missing {}). Reinstall YzPzCode to restore the agent.",
                entry.display()
            )));
        }

        let mut child = new_node_command(&node)
            .arg(&entry)
            .arg("--data-dir")
            .arg(data_dir_path())
            .current_dir(&harness_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AgentHostError::Sidecar(format!("failed to spawn sidecar: {e}")))?;

        let stdout = child.stdout.take().ok_or_else(|| {
            AgentHostError::Sidecar("failed to capture sidecar stdout".to_string())
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            AgentHostError::Sidecar("failed to capture sidecar stderr".to_string())
        })?;

        // Start consuming stderr before waiting for READY. Previously this was
        // only started after the handshake, which hid the actual Node error
        // whenever the sidecar exited during startup (most notably on Windows).
        let stderr_tail = Arc::new(Mutex::new(Vec::new()));
        let stderr_tail_for_reader = stderr_tail.clone();
        let stderr_reader = std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("[yzpz-agent] {line}");
                let mut tail = stderr_tail_for_reader.lock().unwrap();
                tail.push(line);
                if tail.len() > 20 {
                    tail.remove(0);
                }
            }
        });

        let port = match read_ready_port(stdout).await {
            Ok(port) => port,
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stderr_reader.join();
                let stderr = sidecar_stderr_summary(&stderr_tail);
                return Err(AgentHostError::Sidecar(format!(
                    "sidecar failed to start: {e}{stderr}"
                )));
            }
        };

        {
            let mut state = self.inner.state.lock().unwrap();
            state.child = Some(child);
            state.port = Some(port);
            state.node_major = Some(node_major);
        }

        self.spawn_ws_client(port).await?;
        Ok(())
    }

    async fn spawn_ws_client(&self, port: u16) -> Result<(), AgentHostError> {
        let inner = self.inner.clone();
        let url = format!("ws://127.0.0.1:{port}");

        let (tx, mut rx): (
            mpsc::UnboundedSender<Message>,
            mpsc::UnboundedReceiver<Message>,
        ) = mpsc::unbounded_channel();
        *inner.send_tx.lock().unwrap() = Some(tx);

        let (conn_tx, conn_rx) = oneshot::channel::<Result<(), String>>();

        tokio::spawn(async move {
            let mut attempt = 0u32;
            let stream = loop {
                match tokio_tungstenite::connect_async(&url).await {
                    Ok((stream, _)) => break stream,
                    Err(e) => {
                        attempt += 1;
                        if attempt >= CONNECT_ATTEMPTS {
                            eprintln!("[yzpz-agent] ws connect failed after {CONNECT_ATTEMPTS} attempts: {e}");
                            let _ = conn_tx.send(Err(format!("ws connect failed: {e}")));
                            return;
                        }
                        tokio::time::sleep(Duration::from_millis(CONNECT_RETRY_DELAY_MS)).await;
                    }
                }
            };

            let (mut sink, mut reader) = stream.split();
            inner.state.lock().unwrap().connected = true;
            emit_log(&inner, "sidecar transport connected");
            let _ = conn_tx.send(Ok(()));

            // Writer task.
            let writer = tokio::spawn(async move {
                while let Some(msg) = rx.recv().await {
                    if sink.send(msg).await.is_err() {
                        break;
                    }
                }
            });

            // Reader loop.
            while let Some(Ok(msg)) = reader.next().await {
                match msg {
                    Message::Text(text) => {
                        handle_sidecar_text(&inner, &text);
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }

            inner.state.lock().unwrap().connected = false;
            emit_log(&inner, "sidecar transport disconnected");
            writer.abort();
        });

        match tokio::time::timeout(Duration::from_secs(10), conn_rx).await {
            Ok(Ok(Ok(()))) => Ok(()),
            Ok(Ok(Err(e))) => Err(AgentHostError::Sidecar(e)),
            Ok(Err(_)) => Err(AgentHostError::Sidecar(
                "sidecar disconnected before connect".to_string(),
            )),
            Err(_) => Err(AgentHostError::Sidecar(
                "timed out connecting to sidecar".to_string(),
            )),
        }
    }

    /// Send a command to the sidecar and await the correlated response.
    pub async fn command(
        &self,
        name: &str,
        args: Option<Value>,
        timeout: Duration,
    ) -> Result<Value, AgentHostError> {
        self.ensure_running().await?;

        let id = self
            .inner
            .next_id
            .fetch_add(1, Ordering::Relaxed)
            .to_string();
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.inner.pending.lock().unwrap();
            pending.insert(id.clone(), tx);
        }

        let message = CommandMessage::new(id.clone(), name, args);
        let raw = serde_json::to_string(&message)
            .map_err(|e| AgentHostError::Sidecar(format!("serialize command: {e}")))?;

        let sent = {
            let send_tx = self.inner.send_tx.lock().unwrap();
            match send_tx.as_ref() {
                Some(tx) => tx.send(Message::Text(raw.into())),
                None => Err(mpsc::error::SendError(Message::Text(raw.into()))),
            }
        };
        if sent.is_err() {
            self.inner.pending.lock().unwrap().remove(&id);
            return Err(AgentHostError::Disconnected);
        }

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(result)) => result.map_err(|e| AgentHostError::Command {
                command: name.to_string(),
                error: e,
            }),
            Ok(Err(_)) => {
                self.inner.pending.lock().unwrap().remove(&id);
                Err(AgentHostError::Disconnected)
            }
            Err(_) => {
                self.inner.pending.lock().unwrap().remove(&id);
                Err(AgentHostError::Timeout)
            }
        }
    }

    pub async fn quick_command(
        &self,
        name: &str,
        args: Option<Value>,
    ) -> Result<Value, AgentHostError> {
        self.command(name, args, QUICK_COMMAND_TIMEOUT).await
    }

    /// Remove a session from the workspace-scoped index (after deletion).
    /// If no sessions remain anywhere, shut the sidecar down so the
    /// agent-harness process doesn't linger once the user closed everything.
    pub fn remove_session_from_workspace(&self, session_id: &str) {
        let empty = {
            let mut map = self.inner.workspace_sessions.lock().unwrap();
            for sessions in map.values_mut() {
                sessions.retain(|s| s != session_id);
            }
            map.values().all(|v| v.is_empty())
        };
        if empty {
            self.shutdown();
        }
    }

    /// Stop a session and drop it from the open-session index (pane closed).
    /// The session stays persisted for resume; if this was the last open one
    /// the sidecar is shut down so the agent-harness process doesn't linger.
    pub async fn close_session(&self, session_id: &str) -> Result<(), AgentHostError> {
        self.quick_command("stop", Some(json!({ "sessionId": session_id })))
            .await
            .map(|_| ())?;
        self.remove_session_from_workspace(session_id);
        Ok(())
    }

    /// Shut down the sidecar process and all agent sessions.
    pub fn shutdown(&self) {
        shutdown_host(&self.inner);
    }
}

/// Kill the sidecar child process and reset all host state.
fn shutdown_host(inner: &HostInner) {
    let mut state = inner.state.lock().unwrap();
    if let Some(child) = state.child.take() {
        kill_process_tree(child);
    }
    state.connected = false;
    state.port = None;
    inner.send_tx.lock().unwrap().take();
    inner.workspace_sessions.lock().unwrap().clear();
}

fn handle_sidecar_text(inner: &HostInner, text: &str) {
    let message: SidecarMessage = match serde_json::from_str(text) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[yzpz-agent] failed to parse sidecar message: {e}");
            return;
        }
    };

    match message {
        SidecarMessage::Response {
            id,
            ok,
            result,
            error,
        } => {
            let pending = inner.pending.lock().unwrap().remove(&id);
            if let Some(tx) = pending {
                let outcome = if ok {
                    Ok(result.unwrap_or(Value::Null))
                } else {
                    Err(error.unwrap_or_else(|| "unknown sidecar error".to_string()))
                };
                let _ = tx.send(outcome);
            }
        }
        SidecarMessage::Event { event } => {
            forward_event(inner, &event.name, event.payload);
        }
    }
}

fn forward_event(inner: &HostInner, name: &str, payload: Value) {
    // Track session creation/deletion for workspace scoping.
    match name {
        "session-created" => {
            if let Some(session_id) = payload.get("sessionId").and_then(|v| v.as_str()) {
                let workspace_id = payload
                    .get("workspaceId")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let mut map = inner.workspace_sessions.lock().unwrap();
                let list = map.entry(workspace_id).or_default();
                // Resume can re-emit session-created for an already-tracked id.
                if !list.iter().any(|s| s == session_id) {
                    list.push(session_id.to_string());
                }
            }
        }
        "session-deleted" => {
            if let Some(session_id) = payload.get("sessionId").and_then(|v| v.as_str()) {
                let empty = {
                    let mut map = inner.workspace_sessions.lock().unwrap();
                    for sessions in map.values_mut() {
                        sessions.retain(|s| s != session_id);
                    }
                    map.values().all(|v| v.is_empty())
                };
                if empty {
                    shutdown_host(inner);
                }
            }
        }
        _ => {}
    }

    let app = inner.app_handle.lock().unwrap();
    if let Some(app) = app.as_ref() {
        let event_name = format!("{EVENT_PREFIX}:{name}");
        let _ = app.emit(&event_name, &payload);
    }
}

fn emit_log(inner: &HostInner, message: &str) {
    eprintln!("[yzpz-agent] {message}");
    let app = inner.app_handle.lock().unwrap();
    if let Some(app) = app.as_ref() {
        let _ = app.emit(
            &format!("{EVENT_PREFIX}:log"),
            &json!({ "message": message }),
        );
    }
}

fn emit_bootstrap(inner: &HostInner, phase: &str, message: &str) {
    let app = inner.app_handle.lock().unwrap();
    if let Some(app) = app.as_ref() {
        let _ = app.emit(
            &format!("{EVENT_PREFIX}:bootstrap"),
            &json!({ "phase": phase, "message": message }),
        );
    }
}

fn node_major_version(node: &std::path::Path) -> Result<u32, AgentHostError> {
    let output = new_node_command(node)
        .arg("--version")
        .output()
        .map_err(|e| AgentHostError::NodeMissing(format!("failed to run node: {e}")))?;
    let version = String::from_utf8_lossy(&output.stdout);
    let version = version.trim().trim_start_matches('v');
    let major = version
        .split('.')
        .next()
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| {
            AgentHostError::NodeMissing(format!("could not parse node version: {version}"))
        })?;
    if major < NODE_MIN_MAJOR {
        return Err(AgentHostError::NodeMissing(format!(
            "YZPZ Agent requires Node.js v{NODE_MIN_MAJOR}+ (found v{major})"
        )));
    }
    Ok(major)
}

async fn resolve_node_binary(inner: &HostInner) -> Result<PathBuf, AgentHostError> {
    if let Ok(node) = which::which("node") {
        let node = normalize_windows_process_path(&node);
        if matches!(node_major_version(&node), Ok(major) if major >= NODE_MIN_MAJOR) {
            return Ok(node);
        }
        emit_log(
            inner,
            "System Node.js is unavailable or older than v22; preparing a managed runtime…",
        );
    } else {
        emit_log(
            inner,
            "Node.js v22+ was not found; downloading the YzPzCode managed runtime…",
        );
    }

    ensure_managed_node(inner).await
}

async fn ensure_managed_node(inner: &HostInner) -> Result<PathBuf, AgentHostError> {
    let runtime_dir = managed_node_dir(inner)?;
    let managed_node = runtime_dir.join(managed_node_executable_path());
    if managed_node.is_file()
        && matches!(node_major_version(&managed_node), Ok(major) if major >= NODE_MIN_MAJOR)
    {
        return Ok(managed_node);
    }

    emit_bootstrap(inner, "downloading", "Downloading Node.js runtime…");
    let client = reqwest::Client::builder()
        .user_agent("YzPzCode Node runtime bootstrap")
        .build()
        .map_err(|e| {
            AgentHostError::NodeMissing(format!("failed to prepare Node download: {e}"))
        })?;
    let manifest = client
        .get(format!("{MANAGED_NODE_DIST_URL}/SHASUMS256.txt"))
        .send()
        .await
        .map_err(|e| AgentHostError::NodeMissing(format!("failed to fetch Node.js manifest: {e}")))?
        .error_for_status()
        .map_err(|e| AgentHostError::NodeMissing(format!("Node.js manifest request failed: {e}")))?
        .text()
        .await
        .map_err(|e| {
            AgentHostError::NodeMissing(format!("failed to read Node.js manifest: {e}"))
        })?;
    let (archive, expected_checksum) =
        node_archive_from_manifest(&manifest, std::env::consts::OS, std::env::consts::ARCH)?;
    let release_url = node_release_url(&archive.filename)?;

    let archive_bytes = client
        .get(format!("{release_url}/{}", archive.filename))
        .send()
        .await
        .map_err(|e| {
            AgentHostError::NodeMissing(format!("failed to download Node.js runtime: {e}"))
        })?
        .error_for_status()
        .map_err(|e| AgentHostError::NodeMissing(format!("Node.js runtime download failed: {e}")))?
        .bytes()
        .await
        .map_err(|e| AgentHostError::NodeMissing(format!("failed to read Node.js runtime: {e}")))?;

    let actual_checksum = format!("{:x}", Sha256::digest(&archive_bytes));
    if actual_checksum != expected_checksum {
        return Err(AgentHostError::NodeMissing(
            "Node.js runtime download failed checksum verification".to_string(),
        ));
    }

    let staging_dir = runtime_dir.with_extension(format!("download-{}", uuid::Uuid::new_v4()));
    let staging_dir_for_extract = staging_dir.clone();
    let archive_for_extract = archive.clone();
    tokio::task::spawn_blocking(move || {
        if archive_for_extract.is_zip {
            extract_node_zip(&archive_bytes, &staging_dir_for_extract)
        } else {
            extract_node_tar_gz(&archive_bytes, &staging_dir_for_extract)
        }
    })
    .await
    .map_err(|e| AgentHostError::NodeMissing(format!("Node.js extraction task failed: {e}")))?
    .map_err(|e| AgentHostError::NodeMissing(format!("failed to extract Node.js runtime: {e}")))?;

    let staged_node = staging_dir.join(&archive.executable);
    if !staged_node.is_file() {
        let _ = tokio::fs::remove_dir_all(&staging_dir).await;
        return Err(AgentHostError::NodeMissing(
            "Node.js archive did not contain the expected executable".to_string(),
        ));
    }

    if runtime_dir.exists() {
        tokio::fs::remove_dir_all(&runtime_dir).await.map_err(|e| {
            AgentHostError::NodeMissing(format!("failed to replace Node.js runtime: {e}"))
        })?;
    }
    if let Some(parent) = runtime_dir.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| {
            AgentHostError::NodeMissing(format!("failed to create Node.js runtime directory: {e}"))
        })?;
    }
    tokio::fs::rename(&staging_dir, &runtime_dir)
        .await
        .map_err(|e| {
            AgentHostError::NodeMissing(format!("failed to install Node.js runtime: {e}"))
        })?;

    emit_bootstrap(inner, "ready", "Node.js runtime ready");
    Ok(managed_node)
}

fn managed_node_dir(inner: &HostInner) -> Result<PathBuf, AgentHostError> {
    let app_data_dir = {
        let app = inner.app_handle.lock().unwrap();
        app.as_ref().and_then(|app| app.path().app_data_dir().ok())
    };
    Ok(match app_data_dir {
        Some(dir) => dir.join("agent").join("node-v22"),
        None => PathBuf::from(data_dir_path()).join("node-v22"),
    })
}

fn managed_node_executable_path() -> &'static str {
    if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "bin/node"
    }
}

fn node_archive_from_manifest(
    manifest: &str,
    os: &str,
    arch: &str,
) -> Result<(NodeArchive, String), AgentHostError> {
    let node_os = match os {
        "windows" => "win",
        "macos" => "darwin",
        "linux" => "linux",
        unsupported => {
            return Err(AgentHostError::NodeMissing(format!(
                "automatic Node.js setup is not supported on {unsupported}"
            )))
        }
    };
    let node_arch = match arch {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        unsupported => {
            return Err(AgentHostError::NodeMissing(format!(
                "automatic Node.js setup is not supported on {unsupported} CPUs"
            )))
        }
    };
    let is_zip = os == "windows";
    let suffix = if is_zip {
        format!("-{node_os}-{node_arch}.zip")
    } else {
        format!("-{node_os}-{node_arch}.tar.gz")
    };

    for line in manifest.lines() {
        let mut fields = line.split_whitespace();
        let Some(checksum) = fields.next() else {
            continue;
        };
        let Some(filename) = fields.next() else {
            continue;
        };
        if filename.starts_with("node-v") && filename.ends_with(&suffix) {
            if checksum.len() == 64 && checksum.bytes().all(|c| c.is_ascii_hexdigit()) {
                return Ok((
                    NodeArchive {
                        filename: filename.to_string(),
                        executable: PathBuf::from(if is_zip { "node.exe" } else { "bin/node" }),
                        is_zip,
                    },
                    checksum.to_ascii_lowercase(),
                ));
            }
        }
    }

    Err(AgentHostError::NodeMissing(format!(
        "no compatible Node.js v22 runtime is published for {node_os}-{node_arch}"
    )))
}

fn node_release_url(filename: &str) -> Result<String, AgentHostError> {
    let version = filename
        .strip_prefix("node-v")
        .and_then(|name| name.split_once('-').map(|(version, _)| version))
        .filter(|version| {
            !version.is_empty()
                && version
                    .bytes()
                    .all(|character| character.is_ascii_digit() || character == b'.')
        })
        .ok_or_else(|| AgentHostError::NodeMissing("invalid Node.js archive name".to_string()))?;
    Ok(format!("https://nodejs.org/dist/v{version}"))
}

fn archive_relative_path(path: &Path) -> Result<Option<PathBuf>> {
    let mut components = path.components();
    let Some(first) = components.next() else {
        return Ok(None);
    };
    if !matches!(first, std::path::Component::Normal(_)) {
        return Err(anyhow!("archive contains an invalid path"));
    }
    let relative = components.as_path();
    if relative.as_os_str().is_empty() {
        return Ok(None);
    }
    if relative
        .components()
        .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(anyhow!("archive contains an unsafe path"));
    }
    Ok(Some(relative.to_path_buf()))
}

fn extract_node_zip(bytes: &[u8], destination: &Path) -> Result<()> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(path) = entry.enclosed_name() else {
            return Err(anyhow!("archive contains an unsafe path"));
        };
        let Some(relative) = archive_relative_path(&path)? else {
            continue;
        };
        let output = destination.join(relative);
        if !output.starts_with(destination) {
            return Err(anyhow!("archive path escaped its destination"));
        }
        if entry.is_dir() {
            std::fs::create_dir_all(output)?;
        } else {
            if entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
            {
                return Err(anyhow!("archive contains an unsupported symbolic link"));
            }
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut file = std::fs::File::create(&output)?;
            std::io::copy(&mut entry, &mut file)?;
        }
    }
    Ok(())
}

fn extract_node_tar_gz(bytes: &[u8], destination: &Path) -> Result<()> {
    let decoder = GzDecoder::new(Cursor::new(bytes));
    let mut archive = tar::Archive::new(decoder);
    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?;
        let Some(relative) = archive_relative_path(&path)? else {
            continue;
        };
        let output = destination.join(relative);
        if !output.starts_with(destination) {
            return Err(anyhow!("archive path escaped its destination"));
        }
        let entry_type = entry.header().entry_type();
        if entry_type.is_dir() {
            std::fs::create_dir_all(output)?;
        } else if entry_type.is_file() {
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut file = std::fs::File::create(&output)?;
            std::io::copy(&mut entry, &mut file)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;

                let mode = entry.header().mode()?;
                std::fs::set_permissions(&output, std::fs::Permissions::from_mode(mode))?;
            }
        } else {
            // The managed runtime only needs `node`; npm's convenience links
            // are intentionally skipped instead of restoring archive links.
            // This prevents a downloaded archive from creating a link outside
            // the private runtime directory.
            continue;
        }
    }
    Ok(())
}

async fn read_ready_port(stdout: std::process::ChildStdout) -> Result<u16> {
    // Read the "READY <port>" line from the sidecar's stdout.
    let (tx, rx) = tokio::sync::oneshot::channel::<u16>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            if let Some(port) = line.strip_prefix("READY ") {
                if let Ok(port) = port.trim().parse::<u16>() {
                    let _ = tx.send(port);
                    return;
                }
            }
        }
    });

    tokio::time::timeout(Duration::from_secs(30), rx)
        .await
        .map_err(|_| anyhow!("timed out waiting for sidecar READY"))?
        .map_err(|_| anyhow!("sidecar exited before READY"))
}

fn sidecar_stderr_summary(stderr_tail: &Arc<Mutex<Vec<String>>>) -> String {
    let tail = stderr_tail.lock().unwrap();
    if tail.is_empty() {
        String::new()
    } else {
        format!("\nSidecar stderr:\n{}", tail.join("\n"))
    }
}

/// Locate the YZPZ Agent harness directory.
///
/// Preference order:
/// 1. `YZPZ_AGENT_HARNESS_DIR` env override (authoritative).
/// 2. Tauri resource dir (`resource_dir/agent-harness`) — where the harness
///    is bundled in packaged builds (macOS `Contents/Resources`, Windows/Linux
///    next to the executable).
/// 3. Next to the running executable (Windows/Linux + dev fallback).
/// 4. Dev-tree relative paths (cwd, cwd/app, parent/app).
///
/// An installed-but-unbuilt harness (`package.json` present without
/// `dist/index.js`) is still returned so callers can rebuild it locally.
fn locate_harness_dir(inner: &HostInner) -> Result<std::path::PathBuf, AgentHostError> {
    if let Ok(dir) = std::env::var("YZPZ_AGENT_HARNESS_DIR") {
        let p = normalize_windows_process_path(std::path::Path::new(&dir));
        if p.join("dist").join("index.js").exists() || p.join("package.json").exists() {
            return Ok(p);
        }
    }

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    {
        let app = inner.app_handle.lock().unwrap();
        if let Some(app) = app.as_ref() {
            if let Ok(resource_dir) = app.path().resource_dir() {
                candidates.push(normalize_windows_process_path(
                    &resource_dir.join("agent-harness"),
                ));
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(normalize_windows_process_path(&dir.join("agent-harness")));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(normalize_windows_process_path(&cwd.join("agent-harness")));
        candidates.push(normalize_windows_process_path(
            &cwd.join("app").join("agent-harness"),
        ));
        candidates.push(normalize_windows_process_path(
            &cwd.join("..").join("app").join("agent-harness"),
        ));
    }

    // Prefer a harness that is already built.
    for candidate in &candidates {
        if candidate.join("dist").join("index.js").exists() {
            return Ok(candidate.clone());
        }
    }
    // Fall back to an unbuilt harness so the caller can rebuild it locally.
    for candidate in candidates {
        if candidate.join("package.json").exists() {
            return Ok(candidate);
        }
    }

    Err(AgentHostError::Sidecar(
        "YZPZ Agent harness could not be located (app/agent-harness). \
         Reinstall YzPzCode, or set YZPZ_AGENT_HARNESS_DIR to the harness directory."
            .to_string(),
    ))
}

/// Ensure `dist/index.js` exists in the harness, rebuilding it locally when
/// possible (requires the bundled source, tsconfig, and node_modules). No
/// network access is used; if the harness is incomplete beyond repair, a
/// clear, actionable error is returned.
async fn ensure_harness_ready(
    inner: &HostInner,
    node: &std::path::Path,
    harness_dir: &std::path::Path,
) -> Result<(), AgentHostError> {
    let entry = harness_dir.join("dist").join("index.js");
    if entry.exists() {
        return Ok(());
    }

    emit_log(
        inner,
        &format!(
            "YZPZ Agent harness not built (missing {}); rebuilding locally…",
            entry.display()
        ),
    );
    emit_bootstrap(inner, "building", "Rebuilding YZPZ Agent harness…");

    let missing_source = !harness_dir.join("src").join("index.ts").exists()
        || !harness_dir.join("tsconfig.json").exists();
    let missing_deps =
        !harness_dir.join("node_modules").exists() || !harness_dir.join("package.json").exists();
    if missing_source || missing_deps {
        return Err(AgentHostError::Sidecar(format!(
            "YZPZ Agent harness is incomplete (missing {}) and cannot be rebuilt locally. \
             Reinstall YzPzCode to restore the agent.",
            entry.display()
        )));
    }

    let tsc = harness_dir
        .join("node_modules")
        .join("typescript")
        .join("bin")
        .join("tsc");
    let output = new_node_command_tokio(node)
        .arg(&tsc)
        .arg("-p")
        .arg(harness_dir.join("tsconfig.json"))
        .current_dir(harness_dir)
        .output()
        .await
        .map_err(|e| AgentHostError::Sidecar(format!("failed to run harness build: {e}")))?;

    if output.status.success() && entry.exists() {
        emit_log(inner, "YZPZ Agent harness built successfully");
        emit_bootstrap(inner, "ready", "YZPZ Agent harness ready");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.lines().next_back().unwrap_or("unknown error");
        Err(AgentHostError::Sidecar(format!(
            "YZPZ Agent harness build failed: {detail}"
        )))
    }
}

fn data_dir_path() -> String {
    if let Ok(dir) = std::env::var("YZPZ_AGENT_DATA_DIR") {
        return normalize_windows_process_path(std::path::Path::new(&dir))
            .to_string_lossy()
            .to_string();
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    normalize_windows_process_path(&std::path::Path::new(&home).join(".yzpzcode").join("agent"))
        .to_string_lossy()
        .to_string()
}

fn kill_process_tree(mut child: Child) {
    #[cfg(target_os = "windows")]
    {
        let pid = child.id();
        if pid != 0 {
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID"])
                .arg(pid.to_string())
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
        let _ = child.kill();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manager() -> AgentHostManager {
        AgentHostManager::new()
    }

    #[test]
    fn includes_sidecar_stderr_in_startup_error_detail() {
        let stderr_tail = Arc::new(Mutex::new(vec![
            "Error: listen EACCES: permission denied".to_string(),
            "  at Server.setupListenHandle".to_string(),
        ]));

        assert_eq!(
            sidecar_stderr_summary(&stderr_tail),
            "\nSidecar stderr:\nError: listen EACCES: permission denied\n  at Server.setupListenHandle"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn normalizes_extended_windows_paths_for_node() {
        assert_eq!(
            normalize_windows_process_path(std::path::Path::new(
                r"\\?\C:\Users\test\agent-harness\dist\index.js"
            )),
            std::path::PathBuf::from(r"C:\Users\test\agent-harness\dist\index.js")
        );
        assert_eq!(
            normalize_windows_process_path(std::path::Path::new(
                r"\\?\UNC\server\share\agent-harness"
            )),
            std::path::PathBuf::from(r"\\server\share\agent-harness")
        );
    }

    #[test]
    fn selects_the_correct_node_archive_for_each_supported_platform() {
        let checksum = "a".repeat(64);
        let manifest = format!(
            "{checksum}  node-v22.23.2-win-x64.zip\n{checksum}  node-v22.23.2-darwin-arm64.tar.gz\n{checksum}  node-v22.23.2-linux-x64.tar.gz\n"
        );

        let (windows, _) = node_archive_from_manifest(&manifest, "windows", "x86_64").unwrap();
        assert_eq!(windows.filename, "node-v22.23.2-win-x64.zip");
        assert_eq!(windows.executable, PathBuf::from("node.exe"));
        assert!(windows.is_zip);

        let (macos, _) = node_archive_from_manifest(&manifest, "macos", "aarch64").unwrap();
        assert_eq!(macos.filename, "node-v22.23.2-darwin-arm64.tar.gz");
        assert_eq!(macos.executable, PathBuf::from("bin/node"));
        assert!(!macos.is_zip);

        let (linux, _) = node_archive_from_manifest(&manifest, "linux", "x86_64").unwrap();
        assert_eq!(linux.filename, "node-v22.23.2-linux-x64.tar.gz");
        assert_eq!(
            node_release_url(&linux.filename).unwrap(),
            "https://nodejs.org/dist/v22.23.2"
        );
    }

    #[test]
    fn rejects_archive_paths_that_escape_the_runtime_directory() {
        assert!(archive_relative_path(Path::new("node-v22.23.2/../node")).is_err());
        assert!(archive_relative_path(Path::new("../node")).is_err());
        assert_eq!(
            archive_relative_path(Path::new("node-v22.23.2/bin/node")).unwrap(),
            Some(PathBuf::from("bin/node"))
        );
    }

    #[test]
    fn tracks_sessions_per_workspace() {
        let m = manager();
        let mut map = m.inner.workspace_sessions.lock().unwrap();
        map.insert("ws1".to_string(), vec!["s1".to_string(), "s2".to_string()]);
        map.insert("ws2".to_string(), vec!["s3".to_string()]);
        drop(map);

        m.remove_session_from_workspace("s2");
        let map = m.inner.workspace_sessions.lock().unwrap();
        assert_eq!(map["ws1"], vec!["s1".to_string()]);
        assert_eq!(map["ws2"], vec!["s3".to_string()]);
    }

    #[test]
    fn status_is_default_when_not_started() {
        let m = manager();
        let status = m.status();
        assert!(!status.running);
        assert!(!status.connected);
        assert_eq!(status.sessions, 0);
    }
}
