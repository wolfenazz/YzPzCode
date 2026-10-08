//! Runs Android emulators headless and embeds their screens in the app.
//!
//! An emulator started here gets `-qt-hide-window` and a gRPC port, the way
//! Android Studio's "Running Devices" tool window does it: the emulator's own
//! window never shows, frames come from `streamScreenshot` and input goes back
//! through `sendTouch` / `sendKey`. `-idle-grpc-timeout` plus a heartbeat makes an
//! orphaned emulator (the app crashed) shut itself down instead of running
//! invisibly forever.
//!
//! Emulators started elsewhere (Android Studio, `flutter emulators --launch`)
//! are discovered from the emulator's `avd/running/pid_*.ini` files and can be
//! attached when their gRPC endpoint accepts us (no auth or console token).

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, watch};
use tokio::task::AbortHandle;

use super::avd::{list_avds, parse_ini};
use super::frame_server::FrameServer;
use super::grpc::EmulatorClient;
use super::proto;
use super::sdk;

const IDLE_TIMEOUT_SECS: u32 = 300;
const HEARTBEAT: Duration = Duration::from_secs(60);
const BOOT_TIMEOUT: Duration = Duration::from_secs(420);
const MIN_FRAME_INTERVAL: Duration = Duration::from_millis(16);
const JPEG_QUALITY: u8 = 78;
const LOG_TAIL: usize = 80;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum EmulatorPhase {
    Booting,
    Running,
    Stopping,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmulatorInfo {
    pub serial: String,
    pub avd_name: String,
    pub display_name: String,
    pub console_port: u16,
    pub grpc_port: Option<u16>,
    pub phase: EmulatorPhase,
    /// Started by this app (hidden window, owned lifecycle).
    pub owned: bool,
    /// The screen can be embedded (gRPC reachable without a JWT).
    pub embeddable: bool,
    pub width: u32,
    pub height: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    #[serde(default)]
    pub cold_boot: bool,
    #[serde(default)]
    pub wipe_data: bool,
}

struct Emulator {
    info: EmulatorInfo,
    pid: Option<u32>,
    token: Option<String>,
    client: Option<EmulatorClient>,
    input: Option<mpsc::Sender<InputCommand>>,
    rotation: i32,
    log: Arc<Mutex<VecDeque<String>>>,
    tasks: Vec<AbortHandle>,
}

/// A screen stream's emulator serial, frame-server token and feeding tasks.
struct ScreenStream {
    serial: String,
    token: String,
    tasks: Vec<AbortHandle>,
}

/// Small messages about a screen stream; the frames themselves go over HTTP.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ScreenEvent {
    /// Frame geometry changed (first frame, rotation, resize) or the display
    /// turned on/off.
    #[serde(rename_all = "camelCase")]
    Meta {
        width: u32,
        height: u32,
        rotation: i32,
        display_off: bool,
        /// Frames stay in the device's natural (portrait) orientation when it
        /// is rotated, so the page turns the picture with the body. Android
        /// frames come in display orientation (false).
        natural_orientation: bool,
    },
    /// Frames delivered during the last second.
    Stats { fps: u32 },
    /// The emulator ended the stream; the page should reconnect.
    End,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenStreamInfo {
    pub stream_id: String,
    /// MJPEG (`multipart/x-mixed-replace`) URL for an `<img>`.
    pub url: String,
}

#[derive(Clone, Default)]
pub struct EmulatorManager {
    app: Arc<Mutex<Option<AppHandle>>>,
    emulators: Arc<Mutex<HashMap<String, Emulator>>>,
    streams: Arc<Mutex<HashMap<String, ScreenStream>>>,
    frame_server: Arc<tokio::sync::OnceCell<FrameServer>>,
}

fn port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn port_listening(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(150),
    )
    .is_ok()
}

fn running_ini_dirs() -> Vec<PathBuf> {
    #[cfg_attr(target_os = "windows", allow(unused_mut))]
    let mut dirs = vec![std::env::temp_dir().join("avd").join("running")];
    #[cfg(target_os = "macos")]
    dirs.push(sdk::home_dir().join("Library/Caches/TemporaryItems/avd/running"));
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(runtime) = std::env::var_os("XDG_RUNTIME_DIR") {
            dirs.push(PathBuf::from(runtime).join("avd").join("running"));
        }
        if let Ok(user) = std::env::var("USER") {
            dirs.push(PathBuf::from(format!("/tmp/android-{user}/avd/running")));
        }
    }
    dirs
}

struct Discovered {
    serial: String,
    avd_name: String,
    console_port: u16,
    grpc_port: Option<u16>,
    token: Option<String>,
    uses_jwt: bool,
    pid: Option<u32>,
}

/// Emulators announced by `pid_*.ini` files whose console is still listening.
fn discover_running() -> Vec<Discovered> {
    let mut found = Vec::new();
    for dir in running_ini_dirs() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("pid_") || !name.ends_with(".ini") {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(entry.path()) else {
                continue;
            };
            let ini = parse_ini(&text);
            let Some(console_port) = ini.get("port.serial").and_then(|p| p.parse::<u16>().ok())
            else {
                continue;
            };
            if !port_listening(console_port) {
                continue;
            }
            let avd_name = ini
                .get("avd.name")
                .or_else(|| ini.get("avd.id"))
                .cloned()
                .unwrap_or_else(|| format!("emulator-{console_port}"));
            found.push(Discovered {
                serial: format!("emulator-{console_port}"),
                avd_name,
                console_port,
                grpc_port: ini.get("grpc.port").and_then(|p| p.parse().ok()),
                token: ini.get("grpc.token").cloned().filter(|t| !t.is_empty()),
                uses_jwt: ini.contains_key("grpc.jwks"),
                pid: name
                    .trim_start_matches("pid_")
                    .trim_end_matches(".ini")
                    .parse()
                    .ok(),
            });
        }
    }
    found
}

/// A 0..1 point on the displayed (rotated) screen, in the display's natural
/// orientation.
pub fn natural_uv(u: f64, v: f64, rotation: i32) -> (f64, f64) {
    let u = u.clamp(0.0, 1.0);
    let v = v.clamp(0.0, 1.0);
    match rotation {
        1 => (1.0 - v, u),
        2 => (1.0 - u, 1.0 - v),
        3 => (v, 1.0 - u),
        _ => (u, v),
    }
}

/// Maps a point on the displayed (rotated) frame, normalised to 0..1, to the
/// emulator's touch coordinates, which use the display's natural orientation.
pub fn map_point(u: f64, v: f64, rotation: i32, width: u32, height: u32) -> (i32, i32) {
    let (nx, ny) = natural_uv(u, v, rotation);
    let x = (nx * f64::from(width.saturating_sub(1))).round() as i32;
    let y = (ny * f64::from(height.saturating_sub(1))).round() as i32;
    (x, y)
}

/// JPEG for one RGB frame; None when the display is off or the frame is short.
fn encode_jpeg(image: &proto::Image) -> Option<Vec<u8>> {
    let format = image.format.as_ref()?;
    let (width, height) = (format.width, format.height);
    let expected = width as usize * height as usize * 3;
    if width == 0 || height == 0 || image.image.len() < expected {
        return None;
    }
    let mut jpeg = Vec::with_capacity(expected / 10);
    yzpz_frame_codec::encode_rgb(
        &image.image,
        width as u16,
        height as u16,
        JPEG_QUALITY,
        &mut jpeg,
    )
    .ok()?;
    Some(jpeg)
}

fn frame_meta(image: &proto::Image) -> ScreenEvent {
    let format = image.format.clone().unwrap_or_default();
    ScreenEvent::Meta {
        width: format.width,
        height: format.height,
        rotation: format.rotation.map(|r| r.rotation).unwrap_or(0),
        display_off: image.image.is_empty(),
        natural_orientation: false,
    }
}

impl EmulatorManager {
    pub fn set_app_handle(&self, app: AppHandle) {
        *self.app.lock().unwrap() = Some(app);
    }

    fn emit_changed(&self) {
        let list = self.list();
        if let Some(app) = self.app.lock().unwrap().clone() {
            let _ = app.emit("android-emulators-changed", list);
        }
    }

    /// Tracked emulators plus running ones started elsewhere.
    pub fn list(&self) -> Vec<EmulatorInfo> {
        let mut emulators = self.emulators.lock().unwrap();
        for found in discover_running() {
            if emulators.contains_key(&found.serial) {
                continue;
            }
            let display_name = list_avds()
                .into_iter()
                .find(|avd| avd.name == found.avd_name)
                .map(|avd| avd.display_name)
                .unwrap_or_else(|| found.avd_name.replace('_', " "));
            emulators.insert(
                found.serial.clone(),
                Emulator {
                    info: EmulatorInfo {
                        serial: found.serial.clone(),
                        avd_name: found.avd_name,
                        display_name,
                        console_port: found.console_port,
                        grpc_port: found.grpc_port,
                        phase: EmulatorPhase::Running,
                        owned: false,
                        embeddable: found.grpc_port.is_some() && !found.uses_jwt,
                        width: 0,
                        height: 0,
                        error: if found.uses_jwt {
                            Some("Started outside YzPzCode with gRPC security; restart it here to embed its screen.".into())
                        } else {
                            None
                        },
                    },
                    pid: found.pid,
                    token: found.token,
                    client: None,
                    input: None,
                    rotation: 0,
                    log: Arc::default(),
                    tasks: Vec::new(),
                },
            );
        }
        // External emulators that went away since the last look.
        emulators.retain(|_, emulator| {
            emulator.info.owned
                || emulator.info.phase != EmulatorPhase::Running
                || port_listening(emulator.info.console_port)
        });
        let mut list: Vec<EmulatorInfo> = emulators.values().map(|e| e.info.clone()).collect();
        list.sort_by(|a, b| a.console_port.cmp(&b.console_port));
        list
    }

    fn update(&self, serial: &str, change: impl FnOnce(&mut Emulator)) {
        let changed = {
            let mut emulators = self.emulators.lock().unwrap();
            match emulators.get_mut(serial) {
                Some(emulator) => {
                    change(emulator);
                    true
                }
                None => false,
            }
        };
        if changed {
            self.emit_changed();
        }
    }

    fn pick_ports(&self) -> Result<(u16, u16), String> {
        let taken: Vec<u16> = self
            .emulators
            .lock()
            .unwrap()
            .values()
            .flat_map(|e| [Some(e.info.console_port), e.info.grpc_port])
            .flatten()
            .collect();
        let console = (5554u16..=5680)
            .step_by(2)
            .find(|port| !taken.contains(port) && port_free(*port) && port_free(port + 1))
            .ok_or("No free emulator console port between 5554 and 5680")?;
        let preferred = 8554 + (console - 5554);
        let grpc = std::iter::once(preferred)
            .chain(8554..8754)
            .find(|port| !taken.contains(port) && port_free(*port))
            .ok_or("No free port for the emulator's gRPC endpoint")?;
        Ok((console, grpc))
    }

    pub async fn start(
        &self,
        avd_name: String,
        options: StartOptions,
    ) -> Result<EmulatorInfo, String> {
        let existing = self.list().into_iter().find(|e| {
            e.avd_name == avd_name
                && e.phase != EmulatorPhase::Stopped
                && e.phase != EmulatorPhase::Failed
        });
        if let Some(existing) = existing {
            return Ok(existing);
        }
        let sdk_dir = sdk::android_sdk_dir()
            .ok_or("Android SDK not found. Run Flutter & Android setup first.")?;
        let emulator_bin = sdk::emulator_path(&sdk_dir);
        if !emulator_bin.is_file() {
            return Err(
                "The Android Emulator package is not installed. Run Flutter & Android setup first."
                    .into(),
            );
        }
        let avd = list_avds()
            .into_iter()
            .find(|avd| avd.name == avd_name)
            .ok_or_else(|| format!("No virtual device named {avd_name}"))?;
        let (console_port, grpc_port) = self.pick_ports()?;
        let serial = format!("emulator-{console_port}");

        let mut command = sdk::std_tool_command(&emulator_bin);
        command
            .current_dir(sdk_dir.join("emulator"))
            .args(["-avd", &avd_name])
            .args(["-port", &console_port.to_string()])
            .args(["-grpc", &grpc_port.to_string()])
            .args(["-idle-grpc-timeout", &IDLE_TIMEOUT_SECS.to_string()])
            .args(["-qt-hide-window", "-no-boot-anim"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if options.cold_boot {
            command.arg("-no-snapshot-load");
        }
        if options.wipe_data {
            command.arg("-wipe-data");
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Could not start the emulator: {e}"))?;
        let pid = child.id();

        let log: Arc<Mutex<VecDeque<String>>> = Arc::default();
        for stream in [
            child
                .stdout
                .take()
                .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
            child
                .stderr
                .take()
                .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        ]
        .into_iter()
        .flatten()
        {
            let log = log.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    let mut log = log.lock().unwrap();
                    if log.len() >= LOG_TAIL {
                        log.pop_front();
                    }
                    log.push_back(line);
                }
            });
        }

        let info = EmulatorInfo {
            serial: serial.clone(),
            avd_name: avd_name.clone(),
            display_name: avd.display_name.clone(),
            console_port,
            grpc_port: Some(grpc_port),
            phase: EmulatorPhase::Booting,
            owned: true,
            embeddable: true,
            width: avd.width.unwrap_or(0),
            height: avd.height.unwrap_or(0),
            error: None,
        };
        self.emulators.lock().unwrap().insert(
            serial.clone(),
            Emulator {
                info: info.clone(),
                pid: Some(pid),
                token: None,
                client: None,
                input: None,
                rotation: 0,
                log: log.clone(),
                tasks: Vec::new(),
            },
        );
        self.emit_changed();

        // Exit watcher: the process ending is the source of truth for Stopped.
        {
            let manager = self.clone();
            let serial = serial.clone();
            std::thread::spawn(move || {
                let status = child.wait();
                let failed = matches!(&status, Ok(status) if !status.success());
                manager.stop_streams_for(&serial);
                manager.update(&serial, |emulator| {
                    for task in emulator.tasks.drain(..) {
                        task.abort();
                    }
                    emulator.client = None;
                    emulator.input = None;
                    let booting = emulator.info.phase == EmulatorPhase::Booting;
                    if booting || (failed && emulator.info.phase != EmulatorPhase::Stopping) {
                        emulator.info.phase = EmulatorPhase::Failed;
                        let tail: Vec<String> = emulator
                            .log
                            .lock()
                            .unwrap()
                            .iter()
                            .rev()
                            .take(6)
                            .rev()
                            .cloned()
                            .collect();
                        emulator.info.error = Some(if tail.is_empty() {
                            "The emulator exited during boot.".into()
                        } else {
                            tail.join("\n")
                        });
                    } else {
                        emulator.info.phase = EmulatorPhase::Stopped;
                    }
                });
            });
        }

        // Boot watcher, then heartbeat.
        let manager = self.clone();
        let task_serial = serial.clone();
        let task = tokio::spawn(async move {
            let started = Instant::now();
            loop {
                if started.elapsed() > BOOT_TIMEOUT {
                    manager.update(&task_serial, |e| {
                        e.info.error =
                            Some("The emulator is taking unusually long to boot.".into());
                    });
                }
                let phase = manager.phase(&task_serial);
                if !matches!(phase, Some(EmulatorPhase::Booting)) {
                    return;
                }
                if let Ok(client) = manager.client(&task_serial).await {
                    if let Ok(status) = client.status().await {
                        if status.booted {
                            let (width, height) = display_size(&status);
                            manager.update(&task_serial, |e| {
                                e.info.phase = EmulatorPhase::Running;
                                e.info.error = None;
                                if width > 0 && height > 0 {
                                    e.info.width = width;
                                    e.info.height = height;
                                }
                            });
                            break;
                        }
                    }
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            loop {
                tokio::time::sleep(HEARTBEAT).await;
                if !matches!(manager.phase(&task_serial), Some(EmulatorPhase::Running)) {
                    return;
                }
                if let Ok(client) = manager.client(&task_serial).await {
                    let _ = client.status().await;
                }
            }
        });
        self.update(&serial, |e| e.tasks.push(task.abort_handle()));
        Ok(info)
    }

    fn phase(&self, serial: &str) -> Option<EmulatorPhase> {
        self.emulators
            .lock()
            .unwrap()
            .get(serial)
            .map(|e| e.info.phase)
    }

    async fn client(&self, serial: &str) -> Result<EmulatorClient, String> {
        let (cached, port, token) = {
            let emulators = self.emulators.lock().unwrap();
            let emulator = emulators
                .get(serial)
                .ok_or_else(|| format!("Unknown emulator {serial}"))?;
            (
                emulator.client.clone(),
                emulator.info.grpc_port,
                emulator.token.clone(),
            )
        };
        if let Some(client) = cached {
            return Ok(client);
        }
        let port = port.ok_or("This emulator has no gRPC endpoint; restart it from YzPzCode.")?;
        let client = EmulatorClient::connect(port, token).await?;
        if let Some(emulator) = self.emulators.lock().unwrap().get_mut(serial) {
            emulator.client = Some(client.clone());
        }
        Ok(client)
    }

    /// Ensures size information for an attached (external) emulator.
    async fn ensure_display(&self, serial: &str, client: &EmulatorClient) {
        let known = self
            .emulators
            .lock()
            .unwrap()
            .get(serial)
            .map(|e| e.info.width > 0 && e.info.height > 0)
            .unwrap_or(true);
        if known {
            return;
        }
        if let Ok(status) = client.status().await {
            let (width, height) = display_size(&status);
            self.update(serial, |e| {
                e.info.width = width;
                e.info.height = height;
            });
        }
    }

    pub async fn stop(&self, serial: &str) -> Result<(), String> {
        let (owned, pid, console_port) = {
            let emulators = self.emulators.lock().unwrap();
            let emulator = emulators
                .get(serial)
                .ok_or_else(|| format!("Unknown emulator {serial}"))?;
            (
                emulator.info.owned,
                emulator.pid,
                emulator.info.console_port,
            )
        };
        self.update(serial, |e| e.info.phase = EmulatorPhase::Stopping);
        self.stop_streams_for(serial);
        let graceful = match self.client(serial).await {
            Ok(client) => client.set_vm_state(proto::VM_SHUTDOWN).await.is_ok(),
            Err(_) => false,
        };
        if !graceful {
            let sdk_dir = sdk::android_sdk_dir_or_default();
            let _ = sdk::tool_command(sdk::adb_path(&sdk_dir))
                .args(["-s", serial, "emu", "kill"])
                .output()
                .await;
        }
        // Force the process down if it ignores both requests.
        let manager = self.clone();
        let serial = serial.to_string();
        tokio::spawn(async move {
            for _ in 0..40 {
                tokio::time::sleep(Duration::from_millis(500)).await;
                if !port_listening(console_port) {
                    if !owned {
                        manager.emulators.lock().unwrap().remove(&serial);
                        manager.emit_changed();
                    }
                    return;
                }
            }
            if let Some(pid) = pid {
                kill_pid(pid);
            }
        });
        Ok(())
    }

    /// Removes a stopped or failed entry from the list.
    pub fn dismiss(&self, serial: &str) {
        let removed = {
            let mut emulators = self.emulators.lock().unwrap();
            let done = emulators
                .get(serial)
                .map(|e| matches!(e.info.phase, EmulatorPhase::Stopped | EmulatorPhase::Failed))
                .unwrap_or(false);
            done && emulators.remove(serial).is_some()
        };
        if removed {
            self.emit_changed();
        }
    }

    /// Shuts down every emulator this app started; called on exit.
    pub fn shutdown_owned(&self) {
        let owned: Vec<(String, Option<u32>)> = self
            .emulators
            .lock()
            .unwrap()
            .values()
            .filter(|e| {
                e.info.owned
                    && matches!(
                        e.info.phase,
                        EmulatorPhase::Booting | EmulatorPhase::Running
                    )
            })
            .map(|e| (e.info.serial.clone(), e.pid))
            .collect();
        if owned.is_empty() {
            return;
        }
        let adb = sdk::adb_path(&sdk::android_sdk_dir_or_default());
        for (serial, pid) in owned {
            let ok = sdk::std_tool_command(&adb)
                .args(["-s", &serial, "emu", "kill"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if !ok {
                if let Some(pid) = pid {
                    kill_pid(pid);
                }
            }
        }
    }

    // ── Screen ───────────────────────────────────────────────────────────

    pub async fn start_stream(
        &self,
        serial: &str,
        width: u32,
        height: u32,
        events: Channel<ScreenEvent>,
    ) -> Result<ScreenStreamInfo, String> {
        let server = self
            .frame_server
            .get_or_try_init(FrameServer::start)
            .await?
            .clone();
        let client = self.client(serial).await?;
        self.ensure_display(serial, &client).await;
        let format = proto::ImageFormat {
            format: proto::ImgFormat::Rgb888 as i32,
            width,
            height,
            ..Default::default()
        };
        let mut frames = client
            .stream_screenshot(format)
            .await
            .map_err(|e| format!("Could not stream the emulator screen: {}", e.message()))?;
        let stream_id = uuid::Uuid::new_v4().to_string();
        let (token, url, jpeg_tx) = server.register();
        let (latest_tx, mut latest_rx) = watch::channel::<Option<Arc<proto::Image>>>(None);

        // Reader: keeps only the newest frame, so a slow encoder skips frames
        // instead of falling behind.
        let manager = self.clone();
        let reader_serial = serial.to_string();
        let reader = tokio::spawn(async move {
            while let Ok(Some(image)) = frames.message().await {
                let rotation = image
                    .format
                    .as_ref()
                    .and_then(|f| f.rotation.as_ref())
                    .map(|r| r.rotation)
                    .unwrap_or(0);
                if let Some(emulator) = manager.emulators.lock().unwrap().get_mut(&reader_serial) {
                    emulator.rotation = rotation;
                }
                if latest_tx.send(Some(Arc::new(image))).is_err() {
                    break;
                }
            }
        });

        // Encoder: JPEG to the frame server, geometry and fps to the page.
        let streams = self.streams.clone();
        let encoder_id = stream_id.clone();
        let encoder_server = server.clone();
        let encoder = tokio::spawn(async move {
            let mut last_sent = Instant::now() - MIN_FRAME_INTERVAL;
            let mut last_meta: Option<ScreenEvent> = None;
            let mut window = Instant::now();
            let mut sent: u32 = 0;
            let mut ticker = tokio::time::interval(Duration::from_secs(1));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                tokio::select! {
                    changed = latest_rx.changed() => {
                        if changed.is_err() {
                            break;
                        }
                    }
                    _ = ticker.tick() => {
                        let fps = (f64::from(sent) / window.elapsed().as_secs_f64()).round() as u32;
                        sent = 0;
                        window = Instant::now();
                        if events.send(ScreenEvent::Stats { fps }).is_err() {
                            break;
                        }
                        continue;
                    }
                }
                let wait = MIN_FRAME_INTERVAL.saturating_sub(last_sent.elapsed());
                if !wait.is_zero() {
                    tokio::time::sleep(wait).await;
                }
                let Some(image) = latest_rx.borrow_and_update().clone() else {
                    continue;
                };
                let meta = frame_meta(&image);
                if last_meta.as_ref() != Some(&meta) {
                    if events.send(meta.clone()).is_err() {
                        break;
                    }
                    last_meta = Some(meta);
                }
                let Ok(Some(jpeg)) = tokio::task::spawn_blocking(move || encode_jpeg(&image)).await
                else {
                    continue;
                };
                last_sent = Instant::now();
                sent += 1;
                jpeg_tx.send_replace(Some(Arc::new(jpeg)));
            }
            // The emulator closed the stream (restart, hiccup): tell the page so
            // it reconnects instead of showing a frozen screen.
            let _ = events.send(ScreenEvent::End);
            let removed = streams.lock().unwrap().remove(&encoder_id);
            if let Some(stream) = removed {
                encoder_server.unregister(&stream.token);
                for handle in stream.tasks {
                    handle.abort();
                }
            }
        });

        self.streams.lock().unwrap().insert(
            stream_id.clone(),
            ScreenStream {
                serial: serial.to_string(),
                token,
                tasks: vec![reader.abort_handle(), encoder.abort_handle()],
            },
        );
        Ok(ScreenStreamInfo { stream_id, url })
    }

    pub fn stop_stream(&self, stream_id: &str) {
        let removed = self.streams.lock().unwrap().remove(stream_id);
        if let Some(stream) = removed {
            if let Some(server) = self.frame_server.get() {
                server.unregister(&stream.token);
            }
            // Aborting the encoder drops the frame sender, which ends the
            // HTTP response for every viewer.
            for handle in stream.tasks {
                handle.abort();
            }
        }
    }

    fn stop_streams_for(&self, serial: &str) {
        let ids: Vec<String> = self
            .streams
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, stream)| stream.serial == serial)
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            self.stop_stream(&id);
        }
    }

    pub async fn screenshot_png(&self, serial: &str) -> Result<Vec<u8>, String> {
        let client = self.client(serial).await?;
        let image = client
            .screenshot(proto::ImageFormat {
                format: proto::ImgFormat::Png as i32,
                ..Default::default()
            })
            .await
            .map_err(|e| e.message().to_string())?;
        if image.image.is_empty() {
            return Err("The emulator display is off.".into());
        }
        Ok(image.image)
    }

    // ── Input ────────────────────────────────────────────────────────────
    //
    // The emulator ignores the client-streaming input RPCs (`streamInputEvent`,
    // `injectWheel`) on current builds, so every event is a unary call. A
    // per-emulator worker sends them one at a time, which keeps the order the
    // pointer produced them in.

    async fn send(&self, serial: &str, command: InputCommand) -> Result<(), String> {
        let sender = self
            .emulators
            .lock()
            .unwrap()
            .get(serial)
            .and_then(|e| e.input.clone());
        let command = match sender {
            Some(sender) if command.droppable() => match sender.try_send(command) {
                Ok(()) => return Ok(()),
                // The device is not keeping up; a later move supersedes this one.
                Err(mpsc::error::TrySendError::Full(_)) => return Ok(()),
                Err(mpsc::error::TrySendError::Closed(command)) => command,
            },
            // Presses and releases must never be lost, or a finger stays down.
            Some(sender) => match sender.send(command).await {
                Ok(()) => return Ok(()),
                Err(mpsc::error::SendError(command)) => command,
            },
            None => command,
        };
        let client = self.client(serial).await?;
        let (tx, mut rx) = mpsc::channel::<InputCommand>(512);
        let _ = tx.try_send(command);
        let manager = self.clone();
        let task_serial = serial.to_string();
        tokio::spawn(async move {
            while let Some(command) = rx.recv().await {
                let result = match command {
                    InputCommand::Touch(event) => client.send_touch(event).await,
                    InputCommand::Key(event) => client.send_key(event).await,
                    InputCommand::Drag(from, to) => drag(&client, from, to).await,
                };
                if let Err(status) = result {
                    if status.code() == tonic::Code::Unavailable {
                        break;
                    }
                }
            }
            if let Some(emulator) = manager.emulators.lock().unwrap().get_mut(&task_serial) {
                emulator.input = None;
                emulator.client = None;
            }
        });
        if let Some(emulator) = self.emulators.lock().unwrap().get_mut(serial) {
            emulator.input = Some(tx);
        }
        Ok(())
    }

    fn geometry(&self, serial: &str) -> Result<(i32, u32, u32), String> {
        let emulators = self.emulators.lock().unwrap();
        let e = emulators
            .get(serial)
            .ok_or_else(|| format!("Unknown emulator {serial}"))?;
        if e.info.width == 0 || e.info.height == 0 {
            return Err("The emulator display size is not known yet.".into());
        }
        Ok((e.rotation, e.info.width, e.info.height))
    }

    pub async fn touch(&self, serial: &str, points: Vec<TouchPoint>) -> Result<(), String> {
        let (rotation, width, height) = self.geometry(serial)?;
        let touches = points
            .into_iter()
            .map(|point| {
                let (x, y) = map_point(point.u, point.v, rotation, width, height);
                touch_at(x, y, point.id, point.down)
            })
            .collect();
        self.send(
            serial,
            InputCommand::Touch(proto::TouchEvent {
                touches,
                display: 0,
            }),
        )
        .await
    }

    /// Scrolls by dragging a finger from one point of the frame to another.
    pub async fn scroll(
        &self,
        serial: &str,
        from: (f64, f64),
        to: (f64, f64),
    ) -> Result<(), String> {
        let (rotation, width, height) = self.geometry(serial)?;
        let from = map_point(from.0, from.1, rotation, width, height);
        let to = map_point(to.0, to.1, rotation, width, height);
        self.send(serial, InputCommand::Drag(from, to)).await
    }

    pub async fn key(
        &self,
        serial: &str,
        key: String,
        event: proto::KeyEventType,
    ) -> Result<(), String> {
        self.send(
            serial,
            InputCommand::Key(proto::KeyboardEvent {
                event_type: event as i32,
                key,
                ..Default::default()
            }),
        )
        .await
    }

    /// Types text. Long text goes to the device clipboard instead (returns false).
    pub async fn text(&self, serial: &str, text: String) -> Result<bool, String> {
        // Long text overruns the emulated keyboard buffer; the clipboard is
        // the documented route for it.
        if text.chars().count() > 120 {
            let client = self.client(serial).await?;
            client
                .set_clipboard(text)
                .await
                .map_err(|e| e.message().to_string())?;
            return Ok(false);
        }
        self.send(
            serial,
            InputCommand::Key(proto::KeyboardEvent {
                text,
                ..Default::default()
            }),
        )
        .await?;
        Ok(true)
    }

    /// Rotates the device a quarter turn.
    pub async fn rotate(&self, serial: &str, clockwise: bool) -> Result<(), String> {
        let client = self.client(serial).await?;
        let current = self
            .emulators
            .lock()
            .unwrap()
            .get(serial)
            .map(|e| e.rotation)
            .unwrap_or(0);
        let next = if clockwise {
            (current + 3) % 4
        } else {
            (current + 1) % 4
        };
        let z = match next {
            1 => 90.0,
            2 => 180.0,
            3 => -90.0,
            _ => 0.0,
        };
        client
            .set_physical_model(proto::PhysicalModelValue {
                target: proto::PHYSICAL_ROTATION,
                status: 0,
                value: Some(proto::ParameterValue {
                    data: vec![0.0, 0.0, z],
                }),
            })
            .await
            .map_err(|e| e.message().to_string())
    }
}

fn display_size(status: &proto::EmulatorStatus) -> (u32, u32) {
    let entries = status
        .hardware_config
        .as_ref()
        .map(|c| c.entry.as_slice())
        .unwrap_or(&[]);
    let get = |key: &str| {
        entries
            .iter()
            .find(|entry| entry.key == key)
            .and_then(|entry| entry.value.parse().ok())
            .unwrap_or(0)
    };
    (get("hw.lcd.width"), get("hw.lcd.height"))
}

fn kill_pid(pid: u32) {
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
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}

enum InputCommand {
    Touch(proto::TouchEvent),
    Key(proto::KeyboardEvent),
    Drag((i32, i32), (i32, i32)),
}

impl InputCommand {
    /// Only finger moves may be skipped when the queue is full.
    fn droppable(&self) -> bool {
        matches!(self, InputCommand::Touch(event) if event.touches.iter().all(|t| t.pressure > 0))
    }
}

/// Pointer id reserved for synthesized scroll drags.
const DRAG_POINTER: i32 = 9;

fn touch_at(x: i32, y: i32, identifier: i32, down: bool) -> proto::Touch {
    proto::Touch {
        x,
        y,
        identifier,
        pressure: if down { 1 } else { 0 },
        touch_major: 0,
        touch_minor: 0,
    }
}

/// A short drag that rests at the end before lifting, so the list scrolls by
/// the distance moved and does not fling.
async fn drag(
    client: &EmulatorClient,
    from: (i32, i32),
    to: (i32, i32),
) -> Result<(), tonic::Status> {
    const STEPS: i32 = 6;
    let event = |x, y, down| proto::TouchEvent {
        touches: vec![touch_at(x, y, DRAG_POINTER, down)],
        display: 0,
    };
    client.send_touch(event(from.0, from.1, true)).await?;
    for step in 1..=STEPS {
        tokio::time::sleep(Duration::from_millis(8)).await;
        let x = from.0 + (to.0 - from.0) * step / STEPS;
        let y = from.1 + (to.1 - from.1) * step / STEPS;
        client.send_touch(event(x, y, true)).await?;
    }
    tokio::time::sleep(Duration::from_millis(45)).await;
    client.send_touch(event(to.0, to.1, true)).await?;
    client.send_touch(event(to.0, to.1, false)).await
}

#[derive(Debug, Clone, Deserialize)]
pub struct TouchPoint {
    pub id: i32,
    /// Position on the displayed frame, 0..1.
    pub u: f64,
    pub v: f64,
    pub down: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_portrait_points_directly() {
        assert_eq!(map_point(0.0, 0.0, 0, 1081, 2401), (0, 0));
        assert_eq!(map_point(1.0, 1.0, 0, 1081, 2401), (1080, 2400));
        assert_eq!(map_point(0.5, 0.25, 0, 1081, 2401), (540, 600));
    }

    #[test]
    fn maps_rotated_frames_back_to_natural_orientation() {
        // Each rotation is a bijection of the corners onto the corners.
        for rotation in 0..4 {
            let mut corners: Vec<(i32, i32)> = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]
                .iter()
                .map(|(u, v)| map_point(*u, *v, rotation, 101, 201))
                .collect();
            corners.sort();
            assert_eq!(
                corners,
                vec![(0, 0), (0, 200), (100, 0), (100, 200)],
                "rotation {rotation}"
            );
        }
        assert_eq!(map_point(1.0, 0.0, 2, 101, 201), (0, 200));
    }

    #[test]
    fn encodes_frames_and_reports_display_off() {
        let image = proto::Image {
            format: Some(proto::ImageFormat {
                format: 2,
                width: 4,
                height: 2,
                ..Default::default()
            }),
            image: vec![200; 4 * 2 * 3],
            seq: 7,
            timestamp_us: 0,
        };
        assert_eq!(&encode_jpeg(&image).unwrap()[..2], &[0xFF, 0xD8]);
        assert_eq!(
            frame_meta(&image),
            ScreenEvent::Meta {
                width: 4,
                height: 2,
                rotation: 0,
                display_off: false,
                natural_orientation: false
            }
        );
        let off = proto::Image {
            image: Vec::new(),
            ..image
        };
        assert!(encode_jpeg(&off).is_none());
        assert!(matches!(
            frame_meta(&off),
            ScreenEvent::Meta {
                display_off: true,
                ..
            }
        ));
        assert_eq!(
            serde_json::to_value(ScreenEvent::Meta {
                width: 1,
                height: 2,
                rotation: 1,
                display_off: false,
                natural_orientation: true
            })
            .unwrap(),
            serde_json::json!({ "type": "meta", "width": 1, "height": 2, "rotation": 1, "displayOff": false, "naturalOrientation": true })
        );
    }

    #[test]
    fn only_finger_moves_are_droppable() {
        let event = |pressure| {
            InputCommand::Touch(proto::TouchEvent {
                touches: vec![touch_at(1, 1, 1, pressure > 0)],
                display: 0,
            })
        };
        assert!(event(1).droppable());
        assert!(!event(0).droppable());
        assert!(!InputCommand::Key(proto::KeyboardEvent::default()).droppable());
    }
}

/// Probes a live emulator: `YZPZ_EMU_GRPC=8600 cargo test --lib emulator_probe -- --ignored --nocapture`.
#[cfg(test)]
mod probe {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn emulator_probe() {
        let port: u16 = std::env::var("YZPZ_EMU_GRPC").unwrap().parse().unwrap();
        let client = EmulatorClient::connect(port, None).await.unwrap();
        let status = client.status().await.unwrap();
        println!(
            "version={} booted={} size={:?}",
            status.version,
            status.booted,
            display_size(&status)
        );
        let image = client
            .screenshot(proto::ImageFormat {
                format: proto::ImgFormat::Rgb888 as i32,
                width: 360,
                height: 800,
                ..Default::default()
            })
            .await
            .unwrap();
        let f = image.format.clone().unwrap();
        println!(
            "frame {}x{} rot={:?} bytes={}",
            f.width,
            f.height,
            f.rotation,
            image.image.len()
        );
        let out = std::env::temp_dir().join("yzpz-frame.jpg");
        std::fs::write(&out, encode_jpeg(&image).unwrap()).unwrap();
        println!("wrote {}", out.display());
    }
}

#[cfg(test)]
mod probe_input {
    use super::*;

    /// Taps (or with `YZPZ_DRAG=1` scrolls) a live emulator, then saves a frame:
    /// `YZPZ_EMU_GRPC=8600 YZPZ_TAP=0.06,0.084 cargo test --lib emulator_tap_probe -- --ignored`
    #[tokio::test]
    #[ignore]
    async fn emulator_tap_probe() {
        let port: u16 = std::env::var("YZPZ_EMU_GRPC").unwrap().parse().unwrap();
        let tap = std::env::var("YZPZ_TAP").unwrap();
        let (u, v) = tap.split_once(',').unwrap();
        let (u, v): (f64, f64) = (u.parse().unwrap(), v.parse().unwrap());
        let client = EmulatorClient::connect(port, None).await.unwrap();
        let (w, h) = display_size(&client.status().await.unwrap());
        let (x, y) = map_point(u, v, 0, w, h);
        if std::env::var("YZPZ_DRAG").is_ok() {
            let (_, y2) = map_point(u, (v - 0.3).max(0.0), 0, w, h);
            drag(&client, (x, y), (x, y2)).await.unwrap();
        } else {
            let event = |down| proto::TouchEvent {
                touches: vec![touch_at(x, y, 1, down)],
                display: 0,
            };
            client.send_touch(event(true)).await.unwrap();
            tokio::time::sleep(Duration::from_millis(60)).await;
            client.send_touch(event(false)).await.unwrap();
        }
        tokio::time::sleep(Duration::from_millis(1200)).await;
        let image = client
            .screenshot(proto::ImageFormat {
                format: 2,
                width: 360,
                height: 800,
                ..Default::default()
            })
            .await
            .unwrap();
        std::fs::write(
            std::env::temp_dir().join("yzpz-after.jpg"),
            encode_jpeg(&image).unwrap(),
        )
        .unwrap();
    }
}

#[cfg(test)]
mod bench {
    use super::*;

    /// `YZPZ_EMU_GRPC=8554 cargo test --lib emulator_stream_bench -- --ignored --nocapture`
    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn emulator_stream_bench() {
        let port: u16 = std::env::var("YZPZ_EMU_GRPC").unwrap().parse().unwrap();
        let bound: u32 = std::env::var("YZPZ_BOUND")
            .ok()
            .and_then(|b| b.parse().ok())
            .unwrap_or(900);
        let client = EmulatorClient::connect(port, None).await.unwrap();
        let (w, h) = display_size(&client.status().await.unwrap());
        // Keep the screen moving.
        let animator = client.clone();
        let animate = tokio::spawn(async move {
            for i in 0..14 {
                let (from, to) = if i % 2 == 0 {
                    (0.75, 0.35)
                } else {
                    (0.35, 0.75)
                };
                let _ = drag(
                    &animator,
                    map_point(0.5, from, 0, w, h),
                    map_point(0.5, to, 0, w, h),
                )
                .await;
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
        });
        let mut frames = client
            .stream_screenshot(proto::ImageFormat {
                format: proto::ImgFormat::Rgb888 as i32,
                width: bound,
                height: bound,
                ..Default::default()
            })
            .await
            .unwrap();
        let started = Instant::now();
        let (mut count, mut encode_ms, mut bytes, mut size) = (0u32, 0f64, 0usize, (0, 0));
        while started.elapsed() < Duration::from_secs(4) {
            let Ok(Some(image)) = frames.message().await else {
                break;
            };
            count += 1;
            let f = image.format.clone().unwrap();
            size = (f.width, f.height);
            let t = Instant::now();
            bytes += encode_jpeg(&image).unwrap().len();
            encode_ms += t.elapsed().as_secs_f64() * 1000.0;
        }
        animate.abort();
        let n = count.max(1) as f64;
        println!(
            "frames={count} ({:.1} fps) size={size:?} encode={:.2}ms avg-jpeg={}KB",
            n / started.elapsed().as_secs_f64(),
            encode_ms / n,
            bytes / count.max(1) as usize / 1024
        );
    }
}
