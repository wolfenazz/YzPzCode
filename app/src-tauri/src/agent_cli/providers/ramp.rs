use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct RampCliProvider;

impl AgentCliProvider for RampCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Ramp
    }

    fn binary_name(&self) -> &'static str {
        "ramp"
    }

    fn display_name(&self) -> &'static str {
        "Ramp CLI"
    }

    fn description(&self) -> &'static str {
        "Expense management and programmatic corporate card issuance for AI agents"
    }

    fn provider(&self) -> &'static str {
        "Ramp"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "@ramp/cli".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://docs.ramp.com"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-ramp.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("@ramp/cli")
    }
}
