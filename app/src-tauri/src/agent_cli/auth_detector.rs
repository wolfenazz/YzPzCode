use std::env;
use std::fs;
use std::path::PathBuf;

use crate::types::AgentType;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AuthStatus {
    Unknown,
    Checking,
    Authenticated,
    NotAuthenticated,
    Error,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthInfo {
    pub agent: AgentType,
    pub status: AuthStatus,
    pub error: Option<String>,
    pub config_path: Option<String>,
}

pub struct AuthDetector;

impl AuthDetector {
    pub fn check_auth(agent: AgentType) -> AuthInfo {
        match agent {
            AgentType::Claude => Self::check_claude_auth(),
            AgentType::Opencode => Self::check_opencode_auth(),
            AgentType::Codex => Self::check_codex_auth(),
            AgentType::Gemini => Self::check_gemini_auth(),
            AgentType::Cursor => Self::check_cursor_auth(),
            AgentType::Kilo => Self::check_kilo_auth(),
            AgentType::Hermes => Self::check_hermes_auth(),
            AgentType::Gh => Self::check_gh_auth(),
            AgentType::Stripe => Self::check_stripe_auth(),
            AgentType::Supabase => Self::check_supabase_auth(),
            AgentType::Valyu => Self::check_valyu_auth(),
            AgentType::Posthog => Self::check_posthog_auth(),
            AgentType::Elevenlabs => Self::check_elevenlabs_auth(),
            AgentType::Ramp => Self::check_ramp_auth(),
            AgentType::Gws => Self::check_gws_auth(),
            AgentType::Agentmail => Self::check_agentmail_auth(),
            AgentType::Vercel => Self::check_vercel_auth(),
        }
    }

    pub fn check_all() -> Vec<AuthInfo> {
        [
            AgentType::Claude,
            AgentType::Opencode,
            AgentType::Codex,
            AgentType::Gemini,
            AgentType::Cursor,
            AgentType::Kilo,
            AgentType::Hermes,
        ]
        .iter()
        .map(|agent| Self::check_auth(*agent))
        .collect()
    }

    pub fn check_all_tool_auths() -> Vec<AuthInfo> {
        [
            AgentType::Gh,
            AgentType::Stripe,
            AgentType::Supabase,
            AgentType::Valyu,
            AgentType::Posthog,
            AgentType::Elevenlabs,
            AgentType::Ramp,
            AgentType::Gws,
            AgentType::Agentmail,
            AgentType::Vercel,
        ]
        .iter()
        .map(|agent| Self::check_auth(*agent))
        .collect()
    }

    fn check_claude_auth() -> AuthInfo {
        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".claude");

            if config_path.exists() {
                let credentials_path = config_path.join("credentials.json");
                let storage_path = config_path.join("storage.json");

                if credentials_path.exists() || storage_path.exists() {
                    return AuthInfo {
                        agent: AgentType::Claude,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_path.to_string_lossy().to_string()),
                    };
                }
            }
        }

        AuthInfo {
            agent: AgentType::Claude,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_opencode_auth() -> AuthInfo {
        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".opencode");

            if config_path.exists() {
                let config_file = config_path.join("config.json");
                let credentials_path = config_path.join("credentials.json");

                if config_file.exists() || credentials_path.exists() {
                    if let Ok(contents) = fs::read_to_string(&config_file) {
                        if contents.contains("apiKey") || contents.contains("token") {
                            return AuthInfo {
                                agent: AgentType::Opencode,
                                status: AuthStatus::Authenticated,
                                error: None,
                                config_path: Some(config_path.to_string_lossy().to_string()),
                            };
                        }
                    }

                    return AuthInfo {
                        agent: AgentType::Opencode,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_path.to_string_lossy().to_string()),
                    };
                }
            }
        }

        AuthInfo {
            agent: AgentType::Opencode,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_codex_auth() -> AuthInfo {
        if env::var("OPENAI_API_KEY").is_ok() {
            return AuthInfo {
                agent: AgentType::Codex,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }

        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".codex");

            if config_path.exists() {
                let config_file = config_path.join("config.json");

                if config_file.exists() {
                    if let Ok(contents) = fs::read_to_string(&config_file) {
                        if contents.contains("apiKey") || contents.contains("OPENAI_API_KEY") {
                            return AuthInfo {
                                agent: AgentType::Codex,
                                status: AuthStatus::Authenticated,
                                error: None,
                                config_path: Some(config_path.to_string_lossy().to_string()),
                            };
                        }
                    }
                }
            }
        }

        AuthInfo {
            agent: AgentType::Codex,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_gemini_auth() -> AuthInfo {
        if env::var("GEMINI_API_KEY").is_ok() || env::var("GOOGLE_API_KEY").is_ok() {
            return AuthInfo {
                agent: AgentType::Gemini,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }

        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".gemini");

            if config_path.exists() {
                let config_file = config_path.join("config.json");
                let credentials_path = config_path.join("credentials.json");

                if config_file.exists() || credentials_path.exists() {
                    return AuthInfo {
                        agent: AgentType::Gemini,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_path.to_string_lossy().to_string()),
                    };
                }
            }

            let gcloud_path = home.join(".config").join("gcloud");
            if gcloud_path.exists() {
                let credentials = gcloud_path.join("application_default_credentials.json");
                if credentials.exists() {
                    return AuthInfo {
                        agent: AgentType::Gemini,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(gcloud_path.to_string_lossy().to_string()),
                    };
                }
            }
        }

        AuthInfo {
            agent: AgentType::Gemini,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_cursor_auth() -> AuthInfo {
        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".cursor");

            if config_path.exists() {
                let credentials_path = config_path.join("credentials.json");
                let storage_path = config_path.join("storage.json");

                if credentials_path.exists() || storage_path.exists() {
                    return AuthInfo {
                        agent: AgentType::Cursor,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_path.to_string_lossy().to_string()),
                    };
                }
            }

            #[cfg(target_os = "windows")]
            {
                let appdata_path = env::var("APPDATA").ok();
                if let Some(appdata) = appdata_path {
                    let cursor_appdata = PathBuf::from(appdata).join("Cursor");
                    if cursor_appdata.exists() {
                        return AuthInfo {
                            agent: AgentType::Cursor,
                            status: AuthStatus::Authenticated,
                            error: None,
                            config_path: Some(cursor_appdata.to_string_lossy().to_string()),
                        };
                    }
                }
            }

            #[cfg(target_os = "macos")]
            {
                let cursor_app_support = home
                    .join("Library")
                    .join("Application Support")
                    .join("Cursor");
                if cursor_app_support.exists() {
                    return AuthInfo {
                        agent: AgentType::Cursor,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(cursor_app_support.to_string_lossy().to_string()),
                    };
                }
            }
        }

        AuthInfo {
            agent: AgentType::Cursor,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_kilo_auth() -> AuthInfo {
        if env::var("KILO_API_KEY").is_ok() {
            return AuthInfo {
                agent: AgentType::Kilo,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }

        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".config").join("kilo");

            if config_path.exists() {
                let config_file = config_path.join("opencode.json");
                let config_jsonc = config_path.join("opencode.jsonc");

                for file in [&config_file, &config_jsonc] {
                    if file.exists() {
                        if let Ok(contents) = fs::read_to_string(file) {
                            if contents.contains("apiKey") || contents.contains("provider") {
                                return AuthInfo {
                                    agent: AgentType::Kilo,
                                    status: AuthStatus::Authenticated,
                                    error: None,
                                    config_path: Some(config_path.to_string_lossy().to_string()),
                                };
                            }
                        }
                    }
                }
            }
        }

        AuthInfo {
            agent: AgentType::Kilo,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_hermes_auth() -> AuthInfo {
        if let Some(home) = Self::get_home_dir() {
            let hermes_dir = home.join(".hermes");

            if hermes_dir.exists() {
                let env_path = hermes_dir.join(".env");
                let config_path = hermes_dir.join("config.yaml");

                if env_path.exists() {
                    if let Ok(contents) = fs::read_to_string(&env_path) {
                        if contents.contains("OPENROUTER_API_KEY=")
                            || contents.contains("ANTHROPIC_API_KEY=")
                            || contents.contains("OPENAI_API_KEY=")
                        {
                            return AuthInfo {
                                agent: AgentType::Hermes,
                                status: AuthStatus::Authenticated,
                                error: None,
                                config_path: Some(hermes_dir.to_string_lossy().to_string()),
                            };
                        }
                    }
                }

                if config_path.exists() {
                    return AuthInfo {
                        agent: AgentType::Hermes,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(hermes_dir.to_string_lossy().to_string()),
                    };
                }
            }
        }

        AuthInfo {
            agent: AgentType::Hermes,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_gh_auth() -> AuthInfo {
        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".config").join("gh").join("hosts.yml");
            if config_path.exists() {
                if let Ok(contents) = fs::read_to_string(&config_path) {
                    if contents.contains("oauth_token") || contents.contains("user") {
                        return AuthInfo {
                            agent: AgentType::Gh,
                            status: AuthStatus::Authenticated,
                            error: None,
                            config_path: Some(config_path.to_string_lossy().to_string()),
                        };
                    }
                }
            }
        }
        AuthInfo {
            agent: AgentType::Gh,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_stripe_auth() -> AuthInfo {
        if let Some(home) = Self::get_home_dir() {
            let config_dir = home.join(".config").join("stripe");
            if config_dir.exists() {
                let credentials = config_dir.join("credentials.json");
                let config_file = config_dir.join("config.json");
                if credentials.exists() || config_file.exists() {
                    return AuthInfo {
                        agent: AgentType::Stripe,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_dir.to_string_lossy().to_string()),
                    };
                }
            }
        }
        AuthInfo {
            agent: AgentType::Stripe,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_supabase_auth() -> AuthInfo {
        if env::var("SUPABASE_ACCESS_TOKEN").is_ok() || env::var("SUPABASE_API_KEY").is_ok() {
            return AuthInfo {
                agent: AgentType::Supabase,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }
        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".supabase");
            if config_path.exists() {
                let credentials = config_path.join("credentials.json");
                let access_token = config_path.join("access-token");
                if credentials.exists() || access_token.exists() {
                    return AuthInfo {
                        agent: AgentType::Supabase,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_path.to_string_lossy().to_string()),
                    };
                }
            }
        }
        AuthInfo {
            agent: AgentType::Supabase,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_valyu_auth() -> AuthInfo {
        if env::var("VALYU_API_KEY").is_ok() {
            return AuthInfo {
                agent: AgentType::Valyu,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }
        if let Some(home) = Self::get_home_dir() {
            let env_file = home.join(".valyu").join(".env");
            if env_file.exists() {
                if let Ok(contents) = fs::read_to_string(&env_file) {
                    if contents.contains("VALYU_API_KEY") {
                        return AuthInfo {
                            agent: AgentType::Valyu,
                            status: AuthStatus::Authenticated,
                            error: None,
                            config_path: Some(env_file.to_string_lossy().to_string()),
                        };
                    }
                }
            }
        }
        AuthInfo {
            agent: AgentType::Valyu,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_posthog_auth() -> AuthInfo {
        if env::var("POSTHOG_CLI_API_KEY").is_ok() || env::var("POSTHOG_API_KEY").is_ok() {
            return AuthInfo {
                agent: AgentType::Posthog,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }
        AuthInfo {
            agent: AgentType::Posthog,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_elevenlabs_auth() -> AuthInfo {
        if env::var("ELEVENLABS_API_KEY").is_ok() {
            return AuthInfo {
                agent: AgentType::Elevenlabs,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }
        if let Some(home) = Self::get_home_dir() {
            let config_dir = home.join(".config").join("elevenlabs");
            if config_dir.exists() {
                let credentials = config_dir.join("credentials.json");
                let auth_file = config_dir.join("auth.json");
                if credentials.exists() || auth_file.exists() {
                    return AuthInfo {
                        agent: AgentType::Elevenlabs,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_dir.to_string_lossy().to_string()),
                    };
                }
            }
        }
        AuthInfo {
            agent: AgentType::Elevenlabs,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_ramp_auth() -> AuthInfo {
        if env::var("RAMP_API_KEY").is_ok() || env::var("RAMP_ACCESS_TOKEN").is_ok() {
            return AuthInfo {
                agent: AgentType::Ramp,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }
        if let Some(home) = Self::get_home_dir() {
            let config_dir = home.join(".config").join("ramp");
            if config_dir.exists() {
                let credentials = config_dir.join("credentials.json");
                if credentials.exists() {
                    return AuthInfo {
                        agent: AgentType::Ramp,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_dir.to_string_lossy().to_string()),
                    };
                }
            }
        }
        AuthInfo {
            agent: AgentType::Ramp,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_gws_auth() -> AuthInfo {
        if let Some(home) = Self::get_home_dir() {
            let config_dir = home.join(".config").join("gws");
            if config_dir.exists() {
                let credentials = config_dir.join("credentials.json");
                let token = config_dir.join("token.json");
                if credentials.exists() || token.exists() {
                    return AuthInfo {
                        agent: AgentType::Gws,
                        status: AuthStatus::Authenticated,
                        error: None,
                        config_path: Some(config_dir.to_string_lossy().to_string()),
                    };
                }
            }
        }
        AuthInfo {
            agent: AgentType::Gws,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_agentmail_auth() -> AuthInfo {
        if env::var("AGENTMAIL_API_KEY").is_ok() {
            return AuthInfo {
                agent: AgentType::Agentmail,
                status: AuthStatus::Authenticated,
                error: None,
                config_path: None,
            };
        }
        AuthInfo {
            agent: AgentType::Agentmail,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn check_vercel_auth() -> AuthInfo {
        if let Some(home) = Self::get_home_dir() {
            let config_path = home.join(".vercel").join("auth.json");
            if config_path.exists() {
                return AuthInfo {
                    agent: AgentType::Vercel,
                    status: AuthStatus::Authenticated,
                    error: None,
                    config_path: Some(config_path.to_string_lossy().to_string()),
                };
            }
        }
        AuthInfo {
            agent: AgentType::Vercel,
            status: AuthStatus::NotAuthenticated,
            error: None,
            config_path: None,
        }
    }

    fn get_home_dir() -> Option<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            env::var("USERPROFILE").ok().map(PathBuf::from)
        }

        #[cfg(not(target_os = "windows"))]
        {
            env::var("HOME").ok().map(PathBuf::from)
        }
    }

    pub fn get_auth_instructions(agent: AgentType) -> Vec<String> {
        match agent {
            AgentType::Claude => vec![
                "Run 'claude login' in a terminal".to_string(),
                "Or set ANTHROPIC_API_KEY environment variable".to_string(),
            ],
            AgentType::Opencode => vec![
                "Run 'opencode auth' in a terminal".to_string(),
                "Or set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable".to_string(),
            ],
            AgentType::Codex => vec![
                "Run 'codex auth' in a terminal".to_string(),
                "Or set OPENAI_API_KEY environment variable".to_string(),
            ],
            AgentType::Gemini => vec![
                "Run 'gemini auth' in a terminal".to_string(),
                "Or set GEMINI_API_KEY or GOOGLE_API_KEY environment variable".to_string(),
            ],
            AgentType::Cursor => vec![
                "Run 'agent login' in a terminal".to_string(),
                "Or sign in through the Cursor desktop app".to_string(),
            ],
            AgentType::Kilo => vec![
                "Run 'kilo' and use '/connect' to add provider credentials".to_string(),
                "Or set KILO_API_KEY environment variable".to_string(),
                "Or run 'kilo auth' to manage credentials".to_string(),
            ],
            AgentType::Hermes => vec![
                "Run 'hermes model' to configure your LLM provider".to_string(),
                "Or edit ~/.hermes/.env and add OPENROUTER_API_KEY=your-key".to_string(),
                "Or run 'hermes setup' for the full setup wizard".to_string(),
            ],
            AgentType::Gh => vec![
                "Run 'gh auth login' in a terminal".to_string(),
                "Or set GH_TOKEN environment variable".to_string(),
            ],
            AgentType::Stripe => vec!["Run 'stripe login' in a terminal".to_string()],
            AgentType::Supabase => vec![
                "Run 'supabase login' in a terminal".to_string(),
                "Or set SUPABASE_ACCESS_TOKEN environment variable".to_string(),
            ],
            AgentType::Valyu => vec![
                "Set VALYU_API_KEY environment variable".to_string(),
                "export VALYU_API_KEY=\"your_api_key_here\"".to_string(),
            ],
            AgentType::Posthog => vec![
                "Run 'posthog-cli login' in a terminal".to_string(),
                "Or set POSTHOG_CLI_API_KEY environment variable".to_string(),
            ],
            AgentType::Elevenlabs => vec![
                "Run 'elevenlabs auth login' in a terminal".to_string(),
                "Or set ELEVENLABS_API_KEY environment variable".to_string(),
            ],
            AgentType::Ramp => vec![
                "Set RAMP_API_KEY environment variable".to_string(),
                "Or authenticate via the Ramp dashboard for agent card setup".to_string(),
            ],
            AgentType::Gws => vec![
                "Run 'gws auth' in a terminal".to_string(),
                "This will open a browser for OAuth authentication".to_string(),
            ],
            AgentType::Agentmail => vec![
                "Set AGENTMAIL_API_KEY environment variable".to_string(),
                "export AGENTMAIL_API_KEY=\"am_us_xxx\"".to_string(),
            ],
            AgentType::Vercel => vec!["Run 'vercel login' in a terminal".to_string()],
        }
    }
}
