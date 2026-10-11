//! Downloadable local TTS model catalog and Hugging Face weight downloads.
//!
//! v1 catalog: SILMA TTS v1 (default bilingual AR/EN), Lahgtna-Chatterbox
//! (Arabic dialects, slower) and Kokoro-82M (fast English). Weights land in
//! `<appData>/tts/models/<modelId>/` with a `manifest.json` of per-file
//! SHA-256 digests; the model Python package is `pip install`ed on demand.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use super::env;
use crate::filesystem::validation::validate_no_path_traversal;

const USER_AGENT: &str = concat!("YzPzCode/", env!("CARGO_PKG_VERSION"), " (tts models)");
/// Refuse any single download (and the running total) past this many bytes.
const MAX_MODEL_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MANIFEST_NAME: &str = "manifest.json";

#[derive(Debug, Clone, Copy)]
pub struct CatalogEntry {
    pub id: &'static str,
    pub label: &'static str,
    pub langs: &'static [&'static str],
    pub dialects: &'static [&'static str],
    pub size_mb: u64,
    pub speed: u8,
    pub quality: u8,
    pub pip_spec: &'static str,
    /// `pip install` invocations (arguments after `install`), in order.
    pub pip_steps: &'static [&'static [&'static str]],
    /// Top-level Python package that proves `pip_steps` completed.
    pub import_name: &'static str,
    /// Newest Python minor version (3.x) the model's packages support.
    pub max_python_minor: Option<u32>,
    pub hf_repo: &'static str,
    pub license_url: &'static str,
    pub description: &'static str,
}

/// SILMA's own requirements minus `nemo_text_processing`: that pin needs
/// `pynini`, which has no Windows wheels and fails to build there, so
/// installing `silma-tts` with its declared dependencies never succeeds on
/// Windows. The bridge substitutes a pass-through text normaliser
/// (`_ensure_text_normalizer` in `tts_bridge.py`) when NeMo is absent.
const SILMA_DEPS: &[&str] = &[
    "cached_path",
    "click",
    "ema_pytorch>=0.5.2",
    "hydra-core>=1.3.0",
    "librosa",
    "matplotlib",
    "numpy<=1.26.4",
    "pydub",
    "safetensors",
    "soundfile",
    "tomli",
    "torch>=2.0.0",
    "torchaudio>=2.0.0",
    "torchvision>=0.21",
    "torchcodec",
    "torchdiffeq",
    "tqdm>=4.65.0",
    "transformers",
    "transformers_stream_generator",
    "unidecode",
    "vocos",
    "x_transformers>=1.31.14",
    "catt_tashkeel==1.0.2",
];

/// Local-only catalog v1. SILMA alone covers Arabic + English; Kokoro is the
/// speed option for long English reports, Lahgtna the dialect option.
pub static TTS_CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "silma",
        label: "SILMA TTS v1 (default)",
        langs: &["ar", "en"],
        dialects: &["msa"],
        size_mb: 2500,
        speed: 3,
        quality: 4,
        pip_spec: "silma-tts",
        pip_steps: &[&["--no-deps", "silma-tts==1.0.5"], SILMA_DEPS],
        import_name: "silma_tts",
        max_python_minor: None,
        hf_repo: "silma-ai/silma-tts",
        license_url: "https://huggingface.co/silma-ai/silma-tts",
        description: "Balanced bilingual Arabic (Tashkeel-aware) + English. Best default.",
    },
    CatalogEntry {
        id: "lahgtna",
        label: "Lahgtna-Chatterbox (dialects)",
        langs: &["ar"],
        dialects: &["eg", "sa", "ma", "iq", "msa"],
        size_mb: 1500,
        speed: 2,
        quality: 5,
        pip_spec: "chatterbox-tts",
        pip_steps: &[&["chatterbox-tts==0.1.7"]],
        import_name: "chatterbox",
        max_python_minor: None,
        hf_repo: "oddadmix/lahgtna-chatterbox-v1",
        license_url: "https://huggingface.co/oddadmix/lahgtna-chatterbox-v1",
        description: "Egyptian, Saudi, Moroccan and Iraqi dialects. Larger and slower.",
    },
    CatalogEntry {
        id: "kokoro",
        label: "Kokoro-82M (fast English)",
        langs: &["en"],
        dialects: &[],
        size_mb: 350,
        speed: 5,
        quality: 3,
        pip_spec: "kokoro>=0.9",
        pip_steps: &[&["kokoro>=0.9", "soundfile>=0.12"]],
        import_name: "kokoro",
        max_python_minor: Some(12),
        hf_repo: "hexgrad/Kokoro-82M",
        license_url: "https://huggingface.co/hexgrad/Kokoro-82M",
        description: "Ultra-fast English-only voice for long reports. Small download. Needs Python 3.10-3.12.",
    },
];

/// `state` is one of `ready`, `notDownloaded`, `downloading`, `error`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub id: String,
    pub state: String,
    pub progress: Option<f64>,
    pub local_bytes: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsModelInfo {
    pub id: String,
    pub label: String,
    pub langs: Vec<String>,
    pub dialects: Vec<String>,
    pub size_mb: u64,
    pub speed: u8,
    pub quality: u8,
    pub pip_spec: String,
    pub hf_repo: String,
    pub license_url: String,
    pub description: String,
    pub status: ModelStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsDownloadProgress {
    pub model_id: String,
    pub stage: String,
    pub message: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<f64>,
}

/// Cancel flags + in-flight percentages, shared between the download task and
/// the `tts_cancel_download` command.
#[derive(Debug, Default, Clone)]
pub struct DownloadTracker {
    cancelled: Arc<Mutex<HashMap<String, bool>>>,
    progress: Arc<Mutex<HashMap<String, f64>>>,
}

impl DownloadTracker {
    pub fn begin(&self, model_id: &str) {
        if let Ok(mut cancelled) = self.cancelled.lock() {
            cancelled.insert(model_id.to_string(), false);
        }
        if let Ok(mut progress) = self.progress.lock() {
            progress.insert(model_id.to_string(), 0.0);
        }
    }

    pub fn is_cancelled(&self, model_id: &str) -> bool {
        self.cancelled
            .lock()
            .map(|cancelled| cancelled.get(model_id).copied().unwrap_or(false))
            .unwrap_or(false)
    }

    pub fn request_cancel(&self, model_id: &str) {
        if let Ok(mut cancelled) = self.cancelled.lock() {
            cancelled.insert(model_id.to_string(), true);
        }
    }

    pub fn set_progress(&self, model_id: &str, percent: f64) {
        if let Ok(mut progress) = self.progress.lock() {
            progress.insert(model_id.to_string(), percent.clamp(0.0, 100.0));
        }
    }

    pub fn progress_of(&self, model_id: &str) -> Option<f64> {
        self.progress
            .lock()
            .ok()?
            .get(model_id)
            .copied()
    }

    pub fn finish(&self, model_id: &str) {
        if let Ok(mut progress) = self.progress.lock() {
            progress.remove(model_id);
        }
        if let Ok(mut cancelled) = self.cancelled.lock() {
            cancelled.remove(model_id);
        }
    }
}

pub fn find_entry(model_id: &str) -> Option<CatalogEntry> {
    TTS_CATALOG
        .iter()
        .find(|entry| entry.id == model_id)
        .copied()
}

/// Model ids come from the catalog only, so joining them is traversal-safe.
pub fn model_dir(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    find_entry(model_id).ok_or_else(|| format!("Unknown TTS model: {model_id}"))?;
    Ok(env::models_dir(app)?.join(model_id))
}

fn dir_size(path: &Path) -> u64 {
    let mut total: u64 = 0;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for item in entries.flatten() {
            let entry_path = item.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
            } else if let Ok(meta) = item.metadata() {
                total = total.saturating_add(meta.len());
            }
        }
    }
    total
}

pub fn info_of(entry: CatalogEntry, status: ModelStatus) -> TtsModelInfo {
    TtsModelInfo {
        id: entry.id.to_string(),
        label: entry.label.to_string(),
        langs: entry.langs.iter().map(|lang| lang.to_string()).collect(),
        dialects: entry
            .dialects
            .iter()
            .map(|dialect| dialect.to_string())
            .collect(),
        size_mb: entry.size_mb,
        speed: entry.speed,
        quality: entry.quality,
        pip_spec: entry.pip_spec.to_string(),
        hf_repo: entry.hf_repo.to_string(),
        license_url: entry.license_url.to_string(),
        description: entry.description.to_string(),
        status,
    }
}

pub fn status_of(
    app: &AppHandle,
    tracker: &DownloadTracker,
    entry: CatalogEntry,
) -> ModelStatus {
    if let Some(percent) = tracker.progress_of(entry.id) {
        return ModelStatus {
            id: entry.id.to_string(),
            state: "downloading".to_string(),
            progress: Some(percent),
            local_bytes: 0,
            error: None,
        };
    }
    match model_dir(app, entry.id) {
        // Weights alone are not a usable voice: the Python package that runs
        // them must be installed as well.
        Ok(dir)
            if dir.join(MANIFEST_NAME).is_file()
                && !env::package_installed(app, entry.import_name) =>
        {
            ModelStatus {
                id: entry.id.to_string(),
                state: "error".to_string(),
                progress: None,
                local_bytes: dir_size(&dir),
                error: Some(
                    "The voice package is not installed. Download again to repair it (the model files are kept)."
                        .to_string(),
                ),
            }
        }
        Ok(dir) if dir.join(MANIFEST_NAME).is_file() => ModelStatus {
            id: entry.id.to_string(),
            state: "ready".to_string(),
            progress: Some(100.0),
            local_bytes: dir_size(&dir),
            error: None,
        },
        Ok(dir) if dir.exists() && dir_size(&dir) > 0 => ModelStatus {
            id: entry.id.to_string(),
            state: "error".to_string(),
            progress: None,
            local_bytes: dir_size(&dir),
            error: Some(
                "A previous download did not finish. Download again to repair it.".to_string(),
            ),
        },
        Ok(_) => ModelStatus {
            id: entry.id.to_string(),
            state: "notDownloaded".to_string(),
            progress: None,
            local_bytes: 0,
            error: None,
        },
        Err(error) => ModelStatus {
            id: entry.id.to_string(),
            state: "error".to_string(),
            progress: None,
            local_bytes: 0,
            error: Some(error),
        },
    }
}

pub async fn list_models(
    app: &AppHandle,
    tracker: &DownloadTracker,
) -> Result<Vec<TtsModelInfo>, String> {
    let app = app.clone();
    let tracker = tracker.clone();
    tokio::task::spawn_blocking(move || {
        Ok(TTS_CATALOG
            .iter()
            .map(|entry| info_of(*entry, status_of(&app, &tracker, *entry)))
            .collect())
    })
    .await
    .map_err(|e| format!("Could not list TTS models: {e}"))?
}

fn emit_progress(
    app: &AppHandle,
    model_id: &str,
    stage: &str,
    message: &str,
    downloaded: u64,
    total: Option<u64>,
) {
    let percent = total
        .filter(|bytes| *bytes > 0)
        .map(|bytes| (downloaded as f64 / bytes as f64 * 100.0).clamp(0.0, 100.0));
    let _ = app.emit(
        "tts-download-progress",
        TtsDownloadProgress {
            model_id: model_id.to_string(),
            stage: stage.to_string(),
            message: message.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: total,
            percent,
        },
    );
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(600))
        // A model file may redirect across CDNs, but never into this computer
        // or the local network.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                attempt.error("too many redirects")
            } else if allowed_hf_url(attempt.url().as_str()).is_err() {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}

/// Loopback, private, link-local and other non-public addresses.
fn is_local_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                // 100.64.0.0/10 (carrier-grade NAT)
                || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xC0) == 64)
        }
        std::net::IpAddr::V6(v6) => {
            let first = v6.segments()[0];
            v6.is_loopback()
                || v6.is_unspecified()
                || (first & 0xFE00) == 0xFC00 // unique local
                || (first & 0xFFC0) == 0xFE80 // link local
                || v6.to_ipv4_mapped().is_some_and(|v4| is_local_ip(std::net::IpAddr::V4(v4)))
        }
    }
}

/// Model weights come only from Hugging Face over HTTPS.
fn allowed_hf_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed =
        reqwest::Url::parse(url).map_err(|_| "Not a valid model address.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Model downloads require HTTPS.".into());
    }
    let host = parsed
        .host_str()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let trusted = host == "huggingface.co"
        || host.ends_with(".huggingface.co")
        || host == "cdn-lfs.hf.co"
        || host.ends_with(".hf.co");
    if !trusted {
        return Err("Only Hugging Face model files can be downloaded.".into());
    }
    if let Some(addr) = parsed.socket_addrs(|| None).ok().and_then(|mut addrs| addrs.pop()) {
        if is_local_ip(addr.ip()) {
            return Err("Only Hugging Face model files can be downloaded.".into());
        }
    }
    Ok(parsed)
}

#[derive(Debug, Deserialize)]
struct HfSiblingsResponse {
    #[serde(default)]
    siblings: Vec<HfSibling>,
}

#[derive(Debug, Deserialize)]
struct HfSibling {
    #[serde(default)]
    rfilename: String,
}

/// File list for a repo via the public model API. Entries with unsafe paths
/// are dropped before anything is written to disk.
async fn list_repo_files(client: &reqwest::Client, repo: &str) -> Result<Vec<String>, String> {
    let url = allowed_hf_url(&format!("https://huggingface.co/api/models/{repo}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Could not reach Hugging Face: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Hugging Face lookup failed ({}).",
            response.status()
        ));
    }
    let body: HfSiblingsResponse = response
        .json()
        .await
        .map_err(|e| format!("Unexpected Hugging Face response: {e}"))?;
    let mut files: Vec<String> = body
        .siblings
        .into_iter()
        .map(|sibling| sibling.rfilename)
        .filter(|name| {
            !name.is_empty()
                && validate_no_path_traversal(name).is_ok()
                && !Path::new(name).is_absolute()
        })
        .collect();
    files.sort();
    files.dedup();
    if files.is_empty() {
        return Err("Hugging Face returned no downloadable files.".into());
    }
    Ok(files)
}

/// Streams one repo file to `target_dir`, honouring cancel and the size cap.
/// Returns `(bytes, sha256_hex)`.
#[allow(clippy::too_many_arguments)]
async fn download_file(
    client: &reqwest::Client,
    app: &AppHandle,
    tracker: &DownloadTracker,
    model_id: &str,
    repo: &str,
    name: &str,
    target_dir: &Path,
    index: usize,
    total_files: usize,
    running_total: &mut u64,
) -> Result<(u64, String), String> {
    let mut url = allowed_hf_url(&format!("https://huggingface.co/{repo}/resolve/main"))?;
    url.path_segments_mut()
        .map_err(|_| "Invalid model address.".to_string())?
        .extend(name.split('/'));
    let target = target_dir.join(name);
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Could not create the model folder: {e}"))?;
    }
    let mut tmp = target.as_os_str().to_owned();
    tmp.push(".part");
    let tmp = PathBuf::from(tmp);

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Could not download {name}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Could not download {name} ({}).",
            response.status()
        ));
    }
    if response.content_length().unwrap_or(0) > MAX_MODEL_BYTES {
        return Err(format!("{name} exceeds the download size limit."));
    }
    let file_total = response.content_length();

    let mut output = tokio::fs::File::create(&tmp)
        .await
        .map_err(|e| format!("Could not save {name}: {e}"))?;
    let mut hash = Sha256::new();
    let mut bytes: u64 = 0;
    let mut last_report: u64 = 0;
    use tokio::io::AsyncWriteExt;
    let mut stream = response;
    loop {
        if tracker.is_cancelled(model_id) {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err("Download cancelled.".into());
        }
        let chunk = stream
            .chunk()
            .await
            .map_err(|e| format!("Could not download {name}: {e}"))?;
        let Some(chunk) = chunk else {
            break;
        };
        bytes = bytes.saturating_add(chunk.len() as u64);
        *running_total = running_total.saturating_add(chunk.len() as u64);
        if bytes > MAX_MODEL_BYTES || *running_total > MAX_MODEL_BYTES {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err("The model exceeds the download size limit.".into());
        }
        output
            .write_all(&chunk)
            .await
            .map_err(|e| format!("Could not save {name}: {e}"))?;
        hash.update(&chunk);
        if bytes - last_report >= 1024 * 1024 {
            last_report = bytes;
            let overall = file_total.map(|total| {
                ((index as f64 + bytes as f64 / total.max(1) as f64) / total_files as f64
                    * 100.0)
                    .clamp(0.0, 100.0)
            });
            if let Some(percent) = overall {
                tracker.set_progress(model_id, percent);
            }
            emit_progress(
                app,
                model_id,
                "downloading",
                &format!("Downloading {name} ({}/{total_files})…", index + 1),
                bytes,
                file_total,
            );
        }
    }
    output
        .flush()
        .await
        .map_err(|e| format!("Could not save {name}: {e}"))?;
    drop(output);
    tokio::fs::rename(&tmp, &target)
        .await
        .map_err(|e| format!("Could not save {name}: {e}"))?;
    Ok((bytes, format!("{:x}", hash.finalize())))
}

fn remove_partials(dir: &Path) {
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else {
            continue;
        };
        for item in entries.flatten() {
            let path = item.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().is_some_and(|ext| ext == "part") {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}

async fn download_model_inner(
    app: &AppHandle,
    tracker: &DownloadTracker,
    entry: CatalogEntry,
) -> Result<(), String> {
    if !env::detect_ffmpeg_async().await.available {
        return Err("ffmpeg is required for narration voices. Install it (Windows: `winget install Gyan.FFmpeg`) and retry.".into());
    }
    if let (Some(max_minor), Some((major, minor))) =
        (entry.max_python_minor, env::venv_python_version(app))
    {
        if major == 3 && minor > max_minor {
            return Err(format!(
                "{} needs Python 3.10 to 3.{max_minor}, but the narration environment uses Python {major}.{minor}. Install Python 3.{max_minor}, delete the narration environment folder ({}) and download again.",
                entry.label,
                env::venv_dir(app).map(|dir| dir.display().to_string()).unwrap_or_default(),
            ));
        }
    }
    let dir = model_dir(app, entry.id)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Could not create the model folder: {e}"))?;
    // Repair path: the weights are already here, only the package is missing.
    if dir.join(MANIFEST_NAME).is_file() {
        emit_progress(
            app,
            entry.id,
            "installing",
            "Installing the narration voice…",
            0,
            None,
        );
        tracker.set_progress(entry.id, 99.0);
        return env::pip_install(app, entry.pip_steps)
            .await
            .map_err(|e| format!("The voice package failed to install: {e}"));
    }
    let client = client()?;
    let files = list_repo_files(&client, entry.hf_repo).await?;
    let total_files = files.len();
    emit_progress(
        app,
        entry.id,
        "downloading",
        &format!("Downloading {total_files} files…"),
        0,
        None,
    );
    tracker.set_progress(entry.id, 1.0);
    let mut running: u64 = 0;
    let mut manifest: HashMap<String, String> = HashMap::new();
    for (index, name) in files.iter().enumerate() {
        if tracker.is_cancelled(entry.id) {
            remove_partials(&dir);
            return Err("Download cancelled.".into());
        }
        match download_file(
            &client,
            app,
            tracker,
            entry.id,
            entry.hf_repo,
            name,
            &dir,
            index,
            total_files,
            &mut running,
        )
        .await
        {
            Ok((_, sha)) => {
                manifest.insert(name.clone(), sha);
                tracker.set_progress(
                    entry.id,
                    ((index + 1) as f64 / total_files as f64 * 100.0).clamp(0.0, 99.0),
                );
            }
            Err(error) => {
                remove_partials(&dir);
                return Err(error);
            }
        }
    }
    // The manifest marks the weights as complete. Readiness additionally
    // needs the package (`status_of`), and a repair skips the download when
    // the manifest exists, so a failed install never costs a re-download.
    tokio::fs::write(
        dir.join(MANIFEST_NAME),
        serde_json::to_vec_pretty(&serde_json::json!({
            "model": entry.id,
            "repo": entry.hf_repo,
            "files": manifest,
        }))
        .map_err(|e| format!("Could not write the model manifest: {e}"))?,
    )
    .await
    .map_err(|e| format!("Could not write the model manifest: {e}"))?;
    emit_progress(
        app,
        entry.id,
        "installing",
        "Installing the narration voice…",
        running,
        Some(running.max(1)),
    );
    tracker.set_progress(entry.id, 99.0);
    env::pip_install(app, entry.pip_steps)
        .await
        .map_err(|e| format!("Weights downloaded, but the voice package failed: {e}"))?;
    Ok(())
}

pub async fn download_model(
    app: &AppHandle,
    tracker: &DownloadTracker,
    model_id: &str,
) -> Result<ModelStatus, String> {
    let entry = find_entry(model_id).ok_or_else(|| format!("Unknown TTS model: {model_id}"))?;
    tracker.begin(model_id);
    emit_progress(app, model_id, "resolving", "Finding the model files…", 0, None);
    match download_model_inner(app, tracker, entry).await {
        Ok(()) => {
            tracker.finish(model_id);
            emit_progress(app, model_id, "completed", "Model is ready.", 1, Some(1));
            Ok(status_of(app, tracker, entry))
        }
        Err(error) => {
            tracker.finish(model_id);
            emit_progress(app, model_id, "failed", &error, 0, None);
            Err(error)
        }
    }
}

pub fn cancel_download(tracker: &DownloadTracker, model_id: &str) {
    tracker.request_cancel(model_id);
}

pub async fn delete_model(
    app: &AppHandle,
    tracker: &DownloadTracker,
    model_id: &str,
) -> Result<ModelStatus, String> {
    let entry = find_entry(model_id).ok_or_else(|| format!("Unknown TTS model: {model_id}"))?;
    // Stop any in-flight download loop for this model as well.
    tracker.request_cancel(model_id);
    let dir = model_dir(app, model_id)?;
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir)
            .await
            .map_err(|e| format!("Could not delete the model files: {e}"))?;
    }
    tracker.finish(model_id);
    Ok(status_of(app, tracker, entry))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_three_known_models() {
        let ids: Vec<&str> = TTS_CATALOG.iter().map(|entry| entry.id).collect();
        assert_eq!(ids, vec!["silma", "lahgtna", "kokoro"]);
        assert!(find_entry("silma").is_some());
        assert!(find_entry("nope").is_none());
    }

    #[test]
    fn only_hugging_face_addresses_download() {
        assert!(allowed_hf_url("https://huggingface.co/silma-ai/silma-tts/resolve/main/model.bin")
            .is_ok());
        assert!(allowed_hf_url(
            "https://cdn-lfs.huggingface.co/some/file.bin"
        )
        .is_ok());
        assert!(allowed_hf_url("http://huggingface.co/a/b").is_err());
        assert!(allowed_hf_url("https://example.com/model.bin").is_err());
        assert!(allowed_hf_url("file:///C:/secret.bin").is_err());
        assert!(allowed_hf_url("https://127.0.0.1/model.bin").is_err());
        assert!(allowed_hf_url("https://localhost/model.bin").is_err());
    }

    #[test]
    fn tracker_cancel_and_progress_roundtrip() {
        let tracker = DownloadTracker::default();
        tracker.begin("silma");
        assert!(!tracker.is_cancelled("silma"));
        assert_eq!(tracker.progress_of("silma"), Some(0.0));
        tracker.set_progress("silma", 42.5);
        assert_eq!(tracker.progress_of("silma"), Some(42.5));
        tracker.request_cancel("silma");
        assert!(tracker.is_cancelled("silma"));
        tracker.finish("silma");
        assert_eq!(tracker.progress_of("silma"), None);
    }
}
