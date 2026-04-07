use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct HermesCliProvider;

impl AgentCliProvider for HermesCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Hermes
    }

    fn binary_name(&self) -> &'static str {
        "hermes"
    }

    fn display_name(&self) -> &'static str {
        "Hermes Agent"
    }

    fn description(&self) -> &'static str {
        "NousResearch autonomous AI agent with tool use, messaging, and multi-modal capabilities"
    }

    fn provider(&self) -> &'static str {
        "NousResearch"
    }

    fn get_install_command(&self, platform: Platform) -> Vec<String> {
        match platform {
            Platform::Windows => vec!["bash".to_string(), "-c".to_string(), "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash".to_string()],
            Platform::Macos | Platform::Linux => vec!["bash".to_string(), "-c".to_string(), "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash".to_string()],
        }
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://github.com/NousResearch/hermes-agent"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Git]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/Hermes-logo.png"
    }
}
