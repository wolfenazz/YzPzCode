use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct StripeCliProvider;

impl AgentCliProvider for StripeCliProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Stripe
    }

    fn binary_name(&self) -> &'static str {
        "stripe"
    }

    fn display_name(&self) -> &'static str {
        "Stripe CLI"
    }

    fn description(&self) -> &'static str {
        "Payments, webhooks, and Stripe API testing from the terminal"
    }

    fn provider(&self) -> &'static str {
        "Stripe"
    }

    fn get_install_command(&self, platform: Platform) -> Vec<String> {
        match platform {
            Platform::Macos => vec![
                "brew".to_string(),
                "install".to_string(),
                "stripe/stripe-cli/stripe".to_string(),
            ],
            Platform::Windows => vec![
                "scoop".to_string(),
                "install".to_string(),
                "stripe".to_string(),
            ],
            Platform::Linux => vec![
                "bash".to_string(),
                "-c".to_string(),
                "curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripecli.gpg && echo \"deb [signed-by=/usr/share/keyrings/stripecli.gpg] https://packages.stripe.dev/stripe-cli-apt stable main\" | sudo tee /etc/apt/sources.list.d/stripe-cli.list && sudo apt update && sudo apt install stripe".to_string(),
            ],
        }
    }

    fn get_version_command(&self) -> Vec<String> {
        vec!["version".to_string()]
    }

    fn get_docs_url(&self) -> &'static str {
        "https://docs.stripe.com/stripe-cli"
    }

    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        vec![]
    }

    fn get_icon_path(&self) -> &'static str {
        "/assets/tool-stripe.svg"
    }
}
