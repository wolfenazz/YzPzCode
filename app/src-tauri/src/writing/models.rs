//! Model lookup for the writing engines, and the default OpenCode falls back
//! to when none is chosen. OpenCode, Antigravity, Codex and Grok list their
//! models through the CLI (Codex and Grok also keep a cache file); Claude Code
//! has no listing command, so its own cached model catalog is read instead.
//! Each model carries the reasoning-effort levels it accepts.

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
    /// Reasoning-effort levels the model accepts, lowest first; empty when it has none.
    pub efforts: Vec<String>,
}

const EFFORT_ORDER: [&str; 7] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/// Effort ids deduplicated and ordered lowest to highest.
fn ordered_efforts<I: IntoIterator<Item = String>>(efforts: I) -> Vec<String> {
    let mut list: Vec<String> = efforts.into_iter().filter(|e| !e.is_empty()).collect();
    list.sort_by_key(|e| {
        EFFORT_ORDER
            .iter()
            .position(|known| known == e)
            .unwrap_or(EFFORT_ORDER.len())
    });
    list.dedup();
    list
}

fn effort_ids(entries: Option<&Vec<serde_json::Value>>, key: &str) -> Vec<String> {
    ordered_efforts(
        entries
            .into_iter()
            .flatten()
            .filter_map(|entry| entry.get(key).and_then(|v| v.as_str()).map(str::to_string)),
    )
}

/// Levels the CLI accepts for every model, for engines that do not list them per model.
fn generic_efforts(engine: WritingEngine) -> Vec<String> {
    let levels: &[&str] = match engine {
        WritingEngine::Antigravity => &["low", "medium", "high", "xhigh", "max"],
        // OpenCode variants differ per provider; the ones a model does not know are ignored.
        WritingEngine::Opencode => &["low", "medium", "high", "max"],
        _ => &[],
    };
    levels.iter().map(|level| level.to_string()).collect()
}

fn model(id: &str, label: &str, efforts: Vec<String>) -> WritingModelInfo {
    WritingModelInfo {
        id: id.to_string(),
        label: label.to_string(),
        connected: true,
        efforts,
    }
}

fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
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
            let label = parts
                .next()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .unwrap_or(id);
            let provider = id.split('/').next().unwrap_or("");
            let is_connected = engine != WritingEngine::Opencode
                || provider == "opencode"
                || connected.iter().any(|c| c == provider);
            Some(WritingModelInfo {
                id: id.to_string(),
                label: label.to_string(),
                connected: is_connected,
                efforts: generic_efforts(engine),
            })
        })
        .collect();
    // Signed-in providers first; keeps the CLI's own order otherwise.
    models.sort_by_key(|m| !m.connected);
    models
}

/// `codex debug models` JSON (or its `models_cache.json`): the models the
/// signed-in plan can pick, best first. Hidden entries are internal.
pub(crate) fn parse_codex_models(json: &str) -> Vec<WritingModelInfo> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let mut entries: Vec<(i64, WritingModelInfo)> = value
        .get("models")
        .and_then(|models| models.as_array())
        .map(|models| {
            models
                .iter()
                .filter(|entry| {
                    entry
                        .get("visibility")
                        .and_then(|v| v.as_str())
                        .unwrap_or("list")
                        == "list"
                })
                .filter_map(|entry| {
                    let slug = entry.get("slug")?.as_str()?;
                    let name = entry
                        .get("display_name")
                        .and_then(|n| n.as_str())
                        .unwrap_or(slug);
                    let priority = entry
                        .get("priority")
                        .and_then(|p| p.as_i64())
                        .unwrap_or(i64::MAX);
                    let levels = entry
                        .get("supported_reasoning_levels")
                        .and_then(|l| l.as_array());
                    Some((priority, model(slug, name, effort_ids(levels, "effort"))))
                })
                .collect()
        })
        .unwrap_or_default();
    entries.sort_by_key(|(priority, _)| *priority);
    entries.into_iter().map(|(_, info)| info).collect()
}

/// `grok models`: `  * grok-4.6 (default)` / `  - grok-4.5`. Names only, no efforts.
pub(crate) fn parse_grok_models(stdout: &str) -> Vec<WritingModelInfo> {
    stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let rest = line.strip_prefix('*').or_else(|| line.strip_prefix('-'))?;
            let id = rest.split_whitespace().next()?;
            Some(model(id, id, Vec::new()))
        })
        .collect()
}

/// `~/.grok/models_cache.json`: the models the signed-in account can use, each
/// with the reasoning efforts it accepts.
pub(crate) fn parse_grok_cache(json: &str) -> Vec<WritingModelInfo> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(models) = value.get("models").and_then(|m| m.as_object()) else {
        return Vec::new();
    };
    models
        .iter()
        .filter_map(|(key, entry)| {
            let info = entry.get("info")?;
            if info
                .get("hidden")
                .and_then(|h| h.as_bool())
                .unwrap_or(false)
            {
                return None;
            }
            let id = info.get("id").and_then(|i| i.as_str()).unwrap_or(key);
            let name = info.get("name").and_then(|n| n.as_str()).unwrap_or(id);
            let supported = info
                .get("supports_reasoning_effort")
                .and_then(|s| s.as_bool())
                .unwrap_or(false);
            let efforts = if supported {
                effort_ids(
                    info.get("reasoning_efforts").and_then(|e| e.as_array()),
                    "value",
                )
            } else {
                Vec::new()
            };
            Some(model(id, name, efforts))
        })
        .collect()
}

/// Claude Code's cached account catalog (`~/.claude/cache/model-catalog`),
/// main models before the overflow list.
pub(crate) fn parse_claude_catalog(json: &str) -> Vec<WritingModelInfo> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(entries) = value
        .pointer("/catalog/config/models")
        .and_then(|m| m.as_array())
    else {
        return Vec::new();
    };
    let is_main =
        |entry: &&serde_json::Value| entry.get("section").and_then(|s| s.as_str()) == Some("main");
    let main = entries.iter().filter(is_main);
    let rest = entries.iter().filter(|entry| !is_main(entry));
    main.chain(rest)
        .filter_map(|entry| {
            let id = entry.get("id")?.as_str()?;
            let name = entry.get("name").and_then(|n| n.as_str()).unwrap_or(id);
            let thinking = entry.get("thinking");
            let efforts = if thinking
                .and_then(|t| t.get("type"))
                .and_then(|t| t.as_str())
                == Some("effort")
            {
                effort_ids(
                    thinking
                        .and_then(|t| t.get("effort_options"))
                        .and_then(|o| o.as_array()),
                    "id",
                )
            } else {
                Vec::new()
            };
            Some(model(id, name, efforts))
        })
        .collect()
}

fn claude_models() -> Vec<WritingModelInfo> {
    let listed = home_dir()
        .map(|home| home.join(".claude").join("cache").join("model-catalog"))
        .and_then(|dir| std::fs::read_dir(dir).ok())
        .and_then(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().ends_with("-cc.json"))
                .max_by_key(|entry| entry.metadata().and_then(|m| m.modified()).ok())
        })
        .and_then(|entry| std::fs::read_to_string(entry.path()).ok())
        .map(|raw| parse_claude_catalog(&raw))
        .unwrap_or_default();
    if !listed.is_empty() {
        return listed;
    }
    // Aliases the CLI resolves to the newest model of each family.
    let efforts = || {
        ["low", "medium", "high", "xhigh", "max"]
            .map(String::from)
            .to_vec()
    };
    vec![
        model("opus", "Opus (latest)", efforts()),
        model("sonnet", "Sonnet (latest)", efforts()),
        model("haiku", "Haiku (latest)", Vec::new()),
    ]
}

fn grok_cached_models() -> Vec<WritingModelInfo> {
    home_dir()
        .map(|home| home.join(".grok").join("models_cache.json"))
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|raw| parse_grok_cache(&raw))
        .unwrap_or_default()
}

fn codex_cached_models() -> Vec<WritingModelInfo> {
    home_dir()
        .map(|home| home.join(".codex").join("models_cache.json"))
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|raw| parse_codex_models(&raw))
        .unwrap_or_default()
}

/// Models the engine offers: from its CLI where it can list them, otherwise
/// from the files the CLI keeps. An engine that is not installed, or whose
/// listing fails, returns an empty list and takes free text.
pub async fn list_models(engine: WritingEngine) -> Result<Vec<WritingModelInfo>, String> {
    if engine == WritingEngine::Claude {
        return tokio::task::spawn_blocking(claude_models)
            .await
            .map_err(|e| e.to_string());
    }
    let mut binary = None;
    for candidate in engine.binary_candidates() {
        if let Some(path) = ProcessRunner::find_binary_async(candidate).await {
            binary = Some(path);
            break;
        }
    }
    let Some(binary) = binary else {
        return Ok(Vec::new());
    };
    let args: &'static [&'static str] = if engine == WritingEngine::Codex {
        &["debug", "models"]
    } else {
        &["models"]
    };
    // OpenCode answers the first call after a cold start with nothing while its
    // background service boots, so an empty reply is retried.
    let attempts = if engine == WritingEngine::Opencode {
        4
    } else {
        1
    };
    let mut listed: Result<String, String> = Ok(String::new());
    for attempt in 0..attempts {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(1200)).await;
        }
        let binary = binary.clone();
        let probe = tokio::task::spawn_blocking(move || {
            ProcessRunner::run_cmd_hidden(&binary, args)
                .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
        });
        listed = match tokio::time::timeout(Duration::from_secs(25), probe).await {
            Ok(Ok(Ok(stdout))) => Ok(stdout),
            Ok(Ok(Err(e))) => Err(e.to_string()),
            Ok(Err(e)) => Err(e.to_string()),
            Err(_) => Err("Listing models timed out.".to_string()),
        };
        if listed
            .as_ref()
            .is_ok_and(|stdout| !stdout.trim().is_empty())
        {
            break;
        }
    }
    match engine {
        WritingEngine::Codex => {
            let models = listed
                .map(|stdout| parse_codex_models(&stdout))
                .unwrap_or_default();
            Ok(if models.is_empty() {
                codex_cached_models()
            } else {
                models
            })
        }
        WritingEngine::Grok => {
            // The cache knows each model's efforts; the CLI listing is the fallback.
            let cached = grok_cached_models();
            Ok(if cached.is_empty() {
                parse_grok_models(&listed?)
            } else {
                cached
            })
        }
        _ => Ok(parse_model_lines(engine, &listed?)),
    }
}

const PREFERRED_PROVIDERS: [&str; 6] = [
    "opencode-go",
    "opencode",
    "zai-coding-plan",
    "anthropic",
    "openai",
    "google",
];

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
        assert_eq!(models[0].efforts, ["low", "medium", "high", "xhigh", "max"]);
    }

    #[test]
    fn codex_listing_keeps_visible_models_best_first() {
        let models = parse_codex_models(
            r#"{"models":[{"slug":"b","display_name":"B","visibility":"list","priority":9,"supported_reasoning_levels":[{"effort":"high"},{"effort":"low"}]},{"slug":"h","display_name":"H","visibility":"hide","priority":1},{"slug":"a","display_name":"A","visibility":"list","priority":4}]}"#,
        );
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, ["a", "b"]);
        assert_eq!(models[0].label, "A");
        assert_eq!(models[1].efforts, ["low", "high"]);
    }

    #[test]
    fn grok_listing_reads_marked_lines_only() {
        let models = parse_grok_models("You are not authenticated.\n\nDefault model: grok-4.6\n\nAvailable models:\n  * grok-4.6 (default)\n  - grok-4.5\n");
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, ["grok-4.6", "grok-4.5"]);
    }

    #[test]
    fn grok_cache_reads_efforts_and_skips_hidden_models() {
        let models = parse_grok_cache(
            r#"{"models":{"g":{"info":{"id":"g","name":"G","hidden":false,"supports_reasoning_effort":true,"reasoning_efforts":[{"value":"xhigh"},{"value":"low"},{"value":"high"}]}},"h":{"info":{"id":"h","hidden":true}},"p":{"info":{"id":"p","name":"P","supports_reasoning_effort":false}}}}"#,
        );
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].efforts, ["low", "high", "xhigh"]);
        assert!(models[1].efforts.is_empty());
    }

    #[test]
    fn claude_catalog_lists_main_models_first() {
        let models = parse_claude_catalog(
            r#"{"catalog":{"config":{"models":[{"id":"old","name":"Old","section":"overflow"},{"id":"new","name":"New","section":"main","thinking":{"type":"effort","effort_options":[{"id":"max"},{"id":"low"}]}}]}}}"#,
        );
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, ["new", "old"]);
        assert_eq!(models[0].efforts, ["low", "max"]);
        assert!(models[1].efforts.is_empty());
    }

    #[test]
    fn default_prefers_a_signed_in_provider() {
        let model = |id: &str, connected| WritingModelInfo {
            id: id.into(),
            label: id.into(),
            connected,
            efforts: Vec::new(),
        };
        let models = [
            model("openrouter/x", false),
            model("fireworks-ai/y", true),
            model("opencode-go/z", true),
        ];
        assert_eq!(pick_default(&models).as_deref(), Some("opencode-go/z"));
        assert_eq!(pick_default(&models[..1]), None);
    }
}
