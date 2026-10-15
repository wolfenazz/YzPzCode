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

#[tauri::command]
pub async fn install_skill(
    app: AppHandle,
    request: InstallSkillRequest,
) -> Result<String, String> {
    let cwd = runner::validate_install_request(&request).map_err(|e| format!("{e:#}"))?;
    let skill_id = runner::display_id(&request);
    let source = request.source.clone();
    let args = runner::build_install_args(&request);

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
            "Downloading skill via npx skills",
            Some(30),
        ),
    );

    let (stdout, stderr, success) = runner::run_npx(&args, &cwd)
        .await
        .map_err(|e| {
            runner::emit_progress(
                &app,
                &runner::progress(
                    &skill_id,
                    &source,
                    "failed",
                    &format!("{e:#}"),
                    None,
                ),
            );
            format!("{e:#}")
        })?;

    if success {
        runner::emit_progress(
            &app,
            &runner::progress(&skill_id, &source, "verifying", "Verifying install", Some(70)),
        );
        runner::emit_progress(
            &app,
            &runner::progress(
                &skill_id,
                &source,
                "completed",
                "Skill installed",
                Some(100),
            ),
        );
        Ok(runner::tail_2000(&stdout))
    } else {
        let tail = runner::tail_2000(&stderr);
        let message = if tail.trim().is_empty() {
            runner::tail_2000(&stdout)
        } else {
            tail
        };
        runner::emit_progress(
            &app,
            &runner::progress(&skill_id, &source, "failed", &message, None),
        );
        Err(message)
    }
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
    if name.contains("..") {
        return Err("Invalid skill name".to_string());
    }
    let is_global = global.unwrap_or(false);
    let cwd = if is_global {
        std::env::temp_dir()
    } else if let Some(workspace) = workspace_path.as_deref() {
        if workspace.trim().is_empty() {
            std::env::temp_dir()
        } else {
            let path = std::path::PathBuf::from(workspace);
            if !path.is_dir() {
                return Err("workspace path does not exist or is not a directory".to_string());
            }
            path
        }
    } else {
        std::env::temp_dir()
    };

    let args = runner::build_remove_args(&name, agent.as_deref(), is_global);
    runner::emit_progress(
        &app,
        &runner::progress(&name, &name, "queued", "Queued skill removal", Some(5)),
    );
    runner::emit_progress(
        &app,
        &runner::progress(&name, &name, "downloading", "Removing skill via npx", Some(30)),
    );

    let (stdout, stderr, success) = runner::run_npx(&args, &cwd)
        .await
        .map_err(|e| {
            runner::emit_progress(
                &app,
                &runner::progress(&name, &name, "failed", &format!("{e:#}"), None),
            );
            format!("{e:#}")
        })?;

    if success {
        runner::emit_progress(
            &app,
            &runner::progress(&name, &name, "completed", "Skill removed", Some(100)),
        );
        Ok(runner::tail_2000(&stdout))
    } else {
        let tail = runner::tail_2000(&stderr);
        let message = if tail.trim().is_empty() {
            runner::tail_2000(&stdout)
        } else {
            tail
        };
        runner::emit_progress(
            &app,
            &runner::progress(&name, &name, "failed", &message, None),
        );
        Err(message)
    }
}

#[tauri::command]
pub async fn update_skills(
    app: AppHandle,
    skill_names: Option<Vec<String>>,
    global: Option<bool>,
) -> Result<String, String> {
    let is_global = global.unwrap_or(false);
    let label = skill_names
        .as_ref()
        .and_then(|names| names.first().cloned())
        .unwrap_or_else(|| "all".to_string());
    let args = runner::build_update_args(skill_names.as_deref(), is_global);
    let cwd = std::env::temp_dir();

    runner::emit_progress(
        &app,
        &runner::progress(&label, &label, "queued", "Queued skills update", Some(5)),
    );
    runner::emit_progress(
        &app,
        &runner::progress(&label, &label, "downloading", "Updating skills via npx", Some(30)),
    );

    let (stdout, stderr, success) = runner::run_npx(&args, &cwd)
        .await
        .map_err(|e| {
            runner::emit_progress(
                &app,
                &runner::progress(&label, &label, "failed", &format!("{e:#}"), None),
            );
            format!("{e:#}")
        })?;

    if success {
        runner::emit_progress(
            &app,
            &runner::progress(&label, &label, "completed", "Skills updated", Some(100)),
        );
        Ok(runner::tail_2000(&stdout))
    } else {
        let tail = runner::tail_2000(&stderr);
        let message = if tail.trim().is_empty() {
            runner::tail_2000(&stdout)
        } else {
            tail
        };
        runner::emit_progress(
            &app,
            &runner::progress(&label, &label, "failed", &message, None),
        );
        Err(message)
    }
}
