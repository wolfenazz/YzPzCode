use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    Claude,
    Codex,
    Gemini,
    Opencode,
    Cursor,
    Kilo,
    Hermes,
    Pi,
    CommandCode,
    Cline,
    Grok,
    Gh,
    Stripe,
    Supabase,
    Valyu,
    Posthog,
    Elevenlabs,
    Ramp,
    Gws,
    Agentmail,
    Vercel,
}

impl AgentType {
    #[allow(dead_code)]
    pub fn is_tool_cli(&self) -> bool {
        matches!(
            self,
            AgentType::Gh
                | AgentType::Stripe
                | AgentType::Supabase
                | AgentType::Valyu
                | AgentType::Posthog
                | AgentType::Elevenlabs
                | AgentType::Ramp
                | AgentType::Gws
                | AgentType::Agentmail
                | AgentType::Vercel
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Idle,
    Running,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct LayoutConfig {
    #[serde(rename = "type")]
    pub layout_type: String,
    pub sessions: usize,
    pub rows: Option<usize>,
    pub cols: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFleet {
    pub total_slots: usize,
    pub allocation: std::collections::HashMap<AgentType, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct WorkspaceConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub layout: LayoutConfig,
    pub agent_fleet: AgentFleet,
    pub created_at: u64,
    pub last_opened: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSession {
    pub id: String,
    pub workspace_id: String,
    pub index: usize,
    pub cwd: String,
    pub agent: Option<AgentType>,
    pub status: SessionStatus,
    pub shell: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionsRequest {
    pub workspace_id: String,
    pub workspace_path: String,
    pub count: usize,
    pub agent_fleet: AgentFleet,
    pub shell: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct TerminalOutput {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchExternalRequest {
    pub workspace_path: String,
    pub count: usize,
    pub agent_allocation: std::collections::HashMap<AgentType, usize>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum IdeType {
    VsCode,
    VisualStudio,
    Cursor,
    Zed,
    WebStorm,
    IntelliJ,
    SublimeText,
    Windsurf,
    Perplexity,
    Antigravity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeInfo {
    pub ide: IdeType,
    pub name: String,
    pub binary_name: String,
    pub installed: bool,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_at: u64,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GitFileChange {
    Added,
    Modified,
    Deleted,
    Untracked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub change: GitFileChange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffStat {
    pub path: String,
    pub lines_added: u32,
    pub lines_deleted: u32,
}

/// Unified diff for one file (working tree vs HEAD, or a git show of a path).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    pub path: String,
    pub diff: String,
    /// Original (HEAD / staged) content for display in a side-by-side view.
    pub original: String,
    /// Current working-tree content.
    pub current: String,
}

/// One entry of `git log`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub current: String,
    pub branches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub language: String,
}

pub fn get_default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        // Try to find the full path to the shell binary to avoid ambiguity
        if let Ok(path) = which::which("pwsh") {
            return path.to_string_lossy().to_string();
        }
        if let Ok(path) = which::which("powershell") {
            return path.to_string_lossy().to_string();
        }
        std::env::var("COMSPEC").unwrap_or_else(|_| "C:\\Windows\\System32\\cmd.exe".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}
