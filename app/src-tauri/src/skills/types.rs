use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub installs: i64,
    #[serde(default, alias = "stars", alias = "stargazers_count", alias = "repoStars", alias = "repo_stars", alias = "stargazersCount")]
    pub stars: Option<i64>,
    #[serde(default, alias = "source_type")]
    pub source_type: String,
    #[serde(default, alias = "install_url")]
    pub install_url: Option<String>,
    #[serde(default)]
    pub url: String,
    #[serde(default, alias = "is_duplicate")]
    pub is_duplicate: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillListPagination {
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_per_page", alias = "per_page")]
    pub per_page: u32,
    #[serde(default)]
    pub total: i64,
    #[serde(default, alias = "has_more")]
    pub has_more: bool,
}

fn default_page() -> u32 {
    1
}

fn default_per_page() -> u32 {
    20
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillListResponse {
    #[serde(default)]
    pub data: Vec<SkillSummary>,
    pub pagination: SkillListPagination,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSearchResponse {
    #[serde(default)]
    pub data: Vec<SkillSummary>,
    #[serde(default)]
    pub query: String,
    #[serde(default = "default_search_type", alias = "search_type")]
    pub search_type: String,
    #[serde(default)]
    pub count: usize,
}

fn default_search_type() -> String {
    "keyword".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub contents: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetail {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub installs: i64,
    #[serde(default, alias = "stars", alias = "stargazers_count", alias = "repoStars", alias = "repo_stars", alias = "stargazersCount")]
    pub stars: Option<i64>,
    #[serde(default)]
    pub hash: Option<String>,
    #[serde(default)]
    pub files: Option<Vec<SkillFile>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillAuditEntry {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default, alias = "audited_at")]
    pub audited_at: String,
    #[serde(default, alias = "risk_level")]
    pub risk_level: Option<String>,
    #[serde(default)]
    pub categories: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillAuditResponse {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub audits: Vec<SkillAuditEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub agent: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillsResponse {
    #[serde(default)]
    pub project: Vec<InstalledSkill>,
    #[serde(default)]
    pub global: Vec<InstalledSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillRequest {
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub skill: Option<String>,
    #[serde(default)]
    pub agents: Vec<String>,
    #[serde(default)]
    pub scope: String,
    #[serde(default, alias = "workspace_path")]
    pub workspace_path: Option<String>,
    #[serde(default, alias = "use_copy")]
    pub use_copy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInstallProgress {
    #[serde(default, alias = "skill_id")]
    pub skill_id: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub stage: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub percent: Option<u8>,
}
