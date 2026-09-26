use crate::agent_cli::prerequisites::PrerequisiteType;
use crate::agent_cli::provider::{AgentCliProvider, Platform};
use crate::types::AgentType;

pub struct AdditionalCliProvider(pub AgentType);

struct Spec {
    binary: &'static str,
    name: &'static str,
    description: &'static str,
    vendor: &'static str,
    docs: &'static str,
    icon: &'static str,
    npm: Option<&'static str>,
    windows_install: &'static str,
    unix_install: &'static str,
}

impl AdditionalCliProvider {
    fn spec(&self) -> Spec {
        use AgentType::*;
        match self.0 {
            Devin => Spec {
                binary: "devin",
                name: "Devin for Terminal",
                description: "Cognition terminal coding agent",
                vendor: "Cognition",
                docs: "https://docs.devin.ai/cli",
                icon: "/assets/devin.png",
                npm: None,
                windows_install: "irm https://static.devin.ai/cli/setup.ps1 | iex",
                unix_install: "curl -fsSL https://cli.devin.ai/install.sh | bash",
            },
            Trae => Spec {
                binary: "traecli",
                name: "Trae CLI",
                description: "TraeCode terminal coding agent",
                vendor: "Trae",
                docs: "https://docs.trae.cn/cli_get-started-with-trae-code-cli-2",
                icon: "/assets/trae.png",
                npm: None,
                windows_install: "irm https://trae.cn/trae-cli/install_v2.ps1 | iex",
                unix_install: "sh -c \"$(curl -fsSL https://trae.cn/trae-cli/install_v2.sh)\"",
            },
            Kimi => Spec {
                binary: "kimi",
                name: "Kimi Code CLI",
                description: "Moonshot terminal coding agent",
                vendor: "Moonshot AI",
                docs: "https://moonshotai.github.io/kimi-code/en/guides/getting-started",
                icon: "/assets/kimi.png",
                npm: Some("@moonshot-ai/kimi-code"),
                windows_install: "irm https://code.kimi.com/kimi-code/install.ps1 | iex",
                unix_install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash",
            },
            Qoder => Spec {
                binary: "qoder",
                name: "Qoder CLI",
                description: "Qoder terminal coding agent",
                vendor: "Qoder",
                docs: "https://docs.qoder.com/cli/installation",
                icon: "/assets/qoder.png",
                npm: Some("@qoder-ai/qodercli"),
                windows_install: "irm https://qoder.com/install.ps1 | iex",
                unix_install: "curl -fsSL https://qoder.com/install | bash",
            },
            Copilot => Spec {
                binary: "copilot",
                name: "GitHub Copilot CLI",
                description: "GitHub terminal coding agent",
                vendor: "GitHub",
                docs: "https://docs.github.com/en/copilot/get-started/cli-quickstart",
                icon: "/assets/copilot.png",
                npm: Some("@github/copilot"),
                windows_install: "npm install -g @github/copilot",
                unix_install: "npm install -g @github/copilot",
            },
            Kiro => Spec {
                binary: "kiro-cli",
                name: "Kiro CLI",
                description: "Kiro terminal coding agent",
                vendor: "Kiro",
                docs: "https://kiro.dev/docs/cli/",
                icon: "/assets/kiro.png",
                npm: None,
                windows_install: "irm https://cli.kiro.dev/install.ps1 | iex",
                unix_install: "curl -fsSL https://cli.kiro.dev/install | bash",
            },
            MistralVibe => Spec {
                binary: "vibe",
                name: "Mistral Vibe",
                description: "Mistral terminal coding agent",
                vendor: "Mistral AI",
                docs: "https://github.com/mistralai/mistral-vibe",
                icon: "/assets/mistralvibe.png",
                npm: None,
                windows_install: "uv tool install mistral-vibe",
                unix_install: "curl -LsSf https://mistral.ai/vibe/install.sh | bash",
            },
            DeepseekTui => Spec {
                binary: "deepseek",
                name: "DeepSeek TUI",
                description: "Community DeepSeek terminal coding agent",
                vendor: "Hmbown",
                docs: "https://github.com/Hmbown/DeepSeek-TUI/blob/main/docs/INSTALL.md",
                icon: "/assets/deepseektui.png",
                npm: Some("deepseek-tui"),
                windows_install: "npm install -g deepseek-tui",
                unix_install: "npm install -g deepseek-tui",
            },
            Aider => Spec {
                binary: "aider",
                name: "Aider",
                description: "Open source AI pair programming CLI",
                vendor: "Aider",
                docs: "https://aider.chat/docs/install.html",
                icon: "/assets/aider.png",
                npm: None,
                windows_install: "irm https://aider.chat/install.ps1 | iex",
                unix_install: "curl -LsSf https://aider.chat/install.sh | sh",
            },
            Antigravity => Spec {
                binary: "agy",
                name: "Antigravity CLI",
                description: "Google Antigravity terminal agent",
                vendor: "Google",
                docs: "https://antigravity.google/docs/getting-started?tab=cli",
                icon: "/assets/antigravity-cli.png",
                npm: None,
                windows_install: "irm https://antigravity.google/cli/install.ps1 | iex",
                unix_install: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
            },
            Reasonix => Spec {
                binary: "reasonix",
                name: "DeepSeek Reasonix",
                description: "DeepSeek native coding CLI",
                vendor: "Reasonix",
                docs: "https://github.com/esengine/DeepSeek-Reasonix",
                icon: "/assets/reasonix.png",
                npm: Some("reasonix"),
                windows_install: "npm install -g reasonix",
                unix_install: "npm install -g reasonix",
            },
            Amp => Spec {
                binary: "amp",
                name: "Amp",
                description: "Amp terminal coding agent",
                vendor: "Amp",
                docs: "https://ampcode.com/docs/cli",
                icon: "/assets/amp.png",
                npm: None,
                windows_install: "",
                unix_install: "curl -fsSL https://ampcode.com/install.sh | bash",
            },
            Dsh => Spec {
                binary: "dsh",
                name: "DeepSeek Harness",
                description: "DeepSeek plugin based agent harness with Web UI",
                vendor: "DeepSeek AI",
                docs: "https://github.com/deepseek-ai/deepseek-harness",
                icon: "/assets/dsh.png",
                npm: Some("@deepseek-ai/dsh"),
                windows_install: "npm install -g @deepseek-ai/dsh",
                unix_install: "npm install -g @deepseek-ai/dsh",
            },
            Codebuddy => Spec {
                binary: "codebuddy",
                name: "CodeBuddy Code",
                description: "Tencent terminal coding agent",
                vendor: "Tencent",
                docs: "https://www.codebuddy.ai/docs/cli/installation",
                icon: "/assets/codebuddy.png",
                npm: Some("@tencent-ai/codebuddy-code"),
                windows_install: "npm install -g @tencent-ai/codebuddy-code",
                unix_install: "npm install -g @tencent-ai/codebuddy-code",
            },
            Mimo => Spec {
                binary: "mimo",
                name: "MiMo Code",
                description: "Xiaomi terminal coding agent",
                vendor: "Xiaomi",
                docs: "https://mimo.mi.com/docs/en-US/tokenplan/integration/mimo-code",
                icon: "/assets/mimo.png",
                npm: Some("@mimo-ai/cli"),
                windows_install: "npm install -g @mimo-ai/cli",
                unix_install: "curl -fsSL https://mimo.xiaomi.com/install | bash",
            },
            Atomcode => Spec {
                binary: "atomcode",
                name: "AtomCode CLI",
                description: "AtomGit terminal coding agent",
                vendor: "AtomGit",
                docs: "https://atomcode.atomgit.com/docs/en/getting-started.html",
                icon: "/assets/atomcode.png",
                npm: Some("@atomgit.com/atomcode"),
                windows_install: "npm install -g @atomgit.com/atomcode",
                unix_install: "npm install -g @atomgit.com/atomcode",
            },
            _ => unreachable!("additional CLI provider only accepts additional agent types"),
        }
    }
}

impl AgentCliProvider for AdditionalCliProvider {
    fn agent_type(&self) -> AgentType {
        self.0
    }
    fn binary_name(&self) -> &'static str {
        self.spec().binary
    }
    fn display_name(&self) -> &'static str {
        self.spec().name
    }
    fn description(&self) -> &'static str {
        self.spec().description
    }
    fn provider(&self) -> &'static str {
        self.spec().vendor
    }
    fn get_docs_url(&self) -> &'static str {
        self.spec().docs
    }
    fn get_icon_path(&self) -> &'static str {
        self.spec().icon
    }
    fn get_npm_package_name(&self) -> Option<&'static str> {
        self.spec().npm
    }
    fn get_version_command(&self) -> Vec<String> {
        vec!["--version".to_string()]
    }
    fn get_prerequisites(&self) -> Vec<PrerequisiteType> {
        match self.0 {
            AgentType::Copilot
            | AgentType::DeepseekTui
            | AgentType::Reasonix
            | AgentType::Dsh
            | AgentType::Codebuddy
            | AgentType::Atomcode => vec![PrerequisiteType::NodeJs, PrerequisiteType::Npm],
            AgentType::Mimo if Platform::current() == Platform::Windows => {
                vec![PrerequisiteType::NodeJs, PrerequisiteType::Npm]
            }
            AgentType::Kimi if Platform::current() == Platform::Windows => {
                vec![PrerequisiteType::Git]
            }
            _ => vec![],
        }
    }
    fn get_install_command(&self, platform: Platform) -> Vec<String> {
        let command = if platform == Platform::Windows {
            self.spec().windows_install
        } else {
            self.spec().unix_install
        };
        if command.is_empty() {
            return vec![];
        }
        if command.starts_with("npm ") || command.starts_with("uv ") {
            return command.split_whitespace().map(str::to_string).collect();
        }
        if platform == Platform::Windows {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                command.into(),
            ]
        } else {
            vec!["bash".into(), "-c".into(), command.into()]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_additional_agent_has_launch_and_documentation_metadata() {
        let agents = [
            AgentType::Devin,
            AgentType::Trae,
            AgentType::Kimi,
            AgentType::Qoder,
            AgentType::Copilot,
            AgentType::Kiro,
            AgentType::MistralVibe,
            AgentType::DeepseekTui,
            AgentType::Aider,
            AgentType::Antigravity,
            AgentType::Reasonix,
            AgentType::Amp,
            AgentType::Dsh,
            AgentType::Codebuddy,
            AgentType::Mimo,
            AgentType::Atomcode,
        ];
        for agent in agents {
            let provider = AdditionalCliProvider(agent);
            assert!(!provider.binary_name().is_empty());
            assert!(provider.get_docs_url().starts_with("https://"));
            assert!(provider.get_icon_path().starts_with("/assets/"));
            assert!(!provider.get_install_command(Platform::Linux).is_empty());
            if agent != AgentType::Amp {
                assert!(!provider.get_install_command(Platform::Windows).is_empty());
            }
        }
        assert_eq!(
            AdditionalCliProvider(AgentType::Qoder).binary_name(),
            "qoder"
        );
        assert_eq!(
            AdditionalCliProvider(AgentType::MistralVibe).binary_name(),
            "vibe"
        );
        assert_eq!(
            AdditionalCliProvider(AgentType::Antigravity).binary_name(),
            "agy"
        );
    }
}
