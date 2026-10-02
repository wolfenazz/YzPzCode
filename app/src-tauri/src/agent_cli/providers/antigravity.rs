use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct AntigravityCliProvider;

impl AgentCliProvider for AntigravityCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Antigravity
    }

    fn binary_name(&self) -> &'static str {
        "agy"
    }

    fn display_name(&self) -> &'static str {
        "Antigravity CLI"
    }

    fn description(&self) -> &'static str {
        "Google Antigravity terminal agent"
    }

    fn provider(&self) -> &'static str {
        "Google"
    }

    fn get_install_command(&self, platform: Platform) -> Vec<String> {
        if platform == Platform::Windows {
            vec![
                "powershell".to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "irm https://antigravity.google/cli/install.ps1 | iex".to_string(),
            ]
        } else {
            vec![
                "bash".to_string(),
                "-c".to_string(),
                "curl -fsSL https://antigravity.google/cli/install.sh | bash".to_string(),
            ]
        }
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://antigravity.google/docs/getting-started?tab=cli"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Git]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/antigravity-cli.png"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn antigravity_provider_metadata() {
        let provider = AntigravityCliProvider;
        assert_eq!(provider.agent_type(), AgentType::Antigravity);
        assert_eq!(provider.binary_name(), "agy");
        assert_eq!(provider.display_name(), "Antigravity CLI");
        assert_eq!(provider.provider(), "Google");
        assert!(provider.get_docs_url().starts_with("https://"));
        assert_eq!(provider.get_icon_path(), "/assets/antigravity-cli.png");
    }

    #[test]
    fn antigravity_provider_install_commands() {
        let provider = AntigravityCliProvider;
        let win_cmd = provider.get_install_command(Platform::Windows);
        assert!(win_cmd.iter().any(|c| c.contains("install.ps1")));

        let unix_cmd = provider.get_install_command(Platform::Linux);
        assert!(unix_cmd.iter().any(|c| c.contains("install.sh")));
    }
}
