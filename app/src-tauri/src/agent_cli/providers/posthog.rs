use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct PosthogCliProvider;

impl AgentCliProvider for PosthogCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Posthog
    }

    fn binary_name(&self) -> &'static str {
        "posthog-cli"
    }

    fn display_name(&self) -> &'static str {
        "PostHog CLI"
    }

    fn description(&self) -> &'static str {
        "Analytics, SQL querying, and sourcemap management"
    }

    fn provider(&self) -> &'static str {
        "PostHog"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "@posthog/cli".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://posthog.com/docs/cli"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-posthog.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("@posthog/cli")
    }
}
