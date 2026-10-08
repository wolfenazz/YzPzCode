//! Runs iOS Simulators headless and embeds their screens, like the Android
//! emulator next door.
//!
//! `simctl boot` starts a simulator without Simulator.app's window. Its screen
//! and input go through an idb_companion per simulator: an MJPEG
//! `video_stream` whose frames are forwarded unchanged to the loopback frame
//! server, and `hid` events for touches, buttons and keys. Simulators booted
//! elsewhere (Simulator.app, `flutter emulators --launch`) are shown too; only
//! the ones booted here are shut down when the app exits.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::task::AbortHandle;

use super::companion::{companion_path, Companion, CompanionClient};
use super::keys::{key_stroke, text_strokes, KeyStroke, LEFT_SHIFT};
use super::mjpeg::MjpegSplitter;
use super::proto::{self, HidButtonType, HidDirection, HidEvent, HidOrientationType};
use super::simctl::{self, SimulatorDevice};
use crate::android::emulator::{
    natural_uv, EmulatorPhase, ScreenEvent, ScreenStreamInfo, TouchPoint,
};
use crate::android::frame_server::FrameServer;

const BOOT_TIMEOUT: Duration = Duration::from_secs(300);
const STREAM_FPS: u64 = 60;
const JPEG_QUALITY: f64 = 0.75;
const LONG_TEXT: usize = 120;

/// A simulator in the panel's device list; serialized like an Android
/// `EmulatorInfo` plus `platform`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulatorInstance {
    pub serial: String,
    /// The UDID again: the picker keys devices by this.
    pub avd_name: String,
    pub display_name: String,
    pub console_port: u16,
    pub grpc_port: Option<u16>,
    pub phase: EmulatorPhase,
    pub owned: bool,
    pub embeddable: bool,
    pub width: u32,
    pub height: u32,
    pub error: Option<String>,
    pub platform: &'static str,
}

/// What `ios_list_simulators` returns.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IosSnapshot {
    /// Xcode's simulator tools are usable on this machine.
    pub available: bool,
    pub companion_installed: bool,
    pub devices: Vec<SimulatorDevice>,
    pub simulators: Vec<SimulatorInstance>,
    pub error: Option<String>,
}

struct Simulator {
    info: SimulatorInstance,
    companion: Option<Companion>,
    /// Touch space in points (natural orientation).
    points: (f64, f64),
    rotation: i32,
    /// The finger currently down; the simulator digitizer has one.
    finger: Option<i32>,
    input: Option<mpsc::Sender<InputCommand>>,
    tasks: Vec<AbortHandle>,
}

struct ScreenStream {
    udid: String,
    token: String,
    tasks: Vec<AbortHandle>,
}

#[derive(Clone, Default)]
pub struct SimulatorManager {
    app: Arc<Mutex<Option<AppHandle>>>,
    sims: Arc<Mutex<HashMap<String, Simulator>>>,
    /// The last `simctl list`, for building events without another call.
    devices: Arc<Mutex<Vec<SimulatorDevice>>>,
    streams: Arc<Mutex<HashMap<String, ScreenStream>>>,
    frame_server: Arc<tokio::sync::OnceCell<FrameServer>>,
    /// Serializes companion starts so two callers never spawn two.
    companion_start: Arc<tokio::sync::Mutex<()>>,
}

fn unsupported() -> String {
    "The iOS Simulator needs a Mac with Xcode.".into()
}

fn phase_for_state(state: &str) -> Option<EmulatorPhase> {
    match state {
        "Booted" => Some(EmulatorPhase::Running),
        "Booting" | "Creating" => Some(EmulatorPhase::Booting),
        "Shutting Down" => Some(EmulatorPhase::Stopping),
        _ => None,
    }
}

fn instance_for(device: &SimulatorDevice, phase: EmulatorPhase, owned: bool) -> SimulatorInstance {
    SimulatorInstance {
        serial: device.name.clone(),
        avd_name: device.name.clone(),
        display_name: device.display_name.clone(),
        console_port: 0,
        grpc_port: None,
        phase,
        owned,
        embeddable: companion_path().is_some(),
        width: device.width.unwrap_or(0),
        height: device.height.unwrap_or(0),
        error: None,
        platform: "ios",
    }
}

fn orientation_for(rotation: i32) -> HidOrientationType {
    match rotation {
        1 => HidOrientationType::LandscapeLeft,
        2 => HidOrientationType::PortraitUpsideDown,
        3 => HidOrientationType::LandscapeRight,
        _ => HidOrientationType::Portrait,
    }
}

/// Requested scale for frames that fit a `bound`-pixel square.
pub fn scale_for(bound: u32, width: u32, height: u32) -> f64 {
    let longest = width.max(height);
    if longest == 0 || bound == 0 {
        return 1.0;
    }
    (f64::from(bound) / f64::from(longest)).clamp(0.1, 1.0)
}

fn stroke_events(stroke: KeyStroke, events: &mut Vec<HidEvent>) {
    if stroke.shift {
        events.push(HidEvent::key(LEFT_SHIFT, HidDirection::Down));
    }
    events.push(HidEvent::key(stroke.code, HidDirection::Down));
    events.push(HidEvent::key(stroke.code, HidDirection::Up));
    if stroke.shift {
        events.push(HidEvent::key(LEFT_SHIFT, HidDirection::Up));
    }
}

fn button_press(button: HidButtonType) -> [HidEvent; 2] {
    [
        HidEvent::button(button, HidDirection::Down),
        HidEvent::button(button, HidDirection::Up),
    ]
}

impl SimulatorManager {
    pub fn set_app_handle(&self, app: AppHandle) {
        *self.app.lock().unwrap() = Some(app);
    }

    fn emit_changed(&self) {
        let list = self.instances();
        if let Some(app) = self.app.lock().unwrap().clone() {
            let _ = app.emit("ios-simulators-changed", list);
        }
    }

    /// Tracked simulators plus booted ones from the last listing.
    fn instances(&self) -> Vec<SimulatorInstance> {
        let sims = self.sims.lock().unwrap();
        let devices = self.devices.lock().unwrap();
        let mut list: Vec<SimulatorInstance> = sims.values().map(|s| s.info.clone()).collect();
        for device in devices.iter() {
            if sims.contains_key(&device.name) {
                continue;
            }
            if let Some(phase) = phase_for_state(&device.state) {
                list.push(instance_for(device, phase, false));
            }
        }
        list
    }

    pub async fn snapshot(&self) -> IosSnapshot {
        if !cfg!(target_os = "macos") {
            return IosSnapshot {
                available: false,
                companion_installed: false,
                devices: Vec::new(),
                simulators: Vec::new(),
                error: None,
            };
        }
        let (devices, error) = match simctl::list_devices().await {
            Ok(devices) => (devices, None),
            Err(error) => (Vec::new(), Some(error)),
        };
        {
            let mut sims = self.sims.lock().unwrap();
            for device in &devices {
                let Some(sim) = sims.get_mut(&device.name) else {
                    continue;
                };
                // Booted or shut down behind our back (Simulator.app, simctl).
                match (sim.info.phase, device.state.as_str()) {
                    (EmulatorPhase::Running, "Shutdown") => sim.info.phase = EmulatorPhase::Stopped,
                    (EmulatorPhase::Stopped | EmulatorPhase::Failed, "Booted") => {
                        sim.info.phase = EmulatorPhase::Running;
                        sim.info.error = None;
                    }
                    _ => {}
                }
            }
            sims.retain(|_, sim| sim.info.phase != EmulatorPhase::Stopped);
        }
        *self.devices.lock().unwrap() = devices.clone();
        IosSnapshot {
            available: error.is_none(),
            companion_installed: companion_path().is_some(),
            simulators: self.instances(),
            devices,
            error,
        }
    }

    fn device(&self, udid: &str) -> Option<SimulatorDevice> {
        self.devices
            .lock()
            .unwrap()
            .iter()
            .find(|d| d.name == udid)
            .cloned()
    }

    async fn device_or_refresh(&self, udid: &str) -> Result<SimulatorDevice, String> {
        if let Some(device) = self.device(udid) {
            return Ok(device);
        }
        self.snapshot().await;
        self.device(udid)
            .ok_or_else(|| format!("No simulator with UDID {udid}."))
    }

    fn set_phase(&self, udid: &str, phase: EmulatorPhase, error: Option<String>) {
        if let Some(sim) = self.sims.lock().unwrap().get_mut(udid) {
            sim.info.phase = phase;
            sim.info.error = error;
        }
        self.emit_changed();
    }

    /// Starts tracking a simulator that is already booted.
    fn track(&self, device: &SimulatorDevice, phase: EmulatorPhase, owned: bool) {
        self.sims
            .lock()
            .unwrap()
            .entry(device.name.clone())
            .or_insert_with(|| Simulator {
                info: instance_for(device, phase, owned),
                companion: None,
                points: (0.0, 0.0),
                rotation: 0,
                finger: None,
                input: None,
                tasks: Vec::new(),
            });
    }

    pub async fn start(&self, udid: String, wipe_data: bool) -> Result<SimulatorInstance, String> {
        if !cfg!(target_os = "macos") {
            return Err(unsupported());
        }
        let device = self.device_or_refresh(&udid).await?;
        if let Some(sim) = self.sims.lock().unwrap().get(&udid) {
            if matches!(
                sim.info.phase,
                EmulatorPhase::Booting | EmulatorPhase::Running
            ) {
                return Ok(sim.info.clone());
            }
        }
        let owned = device.state == "Shutdown";
        self.sims.lock().unwrap().remove(&udid);
        self.track(&device, EmulatorPhase::Booting, owned);
        self.emit_changed();
        let manager = self.clone();
        let task_udid = udid.clone();
        let boot = tokio::spawn(async move {
            let result = async {
                if wipe_data && owned {
                    simctl::erase(&task_udid).await?;
                }
                simctl::boot(&task_udid).await?;
                simctl::wait_booted(&task_udid, BOOT_TIMEOUT).await
            }
            .await;
            match result {
                Ok(()) => manager.set_phase(&task_udid, EmulatorPhase::Running, None),
                Err(error) => manager.set_phase(
                    &task_udid,
                    EmulatorPhase::Failed,
                    Some(format!("The simulator did not boot: {error}")),
                ),
            }
        });
        let mut sims = self.sims.lock().unwrap();
        let sim = sims.get_mut(&udid).ok_or("The simulator went away.")?;
        sim.tasks.push(boot.abort_handle());
        Ok(sim.info.clone())
    }

    /// Ends a simulator's streams, input worker, boot task and companion.
    fn release(&self, udid: &str) {
        self.stop_streams_for(udid);
        let mut sims = self.sims.lock().unwrap();
        let Some(sim) = sims.get_mut(udid) else {
            return;
        };
        for task in sim.tasks.drain(..) {
            task.abort();
        }
        sim.input = None;
        sim.finger = None;
        if let Some(mut companion) = sim.companion.take() {
            let _ = companion.child.start_kill();
        }
    }

    pub async fn stop(&self, udid: &str) -> Result<(), String> {
        if !cfg!(target_os = "macos") {
            return Err(unsupported());
        }
        if let Some(device) = self.device(udid) {
            self.track(&device, EmulatorPhase::Stopping, false);
        }
        self.release(udid);
        self.set_phase(udid, EmulatorPhase::Stopping, None);
        let result = simctl::shutdown(udid).await;
        match &result {
            Ok(()) => {
                self.sims.lock().unwrap().remove(udid);
                if let Some(device) = self
                    .devices
                    .lock()
                    .unwrap()
                    .iter_mut()
                    .find(|d| d.name == udid)
                {
                    device.state = "Shutdown".into();
                }
                self.emit_changed();
            }
            Err(error) => self.set_phase(udid, EmulatorPhase::Failed, Some(error.clone())),
        }
        result
    }

    pub fn dismiss(&self, udid: &str) {
        self.release(udid);
        self.sims.lock().unwrap().remove(udid);
        self.emit_changed();
    }

    /// On app exit: stop companions, shut down the simulators booted here.
    pub fn shutdown_owned(&self) {
        let udids: Vec<(String, bool)> = self
            .sims
            .lock()
            .unwrap()
            .iter()
            .map(|(udid, sim)| (udid.clone(), sim.info.owned))
            .collect();
        for (udid, owned) in udids {
            self.release(&udid);
            if owned && cfg!(target_os = "macos") {
                let _ = std::process::Command::new("/usr/bin/xcrun")
                    .args(["simctl", "shutdown", &udid])
                    .stdin(std::process::Stdio::null())
                    .output();
            }
        }
        self.sims.lock().unwrap().clear();
    }

    // ── Companion ────────────────────────────────────────────────────────

    /// The simulator's companion client, starting the companion if needed.
    async fn client(&self, udid: &str) -> Result<CompanionClient, String> {
        if !cfg!(target_os = "macos") {
            return Err(unsupported());
        }
        let existing = |manager: &Self| -> Option<CompanionClient> {
            let mut sims = manager.sims.lock().unwrap();
            let sim = sims.get_mut(udid)?;
            let companion = sim.companion.as_mut()?;
            match companion.child.try_wait() {
                Ok(None) => Some(companion.client.clone()),
                // It exited; start a new one below.
                _ => {
                    sim.companion = None;
                    sim.input = None;
                    None
                }
            }
        };
        if let Some(client) = existing(self) {
            return Ok(client);
        }
        let _guard = self.companion_start.lock().await;
        if let Some(client) = existing(self) {
            return Ok(client);
        }
        if !self.sims.lock().unwrap().contains_key(udid) {
            let device = self.device_or_refresh(udid).await?;
            self.track(&device, EmulatorPhase::Running, false);
        }
        let companion = Companion::start(udid).await?;
        let description = companion.client.describe().await.map_err(|e| {
            format!(
                "idb_companion could not describe the simulator: {}",
                e.message()
            )
        })?;
        let client = companion.client.clone();
        let mut sims = self.sims.lock().unwrap();
        let Some(sim) = sims.get_mut(udid) else {
            return Err("The simulator went away.".into());
        };
        if let Some(screen) = description.screen_dimensions {
            if screen.width > 0 && screen.height > 0 {
                sim.info.width = screen.width as u32;
                sim.info.height = screen.height as u32;
            }
            let density = if screen.density > 0.0 {
                screen.density
            } else {
                1.0
            };
            sim.points = if screen.width_points > 0 && screen.height_points > 0 {
                (screen.width_points as f64, screen.height_points as f64)
            } else {
                (
                    screen.width as f64 / density,
                    screen.height as f64 / density,
                )
            };
        }
        sim.info.grpc_port = Some(companion.port);
        sim.companion = Some(companion);
        Ok(client)
    }

    // ── Screen ───────────────────────────────────────────────────────────

    pub async fn start_stream(
        &self,
        udid: &str,
        width: u32,
        height: u32,
        events: Channel<ScreenEvent>,
    ) -> Result<ScreenStreamInfo, String> {
        let server = self
            .frame_server
            .get_or_try_init(FrameServer::start)
            .await?
            .clone();
        let client = self.client(udid).await?;
        let (pixel_width, pixel_height) = self
            .sims
            .lock()
            .unwrap()
            .get(udid)
            .map(|s| (s.info.width, s.info.height))
            .unwrap_or((0, 0));
        let (control, mut responses) = client
            .video_stream(proto::VideoStreamStart {
                file_path: String::new(),
                fps: STREAM_FPS,
                format: proto::VideoFormat::Mjpeg as i32,
                compression_quality: JPEG_QUALITY,
                scale_factor: scale_for(width.max(height), pixel_width, pixel_height),
            })
            .await
            .map_err(|e| format!("Could not stream the simulator screen: {}", e.message()))?;
        let stream_id = uuid::Uuid::new_v4().to_string();
        let (token, url, jpeg_tx) = server.register();

        let sims = self.sims.clone();
        let streams = self.streams.clone();
        let task_udid = udid.to_string();
        let task_id = stream_id.clone();
        let task_server = server.clone();
        let reader = tokio::spawn(async move {
            // Ending the request stream ends the video; keep it open.
            let _control = control;
            let mut splitter = MjpegSplitter::default();
            let mut last_meta: Option<ScreenEvent> = None;
            let mut sent: u32 = 0;
            let mut window = Instant::now();
            let mut ticker = tokio::time::interval(Duration::from_secs(1));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                let message = tokio::select! {
                    message = responses.message() => message,
                    _ = ticker.tick() => {
                        let fps = (f64::from(sent) / window.elapsed().as_secs_f64()).round() as u32;
                        sent = 0;
                        window = Instant::now();
                        if events.send(ScreenEvent::Stats { fps }).is_err() {
                            break;
                        }
                        continue;
                    }
                };
                let data = match message {
                    Ok(Some(proto::VideoStreamResponse {
                        output:
                            Some(proto::VideoOutput::Payload(proto::Payload {
                                source: Some(proto::PayloadSource::Data(data)),
                            })),
                    })) => data,
                    Ok(Some(_)) => continue,
                    _ => break,
                };
                let Some(frame) = splitter.push(&data) else {
                    continue;
                };
                let rotation = sims
                    .lock()
                    .unwrap()
                    .get(&task_udid)
                    .map(|s| s.rotation)
                    .unwrap_or(0);
                // Landscape frames are already turned; portrait frames of a
                // landscape device turn with the body.
                let natural = rotation % 2 == 0 || frame.height >= frame.width;
                let meta = ScreenEvent::Meta {
                    width: frame.width,
                    height: frame.height,
                    rotation,
                    display_off: false,
                    natural_orientation: natural,
                };
                if last_meta.as_ref() != Some(&meta) {
                    if events.send(meta.clone()).is_err() {
                        break;
                    }
                    last_meta = Some(meta);
                }
                sent += 1;
                jpeg_tx.send_replace(Some(Arc::new(frame.data)));
            }
            let _ = events.send(ScreenEvent::End);
            let removed = streams.lock().unwrap().remove(&task_id);
            if let Some(stream) = removed {
                task_server.unregister(&stream.token);
            }
        });
        self.streams.lock().unwrap().insert(
            stream_id.clone(),
            ScreenStream {
                udid: udid.to_string(),
                token,
                tasks: vec![reader.abort_handle()],
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
            // Aborting the reader drops the video control, ending the stream.
            for handle in stream.tasks {
                handle.abort();
            }
        }
    }

    fn stop_streams_for(&self, udid: &str) {
        let ids: Vec<String> = self
            .streams
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, s)| s.udid == udid)
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            self.stop_stream(&id);
        }
    }

    pub async fn screenshot(&self, udid: &str, path: &std::path::Path) -> Result<(), String> {
        if !cfg!(target_os = "macos") {
            return Err(unsupported());
        }
        simctl::screenshot_png(udid, path).await
    }

    // ── Input ────────────────────────────────────────────────────────────
    //
    // Each command is one `hid` client stream, sent in order by a worker per
    // simulator. Finger moves may be dropped when the companion falls behind;
    // presses and releases never are.

    async fn send(&self, udid: &str, command: InputCommand) -> Result<(), String> {
        let sender = self
            .sims
            .lock()
            .unwrap()
            .get(udid)
            .and_then(|s| s.input.clone());
        let command = match sender {
            Some(sender) if command.droppable => match sender.try_send(command) {
                Ok(()) => return Ok(()),
                Err(mpsc::error::TrySendError::Full(_)) => return Ok(()),
                Err(mpsc::error::TrySendError::Closed(command)) => command,
            },
            Some(sender) => match sender.send(command).await {
                Ok(()) => return Ok(()),
                Err(mpsc::error::SendError(command)) => command,
            },
            None => command,
        };
        let client = self.client(udid).await?;
        let (tx, mut rx) = mpsc::channel::<InputCommand>(256);
        let _ = tx.try_send(command);
        let sims = self.sims.clone();
        let task_udid = udid.to_string();
        tokio::spawn(async move {
            while let Some(command) = rx.recv().await {
                if let Err(status) = client.hid(command.events).await {
                    if status.code() == tonic::Code::Unavailable {
                        break;
                    }
                }
            }
            if let Some(sim) = sims.lock().unwrap().get_mut(&task_udid) {
                sim.input = None;
            }
        });
        if let Some(sim) = self.sims.lock().unwrap().get_mut(udid) {
            sim.input = Some(tx);
        }
        Ok(())
    }

    /// Touch space and rotation; starts the companion so `points` is known.
    async fn touch_space(&self, udid: &str) -> Result<((f64, f64), i32), String> {
        self.client(udid).await?;
        let sims = self.sims.lock().unwrap();
        let sim = sims.get(udid).ok_or("Unknown simulator")?;
        if sim.points.0 <= 0.0 || sim.points.1 <= 0.0 {
            return Err("The simulator screen size is not known yet.".into());
        }
        Ok((sim.points, sim.rotation))
    }

    fn to_points(u: f64, v: f64, rotation: i32, points: (f64, f64)) -> (f64, f64) {
        let (nx, ny) = natural_uv(u, v, rotation);
        (nx * points.0, ny * points.1)
    }

    pub async fn touch(&self, udid: &str, touches: Vec<TouchPoint>) -> Result<(), String> {
        let (points, rotation) = self.touch_space(udid).await?;
        let mut events = Vec::new();
        let mut droppable = true;
        {
            let mut sims = self.sims.lock().unwrap();
            let sim = sims.get_mut(udid).ok_or("Unknown simulator")?;
            for touch in touches {
                match sim.finger {
                    Some(id) if id != touch.id => continue,
                    None if !touch.down => continue,
                    None => {
                        sim.finger = Some(touch.id);
                        droppable = false;
                    }
                    Some(_) => {}
                }
                let (x, y) = Self::to_points(touch.u, touch.v, rotation, points);
                if touch.down {
                    events.push(HidEvent::touch(x, y, HidDirection::Down));
                } else {
                    events.push(HidEvent::touch(x, y, HidDirection::Up));
                    sim.finger = None;
                    droppable = false;
                }
            }
        }
        if events.is_empty() {
            return Ok(());
        }
        self.send(udid, InputCommand { events, droppable }).await
    }

    /// Scrolls with a short drag that rests before lifting (no fling).
    pub async fn scroll(&self, udid: &str, from: (f64, f64), to: (f64, f64)) -> Result<(), String> {
        const STEPS: u32 = 6;
        let (points, rotation) = self.touch_space(udid).await?;
        let (fx, fy) = Self::to_points(from.0, from.1, rotation, points);
        let (tx, ty) = Self::to_points(to.0, to.1, rotation, points);
        let mut events = vec![HidEvent::touch(fx, fy, HidDirection::Down)];
        for step in 1..=STEPS {
            let t = f64::from(step) / f64::from(STEPS);
            events.push(HidEvent::delay(0.008));
            events.push(HidEvent::touch(
                fx + (tx - fx) * t,
                fy + (ty - fy) * t,
                HidDirection::Down,
            ));
        }
        events.push(HidEvent::delay(0.06));
        events.push(HidEvent::touch(tx, ty, HidDirection::Up));
        self.send(
            udid,
            InputCommand {
                events,
                droppable: false,
            },
        )
        .await
    }

    /// Hardware buttons by the panel's key names, and keyboard keys.
    /// `event` is "down", "up" or a full press.
    pub async fn key(&self, udid: &str, key: &str, event: Option<&str>) -> Result<(), String> {
        let events: Vec<HidEvent> = match key {
            "Power" => button_press(HidButtonType::Lock).to_vec(),
            "AudioVolumeUp" => button_press(HidButtonType::VolumeUp).to_vec(),
            "AudioVolumeDown" => button_press(HidButtonType::VolumeDown).to_vec(),
            "GoHome" => button_press(HidButtonType::Home).to_vec(),
            // A double press of Home opens the app switcher.
            "AppSwitch" => {
                let mut events = button_press(HidButtonType::Home).to_vec();
                events.push(HidEvent::delay(0.12));
                events.extend(button_press(HidButtonType::Home));
                events
            }
            // iOS has no system Back button.
            "GoBack" => return Ok(()),
            _ => {
                let Some(stroke) = key_stroke(key) else {
                    return Ok(());
                };
                let mut events = Vec::new();
                match event {
                    Some("down") => events.push(HidEvent::key(stroke.code, HidDirection::Down)),
                    Some("up") => events.push(HidEvent::key(stroke.code, HidDirection::Up)),
                    _ => stroke_events(stroke, &mut events),
                }
                events
            }
        };
        self.send(
            udid,
            InputCommand {
                events,
                droppable: false,
            },
        )
        .await
    }

    /// Types text; long or untypable text goes to the pasteboard (returns false).
    pub async fn text(&self, udid: &str, text: String) -> Result<bool, String> {
        let strokes = (text.chars().count() <= LONG_TEXT)
            .then(|| text_strokes(&text))
            .flatten();
        let Some(strokes) = strokes else {
            simctl::pbcopy(udid, &text).await?;
            return Ok(false);
        };
        let mut events = Vec::new();
        for stroke in strokes {
            stroke_events(stroke, &mut events);
        }
        self.send(
            udid,
            InputCommand {
                events,
                droppable: false,
            },
        )
        .await?;
        Ok(true)
    }

    pub async fn rotate(&self, udid: &str, clockwise: bool) -> Result<(), String> {
        let client = self.client(udid).await?;
        let current = self
            .sims
            .lock()
            .unwrap()
            .get(udid)
            .map(|s| s.rotation)
            .unwrap_or(0);
        let next = if clockwise {
            (current + 3) % 4
        } else {
            (current + 1) % 4
        };
        let orientation = orientation_for(next);
        if let Err(status) = client.set_orientation(orientation).await {
            // Companions older than `set_orientation` take it as a HID event.
            if status.code() != tonic::Code::Unimplemented {
                return Err(status.message().to_string());
            }
            client
                .hid(vec![HidEvent {
                    event: Some(proto::Event::Orientation(proto::HidOrientation {
                        orientation: orientation as i32,
                    })),
                }])
                .await
                .map_err(|e| e.message().to_string())?;
        }
        if let Some(sim) = self.sims.lock().unwrap().get_mut(udid) {
            sim.rotation = next;
        }
        Ok(())
    }
}

struct InputCommand {
    events: Vec<HidEvent>,
    droppable: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scales_frames_to_the_requested_bound() {
        assert_eq!(scale_for(1152, 1206, 2622), 1152.0 / 2622.0);
        assert_eq!(scale_for(4096, 1206, 2622), 1.0);
        assert_eq!(scale_for(64, 1206, 2622), 0.1);
        assert_eq!(scale_for(800, 0, 0), 1.0);
    }

    #[test]
    fn maps_touches_to_points_for_each_rotation() {
        let points = (402.0, 874.0);
        assert_eq!(
            SimulatorManager::to_points(0.5, 0.5, 0, points),
            (201.0, 437.0)
        );
        assert_eq!(SimulatorManager::to_points(0.0, 0.0, 0, points), (0.0, 0.0));
        // Landscape: the displayed top-left is the natural bottom-left.
        assert_eq!(
            SimulatorManager::to_points(0.0, 0.0, 1, points),
            (402.0, 0.0)
        );
    }

    #[test]
    fn instances_serialize_like_android_emulators() {
        let device = SimulatorDevice {
            name: "UDID".into(),
            display_name: "iPhone 16 Pro".into(),
            api_level: None,
            abi: None,
            variant: Some("iOS 18.2".into()),
            device: Some("iPhone 16 Pro".into()),
            width: Some(1206),
            height: Some(2622),
            density: Some(3.0),
            path: String::new(),
            platform: "ios",
            state: "Booted".into(),
            frame: None,
        };
        let value =
            serde_json::to_value(instance_for(&device, EmulatorPhase::Running, true)).unwrap();
        assert_eq!(value["serial"], "UDID");
        assert_eq!(value["avdName"], "UDID");
        assert_eq!(value["phase"], "Running");
        assert_eq!(value["platform"], "ios");
        assert_eq!(value["width"], 1206);
    }
}
