use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct GrokCliProvider;

impl AgentCliProvider for GrokCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Grok
    }

    fn binary_name(&self) -> &'static str {
        "grok"
    }

    fn display_name(&self) -> &'static str {
        "Grok CLI"
    }

    fn description(&self) -> &'static str {
        "xAI's agentic coding assistant with headless, streaming, and ACP modes"
    }

    fn provider(&self) -> &'static str {
        "xAI"
    }

    fn get_install_command(&self, platform: Platform) -> Vec<String> {
        match platform {
            Platform::Windows => vec![
                "powershell".to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "irm https://x.ai/cli/install.ps1 | iex".to_string(),
            ],
            Platform::Macos | Platform::Linux => vec![
                "bash".to_string(),
                "-c".to_string(),
                "curl -fsSL https://x.ai/cli/install.sh | bash".to_string(),
            ],
        }
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://docs.x.ai/build/overview"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        // The official installer downloads a native binary; it does not require
        // Node.js, npm, or Git.
        vec![]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/Grok.png"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("@xai-official/grok")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grok_uses_the_official_windows_installer() {
        let provider = GrokCliProvider;

        assert_eq!(
            provider.get_install_command(Platform::Windows),
            vec![
                "powershell".to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "irm https://x.ai/cli/install.ps1 | iex".to_string(),
            ]
        );
    }

    #[test]
    fn grok_uses_the_official_unix_installer() {
        let provider = GrokCliProvider;

        let expected = vec![
            "bash".to_string(),
            "-c".to_string(),
            "curl -fsSL https://x.ai/cli/install.sh | bash".to_string(),
        ];

        assert_eq!(provider.get_install_command(Platform::Macos), expected);
        assert_eq!(provider.get_install_command(Platform::Linux), expected);
    }
}
