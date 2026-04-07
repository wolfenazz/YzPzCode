use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct GhCliProvider;

impl AgentCliProvider for GhCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Gh
    }

    fn binary_name(&self) -> &'static str {
        "gh"
    }

    fn display_name(&self) -> &'static str {
        "GitHub CLI"
    }

    fn description(&self) -> &'static str {
        "Manage repositories, pull requests, and issues from the terminal"
    }

    fn provider(&self) -> &'static str {
        "GitHub"
    }

    fn get_install_command(&self, platform: Platform) -> Vec<String> {
        match platform {
            Platform::Macos => vec!["brew".to_string(), "install".to_string(), "gh".to_string()],
            Platform::Windows => vec![
                "winget".to_string(),
                "install".to_string(),
                "--id".to_string(),
                "GitHub.cli".to_string(),
            ],
            Platform::Linux => vec![
                "bash".to_string(),
                "-c".to_string(),
                "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo \"deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt update && sudo apt install gh -y".to_string(),
            ],
        }
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://cli.github.com"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Git]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-gh.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        None
    }
}
