use super::provider::get_provider;
use crate::types::AgentType;
use crate::utils::process::ProcessRunner;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CliStatus {
    NotInstalled,
    Installed,
    Checking,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCliInfo {
    pub agent: AgentType,
    pub binary_name: String,
    pub display_name: String,
    pub description: String,
    pub provider: String,
    pub status: CliStatus,
    pub version: Option<String>,
    pub path: Option<String>,
    pub error: Option<String>,
    pub docs_url: String,
    pub icon_path: String,
}

pub struct AgentCliDetector {
    cache: Arc<Mutex<HashMap<AgentType, AgentCliInfo>>>,
}

impl AgentCliDetector {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn detect(&self, agent: AgentType) -> AgentCliInfo {
        if let Some(cached) = self.cache.lock().unwrap().get(&agent) {
            return cached.clone();
        }

        let info = self.detect_uncached(agent);
        self.cache.lock().unwrap().insert(agent, info.clone());
        info
    }

    pub fn detect_uncached(&self, agent: AgentType) -> AgentCliInfo {
        let provider = get_provider(agent);
        let binary_name = provider.binary_name();

        let mut info = AgentCliInfo {
            agent,
            binary_name: binary_name.to_string(),
            display_name: provider.display_name().to_string(),
            description: provider.description().to_string(),
            provider: provider.provider().to_string(),
            status: CliStatus::Checking,
            version: None,
            path: None,
            error: None,
            docs_url: provider.get_docs_url().to_string(),
            icon_path: provider.get_icon_path().to_string(),
        };

        match ProcessRunner::find_binary(binary_name) {
            Some(path) => {
                info.path = Some(path.clone());
                let version_args = provider.get_version_command();
                match Self::run_version_check(&path, &version_args) {
                    Some(version) => {
                        info.version = Some(version);
                        info.status = CliStatus::Installed;
                    }
                    None => {
                        info.status = CliStatus::Installed;
                        info.version = provider
                            .get_npm_package_name()
                            .and_then(Self::get_npm_version)
                            .or_else(|| Some("unknown".to_string()));
                    }
                }
            }
            None => {
                info.status = CliStatus::NotInstalled;
            }
        }

        info
    }

    pub fn detect_all(&self) -> HashMap<AgentType, AgentCliInfo> {
        let agents = [
            AgentType::Claude,
            AgentType::Opencode,
            AgentType::Codex,
            AgentType::Gemini,
            AgentType::Cursor,
            AgentType::Kilo,
        ];
        agents
            .iter()
            .map(|&agent| (agent, self.detect(agent)))
            .collect()
    }

    pub fn clear_cache(&self) {
        self.cache.lock().unwrap().clear();
    }

    fn run_version_check(binary_path: &str, args: &[String]) -> Option<String> {
        let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let output = ProcessRunner::run_cmd_hidden(binary_path, &args_str).ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let version = if !stdout.is_empty() { stdout } else { stderr };
        let first_line = version.lines().next().unwrap_or("").trim();

        if first_line.is_empty() {
            return None;
        }

        let version_regex = regex::Regex::new(r"\d+\.\d+(?:\.\d+)?(?:[.\-][\w]+)*").ok()?;
        if let Some(caps) = version_regex.find(first_line) {
            let matched = caps.as_str();
            let start = caps.start();
            if start == 0 && output.status.success() {
                let truncated = if first_line.len() > 50 {
                    &first_line[..50]
                } else {
                    first_line
                };
                Some(truncated.to_string())
            } else {
                let end = matched.len().min(50);
                Some(matched[..end].to_string())
            }
        } else if output.status.success() {
            let truncated = if first_line.len() > 50 {
                &first_line[..50]
            } else {
                first_line
            };
            Some(truncated.to_string())
        } else {
            None
        }
    }

    fn get_npm_version(package_name: &str) -> Option<String> {
        let output =
            ProcessRunner::run_hidden("npm", &["list", "-g", package_name, "--json"]).ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let json: serde_json::Value = serde_json::from_str(&stdout).ok()?;
        let version = json
            .get("dependencies")
            .and_then(|deps| deps.get(package_name))
            .and_then(|pkg| pkg.get("version"))
            .and_then(|v| v.as_str())?;
        if version.is_empty() {
            None
        } else {
            Some(version.to_string())
        }
    }
}

impl Default for AgentCliDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for AgentCliDetector {
    fn clone(&self) -> Self {
        Self {
            cache: Arc::clone(&self.cache),
        }
    }
}
