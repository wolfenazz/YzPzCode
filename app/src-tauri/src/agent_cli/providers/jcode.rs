use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct JcodeCliProvider;

impl AgentCliProvider for JcodeCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Jcode
    }

    fn binary_name(&self) -> &'static str {
        "jcode"
    }

    fn display_name(&self) -> &'static str {
        "Jcode"
    }

    fn description(&self) -> &'static str {
        "High-performance Rust coding agent harness with swarm collaboration and multi-provider OAuth"
    }

    fn provider(&self) -> &'static str {
        "Jcode"
    }

    fn get_install_command(&self, platform: Platform) -> Vec<String> {
        match platform {
            Platform::Windows => vec![
                "powershell".to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "irm https://jcode.sh/install.ps1 | iex".to_string(),
            ],
            Platform::Macos | Platform::Linux => vec![
                "bash".to_string(),
                "-c".to_string(),
                "curl -fsSL https://jcode.sh/install | bash".to_string(),
            ],
        }
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://jcode.sh/docs"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        // The official installer downloads a native Rust binary; it does not
        // require Node.js, npm, or Git.
        vec![]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/jcode.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jcode_uses_the_official_windows_installer() {
        let provider = JcodeCliProvider;

        assert_eq!(
            provider.get_install_command(Platform::Windows),
            vec![
                "powershell".to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "irm https://jcode.sh/install.ps1 | iex".to_string(),
            ]
        );
    }

    #[test]
    fn jcode_uses_the_official_unix_installer() {
        let provider = JcodeCliProvider;

        let expected = vec![
            "bash".to_string(),
            "-c".to_string(),
            "curl -fsSL https://jcode.sh/install | bash".to_string(),
        ];

        assert_eq!(provider.get_install_command(Platform::Macos), expected);
        assert_eq!(provider.get_install_command(Platform::Linux), expected);
    }

    #[test]
    fn jcode_provider_metadata() {
        let provider = JcodeCliProvider;
        assert_eq!(provider.agent_type(), AgentType::Jcode);
        assert_eq!(provider.binary_name(), "jcode");
        assert_eq!(provider.display_name(), "Jcode");
        assert_eq!(provider.provider(), "Jcode");
        assert_eq!(provider.get_docs_url(), "https://jcode.sh/docs");
        assert_eq!(provider.get_icon_path(), "/assets/jcode.svg");
        assert_eq!(provider.get_npm_package_name(), None);
        assert!(provider.get_prerequisites().is_empty());
    }
}
