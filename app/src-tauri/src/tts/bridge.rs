//! Owns the `tts_bridge.py` child process and in-flight synthesis runs.
//!
//! The Python bridge (`resources/tts_bridge.py`) listens on loopback only
//! (`127.0.0.1`, never `0.0.0.0`) and serves `GET /health`, `GET /progress`,
//! `POST /synthesize` and `POST /cancel`.

use std::collections::HashMap;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Context;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use super::{cache, env, models};
use crate::utils::process::{terminate_process_tree, ProcessRunner};

const HEALTH_ATTEMPTS: u32 = 120;
const HEALTH_INTERVAL: Duration = Duration::from_millis(250);
/// First synthesis loads a multi-GB model on CPU; leave room for that.
const SYNTH_TIMEOUT_SECS: u64 = 1800;
/// How long a request waits for the bridge to finish a previous (cancelled)
/// synthesis before giving up.
const BUSY_RETRY_SECS: u64 = 90;
/// Long notes should use the frontend chunking helper; this is a backstop.
const MAX_TEXT_CHARS: usize = 6000;
/// Audio is always synthesized at natural speed. Playback speed is applied by
/// the player (`playbackRate`), so changing speed never re-synthesizes and
/// every speed shares one cached WAV.
const SYNTH_SPEED: f64 = 1.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsSynthProgress {
    pub run_id: String,
    pub model_id: String,
    pub stage: String,
    pub message: String,
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SynthResult {
    pub wav_path: String,
    pub duration_ms: Option<u64>,
    pub cached: bool,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsStatus {
    pub env: env::EnvStatus,
    pub models: Vec<models::TtsModelInfo>,
    pub cache: cache::TtsCacheInfo,
    pub bridge_running: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeSynthRequest {
    model_id: String,
    text: String,
    voice: String,
    speed: f64,
    out_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeSynthResponse {
    #[serde(default)]
    wav_path: Option<String>,
    #[serde(default)]
    duration_ms: Option<u64>,
}

/// Error body the bridge sends with every non-2xx answer.
#[derive(Debug, Default, Deserialize)]
struct BridgeErrorBody {
    #[serde(default)]
    error: String,
    #[serde(default)]
    cancelled: bool,
}

/// `GET /progress` snapshot of the running synthesis.
#[derive(Debug, Default, Deserialize)]
struct BridgeProgress {
    #[serde(default)]
    stage: String,
    #[serde(default)]
    done: u32,
    #[serde(default)]
    total: u32,
    #[serde(default)]
    message: String,
}

struct BridgeProcess {
    child: std::process::Child,
    port: u16,
}

impl Drop for BridgeProcess {
    fn drop(&mut self) {
        let _ = terminate_process_tree(self.child.id());
    }
}

#[derive(Clone, Default)]
pub struct TtsManager {
    bridge: Arc<Mutex<Option<BridgeProcess>>>,
    /// Serializes bridge start-up so two simultaneous Plays cannot each spawn
    /// one (the second would replace and kill the first).
    spawn_lock: Arc<tokio::sync::Mutex<()>>,
    synth_cancel: Arc<Mutex<HashMap<String, bool>>>,
    downloads: models::DownloadTracker,
}

/// Run ids come from the frontend so Stop can cancel the right synthesis.
fn valid_run_id(run_id: &str) -> bool {
    !run_id.is_empty()
        && run_id.len() <= 80
        && run_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Turns a bridge error answer into a sentence the UI can show.
fn bridge_error_message(status: reqwest::StatusCode, body: &str) -> String {
    let parsed: BridgeErrorBody = serde_json::from_str(body).unwrap_or_default();
    let detail = parsed.error.trim();
    if detail.is_empty() {
        format!("Narration failed ({status}).")
    } else {
        detail.to_string()
    }
}

fn emit_progress(
    app: &AppHandle,
    run_id: &str,
    model_id: &str,
    stage: &str,
    message: &str,
    percent: Option<f64>,
) {
    let _ = app.emit(
        "tts-synth-progress",
        TtsSynthProgress {
            run_id: run_id.to_string(),
            model_id: model_id.to_string(),
            stage: stage.to_string(),
            message: message.to_string(),
            percent,
        },
    );
}

fn last_log_lines(path: &Path, count: usize) -> String {
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .rev()
        .take(count.max(1))
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" | ")
}

/// Bundled bridge script, with a dev-tree fallback next to this crate.
fn bridge_script_path(app: &AppHandle) -> anyhow::Result<PathBuf> {
    // Bundle resources keep their relative layout, so `resources/tts_bridge.py`
    // in the bundle config lands at `<resourceDir>/resources/tts_bridge.py`.
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("resources").join("tts_bridge.py");
        if bundled.is_file() {
            return Ok(bundled);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("tts_bridge.py");
    if dev.is_file() {
        return Ok(dev);
    }
    anyhow::bail!("The narration bridge script is missing from this installation. Reinstall YzPzCode.")
}

impl TtsManager {
    /// Kill the bridge child and mark every synthesis run cancelled. Called
    /// when the app closes (see `RunEvent::Exit` in `lib.rs`).
    pub fn stop_all(&self) {
        if let Ok(mut bridge) = self.bridge.lock() {
            if let Some(process) = bridge.take() {
                let _ = terminate_process_tree(process.child.id());
            }
        }
        if let Ok(mut runs) = self.synth_cancel.lock() {
            for cancelled in runs.values_mut() {
                *cancelled = true;
            }
        }
    }

    pub fn bridge_running(&self) -> bool {
        let Ok(mut bridge) = self.bridge.lock() else {
            return false;
        };
        let Some(process) = bridge.as_mut() else {
            return false;
        };
        process
            .child
            .try_wait()
            .ok()
            .is_some_and(|status| status.is_none())
    }

    fn healthy_port(&self) -> Option<u16> {
        if !self.bridge_running() {
            return None;
        }
        self.bridge.lock().ok()?.as_ref().map(|process| process.port)
    }

    fn register_run(&self, run_id: &str) {
        if let Ok(mut runs) = self.synth_cancel.lock() {
            // A Stop that raced ahead of this registration must stick.
            runs.entry(run_id.to_string()).or_insert(false);
        }
    }

    fn is_cancelled(&self, run_id: &str) -> bool {
        self.synth_cancel
            .lock()
            .map(|runs| runs.get(run_id).copied().unwrap_or(false))
            .unwrap_or(false)
    }

    fn finish_run(&self, run_id: &str) {
        if let Ok(mut runs) = self.synth_cancel.lock() {
            runs.remove(run_id);
        }
    }

    fn check_cancelled(&self, run_id: &str) -> anyhow::Result<()> {
        if self.is_cancelled(run_id) {
            anyhow::bail!("Narration cancelled.");
        }
        Ok(())
    }

    pub async fn status(&self, app: &AppHandle) -> anyhow::Result<TtsStatus> {
        let env = env::env_status(app).await;
        let models = models::list_models(app, &self.downloads)
            .await
            .map_err(anyhow::Error::msg)?;
        let cache = cache::cache_info(app).await.map_err(anyhow::Error::msg)?;
        Ok(TtsStatus {
            env,
            models,
            cache,
            bridge_running: self.bridge_running(),
        })
    }

    pub async fn ensure_env(&self, app: &AppHandle) -> anyhow::Result<env::VenvInfo> {
        env::ensure_venv(app).await.map_err(anyhow::Error::msg)
    }

    pub async fn list_models(
        &self,
        app: &AppHandle,
    ) -> anyhow::Result<Vec<models::TtsModelInfo>> {
        models::list_models(app, &self.downloads)
            .await
            .map_err(anyhow::Error::msg)
    }

    pub async fn download_model(
        &self,
        app: &AppHandle,
        model_id: &str,
    ) -> anyhow::Result<models::ModelStatus> {
        models::download_model(app, &self.downloads, model_id)
            .await
            .map_err(anyhow::Error::msg)
    }

    pub fn cancel_download(&self, model_id: &str) -> anyhow::Result<()> {
        models::cancel_download(&self.downloads, model_id);
        Ok(())
    }

    pub async fn delete_model(
        &self,
        app: &AppHandle,
        model_id: &str,
    ) -> anyhow::Result<models::ModelStatus> {
        models::delete_model(app, &self.downloads, model_id)
            .await
            .map_err(anyhow::Error::msg)
    }

    /// Deletes every cached WAV (Settings → Narration "Clear cache").
    pub async fn clear_cache(&self, app: &AppHandle) -> anyhow::Result<usize> {
        cache::clear_cache(app).await.map_err(anyhow::Error::msg)
    }

    pub fn cancel_synth(&self, run_id: &str) -> anyhow::Result<()> {
        if !valid_run_id(run_id) {
            anyhow::bail!("Invalid narration run id.");
        }
        if let Ok(mut runs) = self.synth_cancel.lock() {
            runs.insert(run_id.to_string(), true);
        }
        Ok(())
    }

    /// `run_id` is chosen by the caller so a later `cancel_synth` can target
    /// this run; one is generated when it is absent or malformed.
    pub async fn synthesize(
        &self,
        app: &AppHandle,
        model_id: &str,
        text: &str,
        voice: Option<String>,
        run_id: Option<String>,
    ) -> anyhow::Result<SynthResult> {
        let entry = models::find_entry(model_id)
            .ok_or_else(|| anyhow::anyhow!("Unknown TTS model: {model_id}"))?;
        let text = text.trim();
        if text.is_empty() {
            anyhow::bail!("There is no text to narrate.");
        }
        if text.chars().count() > MAX_TEXT_CHARS {
            anyhow::bail!(
                "This text is too long to narrate in one go ({MAX_TEXT_CHARS} characters max)."
            );
        }
        let voice = voice
            .as_deref()
            .map(str::trim)
            .filter(|voice| !voice.is_empty())
            .unwrap_or("auto")
            .to_string();
        if voice.len() > 64 {
            anyhow::bail!("Unknown narration voice.");
        }
        let run_id = run_id
            .filter(|id| valid_run_id(id))
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.register_run(&run_id);
        let result = self
            .synthesize_inner(app, &run_id, entry, text, &voice, SYNTH_SPEED)
            .await;
        self.finish_run(&run_id);
        result
    }

    async fn synthesize_inner(
        &self,
        app: &AppHandle,
        run_id: &str,
        entry: models::CatalogEntry,
        text: &str,
        voice: &str,
        speed: f64,
    ) -> anyhow::Result<SynthResult> {
        emit_progress(app, run_id, entry.id, "preparing", "Preparing narration…", None);
        if let Some(path) = cache::lookup(app, text, entry.id, voice, speed).await {
            self.check_cancelled(run_id)?;
            emit_progress(
                app,
                run_id,
                entry.id,
                "completed",
                "Playing from cache.",
                Some(100.0),
            );
            return Ok(SynthResult {
                wav_path: path.to_string_lossy().into_owned(),
                duration_ms: None,
                cached: true,
                model_id: entry.id.to_string(),
            });
        }
        let current = models::status_of(app, &self.downloads, entry);
        if current.state != "ready" {
            anyhow::bail!(
                "Download the {} voice first (Settings → Narration).",
                entry.label
            );
        }
        // A running bridge answers right away; only a cold start needs the
        // environment checks (which probe for Python) and the spawn.
        let port = match self.healthy_port() {
            Some(port) => port,
            None => {
                emit_progress(
                    app,
                    run_id,
                    entry.id,
                    "preparing",
                    "Starting the narration engine…",
                    Some(5.0),
                );
                self.ensure_bridge(app).await?
            }
        };
        self.check_cancelled(run_id)?;

        let key = cache::cache_key(text, entry.id, voice, speed);
        let out_path = cache::cached_path(app, &key).map_err(anyhow::Error::msg)?;
        if let Some(parent) = out_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .context("Could not create the narration cache")?;
        }
        emit_progress(
            app,
            run_id,
            entry.id,
            "synthesizing",
            "Synthesizing narration…",
            Some(12.0),
        );
        let request = BridgeSynthRequest {
            model_id: entry.id.to_string(),
            text: text.to_string(),
            voice: voice.to_string(),
            speed,
            out_path: out_path.to_string_lossy().into_owned(),
        };
        let response = self
            .post_synthesize(app, run_id, entry.id, port, &request)
            .await?;
        self.check_cancelled(run_id)?;
        let wav = response
            .wav_path
            .map(PathBuf::from)
            .unwrap_or_else(|| out_path.clone());
        let meta = tokio::fs::metadata(&wav)
            .await
            .context("Narration finished but no audio file was produced")?;
        if !meta.is_file() || meta.len() == 0 {
            anyhow::bail!("Narration finished but no audio file was produced.");
        }
        let _ = cache::evict_if_needed(app).await;
        emit_progress(
            app,
            run_id,
            entry.id,
            "completed",
            "Narration is ready.",
            Some(100.0),
        );
        Ok(SynthResult {
            wav_path: wav.to_string_lossy().into_owned(),
            duration_ms: response.duration_ms,
            cached: false,
            model_id: entry.id.to_string(),
        })
    }

    /// Forwards the bridge's chunk-level progress to the UI as
    /// `tts-synth-progress` events (best effort).
    async fn relay_progress(
        &self,
        app: &AppHandle,
        run_id: &str,
        model_id: &str,
        client: &reqwest::Client,
        base: &str,
    ) {
        let Ok(response) = client
            .get(format!("{base}/progress"))
            .timeout(Duration::from_secs(1))
            .send()
            .await
        else {
            return;
        };
        let Ok(progress) = response.json::<BridgeProgress>().await else {
            return;
        };
        match progress.stage.as_str() {
            "loading" => emit_progress(
                app,
                run_id,
                model_id,
                "preparing",
                &progress.message,
                Some(12.0),
            ),
            "synthesizing" if progress.total > 0 => {
                let fraction = f64::from(progress.done) / f64::from(progress.total);
                emit_progress(
                    app,
                    run_id,
                    model_id,
                    "synthesizing",
                    &progress.message,
                    Some(15.0 + fraction * 80.0),
                );
            }
            "joining" => emit_progress(
                app,
                run_id,
                model_id,
                "synthesizing",
                &progress.message,
                Some(96.0),
            ),
            _ => {}
        }
    }

    async fn post_synthesize(
        &self,
        app: &AppHandle,
        run_id: &str,
        model_id: &str,
        port: u16,
        request: &BridgeSynthRequest,
    ) -> anyhow::Result<BridgeSynthResponse> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(SYNTH_TIMEOUT_SECS))
            .build()
            .context("Could not create the narration client")?;
        let base = format!("http://127.0.0.1:{port}");
        let url = format!("{base}/synthesize");
        let started = std::time::Instant::now();
        let mut last_poll = std::time::Instant::now();
        // The bridge runs one synthesis at a time and answers 409 while a
        // previous (usually just cancelled) one finishes its current chunk.
        // Wait for it instead of failing the new request.
        loop {
            let future = client.post(&url).json(request).send();
            tokio::pin!(future);
            let response = loop {
                tokio::select! {
                    result = &mut future => {
                        break result.context("The narration bridge did not answer")?;
                    }
                    () = tokio::time::sleep(Duration::from_millis(150)) => {
                        if self.is_cancelled(run_id) {
                            // Stop the bridge after its current chunk so the
                            // next request is not left waiting on it.
                            let _ = client
                                .post(format!("{base}/cancel"))
                                .timeout(Duration::from_secs(2))
                                .send()
                                .await;
                            anyhow::bail!("Narration cancelled.");
                        }
                        if last_poll.elapsed() >= Duration::from_millis(500) {
                            last_poll = std::time::Instant::now();
                            self.relay_progress(app, run_id, model_id, &client, &base).await;
                        }
                    }
                }
            };
            let status = response.status();
            if status.is_success() {
                return response
                    .json::<BridgeSynthResponse>()
                    .await
                    .context("Unexpected narration response");
            }
            let body = response.text().await.unwrap_or_default();
            let parsed: BridgeErrorBody = serde_json::from_str(&body).unwrap_or_default();
            if status == reqwest::StatusCode::CONFLICT {
                if parsed.cancelled {
                    anyhow::bail!("Narration cancelled.");
                }
                if started.elapsed() > Duration::from_secs(BUSY_RETRY_SECS) {
                    anyhow::bail!(
                        "The narration engine is still busy with a previous request. Try again in a moment."
                    );
                }
                tokio::time::sleep(Duration::from_millis(400)).await;
                self.check_cancelled(run_id)?;
                continue;
            }
            anyhow::bail!(bridge_error_message(status, &body));
        }
    }

    /// Returns the loopback port, starting the bridge when it is not running
    /// (or has crashed). Concurrent callers share one start-up.
    async fn ensure_bridge(&self, app: &AppHandle) -> anyhow::Result<u16> {
        let _starting = self.spawn_lock.lock().await;
        // Another caller may have finished starting it while we waited.
        if let Some(port) = self.healthy_port() {
            return Ok(port);
        }
        let venv = env::ensure_venv(app).await.map_err(anyhow::Error::msg)?;
        // Drop a dead child so the spawn below is the single restart attempt.
        if let Ok(mut bridge) = self.bridge.lock() {
            let dead = bridge.as_mut().is_some_and(|process| {
                process.child.try_wait().ok().is_some_and(|status| status.is_some())
            });
            if dead {
                bridge.take();
            }
        }
        self.spawn_bridge(app, &venv).await
    }

    async fn spawn_bridge(
        &self,
        app: &AppHandle,
        venv: &env::VenvInfo,
    ) -> anyhow::Result<u16> {
        let script = bridge_script_path(app)?;
        let venv_python = venv
            .python_path
            .clone()
            .filter(|path| Path::new(path).is_file())
            .ok_or_else(|| {
                anyhow::anyhow!("The narration environment is missing. Run tts_ensure_env first.")
            })?;
        let models_dir = env::models_dir(app).map_err(anyhow::Error::msg)?;
        let cache_dir = cache::cache_dir(app).map_err(anyhow::Error::msg)?;
        let root = env::tts_root(app).map_err(anyhow::Error::msg)?;
        tokio::fs::create_dir_all(&models_dir)
            .await
            .context("Could not create the model folder")?;
        tokio::fs::create_dir_all(&cache_dir)
            .await
            .context("Could not create the narration cache")?;

        // A free loopback port is reserved up front; the bridge binds it on
        // start. Never 0.0.0.0: synthesis stays on this machine.
        let port = TcpListener::bind("127.0.0.1:0")
            .context("Could not reserve a local port for narration")?
            .local_addr()
            .context("Could not reserve a local port for narration")?
            .port();
        let log_path = root.join("bridge.log");
        let stderr_log =
            std::fs::File::create(&log_path).context("Could not create the narration log")?;
        let script_arg = script.to_string_lossy().into_owned();
        let port_arg = port.to_string();
        let models_arg = models_dir.to_string_lossy().into_owned();
        let cache_arg = cache_dir.to_string_lossy().into_owned();
        let voices_arg = root.join("voices").to_string_lossy().into_owned();
        let mut command = ProcessRunner::hidden_command(
            &venv_python,
            &[
                script_arg.as_str(),
                "--port",
                port_arg.as_str(),
                "--models-dir",
                models_arg.as_str(),
                "--cache-dir",
                cache_arg.as_str(),
                "--voices-dir",
                voices_arg.as_str(),
            ],
        );
        command
            .current_dir(&root)
            // Output goes to a file, so Python would use the ANSI code page
            // and crash on emoji printed by model libraries.
            .env("PYTHONUTF8", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(stderr_log);
        let mut child = command
            .spawn()
            .context("Could not start the narration bridge")?;
        let pid = child.id();

        let probe = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .context("Could not create the narration client")?;
        let url = format!("http://127.0.0.1:{port}/health");
        let mut ready = false;
        for _ in 0..HEALTH_ATTEMPTS {
            if child
                .try_wait()
                .context("The narration bridge stopped")?
                .is_some()
            {
                let tail = last_log_lines(&log_path, 4);
                if tail.is_empty() {
                    anyhow::bail!("The narration bridge stopped during startup.");
                }
                anyhow::bail!("The narration bridge stopped during startup: {tail}");
            }
            if probe
                .get(&url)
                .send()
                .await
                .is_ok_and(|response| response.status().is_success())
            {
                ready = true;
                break;
            }
            tokio::time::sleep(HEALTH_INTERVAL).await;
        }
        if !ready {
            let _ = tokio::task::spawn_blocking(move || terminate_process_tree(pid)).await;
            anyhow::bail!("The narration bridge did not become ready.");
        }
        if let Ok(mut bridge) = self.bridge.lock() {
            *bridge = Some(BridgeProcess { child, port });
        }
        Ok(port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manager_starts_empty_and_stops_cleanly() {
        let manager = TtsManager::default();
        assert!(!manager.bridge_running());
        // Nothing is running; stop_all must be a safe no-op.
        manager.stop_all();
        assert!(manager.cancel_synth("00000000-0000-0000-0000-000000000000").is_ok());
        assert!(manager.cancel_synth("../escape").is_err());
        assert!(manager.cancel_synth("").is_err());
    }

    #[test]
    fn run_ids_are_validated_and_cancel_sticks_before_registration() {
        assert!(valid_run_id("3f2b6c1e-9a4d-4e0f-8b7a-1c2d3e4f5a6b"));
        assert!(!valid_run_id(""));
        assert!(!valid_run_id("../escape"));
        assert!(!valid_run_id(&"a".repeat(81)));

        let manager = TtsManager::default();
        // A Stop that arrives before the run registers must not be undone.
        manager.cancel_synth("run-1").unwrap();
        manager.register_run("run-1");
        assert!(manager.is_cancelled("run-1"));
        manager.register_run("run-2");
        assert!(!manager.is_cancelled("run-2"));
    }

    #[test]
    fn bridge_errors_surface_the_reason() {
        let status = reqwest::StatusCode::BAD_REQUEST;
        let body = r#"{"ok": false, "error": "reference voice 'x.wav' not found."}"#;
        assert_eq!(
            bridge_error_message(status, body),
            "reference voice 'x.wav' not found."
        );
        assert_eq!(
            bridge_error_message(status, "not json"),
            "Narration failed (400 Bad Request)."
        );
    }

    #[test]
    fn log_tail_keeps_last_lines() {
        let dir = std::env::temp_dir().join(format!("yzpz-tts-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("bridge.log");
        std::fs::write(&log, "a\n\nb\nc\nd\n").unwrap();
        assert_eq!(last_log_lines(&log, 2), "c | d");
        assert_eq!(last_log_lines(&dir.join("missing.log"), 2), "");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
