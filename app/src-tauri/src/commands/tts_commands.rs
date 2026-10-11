//! Thin IPC wrappers for local TTS narration. All work lives in [`crate::tts`].
//!
//! Argument names are `snake_case` in Rust; Tauri maps them to `camelCase`
//! for the frontend (`modelId`, `runId`). Progress arrives as `tts-download-progress`
//! and `tts-synth-progress` events; WAVs play via `localFileUrl(absPath)`.

use tauri::{AppHandle, State};

use crate::tts::{ModelStatus, SynthResult, TtsManager, TtsModelInfo, TtsStatus, VenvInfo};

#[tauri::command]
pub async fn tts_status(
    app: AppHandle,
    manager: State<'_, TtsManager>,
) -> Result<TtsStatus, String> {
    manager.status(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tts_ensure_env(
    app: AppHandle,
    manager: State<'_, TtsManager>,
) -> Result<VenvInfo, String> {
    manager.ensure_env(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tts_list_models(
    app: AppHandle,
    manager: State<'_, TtsManager>,
) -> Result<Vec<TtsModelInfo>, String> {
    manager.list_models(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tts_download_model(
    app: AppHandle,
    manager: State<'_, TtsManager>,
    model_id: String,
) -> Result<ModelStatus, String> {
    manager
        .download_model(&app, &model_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tts_cancel_download(
    manager: State<'_, TtsManager>,
    model_id: String,
) -> Result<(), String> {
    manager
        .cancel_download(&model_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tts_delete_model(
    app: AppHandle,
    manager: State<'_, TtsManager>,
    model_id: String,
) -> Result<ModelStatus, String> {
    manager
        .delete_model(&app, &model_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tts_clear_cache(
    app: AppHandle,
    manager: State<'_, TtsManager>,
) -> Result<usize, String> {
    manager.clear_cache(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tts_synthesize(
    app: AppHandle,
    manager: State<'_, TtsManager>,
    model_id: String,
    text: String,
    voice: Option<String>,
    run_id: Option<String>,
) -> Result<SynthResult, String> {
    manager
        .synthesize(&app, &model_id, &text, voice, run_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tts_cancel_synth(
    manager: State<'_, TtsManager>,
    run_id: String,
) -> Result<(), String> {
    manager.cancel_synth(&run_id).map_err(|e| e.to_string())
}
