export type AgentType = "claude" | "codex" | "gemini" | "opencode" | "cursor" | "kilo" | "hermes";

export type ToolCliType = "gh" | "stripe" | "supabase" | "valyu" | "posthog" | "elevenlabs" | "ramp" | "gws" | "agentmail" | "vercel";

export type AgentTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type CliStatus = "NotInstalled" | "Installed" | "Checking" | "Error";

export type CliLaunchStatus = "NotLaunched" | "Starting" | "Running" | "AuthenticationRequired" | "Error";

export type AuthStatus = "Unknown" | "Checking" | "Authenticated" | "NotAuthenticated" | "Error";

export type PrerequisiteType = "NodeJs" | "Npm" | "Git" | "Bun" | "Pnpm";

export type IdeType = "vsCode" | "visualStudio" | "cursor" | "zed" | "webStorm" | "intelliJ" | "sublimeText" | "windsurf" | "perplexity" | "antigravity";

export interface PrerequisiteStatus {
  name: string;
  prerequisiteType: PrerequisiteType;
  installed: boolean;
  version: string | null;
  minimumVersion: string;
  meetsMinimum: boolean;
  installUrl: string;
  requiredFor: string[];
}

export interface AgentCliInfo {
  agent: AgentType;
  binaryName: string;
  displayName: string;
  description: string;
  provider: string;
  status: CliStatus;
  version: string | null;
  path: string | null;
  error: string | null;
  docsUrl: string;
  iconPath: string;
}

export interface ToolCliInfo {
  tool: ToolCliType;
  binaryName: string;
  displayName: string;
  description: string;
  provider: string;
  status: CliStatus;
  version: string | null;
  path: string | null;
  error: string | null;
  docsUrl: string;
  iconPath: string;
}

export interface ToolAuthInfo {
  tool: ToolCliType;
  status: AuthStatus;
  error: string | null;
  configPath: string | null;
}

export interface InstallProgress {
  agent: AgentType;
  stage: "CheckingPrerequisites" | "Installing" | "Verifying" | "Completed" | "Failed";
  message: string;
}

export interface CliLaunchState {
  sessionId: string;
  agent: AgentType;
  status: CliLaunchStatus;
  error: string | null;
  version: string | null;
}

export interface AuthInfo {
  agent: AgentType;
  status: AuthStatus;
  error: string | null;
  configPath: string | null;
}

export interface LayoutConfig {
  type: "grid";
  sessions: number;
  rows?: number;
  cols?: number;
  openExternally?: boolean;
}

export interface AgentFleet {
  totalSlots: number;
  allocation: Record<AgentType, number>;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  path: string;
  layout: LayoutConfig;
  agentFleet: AgentFleet;
  createdAt: number;
  lastOpened?: number;
}

export interface TerminalSession {
  id: string;
  workspaceId: string;
  index: number;
  cwd: string;
  agent?: AgentType;
  status: "idle" | "running" | "error";
  shell: string;
}

export interface AgentTask {
  id: string;
  sessionId: string;
  agent: AgentType;
  prompt: string;
  cwd: string;
  status: AgentTaskStatus;
  generatedCommand?: string;
  output: string;
  error?: string;
  retryCount: number;
  createdAt: number;
  completedAt?: number;
}

export interface ExecuteAgentTaskRequest {
  sessionId: string;
  agent: AgentType;
  prompt: string;
  cwd: string;
}

export interface IdeInfo {
  ide: IdeType;
  name: string;
  binaryName: string;
  installed: boolean;
  path: string | null;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  extension: string | null;
}

export type GitFileChange = "added" | "modified" | "deleted" | "untracked";

export interface GitFileStatus {
  path: string;
  change: GitFileChange;
}

export interface GitDiffStat {
  path: string;
  linesAdded: number;
  linesDeleted: number;
}

export interface FileContent {
  content: string;
  language: string;
}

export interface FileTab {
  path: string;
  name: string;
  language: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  gitChange?: 'added' | 'modified' | 'deleted' | 'untracked';
}
