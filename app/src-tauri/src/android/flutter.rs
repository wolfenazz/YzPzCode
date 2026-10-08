//! Flutter run sessions driven through `flutter run --machine`.
//!
//! The machine protocol is the one IDEs use: JSON events on stdout
//! (`app.start`, `app.progress`, `app.log`, …) and JSON-RPC requests on stdin
//! (`app.restart` for hot reload / hot restart, `app.stop`). One session per
//! workspace; its state and log lines reach the UI as `flutter-run-state` and
//! `flutter-run-log` events.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;

use super::sdk;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum RunPhase {
    Starting,
    Running,
    Reloading,
    Restarting,
    Stopping,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlutterRunState {
    pub workspace_id: String,
    pub run_id: String,
    pub cwd: String,
    pub device_id: String,
    pub device_name: String,
    pub mode: String,
    pub phase: RunPhase,
    pub app_id: Option<String>,
    pub supports_restart: bool,
    pub vm_service_uri: Option<String>,
    pub web_url: Option<String>,
    /// Latest progress or reload result, e.g. "Hot reload · 412 ms".
    pub message: Option<String>,
    pub error: Option<String>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlutterLogLine {
    pub workspace_id: String,
    pub run_id: String,
    pub text: String,
    /// stdout | stderr | error | progress | info
    pub level: &'static str,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlutterRunRequest {
    pub cwd: String,
    pub device_id: String,
    pub device_name: String,
    /// debug | profile | release
    #[serde(default)]
    pub mode: Option<String>,
    /// Entry point, relative to `cwd` (defaults to lib/main.dart).
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub flavor: Option<String>,
    #[serde(default)]
    pub extra_args: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlutterDevice {
    pub id: String,
    pub name: String,
    pub target_platform: String,
    pub category: Option<String>,
    pub emulator: bool,
    pub sdk: Option<String>,
    pub supported: bool,
}

enum Pending {
    Restart { full: bool, started: Instant },
    Stop,
}

struct Run {
    state: FlutterRunState,
    stdin: Arc<tokio::sync::Mutex<Option<ChildStdin>>>,
    pid: Option<u32>,
    next_request: u64,
    pending: HashMap<u64, Pending>,
}

#[derive(Clone, Default)]
pub struct FlutterRunManager {
    app: Arc<Mutex<Option<AppHandle>>>,
    runs: Arc<Mutex<HashMap<String, Run>>>,
}

fn is_active(phase: RunPhase) -> bool {
    !matches!(phase, RunPhase::Stopped | RunPhase::Failed)
}

pub fn flutter_command() -> Result<tokio::process::Command, String> {
    let root = sdk::flutter_root()
        .ok_or("Flutter SDK not found. Open Flutter & Android setup to install it.")?;
    Ok(sdk::tool_command(sdk::flutter_launcher(&root)))
}

/// `flutter devices --machine`.
pub async fn list_devices() -> Result<Vec<FlutterDevice>, String> {
    let output = tokio::time::timeout(
        Duration::from_secs(90),
        flutter_command()?
            .args(["devices", "--machine"])
            .stdin(Stdio::null())
            .output(),
    )
    .await
    .map_err(|_| "flutter devices timed out".to_string())?
    .map_err(|e| format!("Could not run flutter devices: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let devices = parse_devices(&stdout).ok_or_else(|| {
        let stderr = String::from_utf8_lossy(&output.stderr);
        format!(
            "flutter devices failed: {}",
            stderr.trim().lines().last().unwrap_or("no output")
        )
    })?;
    Ok(devices)
}

/// Pulls the JSON array out of `flutter devices --machine` output, which can
/// carry banner lines before it.
pub fn parse_devices(stdout: &str) -> Option<Vec<FlutterDevice>> {
    let start = stdout.find('[')?;
    let end = stdout.rfind(']')?;
    let values: Vec<Value> = serde_json::from_str(&stdout[start..=end]).ok()?;
    Some(
        values
            .into_iter()
            .filter_map(|value| {
                Some(FlutterDevice {
                    id: value.get("id")?.as_str()?.to_string(),
                    name: value.get("name")?.as_str()?.to_string(),
                    target_platform: value
                        .get("targetPlatform")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    category: value
                        .get("category")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    emulator: value
                        .get("emulator")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    sdk: value.get("sdk").and_then(Value::as_str).map(str::to_string),
                    supported: value
                        .get("isSupported")
                        .and_then(Value::as_bool)
                        .unwrap_or(true),
                })
            })
            .collect(),
    )
}

fn kill_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // The run is spawned as its own process group.
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .output();
    }
}

impl FlutterRunManager {
    pub fn set_app_handle(&self, app: AppHandle) {
        *self.app.lock().unwrap() = Some(app);
    }

    fn emit_state(&self, state: &FlutterRunState) {
        if let Some(app) = self.app.lock().unwrap().clone() {
            let _ = app.emit("flutter-run-state", state);
        }
    }

    fn log(&self, workspace_id: &str, run_id: &str, text: impl Into<String>, level: &'static str) {
        if let Some(app) = self.app.lock().unwrap().clone() {
            let _ = app.emit(
                "flutter-run-log",
                FlutterLogLine {
                    workspace_id: workspace_id.to_string(),
                    run_id: run_id.to_string(),
                    text: text.into(),
                    level,
                },
            );
        }
    }

    /// Applies a change to the current run, if `run_id` still is the current
    /// one, and publishes the new state.
    fn update(&self, workspace_id: &str, run_id: &str, change: impl FnOnce(&mut Run)) {
        let state = {
            let mut runs = self.runs.lock().unwrap();
            let Some(run) = runs.get_mut(workspace_id) else {
                return;
            };
            if run.state.run_id != run_id {
                return;
            }
            change(run);
            run.state.clone()
        };
        self.emit_state(&state);
    }

    pub fn state(&self, workspace_id: &str) -> Option<FlutterRunState> {
        self.runs
            .lock()
            .unwrap()
            .get(workspace_id)
            .map(|run| run.state.clone())
    }

    pub async fn start(
        &self,
        workspace_id: String,
        request: FlutterRunRequest,
    ) -> Result<FlutterRunState, String> {
        if let Some(state) = self.state(&workspace_id) {
            if is_active(state.phase) {
                return Err(
                    "A Flutter app is already running in this workspace. Stop it first.".into(),
                );
            }
        }
        let mode = request.mode.clone().unwrap_or_else(|| "debug".into());
        let mut command = flutter_command()?;
        command.current_dir(&request.cwd).args([
            "run",
            "--machine",
            "-d",
            &request.device_id,
            &format!("--{mode}"),
        ]);
        if let Some(target) = request.target.as_deref().filter(|t| !t.trim().is_empty()) {
            command.args(["-t", target]);
        }
        if let Some(flavor) = request.flavor.as_deref().filter(|f| !f.trim().is_empty()) {
            command.args(["--flavor", flavor]);
        }
        command.args(request.extra_args.iter().filter(|a| !a.trim().is_empty()));
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(false);
        #[cfg(unix)]
        command.process_group(0);
        let mut child = command
            .spawn()
            .map_err(|e| format!("Could not start flutter run: {e}"))?;

        let run_id = uuid::Uuid::new_v4().to_string();
        let state = FlutterRunState {
            workspace_id: workspace_id.clone(),
            run_id: run_id.clone(),
            cwd: request.cwd.clone(),
            device_id: request.device_id.clone(),
            device_name: request.device_name.clone(),
            mode: mode.clone(),
            phase: RunPhase::Starting,
            app_id: None,
            supports_restart: false,
            vm_service_uri: None,
            web_url: None,
            message: Some(format!("Launching on {}…", request.device_name)),
            error: None,
            exit_code: None,
        };
        let stdin = Arc::new(tokio::sync::Mutex::new(child.stdin.take()));
        self.runs.lock().unwrap().insert(
            workspace_id.clone(),
            Run {
                state: state.clone(),
                stdin,
                pid: child.id(),
                next_request: 1,
                pending: HashMap::new(),
            },
        );
        self.emit_state(&state);
        self.log(
            &workspace_id,
            &run_id,
            format!("$ flutter run -d {} --{mode}", request.device_id),
            "info",
        );

        if let Some(stdout) = child.stdout.take() {
            let manager = self.clone();
            let (ws, id) = (workspace_id.clone(), run_id.clone());
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    manager.handle_stdout(&ws, &id, &line);
                }
            });
        }
        if let Some(stderr) = child.stderr.take() {
            let manager = self.clone();
            let (ws, id) = (workspace_id.clone(), run_id.clone());
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    manager.log(&ws, &id, line, "stderr");
                }
            });
        }
        {
            let manager = self.clone();
            let (ws, id) = (workspace_id.clone(), run_id.clone());
            tokio::spawn(async move {
                let status = child.wait().await;
                let code = status.as_ref().ok().and_then(|s| s.code());
                manager.update(&ws, &id, |run| {
                    run.stdin = Arc::default();
                    run.pending.clear();
                    run.state.exit_code = code;
                    let never_started = run.state.app_id.is_none();
                    let stopping = run.state.phase == RunPhase::Stopping;
                    if !stopping && (never_started || code.unwrap_or(0) != 0) {
                        run.state.phase = RunPhase::Failed;
                        if run.state.error.is_none() {
                            run.state.error = Some(match code {
                                Some(code) => format!(
                                    "flutter run exited with code {code}. See the log for details."
                                ),
                                None => "flutter run ended unexpectedly.".into(),
                            });
                        }
                    } else {
                        run.state.phase = RunPhase::Stopped;
                    }
                    run.state.message = Some("Application finished.".into());
                });
                manager.log(
                    &ws,
                    &id,
                    format!(
                        "flutter run exited{}",
                        code.map(|c| format!(" with code {c}")).unwrap_or_default()
                    ),
                    "info",
                );
            });
        }
        Ok(state)
    }

    fn handle_stdout(&self, workspace_id: &str, run_id: &str, line: &str) {
        let trimmed = line.trim();
        let messages = (trimmed.starts_with("[{") && trimmed.ends_with("}]"))
            .then(|| serde_json::from_str::<Vec<Value>>(trimmed).ok())
            .flatten();
        let Some(messages) = messages else {
            if !trimmed.is_empty() {
                self.log(workspace_id, run_id, line, "stdout");
            }
            return;
        };
        for message in messages {
            if let Some(event) = message.get("event").and_then(Value::as_str) {
                self.handle_event(
                    workspace_id,
                    run_id,
                    event,
                    message.get("params").unwrap_or(&Value::Null),
                );
            } else if let Some(id) = message.get("id").and_then(Value::as_u64) {
                self.handle_response(workspace_id, run_id, id, &message);
            }
        }
    }

    fn handle_event(&self, workspace_id: &str, run_id: &str, event: &str, params: &Value) {
        let text = |key: &str| params.get(key).and_then(Value::as_str).map(str::to_string);
        match event {
            "app.start" => self.update(workspace_id, run_id, |run| {
                run.state.app_id = text("appId");
                run.state.supports_restart = params
                    .get("supportsRestart")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
            }),
            "app.debugPort" => self.update(workspace_id, run_id, |run| {
                run.state.vm_service_uri = text("wsUri");
            }),
            "app.started" => {
                self.update(workspace_id, run_id, |run| {
                    run.state.phase = RunPhase::Running;
                    run.state.message = Some(format!("Running on {}", run.state.device_name));
                });
                self.log(workspace_id, run_id, "Application started.", "info");
            }
            "app.webLaunchUrl" => self.update(workspace_id, run_id, |run| {
                run.state.web_url = text("url");
            }),
            "app.log" => {
                if let Some(log) = text("log") {
                    let level = if params
                        .get("error")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                    {
                        "error"
                    } else {
                        "stdout"
                    };
                    for part in log.lines() {
                        self.log(workspace_id, run_id, part, level);
                    }
                }
            }
            "app.progress" => {
                if let Some(message) = text("message").filter(|m| !m.is_empty()) {
                    self.log(workspace_id, run_id, message.clone(), "progress");
                    self.update(workspace_id, run_id, |run| {
                        if matches!(
                            run.state.phase,
                            RunPhase::Starting | RunPhase::Reloading | RunPhase::Restarting
                        ) {
                            run.state.message = Some(message);
                        }
                    });
                }
            }
            "app.stop" => {
                let error = text("error");
                if let Some(error) = &error {
                    self.log(workspace_id, run_id, error.clone(), "error");
                }
                self.update(workspace_id, run_id, |run| {
                    if error.is_some() {
                        run.state.error = error;
                    }
                    if run.state.phase != RunPhase::Failed {
                        run.state.phase = RunPhase::Stopping;
                    }
                });
            }
            "daemon.logMessage" => {
                if let Some(message) = text("message") {
                    let level = match params.get("level").and_then(Value::as_str) {
                        Some("error") => "error",
                        Some("status") => "progress",
                        _ => "info",
                    };
                    self.log(workspace_id, run_id, message, level);
                }
            }
            _ => {}
        }
    }

    fn handle_response(&self, workspace_id: &str, run_id: &str, id: u64, message: &Value) {
        let pending = {
            let mut runs = self.runs.lock().unwrap();
            runs.get_mut(workspace_id)
                .filter(|run| run.state.run_id == run_id)
                .and_then(|run| run.pending.remove(&id))
        };
        let Some(Pending::Restart { full, started }) = pending else {
            return;
        };
        let label = if full { "Hot restart" } else { "Hot reload" };
        let elapsed = started.elapsed().as_millis();
        let result = message.get("result");
        let code = result
            .and_then(|r| r.get("code"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let error = message
            .get("error")
            .map(|e| {
                e.as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| e.to_string())
            })
            .or_else(|| {
                (code != 0).then(|| {
                    result
                        .and_then(|r| r.get("message"))
                        .and_then(Value::as_str)
                        .unwrap_or("failed")
                        .to_string()
                })
            });
        match &error {
            Some(error) => self.log(
                workspace_id,
                run_id,
                format!("{label} failed: {error}"),
                "error",
            ),
            None => self.log(
                workspace_id,
                run_id,
                format!("{label} done in {elapsed} ms"),
                "info",
            ),
        }
        self.update(workspace_id, run_id, |run| {
            if matches!(run.state.phase, RunPhase::Reloading | RunPhase::Restarting) {
                run.state.phase = RunPhase::Running;
            }
            run.state.message = Some(match &error {
                Some(_) => format!("{label} failed"),
                None => format!("{label} · {elapsed} ms"),
            });
            run.state.error = error;
        });
    }

    async fn request(
        &self,
        workspace_id: &str,
        method: &str,
        params: Value,
        pending: Pending,
    ) -> Result<(), String> {
        let (stdin, id) = {
            let mut runs = self.runs.lock().unwrap();
            let run = runs
                .get_mut(workspace_id)
                .ok_or("No Flutter app is running in this workspace.")?;
            let id = run.next_request;
            run.next_request += 1;
            run.pending.insert(id, pending);
            (run.stdin.clone(), id)
        };
        let line = format!(
            "{}\n",
            json!([{ "id": id, "method": method, "params": params }])
        );
        let mut stdin = stdin.lock().await;
        let pipe = stdin
            .as_mut()
            .ok_or("The Flutter process is no longer accepting commands.")?;
        pipe.write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        pipe.flush().await.map_err(|e| e.to_string())
    }

    pub async fn reload(&self, workspace_id: &str, full: bool) -> Result<(), String> {
        let state = self
            .state(workspace_id)
            .ok_or("No Flutter app is running in this workspace.")?;
        match state.phase {
            RunPhase::Running => {}
            RunPhase::Reloading | RunPhase::Restarting => return Ok(()),
            RunPhase::Starting => return Err("The app is still launching.".into()),
            _ => return Err("No Flutter app is running in this workspace.".into()),
        }
        if !state.supports_restart {
            return Err(format!(
                "Hot {} is not available in {} mode.",
                if full { "restart" } else { "reload" },
                state.mode
            ));
        }
        let app_id = state.app_id.ok_or("The app has not reported its id yet.")?;
        self.update(workspace_id, &state.run_id, |run| {
            run.state.phase = if full {
                RunPhase::Restarting
            } else {
                RunPhase::Reloading
            };
            run.state.message = Some(if full {
                "Hot restarting…".into()
            } else {
                "Hot reloading…".into()
            });
        });
        let params =
            json!({ "appId": app_id, "fullRestart": full, "pause": false, "reason": "manual" });
        if let Err(error) = self
            .request(
                workspace_id,
                "app.restart",
                params,
                Pending::Restart {
                    full,
                    started: Instant::now(),
                },
            )
            .await
        {
            self.update(workspace_id, &state.run_id, |run| {
                run.state.phase = RunPhase::Running;
                run.state.error = Some(error.clone());
            });
            return Err(error);
        }
        Ok(())
    }

    pub async fn stop(&self, workspace_id: &str) -> Result<(), String> {
        let Some(state) = self.state(workspace_id) else {
            return Ok(());
        };
        if !is_active(state.phase) {
            return Ok(());
        }
        self.update(workspace_id, &state.run_id, |run| {
            run.state.phase = RunPhase::Stopping;
            run.state.message = Some("Stopping…".into());
        });
        if let Some(app_id) = state.app_id.clone() {
            let _ = self
                .request(
                    workspace_id,
                    "app.stop",
                    json!({ "appId": app_id }),
                    Pending::Stop,
                )
                .await;
        }
        let pid = self
            .runs
            .lock()
            .unwrap()
            .get(workspace_id)
            .and_then(|run| run.pid);
        let manager = self.clone();
        let workspace_id = workspace_id.to_string();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(if state.app_id.is_some() {
                5
            } else {
                0
            }))
            .await;
            let still_running = manager
                .state(&workspace_id)
                .map(|s| s.run_id == state.run_id && is_active(s.phase))
                .unwrap_or(false);
            if still_running {
                if let Some(pid) = pid {
                    kill_tree(pid);
                }
            }
        });
        Ok(())
    }

    /// Kills every run; called when the app exits.
    pub fn stop_all(&self) {
        let pids: Vec<u32> = self
            .runs
            .lock()
            .unwrap()
            .values()
            .filter(|run| is_active(run.state.phase))
            .filter_map(|run| run.pid)
            .collect();
        for pid in pids {
            kill_tree(pid);
        }
    }

    /// Runs `flutter pub get`, streaming its output into the workspace's log.
    pub async fn pub_get(&self, workspace_id: String, cwd: String) -> Result<(), String> {
        let run_id = self
            .state(&workspace_id)
            .map(|state| state.run_id)
            .unwrap_or_else(|| "pub".into());
        self.log(&workspace_id, &run_id, "$ flutter pub get", "info");
        let output = flutter_command()?
            .current_dir(&cwd)
            .args(["pub", "get"])
            .stdin(Stdio::null())
            .output()
            .await
            .map_err(|e| format!("Could not run flutter pub get: {e}"))?;
        for line in String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|l| !l.trim().is_empty())
        {
            self.log(&workspace_id, &run_id, line, "stdout");
        }
        for line in String::from_utf8_lossy(&output.stderr)
            .lines()
            .filter(|l| !l.trim().is_empty())
        {
            self.log(&workspace_id, &run_id, line, "stderr");
        }
        if output.status.success() {
            Ok(())
        } else {
            Err("flutter pub get failed. See the Flutter log.".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_device_list_after_banner_lines() {
        let output = r#"Waiting for another flutter command to release the startup lock...
[
  {"name":"sdk gphone64 x86 64","id":"emulator-5554","isSupported":true,"targetPlatform":"android-x64","emulator":true,"sdk":"Android 16 (API 36)","category":"mobile"},
  {"name":"Windows","id":"windows","isSupported":true,"targetPlatform":"windows-x64","emulator":false,"category":"desktop"}
]"#;
        let devices = parse_devices(output).unwrap();
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].id, "emulator-5554");
        assert!(devices[0].emulator);
        assert_eq!(devices[1].category.as_deref(), Some("desktop"));
    }

    #[test]
    fn app_lifecycle_events_update_state() {
        let manager = FlutterRunManager::default();
        manager.runs.lock().unwrap().insert(
            "ws".into(),
            Run {
                state: FlutterRunState {
                    workspace_id: "ws".into(),
                    run_id: "r1".into(),
                    cwd: ".".into(),
                    device_id: "emulator-5554".into(),
                    device_name: "Pixel".into(),
                    mode: "debug".into(),
                    phase: RunPhase::Starting,
                    app_id: None,
                    supports_restart: false,
                    vm_service_uri: None,
                    web_url: None,
                    message: None,
                    error: None,
                    exit_code: None,
                },
                stdin: Arc::default(),
                pid: None,
                next_request: 1,
                pending: HashMap::from([(
                    1,
                    Pending::Restart {
                        full: false,
                        started: Instant::now(),
                    },
                )]),
            },
        );
        manager.handle_stdout("ws", "r1", r#"[{"event":"app.start","params":{"appId":"a1","deviceId":"emulator-5554","supportsRestart":true}}]"#);
        manager.handle_stdout(
            "ws",
            "r1",
            r#"[{"event":"app.started","params":{"appId":"a1"}}]"#,
        );
        let state = manager.state("ws").unwrap();
        assert_eq!(state.phase, RunPhase::Running);
        assert_eq!(state.app_id.as_deref(), Some("a1"));
        assert!(state.supports_restart);

        manager.update("ws", "r1", |run| run.state.phase = RunPhase::Reloading);
        manager.handle_stdout("ws", "r1", r#"[{"id":1,"result":{"code":0,"message":""}}]"#);
        let state = manager.state("ws").unwrap();
        assert_eq!(state.phase, RunPhase::Running);
        assert!(state.message.unwrap().starts_with("Hot reload"));

        // Events from a previous run never touch the current one.
        manager.handle_stdout(
            "ws",
            "old",
            r#"[{"event":"app.stop","params":{"appId":"a1"}}]"#,
        );
        assert_eq!(manager.state("ws").unwrap().phase, RunPhase::Running);
    }
}
