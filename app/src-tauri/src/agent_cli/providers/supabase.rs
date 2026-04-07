use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct SupabaseCliProvider;

impl AgentCliProvider for SupabaseCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Supabase
    }

    fn binary_name(&self) -> &'static str {
        "supabase"
    }

    fn display_name(&self) -> &'static str {
        "Supabase CLI"
    }

    fn description(&self) -> &'static str {
        "Local Postgres stack, auth, storage, and database management"
    }

    fn provider(&self) -> &'static str {
        "Supabase"
    }

    fn get_install_command(&self, _platform: Platform) -> Vec<String> {
        vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "supabase".to_string(),
        ]
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://supabase.com/docs/guides/local-development"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![PrerequisiteType::Npm]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-supabase.svg"
    }

    fn get_npm_package_name(&self) -> Option<&'static str> {
        Some("supabase")
    }
}
