//! Model lookup for engines whose CLI lists its models, and the default
//! OpenCode falls back to when none is chosen.

use std::time::Duration;

use serde::Serialize;

use super::engines::WritingEngine;
use crate::utils::process::ProcessRunner;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingModelInfo {
    pub id: String,
    pub label: String,
    /// The provider behind the model is signed in (OpenCode only).
    pub connected: bool,
}

/// Provider ids OpenCode holds credentials for.
fn opencode_connected_providers() -> Vec<String> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| home.map(|h| std::path::PathBuf::from(h).join(".local").join("share")));
    let Some(data) = data else { return Vec::new() };
    std::fs::read_to_string(data.join("opencode").join("auth.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|value| value.as_object().map(|map| map.keys().cloned().collect()))
        .unwrap_or_default()
}

pub(crate) fn parse_model_lines(engine: WritingEngine, stdout: &str) -> Vec<WritingModelInfo> {
    let connected = if engine == WritingEngine::Opencode {
        opencode_connected_providers()
    } else {
        Vec::new()
    };
    let mut models: Vec<WritingModelInfo> = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("Fetching"))
        .filter_map(|line| {
            let mut parts = line.splitn(2, '\t');
            let id = parts.next()?.trim();
            if id.is_empty() || id.contains(' ') {
                return None;
            }
            let label = parts.next().map(str::trim).filter(|l| !l.is_empty()).unwrap_or(id);
            let provider = id.split('/').next().unwrap_or("");
            let is_connected = engine != WritingEngine::Opencode
                || provider == "opencode"
                || connected.iter().any(|c| c == provider);
            Some(WritingModelInfo {
                id: id.to_string(),
                label: label.to_string(),
                connected: is_connected,
            })
        })
        .collect();
    // Signed-in providers first; keeps the CLI's own order otherwise.
    models.sort_by_key(|m| !m.connected);
    models
}


/// Models the engine's CLI offers. Engines without a listing command return an
/// empty list.
pub async fn list_models(engine: WritingEngine) -> Result<Vec<WritingModelInfo>, String> {
    if !matches!(engine, WritingEngine::Opencode | WritingEngine::Antigravity) {
        return Ok(Vec::new());
    }
    let mut binary = None;
    for candidate in engine.binary_candidates() {
        if let Some(path) = ProcessRunner::find_binary_async(candidate).await {
            binary = Some(path);
            break;
        }
    }
    let Some(binary) = binary else { return Ok(Vec::new()) };
    let probe = tokio::task::spawn_blocking(move || {
        ProcessRunner::run_cmd_hidden(&binary, &["models"])
            .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
    });
    let stdout = tokio::time::timeout(Duration::from_secs(25), probe)
        .await
        .map_err(|_| "Listing models timed out.".to_string())?
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(parse_model_lines(engine, &stdout))
}

const PREFERRED_PROVIDERS: [&str; 6] = ["opencode-go", "opencode", "zai-coding-plan", "anthropic", "openai", "google"];

/// A model OpenCode can actually reach. Its own default can belong to a
/// provider that is not signed in, which fails every run with a 401.
pub fn pick_default(models: &[WritingModelInfo]) -> Option<String> {
    let connected: Vec<&WritingModelInfo> = models.iter().filter(|m| m.connected).collect();
    PREFERRED_PROVIDERS
        .iter()
        .find_map(|provider| {
            connected
                .iter()
                .find(|m| m.id.split('/').next() == Some(provider))
        })
        .or_else(|| connected.first())
        .map(|m| m.id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn antigravity_listing_skips_the_banner_and_keeps_labels() {
        let models = parse_model_lines(
            WritingEngine::Antigravity,
            "Fetching available models...
gemini-3.8-flash-high	Gemini 3.8 Flash (High)
",
        );
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "gemini-3.8-flash-high");
        assert_eq!(models[0].label, "Gemini 3.8 Flash (High)");
    }

    #[test]
    fn default_prefers_a_signed_in_provider() {
        let model = |id: &str, connected| WritingModelInfo { id: id.into(), label: id.into(), connected };
        let models = [
            model("openrouter/x", false),
            model("fireworks-ai/y", true),
            model("opencode-go/z", true),
        ];
        assert_eq!(pick_default(&models).as_deref(), Some("opencode-go/z"));
        assert_eq!(pick_default(&models[..1]), None);
    }
}
