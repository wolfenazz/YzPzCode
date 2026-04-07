use crate::utils::process::ProcessRunner;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PrerequisiteType {
    NodeJs,
    Npm,
    Git,
    Bun,
    Pnpm,
    Docker,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrerequisiteStatus {
    pub name: String,
    pub prerequisite_type: PrerequisiteType,
    pub installed: bool,
    pub version: Option<String>,
    pub minimum_version: String,
    pub meets_minimum: bool,
    pub install_url: String,
    pub required_for: Vec<String>,
}

pub struct PrerequisitesChecker;

impl PrerequisitesChecker {
    pub fn new() -> Self {
        Self
    }

    pub fn check_all() -> Vec<PrerequisiteStatus> {
        vec![
            Self::check_nodejs(),
            Self::check_npm(),
            Self::check_git(),
            Self::check_bun(),
            Self::check_pnpm(),
            Self::check_docker(),
        ]
    }

    pub fn check_nodejs() -> PrerequisiteStatus {
        let minimum = "18.0.0";
        let result = Self::run_command("node", &["--version"]);

        match result {
            Some(output) => {
                let version = Self::parse_version(&output);
                let meets_minimum = Self::compare_versions(&version, minimum);
                PrerequisiteStatus {
                    name: "Node.js".to_string(),
                    prerequisite_type: PrerequisiteType::NodeJs,
                    installed: true,
                    version: Some(version.clone()),
                    minimum_version: minimum.to_string(),
                    meets_minimum,
                    install_url: "https://nodejs.org".to_string(),
                    required_for: vec![
                        "Claude Code".to_string(),
                        "OpenCode".to_string(),
                        "Codex CLI".to_string(),
                        "Gemini CLI".to_string(),
                        "Kilo CLI".to_string(),
                    ],
                }
            }
            None => Self::not_installed(
                "Node.js",
                PrerequisiteType::NodeJs,
                minimum,
                "https://nodejs.org",
            ),
        }
    }

    pub fn check_npm() -> PrerequisiteStatus {
        let minimum = "8.0.0";
        let result = Self::run_command("npm", &["--version"]);

        match result {
            Some(output) => {
                let version = Self::parse_version(&output);
                let meets_minimum = Self::compare_versions(&version, minimum);
                PrerequisiteStatus {
                    name: "npm".to_string(),
                    prerequisite_type: PrerequisiteType::Npm,
                    installed: true,
                    version: Some(version.clone()),
                    minimum_version: minimum.to_string(),
                    meets_minimum,
                    install_url: "https://nodejs.org".to_string(),
                    required_for: vec![
                        "Claude Code".to_string(),
                        "OpenCode".to_string(),
                        "Codex CLI".to_string(),
                        "Gemini CLI".to_string(),
                        "Kilo CLI".to_string(),
                    ],
                }
            }
            None => {
                Self::not_installed("npm", PrerequisiteType::Npm, minimum, "https://nodejs.org")
            }
        }
    }

    pub fn check_git() -> PrerequisiteStatus {
        let minimum = "2.0.0";
        let result = Self::run_command("git", &["--version"]);

        match result {
            Some(output) => {
                let version = Self::parse_git_version(&output);
                let meets_minimum = Self::compare_versions(&version, minimum);
                PrerequisiteStatus {
                    name: "Git".to_string(),
                    prerequisite_type: PrerequisiteType::Git,
                    installed: true,
                    version: Some(version.clone()),
                    minimum_version: minimum.to_string(),
                    meets_minimum,
                    install_url: "https://git-scm.com".to_string(),
                    required_for: vec![
                        "Claude Code".to_string(),
                        "OpenCode".to_string(),
                        "Codex CLI".to_string(),
                        "Gemini CLI".to_string(),
                        "Kilo CLI".to_string(),
                        "Hermes Agent".to_string(),
                    ],
                }
            }
            None => {
                Self::not_installed("Git", PrerequisiteType::Git, minimum, "https://git-scm.com")
            }
        }
    }

    pub fn check_bun() -> PrerequisiteStatus {
        let minimum = "1.0.0";
        let result = Self::run_command("bun", &["--version"]);

        match result {
            Some(output) => {
                let version = Self::parse_version(&output);
                let meets_minimum = Self::compare_versions(&version, minimum);
                PrerequisiteStatus {
                    name: "Bun".to_string(),
                    prerequisite_type: PrerequisiteType::Bun,
                    installed: true,
                    version: Some(version.clone()),
                    minimum_version: minimum.to_string(),
                    meets_minimum,
                    install_url: "https://bun.sh".to_string(),
                    required_for: vec!["Bun Runtime".to_string()],
                }
            }
            None => Self::not_installed("Bun", PrerequisiteType::Bun, minimum, "https://bun.sh"),
        }
    }

    pub fn check_pnpm() -> PrerequisiteStatus {
        let minimum = "8.0.0";
        let result = Self::run_command("pnpm", &["--version"]);

        match result {
            Some(output) => {
                let version = Self::parse_version(&output);
                let meets_minimum = Self::compare_versions(&version, minimum);
                PrerequisiteStatus {
                    name: "pnpm".to_string(),
                    prerequisite_type: PrerequisiteType::Pnpm,
                    installed: true,
                    version: Some(version.clone()),
                    minimum_version: minimum.to_string(),
                    meets_minimum,
                    install_url: "https://pnpm.io".to_string(),
                    required_for: vec!["Package Management".to_string()],
                }
            }
            None => Self::not_installed("pnpm", PrerequisiteType::Pnpm, minimum, "https://pnpm.io"),
        }
    }

    pub fn check_docker() -> PrerequisiteStatus {
        let minimum = "20.0.0";
        let result = Self::run_command("docker", &["--version"]);

        match result {
            Some(output) => {
                let version = Self::parse_docker_version(&output);
                let meets_minimum = Self::compare_versions(&version, minimum);
                PrerequisiteStatus {
                    name: "Docker".to_string(),
                    prerequisite_type: PrerequisiteType::Docker,
                    installed: true,
                    version: Some(version.clone()),
                    minimum_version: minimum.to_string(),
                    meets_minimum,
                    install_url: "https://docker.com".to_string(),
                    required_for: vec!["Supabase CLI".to_string()],
                }
            }
            None => Self::not_installed(
                "Docker",
                PrerequisiteType::Docker,
                minimum,
                "https://docker.com",
            ),
        }
    }

    fn not_installed(
        name: &str,
        prereq_type: PrerequisiteType,
        minimum: &str,
        url: &str,
    ) -> PrerequisiteStatus {
        PrerequisiteStatus {
            name: name.to_string(),
            prerequisite_type: prereq_type,
            installed: false,
            version: None,
            minimum_version: minimum.to_string(),
            meets_minimum: false,
            install_url: url.to_string(),
            required_for: vec![
                "Claude Code".to_string(),
                "OpenCode".to_string(),
                "Codex CLI".to_string(),
                "Gemini CLI".to_string(),
            ],
        }
    }

    fn run_command(cmd: &str, args: &[&str]) -> Option<String> {
        #[cfg(target_os = "windows")]
        {
            let full_args = vec![cmd.to_string()]
                .into_iter()
                .chain(args.iter().map(|s| s.to_string()))
                .collect::<Vec<_>>();
            let mut cmd_args: Vec<&str> = vec!["/c"];
            cmd_args.extend(full_args.iter().map(|s| s.as_str()));
            ProcessRunner::run_hidden("cmd", &cmd_args)
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        }
        #[cfg(not(target_os = "windows"))]
        {
            ProcessRunner::run_hidden(cmd, args)
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        }
    }

    fn parse_version(output: &str) -> String {
        output
            .trim_start_matches('v')
            .split_whitespace()
            .next()
            .unwrap_or("0.0.0")
            .to_string()
    }

    fn parse_git_version(output: &str) -> String {
        output
            .strip_prefix("git version ")
            .unwrap_or("0.0.0")
            .split_whitespace()
            .next()
            .unwrap_or("0.0.0")
            .to_string()
    }

    fn parse_docker_version(output: &str) -> String {
        output
            .strip_prefix("Docker version ")
            .unwrap_or("0.0.0")
            .split(',')
            .next()
            .unwrap_or("0.0.0")
            .split_whitespace()
            .next()
            .unwrap_or("0.0.0")
            .to_string()
    }

    fn compare_versions(version: &str, minimum: &str) -> bool {
        let parse_parts =
            |v: &str| -> Vec<u32> { v.split('.').filter_map(|s| s.parse().ok()).collect() };

        let v_parts = parse_parts(version);
        let m_parts = parse_parts(minimum);

        for i in 0..m_parts.len().max(v_parts.len()) {
            let v = v_parts.get(i).unwrap_or(&0);
            let m = m_parts.get(i).unwrap_or(&0);
            if v < m {
                return false;
            }
            if v > m {
                return true;
            }
        }
        true
    }

    pub fn get_install_command(prereq_type: &PrerequisiteType) -> Vec<String> {
        match prereq_type {
            PrerequisiteType::NodeJs | PrerequisiteType::Npm => {
                #[cfg(target_os = "windows")]
                {
                    vec![
                        "winget".to_string(),
                        "install".to_string(),
                        "--id".to_string(),
                        "OpenJS.NodeJS.LTS".to_string(),
                        "-e".to_string(),
                        "--accept-package-agreements".to_string(),
                        "--accept-source-agreements".to_string(),
                    ]
                }
                #[cfg(target_os = "macos")]
                {
                    vec![
                        "bash".to_string(),
                        "-c".to_string(),
                        "brew install node@22".to_string(),
                    ]
                }
                #[cfg(not(any(target_os = "windows", target_os = "macos")))]
                {
                    vec![
                        "bash".to_string(),
                        "-c".to_string(),
                        "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs".to_string(),
                    ]
                }
            }
            PrerequisiteType::Git => {
                #[cfg(target_os = "windows")]
                {
                    vec![
                        "winget".to_string(),
                        "install".to_string(),
                        "--id".to_string(),
                        "Git.Git".to_string(),
                        "-e".to_string(),
                        "--accept-package-agreements".to_string(),
                        "--accept-source-agreements".to_string(),
                    ]
                }
                #[cfg(target_os = "macos")]
                {
                    vec![
                        "bash".to_string(),
                        "-c".to_string(),
                        "brew install git".to_string(),
                    ]
                }
                #[cfg(not(any(target_os = "windows", target_os = "macos")))]
                {
                    vec![
                        "bash".to_string(),
                        "-c".to_string(),
                        "sudo apt-get install -y git".to_string(),
                    ]
                }
            }
            PrerequisiteType::Bun => {
                #[cfg(target_os = "windows")]
                {
                    vec![
                        "powershell".to_string(),
                        "-c".to_string(),
                        "irm bun.sh/install.ps1 | iex".to_string(),
                    ]
                }
                #[cfg(target_os = "macos")]
                {
                    vec![
                        "bash".to_string(),
                        "-c".to_string(),
                        "curl -fsSL https://bun.sh/install | bash".to_string(),
                    ]
                }
                #[cfg(not(any(target_os = "windows", target_os = "macos")))]
                {
                    vec![
                        "bash".to_string(),
                        "-c".to_string(),
                        "curl -fsSL https://bun.sh/install | bash".to_string(),
                    ]
                }
            }
            PrerequisiteType::Pnpm => {
                vec![
                    "npm".to_string(),
                    "install".to_string(),
                    "-g".to_string(),
                    "pnpm".to_string(),
                ]
            }
            PrerequisiteType::Docker => {
                #[cfg(target_os = "windows")]
                {
                    vec![
                        "winget".to_string(),
                        "install".to_string(),
                        "--id".to_string(),
                        "Docker.DockerDesktop".to_string(),
                        "-e".to_string(),
                        "--accept-package-agreements".to_string(),
                        "--accept-source-agreements".to_string(),
                    ]
                }
                #[cfg(target_os = "macos")]
                {
                    vec![
                        "bash".to_string(),
                        "-c".to_string(),
                        "brew install --cask docker".to_string(),
                    ]
                }
                #[cfg(not(any(target_os = "windows", target_os = "macos")))]
                {
                    vec![
                        "bash".to_string(),
                        "-c".to_string(),
                        "sudo apt-get install -y docker.io".to_string(),
                    ]
                }
            }
        }
    }
}

impl Default for PrerequisitesChecker {
    fn default() -> Self {
        Self::new()
    }
}
