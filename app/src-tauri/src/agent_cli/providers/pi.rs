use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct PiCliProvider;

impl AgentCliProvider for PiCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Pi
    }

    fn binary_name(&self) -> &'static str {
        "pi"
    }

    fn display_name(&self) -> &'static str {
        "Pi Agent"
    }

    fn description(&self) -> &'static str {
        "Minimal terminal coding harness with TypeScript extensions, skills, prompt templates, and pi packages"
    }

    fn provider(&self) -> &'static str {
        "Pi"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "--ignore-scripts".to_string(),
            "@earendil-works/pi-coding-agent".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://pi.dev/docs/latest"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::NodeJs, PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/pi.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("@earendil-works/pi-coding-agent")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pi_provider_metadata() {
        let provider = PiCliProvider;
        assert_eq!(provider.agent_type(), AgentType::Pi);
        assert_eq!(provider.binary_name(), "pi");
        assert_eq!(provider.display_name(), "Pi Agent");
        assert_eq!(provider.provider(), "Pi");
        assert_eq!(provider.get_docs_url(), "https://pi.dev/docs/latest");
        assert_eq!(provider.get_icon_path(), "/assets/pi.svg");
    }

    #[test]
    fn pi_provider_install_command() {
        let provider = PiCliProvider;
        assert_eq!(
            provider.get_install_command(Platform::Windows),
            vec![
                "npm".to_string(),
                "install".to_string(),
                "-g".to_string(),
                "--ignore-scripts".to_string(),
                "@earendil-works/pi-coding-agent".to_string(),
            ]
        );
    }

    #[test]
    fn pi_provider_version_command() {
        let provider = PiCliProvider;
        assert_eq!(provider.get_version_command(), vec!["--version".to_string()]);
    }

    #[test]
    fn pi_provider_prerequisites_and_npm_package() {
        let provider = PiCliProvider;
        assert_eq!(
            provider.get_prerequisites(),
            vec![PrerequisiteType::NodeJs, PrerequisiteType::Npm]
        );
        assert_eq!(
            provider.get_npm_package_name(),
            Some("@earendil-works/pi-coding-agent")
        );
    }
}
