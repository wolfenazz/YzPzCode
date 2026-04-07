use super::prerequisites::PrerequisiteType;
use crate::types::AgentType;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Platform {
    Windows,
    Macos,
    Linux,
}

impl Platform {
    pub fn current() -> Self {
        #[cfg(target_os = "windows")]
        {
            Platform::Windows
        }

        #[cfg(target_os = "macos")]
        {
            Platform::Macos
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Platform::Linux
        }
    }
}

pub trait AgentCliProvider: Send + Sync {
    #[allow(dead_code)]
    fn agent_type(&self) -> AgentType;
    fn binary_name(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn provider(&self) -> &'static str;
    fn get_install_command(&self, platform: Platform) -> Vec<String>;
    fn get_version_command(&self) -> Vec<String>;
    fn get_docs_url(&self) -> &'static str;
    fn get_prerequisites(&self) -> Vec<PrerequisiteType>;
    fn get_icon_path(&self) -> &'static str;
    fn get_npm_package_name(&self) -> Option<&'static str> {
        None
    }
}

pub fn get_provider(agent: AgentType) -> Box<dyn AgentCliProvider> {
    use super::providers::{
        AgentmailCliProvider, ClaudeCliProvider, CodexCliProvider, CursorCliProvider,
        ElevenlabsCliProvider, GeminiCliProvider, GhCliProvider, GwsCliProvider, HermesCliProvider,
        KiloCliProvider, OpenCodeCliProvider, PosthogCliProvider, RampCliProvider,
        StripeCliProvider, SupabaseCliProvider, ValyuCliProvider, VercelCliProvider,
    };
    match agent {
        AgentType::Claude => Box::new(ClaudeCliProvider),
        AgentType::Opencode => Box::new(OpenCodeCliProvider),
        AgentType::Codex => Box::new(CodexCliProvider),
        AgentType::Gemini => Box::new(GeminiCliProvider),
        AgentType::Cursor => Box::new(CursorCliProvider),
        AgentType::Kilo => Box::new(KiloCliProvider),
        AgentType::Hermes => Box::new(HermesCliProvider),
        AgentType::Gh => Box::new(GhCliProvider),
        AgentType::Stripe => Box::new(StripeCliProvider),
        AgentType::Supabase => Box::new(SupabaseCliProvider),
        AgentType::Valyu => Box::new(ValyuCliProvider),
        AgentType::Posthog => Box::new(PosthogCliProvider),
        AgentType::Elevenlabs => Box::new(ElevenlabsCliProvider),
        AgentType::Ramp => Box::new(RampCliProvider),
        AgentType::Gws => Box::new(GwsCliProvider),
        AgentType::Agentmail => Box::new(AgentmailCliProvider),
        AgentType::Vercel => Box::new(VercelCliProvider),
    }
}
