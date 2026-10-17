use tauri::AppHandle;

use crate::skills::{
    catalog, inventory, runner, InstallSkillRequest, InstalledSkillsResponse, SkillAuditResponse,
    SkillDetail, SkillListResponse, SkillSearchResponse,
};

const VALID_VIEWS: [&str; 3] = ["all-time", "trending", "hot"];

#[tauri::command]
pub async fn list_trending_skills(
    view: Option<String>,
    page: Option<u32>,
    per_page: Option<u32>,
    api_key: Option<String>,
) -> Result<SkillListResponse, String> {
    let raw_view = view.unwrap_or_else(|| "trending".to_string());
    let view = if VALID_VIEWS.contains(&raw_view.as_str()) {
        raw_view
    } else {
        "trending".to_string()
    };
    let page = page.unwrap_or(1).max(1);
    let per_page = per_page.unwrap_or(20).clamp(1, 100);

    catalog::fetch_trending(&view, page, per_page, api_key.as_deref())
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn search_skills(
    query: String,
    limit: Option<u8>,
    owner: Option<String>,
    api_key: Option<String>,
) -> Result<SkillSearchResponse, String> {
    if query.trim().chars().count() < 2 {
        return Err("Search query must be at least 2 characters".to_string());
    }
    let limit = limit.unwrap_or(20).clamp(1, 50);

    catalog::fetch_search(query.trim(), limit, owner.as_deref(), api_key.as_deref())
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn get_skill_detail(
    app: AppHandle,
    skill_id: String,
    api_key: Option<String>,
) -> Result<SkillDetail, String> {
    let _ = &app;
    let trimmed = skill_id.trim().to_string();
    if trimmed.is_empty() {
        return Err("Skill id must not be empty".to_string());
    }
    if trimmed.contains("..") {
        return Err("Invalid skill id".to_string());
    }

    catalog::fetch_detail(&trimmed, api_key.as_deref())
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn get_skill_audit(
    skill_id: String,
    api_key: Option<String>,
) -> Result<SkillAuditResponse, String> {
    let trimmed = skill_id.trim().to_string();
    if trimmed.is_empty() {
        return Err("Skill id must not be empty".to_string());
    }
    if trimmed.contains("..") {
        return Err("Invalid skill id".to_string());
    }

    catalog::fetch_audit(&trimmed, api_key.as_deref())
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn list_installed_skills(
    workspace_path: Option<String>,
) -> Result<InstalledSkillsResponse, String> {
    inventory::list_installed(workspace_path.as_deref()).map_err(|e| format!("{e:#}"))
}


/// Reports a failure on the progress channel and returns the message.
fn fail(app: &AppHandle, id: &str, source: &str, message: String) -> String {
    runner::emit_progress(app, &runner::progress(id, source, "failed", &message, None));
    message
}

#[tauri::command]
pub async fn install_skill(
    app: AppHandle,
    request: InstallSkillRequest,
) -> Result<String, String> {
    let mut request = request;
    let cwd = runner::validate_install_request(&request).map_err(|e| format!("{e:#}"))?;
    let skill_id = runner::display_id(&request);
    let source = request.source.clone();

    runner::emit_progress(
        &app,
        &runner::progress(&skill_id, &source, "queued", "Queued skill install", Some(5)),
    );
    runner::emit_progress(
        &app,
        &runner::progress(
            &skill_id,
            &source,
            "downloading",
            "Downloading the skill and linking it to your agents…",
            Some(30),
        ),
    );

    // Agents the CLI does not know are dropped and the install is retried, so
    // one unsupported agent never blocks the others.
    let mut skipped: Vec<String> = Vec::new();
    loop {
        let args = runner::build_install_args(&request);
        let output = runner::run_npx(&args, &cwd)
            .await
            .map_err(|e| fail(&app, &skill_id, &source, format!("{e:#}")))?;
        let summary = runner::extract_json_result(&output.stdout)
            .map(|items| runner::summarize_install(&items))
            .unwrap_or_default();

        if output.success && summary.problem.is_none() {
            runner::emit_progress(
                &app,
                &runner::progress(&skill_id, &source, "verifying", "Verifying install", Some(70)),
            );
            let mut message = if summary.agents.is_empty() {
                "Skill installed".to_string()
            } else {
                format!("Installed for {}", summary.agents.join(", "))
            };
            if !skipped.is_empty() {
                message.push_str(&format!(
                    " · skipped (not supported by skills.sh): {}",
                    skipped.join(", ")
                ));
            }
            runner::emit_progress(
                &app,
                &runner::progress(&skill_id, &source, "completed", &message, Some(100)),
            );
            return Ok(message);
        }

        let mut lines = runner::clean_output(&output.stdout);
        lines.extend(runner::clean_output(&output.stderr));
        let mut invalid = runner::parse_invalid_agents(&lines);
        invalid.retain(|bad| request.agents.iter().any(|a| a.eq_ignore_ascii_case(bad)));
        if !invalid.is_empty() {
            request
                .agents
                .retain(|a| !invalid.iter().any(|bad| bad.eq_ignore_ascii_case(a)));
            skipped.extend(invalid);
            if request.agents.is_empty() {
                return Err(fail(
                    &app,
                    &skill_id,
                    &source,
                    format!(
                        "skills.sh does not support {} yet. Pick another agent.",
                        skipped.join(", ")
                    ),
                ));
            }
            runner::emit_progress(
                &app,
                &runner::progress(
                    &skill_id,
                    &source,
                    "downloading",
                    &format!("Retrying without {}…", skipped.join(", ")),
                    Some(40),
                ),
            );
            continue;
        }

        let message = summary
            .problem
            .unwrap_or_else(|| runner::failure_message(&output));
        return Err(fail(&app, &skill_id, &source, message));
    }
}

/// Folder a scoped CLI run starts in: the workspace for project scope,
/// otherwise a neutral temp folder.
fn scope_dir(global: bool, workspace_path: Option<&str>) -> Result<std::path::PathBuf, String> {
    if global {
        return Ok(std::env::temp_dir());
    }
    let workspace = workspace_path.unwrap_or("").trim();
    if workspace.is_empty() {
        return Err("Project scope needs an open workspace".to_string());
    }
    let path = std::path::PathBuf::from(workspace);
    if !path.is_dir() {
        return Err("workspace path does not exist or is not a directory".to_string());
    }
    Ok(path)
}

#[tauri::command]
pub async fn remove_skill(
    app: AppHandle,
    skill_name: String,
    agent: Option<String>,
    global: Option<bool>,
    workspace_path: Option<String>,
) -> Result<String, String> {
    let name = skill_name.trim().to_string();
    if name.is_empty() {
        return Err("Skill name must not be empty".to_string());
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Invalid skill name".to_string());
    }
    runner::ensure_plain_argument("skill name", &name).map_err(|e| format!("{e:#}"))?;
    if let Some(agent) = agent.as_deref() {
        runner::ensure_plain_argument("agent", agent).map_err(|e| format!("{e:#}"))?;
    }
    let is_global = global.unwrap_or(false);
    let cwd = scope_dir(is_global, workspace_path.as_deref())?;

    // Without `-a` the CLI cleans every agent link, which is what "remove" means.
    let args = runner::build_remove_args(&name, agent.as_deref(), is_global);
    runner::emit_progress(
        &app,
        &runner::progress(&name, &name, "queued", "Queued skill removal", Some(5)),
    );
    runner::emit_progress(
        &app,
        &runner::progress(&name, &name, "downloading", "Removing skill…", Some(30)),
    );

    let output = runner::run_npx(&args, &cwd)
        .await
        .map_err(|e| fail(&app, &name, &name, format!("{e:#}")))?;

    if output.success {
        let message = format!("Removed {name}");
        runner::emit_progress(
            &app,
            &runner::progress(&name, &name, "completed", &message, Some(100)),
        );
        Ok(message)
    } else {
        Err(fail(&app, &name, &name, runner::failure_message(&output)))
    }
}

#[tauri::command]
pub async fn update_skills(
    app: AppHandle,
    skill_names: Option<Vec<String>>,
    global: Option<bool>,
    workspace_path: Option<String>,
) -> Result<String, String> {
    let is_global = global.unwrap_or(false);
    if let Some(names) = skill_names.as_deref() {
        for name in names {
            if name.contains("..") || name.contains('/') || name.contains('\\') {
                return Err("Invalid skill name".to_string());
            }
            runner::ensure_plain_argument("skill name", name).map_err(|e| format!("{e:#}"))?;
        }
    }
    let label = skill_names
        .as_ref()
        .and_then(|names| names.first().cloned())
        .unwrap_or_else(|| "all".to_string());
    let args = runner::build_update_args(skill_names.as_deref(), is_global);
    let cwd = scope_dir(is_global, workspace_path.as_deref())?;

    runner::emit_progress(
        &app,
        &runner::progress(&label, &label, "queued", "Queued skills update", Some(5)),
    );
    runner::emit_progress(
        &app,
        &runner::progress(&label, &label, "downloading", "Updating skills…", Some(30)),
    );

    let output = runner::run_npx(&args, &cwd)
        .await
        .map_err(|e| fail(&app, &label, &label, format!("{e:#}")))?;

    if output.success {
        let message = runner::success_message(&output, "Skills updated");
        runner::emit_progress(
            &app,
            &runner::progress(&label, &label, "completed", &message, Some(100)),
        );
        Ok(message)
    } else {
        Err(fail(&app, &label, &label, runner::failure_message(&output)))
    }
}
