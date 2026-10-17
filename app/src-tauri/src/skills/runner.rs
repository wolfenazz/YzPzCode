use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use anyhow::Context;
use tauri::{AppHandle, Emitter};

use super::types::{InstallSkillRequest, SkillInstallProgress};
use crate::utils::process::ProcessRunner;

const NPX_TIMEOUT_SECS: u64 = 300;
/// Lines of cleaned CLI output kept in an error message.
const MESSAGE_TAIL_LINES: usize = 8;

/// Result of one `npx skills` run, with ANSI/spinner noise already removed.
pub struct NpxOutput {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

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

/// Spinner frames the CLI redraws while it works.
const SPINNER_GLYPHS: [char; 4] = ['◒', '◐', '◓', '◑'];

/// Removes ANSI escape sequences (CSI and OSC).
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.peek() {
            Some('[') => {
                chars.next();
                for next in chars.by_ref() {
                    if ('\u{40}'..='\u{7e}').contains(&next) {
                        break;
                    }
                }
            }
            Some(']') => {
                chars.next();
                while let Some(next) = chars.next() {
                    if next == '\u{7}' {
                        break;
                    }
                    if next == '\u{1b}' {
                        chars.next();
                        break;
                    }
                }
            }
            _ => {
                chars.next();
            }
        }
    }
    out
}

/// Turns raw CLI output into readable lines: redraws (`\r`, "cursor to column
/// 1 + clear line") become line breaks, escapes, spinner frames and box
/// drawing are dropped, and repeated lines collapse.
pub fn clean_output(raw: &str) -> Vec<String> {
    let redrawn = raw
        .replace("\u{1b}[1G\u{1b}[J", "\n")
        .replace("\u{1b}[2K", "\n")
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let mut lines: Vec<String> = Vec::new();
    for line in strip_ansi(&redrawn).lines() {
        let text = line
            .trim()
            .trim_start_matches(|c: char| "│┌└├┐┘┤─╮╯╭╰◇◆●■▲◻◼ ".contains(c))
            .trim_end_matches(|c: char| "│╮╯┐┘─ ".contains(c))
            .trim();
        if text.is_empty() || text.starts_with(SPINNER_GLYPHS) {
            continue;
        }
        if lines.last().map(String::as_str) != Some(text) {
            lines.push(text.to_string());
        }
    }
    lines
}

/// The agent slugs the CLI rejected, from "Invalid agents: a, b".
pub fn parse_invalid_agents(lines: &[String]) -> Vec<String> {
    for line in lines {
        let lowered = line.to_lowercase();
        let Some(rest) = lowered.strip_prefix("invalid agent") else {
            continue;
        };
        let Some((_, list)) = rest.split_once(':') else {
            continue;
        };
        let agents: Vec<String> = list
            .split(',')
            .map(|agent| agent.trim().to_string())
            .filter(|agent| !agent.is_empty())
            .collect();
        if !agents.is_empty() {
            return agents;
        }
    }
    Vec::new()
}

/// The JSON array `--json` prints last (the CLI still prints progress lines
/// before it), or `None` when there is none.
pub fn extract_json_result(stdout: &str) -> Option<Vec<serde_json::Value>> {
    let clean = strip_ansi(stdout);
    let mut starts: Vec<usize> = clean.match_indices("\n[").map(|(i, _)| i + 1).collect();
    if clean.trim_start().starts_with('[') {
        starts.push(clean.len() - clean.trim_start().len());
    }
    for start in starts.into_iter().rev() {
        if let Ok(serde_json::Value::Array(items)) =
            serde_json::from_str::<serde_json::Value>(clean[start..].trim())
        {
            return Some(items);
        }
    }
    None
}

fn json_str<'a>(item: &'a serde_json::Value, key: &str) -> Option<&'a str> {
    item.get(key).and_then(serde_json::Value::as_str)
}

/// What `skills add --json` says happened.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct InstallSummary {
    /// Display names of the agents the skill is now available to.
    pub agents: Vec<String>,
    /// Set when the run finished but nothing was installed.
    pub problem: Option<String>,
}

pub fn summarize_install(items: &[serde_json::Value]) -> InstallSummary {
    let mut summary = InstallSummary::default();
    let mut installed = false;
    for item in items {
        match json_str(item, "status") {
            Some("installed") => {
                installed = true;
                if let Some(agents) = item.get("agents").and_then(serde_json::Value::as_array) {
                    for agent in agents.iter().filter_map(serde_json::Value::as_str) {
                        if !summary.agents.iter().any(|known| known == agent) {
                            summary.agents.push(agent.to_string());
                        }
                    }
                }
            }
            Some("failed") | Some("skipped") if summary.problem.is_none() => {
                summary.problem = json_str(item, "error")
                    .or_else(|| json_str(item, "reason"))
                    .map(str::to_string)
                    .or_else(|| {
                        json_str(item, "name").map(|name| format!("{name} was not installed"))
                    });
            }
            _ => {}
        }
    }
    if installed {
        summary.problem = None;
    } else if !items.is_empty() && summary.problem.is_none() {
        summary.problem = Some("The skills CLI did not install anything.".to_string());
    }
    summary
}

/// A short, readable explanation of a failed run.
pub fn failure_message(output: &NpxOutput) -> String {
    if let Some(items) = extract_json_result(&output.stdout) {
        if let Some(error) = items.iter().find_map(|item| json_str(item, "error")) {
            return error.to_string();
        }
    }
    let mut lines = clean_output(&output.stderr);
    lines.extend(clean_output(&output.stdout));
    // The list of every valid agent is long and not actionable here.
    lines.retain(|line| !line.to_lowercase().starts_with("valid agents:"));
    lines.dedup();
    let start = lines.len().saturating_sub(MESSAGE_TAIL_LINES);
    let message = lines[start..].join("\n");
    if message.is_empty() {
        "The skills CLI failed without printing a reason.".to_string()
    } else {
        message
    }
}

/// A readable line for a successful run (the last meaningful output line).
pub fn success_message(output: &NpxOutput, fallback: &str) -> String {
    clean_output(&output.stdout)
        .into_iter()
        .rev()
        .find(|line| !line.eq_ignore_ascii_case("done!"))
        .unwrap_or_else(|| fallback.to_string())
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
    args.push("--json".to_string());
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

/// `update` needs an explicit scope: without one the CLI guesses from the
/// working directory, which here is a temp folder for global runs.
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
    args.push(if global { "-g" } else { "-p" }.to_string());
    args.push("-y".to_string());
    args
}

/// Values that reach the CLI as arguments must not be read as options.
pub fn ensure_plain_argument(label: &str, value: &str) -> anyhow::Result<()> {
    if value.trim_start().starts_with('-') {
        anyhow::bail!("{label} must not start with \"-\"");
    }
    Ok(())
}

pub fn validate_install_request(request: &InstallSkillRequest) -> anyhow::Result<PathBuf> {
    if request.source.trim().is_empty() {
        anyhow::bail!("source must not be empty");
    }
    ensure_plain_argument("source", &request.source)?;
    if let Some(skill) = request.skill.as_deref() {
        ensure_plain_argument("skill", skill)?;
    }
    if request.agents.is_empty() || request.agents.iter().all(|a| a.trim().is_empty()) {
        anyhow::bail!("at least one agent must be selected");
    }
    for agent in &request.agents {
        let valid = !agent.is_empty()
            && !agent.starts_with('-')
            && agent
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !valid {
            anyhow::bail!("\"{agent}\" is not a valid agent name");
        }
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

pub async fn run_npx(args: &[String], cwd: &Path) -> anyhow::Result<NpxOutput> {
    // A GUI launch can have a thinner PATH than a terminal, so fall back to
    // the app's own lookup (nvm, npm prefix, Program Files…).
    let mut binary = resolve_npx();
    if which::which(&binary).is_err() {
        if let Some(found) = ProcessRunner::find_binary_async("npx").await {
            binary = found;
        }
    }
    let mut command = tokio::process::Command::new(&binary);
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .env("DISABLE_TELEMETRY", "1")
        .env("DO_NOT_TRACK", "1")
        .env("NO_COLOR", "1")
        .env("FORCE_COLOR", "0")
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);

    let run = tokio::time::timeout(Duration::from_secs(NPX_TIMEOUT_SECS), command.output())
        .await
        .context("The skills CLI took longer than 5 minutes and was stopped")?;
    let output = run.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            anyhow::anyhow!(
                "Node.js (npx) was not found. Install Node.js 18 or newer, then try again."
            )
        } else {
            anyhow::Error::new(error).context("failed to run npx skills command")
        }
    })?;

    Ok(NpxOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        success: output.status.success(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        build_install_args, build_remove_args, build_update_args, clean_output,
        extract_json_result, failure_message, parse_invalid_agents, summarize_install,
        validate_install_request, NpxOutput,
    };
    use crate::skills::types::InstallSkillRequest;

    fn sample_request() -> InstallSkillRequest {
        InstallSkillRequest {
            source: "owner/repo".to_string(),
            skill: Some("my-skill".to_string()),
            agents: vec!["claude-code".to_string()],
            scope: "global".to_string(),
            workspace_path: None,
            use_copy: false,
        }
    }

    /// What `skills add` printed in the reported failure, spinner included.
    const REPORTED_FAILURE: &str = "\u{1b}[?25l│\n◒  Cloning repository…\u{1b}[1G\u{1b}[J◐  Cloning repository…\u{1b}[1G\u{1b}[J◓  Cloning repository.\u{1b}[1G\u{1b}[J◇  Repository cloned\n│\n◇  Found 27 skills\n│\n●  Selected 1 skill: hyperframes-animation\n│\n■  Invalid agents: jcode\n│\n◇  Valid agents: aider-desk, amp, universal\n";

    #[test]
    fn source_validation_rejects_empty() {
        let mut request = sample_request();
        request.source = "   ".to_string();
        assert!(validate_install_request(&request).is_err());
    }

    #[test]
    fn validation_rejects_option_like_values() {
        let mut request = sample_request();
        request.source = "--global".to_string();
        assert!(validate_install_request(&request).is_err());

        let mut request = sample_request();
        request.skill = Some("-y".to_string());
        assert!(validate_install_request(&request).is_err());

        let mut request = sample_request();
        request.agents = vec!["claude-code; rm".to_string()];
        assert!(validate_install_request(&request).is_err());
    }

    #[test]
    fn args_builder_adds_global_flag_for_global_scope() {
        let request = sample_request();
        let args = build_install_args(&request);
        assert!(args.contains(&"-g".to_string()));
        assert!(args.contains(&"--skill".to_string()));
        assert!(args.contains(&"my-skill".to_string()));
        assert!(args.contains(&"--json".to_string()));
    }

    #[test]
    fn args_builder_omits_global_flag_for_project_scope() {
        let mut request = sample_request();
        request.scope = "project".to_string();
        let args = build_install_args(&request);
        assert!(!args.contains(&"-g".to_string()));
    }

    #[test]
    fn update_args_always_carry_an_explicit_scope() {
        assert!(build_update_args(None, true).contains(&"-g".to_string()));
        assert!(build_update_args(None, false).contains(&"-p".to_string()));
    }

    #[test]
    fn remove_args_skip_the_agent_when_none_is_given() {
        let args = build_remove_args("my-skill", None, false);
        assert!(!args.contains(&"-a".to_string()));
    }

    #[test]
    fn cleaning_drops_spinner_frames_and_keeps_the_reason() {
        let lines = clean_output(REPORTED_FAILURE);
        assert!(lines.iter().all(|line| !line.contains("Cloning")));
        assert!(lines.contains(&"Invalid agents: jcode".to_string()));
        assert!(lines.contains(&"Repository cloned".to_string()));
    }

    #[test]
    fn invalid_agents_are_read_from_the_cleaned_output() {
        assert_eq!(
            parse_invalid_agents(&clean_output(REPORTED_FAILURE)),
            vec!["jcode".to_string()]
        );
        assert!(parse_invalid_agents(&clean_output("Done!")).is_empty());
        assert_eq!(
            parse_invalid_agents(&["Invalid agents: a, b".to_string()]),
            vec!["a".to_string(), "b".to_string()]
        );
    }

    #[test]
    fn failure_message_is_short_and_drops_the_valid_agent_list() {
        let output = NpxOutput {
            stdout: REPORTED_FAILURE.to_string(),
            stderr: String::new(),
            success: false,
        };
        let message = failure_message(&output);
        assert!(message.contains("Invalid agents: jcode"));
        assert!(message
            .lines()
            .all(|line| !line.to_lowercase().starts_with("valid agents")));
        assert!(!message.contains('\u{1b}'));
    }

    #[test]
    fn json_result_is_found_after_progress_lines() {
        let stdout = "◇  Source: x\n[\n  {\"name\":\"a\",\"status\":\"installed\",\"agents\":[\"Codex\"]}\n]\n";
        let items = extract_json_result(stdout).expect("json array");
        let summary = summarize_install(&items);
        assert_eq!(summary.agents, vec!["Codex".to_string()]);
        assert!(summary.problem.is_none());
    }

    #[test]
    fn a_skipped_skill_is_reported_as_a_problem() {
        let items = extract_json_result("[{\"name\":\"x\",\"status\":\"skipped\"}]").unwrap();
        assert!(summarize_install(&items).problem.is_some());
        let items =
            extract_json_result("[{\"status\":\"failed\",\"error\":\"Invalid agents: jcode\"}]")
                .unwrap();
        assert_eq!(
            summarize_install(&items).problem.as_deref(),
            Some("Invalid agents: jcode")
        );
    }
}
