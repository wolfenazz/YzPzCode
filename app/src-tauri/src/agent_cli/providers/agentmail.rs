use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct AgentmailCliProvider;

impl AgentCliProvider for AgentmailCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Agentmail
    }

    fn binary_name(&self) -> &'static str {
        "agentmail"
    }

    fn display_name(&self) -> &'static str {
        "AgentMail CLI"
    }

    fn description(&self) -> &'static str {
        "Email inbox management and transactional emails for AI agents"
    }

    fn provider(&self) -> &'static str {
        "AgentMail"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "agentmail-cli".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://docs.agentmail.ai"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-agentmail.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("agentmail-cli")
    }
}
