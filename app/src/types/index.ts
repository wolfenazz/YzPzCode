export type AgentType = "claude" | "codex" | "gemini" | "opencode" | "cursor" | "kilo" | "hermes" | "pi";

export type ToolCliType = "gh" | "stripe" | "supabase" | "valyu" | "posthog" | "elevenlabs" | "ramp" | "gws" | "agentmail" | "vercel";

export type CliType = AgentType | ToolCliType;
export type WorkspaceView = "terminal" | "agent" | "editor" | "browser" | "image";

export interface ImageEditorWorkspaceState {
  path: string | null;
}

export type AgentTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type CliStatus = "NotInstalled" | "Installed" | "Checking" | "Error";

export type CliLaunchStatus = "NotLaunched" | "Starting" | "Running" | "AuthenticationRequired" | "Error";
export type ManagedCommandStatus = "Idle" | "Starting" | "Running" | "Stopping" | "Stopped" | "Completed" | "Failed";

export type AuthStatus = "Unknown" | "Checking" | "Authenticated" | "NotAuthenticated" | "Error";

export type PrerequisiteType = "NodeJs" | "Npm" | "Git" | "Bun" | "Pnpm" | "Docker";

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
  agent: CliType;
  status: CliLaunchStatus;
  error: string | null;
  version: string | null;
}

export interface AuthInfo {
  agent: CliType;
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
  allocation: Record<CliType, number>;
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
  agent?: CliType;
  status: "idle" | "running" | "error";
  shell: string;
}

export interface ManagedTerminalCommandState {
  sessionId: string;
  workspaceId: string;
  command: string;
  status: ManagedCommandStatus;
  pid: number | null;
  exitCode: number | null;
  error: string | null;
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserViewState {
  workspaceId: string;
  label: string;
  currentUrl: string;
  visible: boolean;
  inspectMode: boolean;
}

export interface BrowserPopoutStatePayload {
  workspaceId: string;
  poppedOut: boolean;
}

export type BrowserDeviceId =
  | "responsive"
  | "desktop"
  | "tablet"
  | "ipad"
  | "ipad-mini"
  | "iphone-se"
  | "iphone-14-pro"
  | "pixel-7"
  | "galaxy-s20";

export interface BrowserDevicePreset {
  id: BrowserDeviceId;
  label: string;
  width: number | null;
  height: number | null;
  category: "desktop" | "tablet" | "mobile";
  chromeScale?: number;
}

export type BrowserDeviceOrientation = "portrait" | "landscape";

export interface BrowserPageLoadPayload {
  workspaceId: string;
  url: string;
  event: "started" | "finished";
}

export interface BrowserInspectModePayload {
  workspaceId: string;
  enabled: boolean;
}

export interface BrowserElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserViewport {
  width: number;
  height: number;
}

export interface BrowserPreviewChrome {
  radius: number;
  mode?: "iphone" | "ipad";
  topInset?: number;
  orientation?: "portrait" | "landscape";
}

export interface BrowserSelectedElement {
  tagName: string;
  id: string | null;
  className: string | null;
  textContent: string;
  htmlSnippet: string;
  selectors: string[];
  attributes: Record<string, string>;
  rect: BrowserElementRect;
  pageUrl: string;
  pageTitle: string;
  viewport: BrowserViewport;
}

export interface BrowserElementSelectedEventPayload {
  workspaceId: string;
  element: BrowserSelectedElement;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
}

export type InspectorQuickPromptGroup = 'enhance' | 'adjust';

export interface InspectorQuickPrompt {
  id: string;
  label: string;
  text: string;
  group: InspectorQuickPromptGroup;
}

export interface CapturedStyle {
  id: string;
  sourceUrl: string;
  selector: string;
  tagName: string;
  computedStyles: Record<string, string>;
  pseudoBefore?: Record<string, string>;
  pseudoAfter?: Record<string, string>;
  htmlSnippet: string;
  viewport: BrowserViewport;
  timestamp: number;
}

export interface CapturedUiElementNode {
  tagName: string;
  role: string | null;
  id?: string | null;
  className: string | null;
  attributes?: Record<string, string>;
  textPreview: string;
  htmlSnippet?: string;
  rect?: BrowserElementRect;
  computedStyles?: Record<string, string>;
  pseudoBefore?: Record<string, string> | null;
  pseudoAfter?: Record<string, string> | null;
  layout?: CapturedUiElementLayout;
  spacing?: CapturedUiElementSpacing;
  typography?: CapturedUiElementTypography;
  visuals?: CapturedUiElementVisuals;
  assets?: CapturedUiElementAsset[];
  childCount: number;
  capturedChildCount?: number;
  truncatedChildren?: boolean;
  captureStats?: {
    capturedNodeCount: number;
    maxNodes: number;
    maxDepth: number;
    maxChildrenPerNode: number;
  };
  children: CapturedUiElementNode[];
}

export interface CapturedUiElementAsset {
  type: "image" | "icon" | "background";
  sourceUrl: string;
  alt: string | null;
}

export interface CapturedUiElementLayout {
  width: string;
  height: string;
  display: string;
  position: string;
  flexDirection: string | null;
  justifyContent: string | null;
  alignItems: string | null;
  gap: string | null;
  gridTemplateColumns: string | null;
  gridTemplateRows: string | null;
}

export interface CapturedUiElementSpacing {
  margin: string;
  padding: string;
  borderRadius: string;
}

export interface CapturedUiElementTypography {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
}

export interface CapturedUiElementVisuals {
  background: string;
  color: string;
  border: string;
  boxShadow: string;
  opacity: string;
}

export interface CapturedUiElementInteractivity {
  cursor: string;
  transition: string;
  hoverSelectors: string[];
}

export interface CapturedUiElementReference {
  id: string;
  sourceUrl: string;
  pageTitle: string;
  selector: string;
  tagName: string;
  textContent: string;
  htmlSnippet: string;
  computedStyles: Record<string, string>;
  pseudoBefore?: Record<string, string>;
  pseudoAfter?: Record<string, string>;
  layout: CapturedUiElementLayout;
  spacing: CapturedUiElementSpacing;
  typography: CapturedUiElementTypography;
  visuals: CapturedUiElementVisuals;
  interactivity: CapturedUiElementInteractivity;
  assets: CapturedUiElementAsset[];
  structure: CapturedUiElementNode;
  designIntent: string;
  componentLabel: string;
  viewport: BrowserViewport;
  timestamp: number;
}

export type BrowserUiIntegrationMode = "insert" | "replace";

export interface AppliedStyle {
  targetSelector: string;
  className: string;
  cssRules: string[];
}

export interface BrowserWorkspaceState {
  currentUrl: string;
  draftUrl: string;
  isLoading: boolean;
  inspectMode: boolean;
  pickStyleMode: boolean;
  pickUiElementMode: boolean;
  applyMode: boolean;
  zoomFactor: number;
  deviceId: BrowserDeviceId;
  deviceOrientation: BrowserDeviceOrientation;
  selectedElement: BrowserSelectedElement | null;
  prompt: string;
  uiReferencePrompt: string;
  uiReferenceMode: BrowserUiIntegrationMode;
  targetSessionId: string | null;
  browserTabs: BrowserTab[];
  activeTabId: string | null;
  styleClipboard: CapturedStyle[];
  uiReferenceClipboard: CapturedUiElementReference[];
  activeUiReferenceId: string | null;
  appliedStyles: AppliedStyle[];
}

export interface BrowserPageStatePayload {
  workspaceId: string;
  url: string;
  title: string;
  historyLength: number;
}

export interface BrowserSnapshotPayload {
  workspaceId: string;
  url: string;
  title: string;
  html: string;
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

// ─── YZPZ Agent (Cline-SDK harness) ────────────────────────────────

export interface AgentHostStatus {
  running: boolean;
  connected: boolean;
  port: number | null;
  nodeMajor: number | null;
  sessions: number;
}

export interface AgentSessionSummary {
  sessionId: string;
  workspaceId: string;
  title: string | null;
  providerId: string | null;
  modelId: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  messageCount: number | null;
  preview: string | null;
  status?: string;
  maxTotalTokens?: number | null;
}

export interface AgentApprovalRequest {
  requestId: string;
  sessionId: string;
  agentId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  policy: string;
  pendingCount: number;
}

export interface AgentProviderInfo {
  id: string;
  name: string;
  baseUrl: string | null;
  defaultModelId: string | null;
  models: number;
}

export interface AgentModelReasoningOption {
  type: 'toggle' | 'effort' | 'budget_tokens';
  /** Present when type === 'effort': allowed levels (may include null/'default') */
  values?: Array<string | null>;
  /** Present when type === 'budget_tokens' */
  min?: number;
  max?: number;
}

export interface AgentModelInfo {
  id: string;
  name: string;
  contextWindow: number | null;
  maxOutput: number | null;
  capabilities?: string[];
  reasoningOptions?: AgentModelReasoningOption[];
}

/** A local file supplied with a user turn. The agent runtime receives its path
 * and only forwards rich media when the selected model supports it. */
export interface AgentAttachment {
  path: string;
  name: string;
  kind: 'image' | 'file';
}

/** One MCP server linked to the agent (from the sidecar). */
export interface AgentMcpServer {
  name: string;
  status: 'connected' | 'connecting' | 'disconnected';
  disabled: boolean;
  lastError?: string | null;
  toolCount: number;
  transport: { type: string; command?: string; args?: string[]; url?: string } | null;
}

/** One item in the agent-maintained task list. */
export interface AgentTodo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/** A pending `ask_question` decision from the agent. */
export interface AgentQuestion {
  requestId: string;
  sessionId: string;
  agentId: string;
  question: string;
  options: string[];
}

/** A CoreSessionEvent forwarded verbatim from the sidecar. */
export interface AgentCoreSessionEvent {
  type:
    | "chunk"
    | "agent_event"
    | "team_progress"
    | "pending_prompts"
    | "pending_prompt_submitted"
    | "session_snapshot"
    | "ended"
    | "hook"
    | "status";
  payload: Record<string, unknown>;
}

/** Inner AgentEvent (content/tool/usage deltas) carried inside agent_event. */
export interface AgentStreamEvent {
  type: string;
  [key: string]: unknown;
}

export interface AgentApprovalRequestEvent {
  requestId: string;
  sessionId: string;
  agentId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  policy: string;
  pendingCount: number;
}

/** Accumulated token/cost usage for a session (from the sidecar). */
export interface AgentAccumulatedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}

export interface AgentSessionUsage {
  usage?: AgentAccumulatedUsage | null;
  aggregateUsage?: AgentAccumulatedUsage | null;
}

export type AgentMode = 'ask' | 'act' | 'plan' | 'orchestrator';

/** Per-pane agent UI density: full shows every control, minimal keeps only a slim status line. */
export type AgentPaneUIMode = 'full' | 'minimal';

/** Live token delta carried by `usage`/`usage-updated` agent events. */
export interface AgentUsageDelta {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCost?: number;
}

export interface AgentTeamProgressSummary {
  teamName: string;
  updatedAt: string;
  members: {
    total: number;
    byStatus: Record<string, number>;
    leadCount: number;
    teammateCount: number;
  };
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    completionPct: number;
  };
  runs: {
    total: number;
    byStatus: Record<string, number>;
    activeRunIds: string[];
  };
  outcomes: {
    total: number;
    byStatus: Record<string, number>;
    finalizedPct: number;
  };
}

export interface AgentSubAgentActivity {
  agentId: string;
  role: 'lead' | 'teammate';
  task: string;
  status: 'running' | 'done' | 'error';
  ts: number;
  lastActivity: string;
  events: AgentSubAgentEvent[];
}

export interface AgentSubAgentEvent {
  id: string;
  kind: 'message' | 'reasoning' | 'tool' | 'result' | 'status';
  summary: string;
  ts: number;
}

export interface AgentToolPolicy {
  enabled: boolean;
  autoApprove: boolean;
}

export interface AgentToolInfo {
  id: string;
  description: string;
  defaultEnabled: boolean;
  policy: AgentToolPolicy | null;
}

export interface AgentUserInstruction {
  id: string;
  filePath: string;
  name: string;
  description: string | null;
  disabled: boolean;
  instructions: string;
}

export interface AgentGlobalSettings {
  telemetryOptOut: boolean;
  autoUpdateEnabled: boolean;
  compactionStrategy?: 'basic' | 'agentic';
  compactionEnabled?: boolean;
  planActMode?: 'plan' | 'act';
  toolAutoApprove?: boolean;
  disabledTools?: string[];
  defaultProviderId?: string | null;
}

export interface AgentSettings {
  global: AgentGlobalSettings;
  tools: AgentToolInfo[];
  providerConfigs: Array<{ providerId: string; apiKey?: string; baseUrl?: string; modelId?: string }>;
}
