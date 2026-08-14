//! Sidecar process + WebSocket client internals for the YZPZ Agent host.

use anyhow::{anyhow, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
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
fn new_node_command(node: &std::path::Path) -> Command {
    let mut cmd = Command::new(node);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

const EVENT_PREFIX: &str = "yzpz-agent";
const CONNECT_ATTEMPTS: u32 = 8;
const CONNECT_RETRY_DELAY_MS: u64 = 400;
const QUICK_COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const NODE_MIN_MAJOR: u32 = 22;

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
        // Resolve node binary and version.
        let node = which::which("node").map_err(|_| {
            AgentHostError::NodeMissing(
                "Node.js is required for YZPZ Agent but was not found on PATH".to_string(),
            )
        })?;
        let node_major = node_major_version(&node)?;

        let harness_dir = resolve_harness_dir()?;
        let entry = harness_dir.join("dist").join("index.js");
        if !entry.exists() {
            return Err(AgentHostError::Sidecar(format!(
                "YZPZ Agent harness not built (missing {}). Run `npm run build` in app/agent-harness.",
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

        let port = read_ready_port(stdout).await.map_err(|e| {
            let _ = child.kill();
            AgentHostError::Sidecar(format!("sidecar failed to start: {e}"))
        })?;

        // Stderr reader thread (logs only).
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("[yzpz-agent] {line}");
            }
        });

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
    pub fn remove_session_from_workspace(&self, session_id: &str) {
        let mut map = self.inner.workspace_sessions.lock().unwrap();
        for sessions in map.values_mut() {
            sessions.retain(|s| s != session_id);
        }
    }

    /// Shut down the sidecar process and all agent sessions.
    pub fn shutdown(&self) {
        let mut state = self.inner.state.lock().unwrap();
        if let Some(child) = state.child.take() {
            kill_process_tree(child);
        }
        state.connected = false;
        state.port = None;
        self.inner.send_tx.lock().unwrap().take();
        self.inner.workspace_sessions.lock().unwrap().clear();
    }
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
                let mut map = inner.workspace_sessions.lock().unwrap();
                for sessions in map.values_mut() {
                    sessions.retain(|s| s != session_id);
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

fn resolve_harness_dir() -> Result<std::path::PathBuf, AgentHostError> {
    if let Ok(dir) = std::env::var("YZPZ_AGENT_HARNESS_DIR") {
        let p = std::path::PathBuf::from(dir);
        if p.join("dist").join("index.js").exists() {
            return Ok(p);
        }
    }

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("agent-harness"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("agent-harness"));
        candidates.push(cwd.join("app").join("agent-harness"));
        candidates.push(cwd.join("..").join("app").join("agent-harness"));
    }

    for candidate in candidates {
        if candidate.join("dist").join("index.js").exists() {
            return Ok(candidate);
        }
    }

    Err(AgentHostError::Sidecar(
        "could not locate YZPZ Agent harness (app/agent-harness). Set YZPZ_AGENT_HARNESS_DIR to its path.".to_string(),
    ))
}

fn data_dir_path() -> String {
    if let Ok(dir) = std::env::var("YZPZ_AGENT_DATA_DIR") {
        return dir;
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    std::path::Path::new(&home)
        .join(".yzpzcode")
        .join("agent")
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
