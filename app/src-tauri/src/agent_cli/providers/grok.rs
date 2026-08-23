use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct GrokCliProvider;

impl AgentCliProvider for GrokCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Grok
    }

    fn binary_name(&self) -> &'static str {
        "grok"
    }

    fn display_name(&self) -> &'static str {
        "Grok CLI"
    }

    fn description(&self) -> &'static str {
        "xAI's agentic coding assistant with headless, streaming, and ACP modes"
    }

    fn provider(&self) -> &'static str {
        "xAI"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "xai-grok-shell".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://docs.x.ai/docs/grok-shell"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::NodeJs, PrerequisiteType::Git]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/Grok.png"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("xai-grok-shell")
    }
}
