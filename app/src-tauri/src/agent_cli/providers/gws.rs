use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct GwsCliProvider;

impl AgentCliProvider for GwsCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Gws
    }

    fn binary_name(&self) -> &'static str {
        "gws"
    }

    fn display_name(&self) -> &'static str {
        "Google Workspace CLI"
    }

    fn description(&self) -> &'static str {
        "Control Gmail, Drive, Docs, Calendar, and Sheets from the terminal"
    }

    fn provider(&self) -> &'static str {
        "Google"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "@googleworkspace/cli".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://developers.google.com/workspace"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-gws.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("@googleworkspace/cli")
    }
}
