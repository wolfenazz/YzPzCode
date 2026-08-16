use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

/// Command Code — taste-aware AI coding CLI (https://commandcode.ai).
///
/// Ships as `cmd` on macOS / Linux / WSL and as `cmdc` on native Windows
/// (where `cmd` is already the built-in Windows shell). Because YzPzCode
/// compiles per-OS, we resolve the right alias at compile time so detection,
/// version probing and PTY launch all use the correct binary.
pub struct CommandCodeCliProvider;

impl AgentCliProvider for CommandCodeCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::CommandCode
    }

    fn binary_name(&self) -> &'static str {
        #[cfg(target_os = "windows")]
        {
            "cmdc"
        }

        #[cfg(not(target_os = "windows"))]
        {
            "cmd"
        }
    }

    fn display_name(&self) -> &'static str {
        "Command Code"
    }

    fn description(&self) -> &'static str {
        "Agentic coding CLI that learns your taste and applies it to every session"
    }

    fn provider(&self) -> &'static str {
        "Command Code"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "command-code@latest".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://commandcode.ai/docs"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        // Command Code requires Node.js 22 or newer (current LTS).
        vec![PrerequisiteType::NodeJs, PrerequisiteType::Git]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/commandcode-logo.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("command-code")
    }
}