use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::Context;
use tauri::{AppHandle, Emitter};

use super::types::{InstallSkillRequest, SkillInstallProgress};

const NPX_TIMEOUT_SECS: u64 = 300;
const OUTPUT_TAIL_CHARS: usize = 2000;

pub fn resolve_npx() -> String {
    #[cfg(target_os = "windows")]
    let candidates = ["npx.cmd", "npx"];
    #[cfg(not(target_os = "windows"))]
    let candidates: [&str; 1] = ["npx"];

    for candidate in candidates {
        if let Ok(path) = which::which(candidate) {
            return path.to_string_lossy().to_string();
        }
    }
    #[cfg(target_os = "windows")]
    return "npx.cmd".to_string();
    #[cfg(not(target_os = "windows"))]
    return "npx".to_string();
}

pub fn tail_output(output: &str, max_chars: usize) -> String {
    if output.chars().count() <= max_chars {
        return output.to_string();
    }
    output
        .chars()
        .skip(output.chars().count() - max_chars)
        .collect()
}

pub fn tail_2000(output: &str) -> String {
    tail_output(output, OUTPUT_TAIL_CHARS)
}

pub fn display_id(request: &InstallSkillRequest) -> String {
    request
        .skill
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| request.source.clone())
}

pub fn build_install_args(request: &InstallSkillRequest) -> Vec<String> {
    let mut args = vec![
        "-y".to_string(),
        "skills@latest".to_string(),
        "add".to_string(),
        request.source.clone(),
    ];
    if let Some(skill) = request.skill.as_ref() {
        if !skill.trim().is_empty() {
            args.push("--skill".to_string());
            args.push(skill.clone());
        }
    }
    for agent in &request.agents {
        if agent.trim().is_empty() {
            continue;
        }
        args.push("-a".to_string());
        args.push(agent.clone());
    }
    if request.scope == "global" {
        args.push("-g".to_string());
    }
    if request.use_copy {
        args.push("--copy".to_string());
    }
    args.push("-y".to_string());
    args
}

pub fn build_remove_args(
    skill_name: &str,
    agent: Option<&str>,
    global: bool,
) -> Vec<String> {
    let mut args = vec![
        "-y".to_string(),
        "skills@latest".to_string(),
        "remove".to_string(),
        skill_name.to_string(),
    ];
    if let Some(agent) = agent {
        if !agent.trim().is_empty() {
            args.push("-a".to_string());
            args.push(agent.to_string());
        }
    }
    if global {
        args.push("-g".to_string());
    }
    args.push("-y".to_string());
    args
}

pub fn build_update_args(skill_names: Option<&[String]>, global: bool) -> Vec<String> {
    let mut args = vec![
        "-y".to_string(),
        "skills@latest".to_string(),
        "update".to_string(),
    ];
    if let Some(names) = skill_names {
        for name in names {
            if !name.trim().is_empty() {
                args.push(name.clone());
            }
        }
    }
    if global {
        args.push("-g".to_string());
    }
    args.push("-y".to_string());
    args
}

pub fn validate_install_request(request: &InstallSkillRequest) -> anyhow::Result<PathBuf> {
    if request.source.trim().is_empty() {
        anyhow::bail!("source must not be empty");
    }
    if request.agents.is_empty() || request.agents.iter().all(|a| a.trim().is_empty()) {
        anyhow::bail!("at least one agent must be selected");
    }
    if request.scope != "global" && request.scope != "project" {
        anyhow::bail!("scope must be \"global\" or \"project\"");
    }
    if request.scope == "project" {
        let workspace = request.workspace_path.as_deref().unwrap_or("");
        if workspace.trim().is_empty() {
            anyhow::bail!("project scope requires a workspace path");
        }
        let path = PathBuf::from(workspace);
        if !path.is_dir() {
            anyhow::bail!("workspace path does not exist or is not a directory");
        }
        Ok(path)
    } else {
        Ok(std::env::temp_dir())
    }
}

pub fn emit_progress(app: &AppHandle, progress: &SkillInstallProgress) {
    let _ = app.emit("skill-install-progress", progress);
}

pub fn progress(
    skill_id: &str,
    source: &str,
    stage: &str,
    message: &str,
    percent: Option<u8>,
) -> SkillInstallProgress {
    SkillInstallProgress {
        skill_id: skill_id.to_string(),
        source: source.to_string(),
        stage: stage.to_string(),
        message: message.to_string(),
        percent,
    }
}

pub async fn run_npx(args: &[String], cwd: &Path) -> anyhow::Result<(String, String, bool)> {
    let binary = resolve_npx();
    let mut command = tokio::process::Command::new(&binary);
    command
        .args(args)
        .current_dir(cwd)
        .env("DISABLE_TELEMETRY", "1")
        .env("DO_NOT_TRACK", "1")
        .kill_on_drop(true);

    let output = tokio::time::timeout(Duration::from_secs(NPX_TIMEOUT_SECS), command.output())
        .await
        .context("npx skills command timed out after 300s")?
        .context("failed to run npx skills command")?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok((stdout, stderr, output.status.success()))
}

#[cfg(test)]
mod tests {
    use super::{build_install_args, tail_output, validate_install_request};
    use crate::skills::types::InstallSkillRequest;

    fn sample_request() -> InstallSkillRequest {
        InstallSkillRequest {
            source: "owner/repo".to_string(),
            skill: Some("my-skill".to_string()),
            agents: vec!["claude".to_string()],
            scope: "global".to_string(),
            workspace_path: None,
            use_copy: false,
        }
    }

    #[test]
    fn source_validation_rejects_empty() {
        let mut request = sample_request();
        request.source = "   ".to_string();
        assert!(validate_install_request(&request).is_err());
    }

    #[test]
    fn args_builder_adds_global_flag_for_global_scope() {
        let request = sample_request();
        let args = build_install_args(&request);
        assert!(args.contains(&"-g".to_string()));
        assert!(args.contains(&"--skill".to_string()));
        assert!(args.contains(&"my-skill".to_string()));
    }

    #[test]
    fn args_builder_omits_global_flag_for_project_scope() {
        let mut request = sample_request();
        request.scope = "project".to_string();
        let args = build_install_args(&request);
        assert!(!args.contains(&"-g".to_string()));
    }

    #[test]
    fn tail_output_keeps_last_chars() {
        let long = "a".repeat(3000);
        let tail = tail_output(&long, 2000);
        assert_eq!(tail.len(), 2000);
    }
}
