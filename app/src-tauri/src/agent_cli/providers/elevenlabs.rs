use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct ElevenlabsCliProvider;

impl AgentCliProvider for ElevenlabsCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Elevenlabs
    }

    fn binary_name(&self) -> &'static str {
        "elevenlabs"
    }

    fn display_name(&self) -> &'static str {
        "ElevenLabs CLI"
    }

    fn description(&self) -> &'static str {
        "Text-to-speech, voice cloning, and AI voice agent management"
    }

    fn provider(&self) -> &'static str {
        "ElevenLabs"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "@elevenlabs/cli".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://elevenlabs.io/docs"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-elevenlabs.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("@elevenlabs/cli")
    }
}
