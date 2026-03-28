use super::detector::{AgentCliDetector, CliStatus};
use super::prerequisites::PrerequisitesChecker;
use super::provider::{get_provider, Platform};
use crate::types::AgentType;
use crate::utils::process::ProcessRunner;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub agent: AgentType,
    pub stage: InstallStage,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallStage {
    CheckingPrerequisites,
    Installing,
    Verifying,
    Completed,
    Failed,
}

pub struct AgentCliInstaller {
    detector: AgentCliDetector,
    app_handle: Option<AppHandle>,
}

impl AgentCliInstaller {
    pub fn new() -> Self {
        Self {
            detector: AgentCliDetector::new(),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub fn install(&self, agent: AgentType) -> Result<(), String> {
        self.emit_progress(
            &agent,
            InstallStage::CheckingPrerequisites,
            "Checking prerequisites...".to_string(),
        );

        let provider = get_provider(agent);
        let required_prereqs = provider.get_prerequisites();

        for prereq in PrerequisitesChecker::check_all() {
            if required_prereqs.contains(&prereq.prerequisite_type) {
                if !prereq.installed {
                    return Err(format!(
                        "{} is not installed. Please install it from {}",
                        prereq.name, prereq.install_url
                    ));
                }
                if !prereq.meets_minimum {
                    return Err(format!(
                        "{} version {} is below minimum required ({}). Please upgrade from {}",
                        prereq.name,
                        prereq.version.as_ref().unwrap_or(&"unknown".to_string()),
                        prereq.minimum_version,
                        prereq.install_url
                    ));
                }
            }
        }

        self.emit_progress(
            &agent,
            InstallStage::Installing,
            "Installing CLI...".to_string(),
        );

        let platform = Platform::current();
        let install_cmd = provider.get_install_command(platform);

        if install_cmd.is_empty() {
            return Err(format!(
                "No installation command available for {}",
                provider.display_name()
            ));
        }

        match self.execute_install_command(&install_cmd) {
            Ok(output) => {
                self.emit_progress(
                    &agent,
                    InstallStage::Verifying,
                    "Verifying installation...".to_string(),
                );

                self.detector.clear_cache();
                let info = self.detector.detect(agent);

                if info.status == CliStatus::Installed {
                    self.emit_progress(
                        &agent,
                        InstallStage::Completed,
                        format!(
                            "{} installed successfully (version: {})",
                            provider.display_name(),
                            info.version.unwrap_or_else(|| "unknown".to_string())
                        ),
                    );
                    Ok(())
                } else {
                    let error_msg = format!(
                        "Installation appeared to succeed but {} was not found in PATH. Output: {}",
                        provider.binary_name(),
                        output
                    );
                    self.emit_progress(&agent, InstallStage::Failed, error_msg.clone());
                    Err(error_msg)
                }
            }
            Err(e) => {
                self.emit_progress(&agent, InstallStage::Failed, e.clone());
                Err(e)
            }
        }
    }

    pub fn get_install_command(agent: AgentType) -> String {
        let provider = get_provider(agent);
        let platform = Platform::current();
        let cmd = provider.get_install_command(platform);
        if cmd.len() >= 3 && cmd[0] == "bash" && cmd[1] == "-c" {
            cmd[2..].join(" ")
        } else {
            cmd.join(" ")
        }
    }

    fn execute_install_command(&self, cmd: &[String]) -> Result<String, String> {
        if cmd.is_empty() {
            return Err("Empty install command".to_string());
        }

        let program = &cmd[0];
        let args: Vec<&str> = cmd[1..].iter().map(|s| s.as_str()).collect();

        let output = ProcessRunner::run_hidden(program, &args)
            .map_err(|e| format!("Failed to execute install command: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            Ok(if stdout.is_empty() { stderr } else { stdout })
        } else {
            Err(format!(
                "Installation failed: {}",
                if stderr.is_empty() { stdout } else { stderr }
            ))
        }
    }

    fn emit_progress(&self, agent: &AgentType, stage: InstallStage, message: String) {
        if let Some(ref handle) = self.app_handle {
            let progress = InstallProgress {
                agent: *agent,
                stage,
                message,
            };
            let _ = handle.emit("cli-install-progress", progress);
        }
    }
}

impl Default for AgentCliInstaller {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for AgentCliInstaller {
    fn clone(&self) -> Self {
        Self {
            detector: self.detector.clone(),
            app_handle: self.app_handle.clone(),
        }
    }
}
