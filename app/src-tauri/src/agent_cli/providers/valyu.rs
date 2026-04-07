use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct ValyuCliProvider;

impl AgentCliProvider for ValyuCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Valyu
    }

    fn binary_name(&self) -> &'static str {
        "valyu"
    }

    fn display_name(&self) -> &'static str {
        "Valyu CLI"
    }

    fn description(&self) -> &'static str {
        "Web search, content extraction, and AI reasoning data access"
    }

    fn provider(&self) -> &'static str {
        "Valyu"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "valyu-cli".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://docs.valyu.ai"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-valyu.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("valyu-cli")
    }
}
