use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::utils::process::ProcessRunner;
use crate::writing::models::WritingModelInfo;
use crate::writing::engines::{EngineStreaming, EngineSupport, WritingEngine, ALL_ENGINES};
use crate::writing::{WritingAiEvent, WritingAiRunRequest, WritingAiRunner};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingEngineInfo {
    pub engine: WritingEngine,
    pub display_name: &'static str,
    pub installed: bool,
    pub binary_path: Option<String>,
    pub version: Option<String>,
    pub support: EngineSupport,
    pub streaming: EngineStreaming,
}

async fn detect_engine(engine: WritingEngine) -> WritingEngineInfo {
    let mut binary_path = None;
    for candidate in engine.binary_candidates() {
        if let Some(path) = ProcessRunner::find_binary_async(candidate).await {
            binary_path = Some(path);
            break;
        }
    }
    let version = match &binary_path {
        Some(path) => {
            let path = path.clone();
            let probe = tokio::task::spawn_blocking(move || {
                ProcessRunner::run_cmd_hidden(&path, &["--version"]).ok().and_then(|output| {
                    String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .map(str::trim)
                        .find(|line| !line.is_empty())
                        .map(str::to_string)
                })
            });
            tokio::time::timeout(Duration::from_secs(8), probe)
                .await
                .ok()
                .and_then(Result::ok)
                .flatten()
        }
        None => None,
    };
    WritingEngineInfo {
        engine,
        display_name: engine.display_name(),
        installed: binary_path.is_some(),
        binary_path,
        version,
        support: engine.support(),
        streaming: engine.streaming(),
    }
}

/// The AI CLIs the Writing workspace can drive, and which are installed.
#[tauri::command]
pub async fn get_writing_ai_engines() -> Result<Vec<WritingEngineInfo>, String> {
    let probes = ALL_ENGINES.map(|engine| tokio::spawn(detect_engine(engine)));
    let mut engines = Vec::with_capacity(probes.len());
    for probe in probes {
        engines.push(probe.await.map_err(|e| e.to_string())?);
    }
    Ok(engines)
}

/// Starts a headless AI run. Returns once the engine has spawned; text and
/// the final result arrive on `on_event`.
#[tauri::command]
pub async fn start_writing_ai_run(
    app: AppHandle,
    runner: State<'_, WritingAiRunner>,
    request: WritingAiRunRequest,
    on_event: Channel<WritingAiEvent>,
) -> Result<(), String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Could not resolve the app cache folder: {e}"))?;
    runner.start(cache_dir, request, on_event).await
}

#[tauri::command]
pub async fn cancel_writing_ai_run(
    runner: State<'_, WritingAiRunner>,
    run_id: String,
) -> Result<(), String> {
    runner.cancel(&run_id)
}

/// Prints the paged report HTML to a PDF file. Returns false when the platform
/// showed its print dialog instead of writing the file.
#[tauri::command]
pub async fn export_writing_pdf(app: AppHandle, html: String, output_path: String) -> Result<bool, String> {
    crate::writing::print_pdf::export_pdf(&app, html, &output_path).await
}

/// Models the engine's CLI offers (`opencode models`, `agy models`). Engines
/// without a listing command return an empty list and take free text.
#[tauri::command]
pub async fn get_writing_engine_models(engine: WritingEngine) -> Result<Vec<WritingModelInfo>, String> {
    crate::writing::models::list_models(engine).await
}
