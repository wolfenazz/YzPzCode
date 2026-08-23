use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct ClineCliProvider;

impl AgentCliProvider for ClineCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Cline
    }

    fn binary_name(&self) -> &'static str {
        "cline"
    }

    fn display_name(&self) -> &'static str {
        "Cline CLI"
    }

    fn description(&self) -> &'static str {
        "Cline's agentic coding CLI with interactive TUI and headless automation"
    }

    fn provider(&self) -> &'static str {
        "Cline"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "cline".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://docs.cline.bot/cli/overview"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::NodeJs, PrerequisiteType::Git]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/cline.webp"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("cline")
    }
}
