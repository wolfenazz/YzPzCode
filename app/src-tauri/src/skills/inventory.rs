use std::path::{Path, PathBuf};

use super::types::{InstalledSkill, InstalledSkillsResponse};

pub fn home_dir() -> Option<PathBuf> {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        if !profile.trim().is_empty() {
            return Some(PathBuf::from(profile));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        if !home.trim().is_empty() {
            return Some(PathBuf::from(home));
        }
    }
    None
}

pub fn infer_agent(path: &Path) -> String {
    let lowered = path.to_string_lossy().to_lowercase();
    if lowered.contains(".claude") {
        "claude".to_string()
    } else if lowered.contains(".cursor") {
        "cursor".to_string()
    } else if lowered.contains("opencode") {
        "opencode".to_string()
    } else if lowered.contains(".agents") || lowered.contains("/agents/") {
        "agents".to_string()
    } else {
        "unknown".to_string()
    }
}

fn global_roots() -> Vec<PathBuf> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    vec![
        home.join(".claude").join("skills"),
        home.join(".cursor").join("skills"),
        home.join(".config").join("opencode").join("skills"),
        home.join(".agents").join("skills"),
    ]
}

fn project_roots(workspace: &Path) -> Vec<PathBuf> {
    vec![
        workspace.join(".claude").join("skills"),
        workspace.join(".agents").join("skills"),
        workspace.join(".cursor").join("skills"),
    ]
}

pub fn scan_root(root: &Path, scope: &str, out: &mut Vec<InstalledSkill>) {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if !is_dir {
            // Fall back to a metadata check when file_type is unavailable.
            if !path.is_dir() {
                continue;
            }
        }
        if !path.join("SKILL.md").is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        out.push(InstalledSkill {
            name,
            agent: infer_agent(root),
            scope: scope.to_string(),
            path: path.to_string_lossy().to_string(),
        });
    }
}

pub fn list_installed(workspace_path: Option<&str>) -> anyhow::Result<InstalledSkillsResponse> {
    let mut global = Vec::new();
    for root in global_roots() {
        scan_root(&root, "global", &mut global);
    }

    let mut project = Vec::new();
    if let Some(workspace) = workspace_path {
        if !workspace.trim().is_empty() {
            let workspace_path_buf = PathBuf::from(workspace);
            if workspace_path_buf.is_dir() {
                for root in project_roots(&workspace_path_buf) {
                    scan_root(&root, "project", &mut project);
                }
            } else {
                return Err(anyhow::anyhow!(
                    "invalid workspace path: workspace path does not exist or is not a directory"
                ));
            }
        }
    }

    Ok(InstalledSkillsResponse { project, global })
}

#[cfg(test)]
mod tests {
    use super::{infer_agent, scan_root};
    use std::path::PathBuf;

    #[test]
    fn inventory_scan_on_temp_dir_finds_skill_md() {
        let base = std::env::temp_dir().join(format!(
            "yzpz-skills-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let skill_dir = base.join("my-skill");
        std::fs::create_dir_all(&skill_dir).expect("create temp skill dir");
        std::fs::write(skill_dir.join("SKILL.md"), "# test skill")
            .expect("write SKILL.md");

        let mut out = Vec::new();
        scan_root(&base, "global", &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "my-skill");
        assert_eq!(out[0].scope, "global");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn inventory_scan_ignores_dirs_without_skill_md() {
        let base = std::env::temp_dir().join(format!(
            "yzpz-skills-empty-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let empty_dir = base.join("not-a-skill");
        std::fs::create_dir_all(&empty_dir).expect("create temp dir");

        let mut out = Vec::new();
        scan_root(&base, "project", &mut out);
        assert!(out.is_empty());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn inventory_infers_agent_from_parent_path() {
        assert_eq!(infer_agent(&PathBuf::from("/home/u/.claude/skills")), "claude");
        assert_eq!(infer_agent(&PathBuf::from("/home/u/.cursor/skills")), "cursor");
        assert_eq!(
            infer_agent(&PathBuf::from("/home/u/.config/opencode/skills")),
            "opencode"
        );
    }
}
