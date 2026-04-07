use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct VercelCliProvider;

impl AgentCliProvider for VercelCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Vercel
    }

    fn binary_name(&self) -> &'static str {
        "vercel"
    }

    fn display_name(&self) -> &'static str {
        "Vercel CLI"
    }

    fn description(&self) -> &'static str {
        "Fast application deployment and cloud environment management"
    }

    fn provider(&self) -> &'static str {
        "Vercel"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "vercel".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://vercel.com/docs/cli"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-vercel.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("vercel")
    }
}
