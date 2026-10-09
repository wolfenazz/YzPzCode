export type AgentType = "claude" | "codex" | "antigravity" | "opencode" | "cursor" | "kilo" | "hermes" | "pi" | "commandcode" | "cline" | "grok" | "devin" | "trae" | "kimi" | "qoder" | "copilot" | "kiro" | "mistralvibe" | "deepseektui" | "aider" | "reasonix" | "amp" | "dsh" | "codebuddy" | "mimo" | "atomcode";

export type ToolCliType = "gh" | "stripe" | "supabase" | "valyu" | "posthog" | "elevenlabs" | "ramp" | "gws" | "agentmail" | "vercel";

export type CliType = AgentType | ToolCliType;
export type WorkspaceView = "terminal" | "extensions" | "editor" | "browser" | "writing";
/** What a workspace is for. Undefined on older saved workspaces, which are coding ones. */
export type WorkspaceKind = "coding" | "writing";
export type ThemeMode = "light" | "dark" | "claude" | "yzpz" | "system" | "custom";

export type CursorStyleId =
  | "pointer"
  | "dot-ring"
  | "reticle"
  | "comet"
  | "halo"
  | "orbit"
  | "pixel"
  | "block"
  | "diamond"
  | "plus";
export type CursorSize = "small" | "medium" | "large";

/** Whether a custom theme is built on a light or dark foundation (drives zinc ramp, shadows, editor base). */
export type CustomThemeBase = "light" | "dark";

/** The nine colors a user edits; every other UI token is derived from these. */
export interface CustomThemeColors {
  /** App canvas behind every panel. */
  background: string;
  /** Panels, cards and bars. */
  surface: string;
  /** Hovered, raised and popover surfaces. */
  elevated: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  danger: string;
  terminal: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  base: CustomThemeBase;
  colors: CustomThemeColors;
  /** Base corner radius in px; control, surface and dialog radii scale from it. */
  radius: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  publisher: string;
  description: string;
  installedVersion: string | null;
  registryUrl: string;
}

export interface ExtensionInstallProgress {
  extensionId: string;
  stage: string;
  message: string;
  downloadedBytes: number;
  totalBytes: number | null;
}

export interface WorkspaceExtensionPanel {
  id: string;
  workspaceId: string;
  extensionId: string;
  name: string;
  /** 'side' docks the panel in the editor's right side panel instead of the Extensions view. */
  dock?: 'side';
}

export interface ExtensionDockState {
  open: boolean;
  width: number;
  activePanelId: string | null;
}
export type WorkspaceAuroraPalette = 'gemini' | 'sage' | 'accent' | 'custom';
export type WorkspaceBackground = 'none' | 'aurora' | 'light-rays';
export type SetupBackground = 'none' | 'galaxy' | 'aurora' | 'threads' | 'iridescence' | 'waves' | 'particles' | 'dark-veil' | 'gradient-blinds' | 'liquid-chrome' | 'plasma' | 'shape-grid';
export type RaysOrigin = 'top-center' | 'top-left' | 'top-right' | 'right' | 'left' | 'bottom-center' | 'bottom-right' | 'bottom-left';

/** Backdrop tuning for the "Configure workspace" start screen. */
export interface SetupGalaxySettings {
  intensity: number;
  density: number;
  hueShift: number;
  glowIntensity: number;
  saturation: number;
  starSpeed: number;
  speed: number;
  rotationSpeed: number;
  twinkleIntensity: number;
  repulsionStrength: number;
  mouseInteraction: boolean;
  mouseRepulsion: boolean;
  motion: boolean;
}

export interface WorkspaceLightRaysSettings {
  raysOrigin: RaysOrigin;
  raysColor: string;
  raysSpeed: number;
  lightSpread: number;
  rayLength: number;
  pulsating: boolean;
  fadeDistance: number;
  saturation: number;
  followMouse: boolean;
  mouseInfluence: number;
  noiseAmount: number;
  distortion: number;
  intensity: number;
  motion: boolean;
}

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
  kind?: WorkspaceKind;
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
  | "laptop"
  | "desktop"
  | "desktop-hd"
  | "ipad-mini"
  | "ipad"
  | "ipad-pro"
  | "iphone-se"
  | "iphone-15-pro"
  | "iphone-15-pro-max"
  | "pixel-8"
  | "galaxy-s24"
  | "custom";

export interface BrowserDevicePreset {
  id: BrowserDeviceId;
  label: string;
  width: number | null;
  height: number | null;
  category: "responsive" | "desktop" | "tablet" | "mobile" | "custom";
}

export interface BrowserViewportSize {
  width: number;
  height: number;
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
  computedStyles: Record<string, string>;
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
  favicon?: string | null;
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
  /** Viewport used by the "custom" device preset (CSS pixels). */
  customViewport: BrowserViewportSize;
  /** Reload localhost pages when workspace files change. */
  autoReload: boolean;
  selectedElement: BrowserSelectedElement | null;
  prompt: string;
  /** Multi-instruction queue: each slot holds its own HTML draft for a UI edit. */
  instructionSlots: string[];
  /** Index of the currently-active instruction slot (0-based). */
  activeInstructionSlot: number;
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
  /** null when the engine has no Navigation API (back/forward stay enabled). */
  canGoBack: boolean | null;
  canGoForward: boolean | null;
  favicon: string | null;
}

/** Payload of events that only identify their workspace. */
export interface BrowserWorkspaceEventPayload {
  workspaceId: string;
}

export type BrowserShortcutAction =
  | "focus-address"
  | "reload"
  | "hard-reload"
  | "stop"
  | "back"
  | "forward"
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "previous-tab"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "toggle-inspect";

export interface BrowserShortcutPayload {
  workspaceId: string;
  action: BrowserShortcutAction;
}

export interface BrowserOpenTabPayload {
  workspaceId: string;
  url: string;
}

/** Page-captured payloads are tagged with the workspace that captured them. */
export type WorkspaceScoped<T> = T & { workspaceId: string };

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

/** Unified diff + both sides of a single file (working tree vs HEAD). */
export interface GitFileDiff {
  path: string;
  diff: string;
  original: string;
  current: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitBranchInfo {
  current: string;
  branches: string[];
  repositoryPath: string;
}

export interface GitRemoteInfo {
  name: string;
  url: string;
  currentBranch: string;
  remoteBranch: string;
  hasUpstream: boolean;
  /** Commits the local branch is ahead of its upstream (pushable). */
  ahead: number;
  /** Commits the local branch is behind its upstream (pullable). */
  behind: number;
}

export interface FileBackupInfo {
  name: string;
  fileName: string;
  timestampMs: number;
  size: number;
}

export interface SearchResult {
  path: string;
  line: number;
  text: string;
  column: number;
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
  /** Latest conflicting disk content; null means the file was deleted. */
  diskContent?: string | null;
  recreateOnSave?: boolean;
  gitChange?: 'added' | 'modified' | 'deleted' | 'untracked';
  /** Not valid UTF-8 text and no dedicated previewer; shown in the hex viewer. */
  binary?: boolean;
}

export interface ProjectRunTarget {
  id: string;
  label: string;
  language: string;
  cwd: string;
  command: string;
  buildCommand: string | null;
  unavailableReason: string | null;
}

export interface ApplicationRunConfig {
  id: string;
  name: string;
  projectPath: string;
  workingDirectory: string;
  command: string;
  buildCommand: string;
}

// ── Android emulator & Flutter ─────────────────────────────────────────────

export type DevicePlatform = 'android' | 'ios';

/** A camera cutout over the top of an iPhone screen, in fractions of the screen width. */
export interface IosCutout {
  kind: 'island' | 'notch';
  width: number;
  height: number;
  top: number;
}

export interface IosFrame {
  /** Display corner radius in screen pixels. */
  cornerRadius: number;
  cutout: IosCutout | null;
  homeButton: boolean;
  tablet: boolean;
}

/** An Android AVD or an iOS simulator (`platform: 'ios'`, `name` is its UDID). */
export interface AvdInfo {
  name: string;
  displayName: string;
  apiLevel: number | null;
  abi: string | null;
  variant: string | null;
  device: string | null;
  width: number | null;
  height: number | null;
  density: number | null;
  path: string;
  platform?: DevicePlatform;
  /** iOS: simctl state (Booted, Shutdown, ...). */
  state?: string;
  frame?: IosFrame | null;
}

export type EmulatorPhase = 'Booting' | 'Running' | 'Stopping' | 'Stopped' | 'Failed';

export interface EmulatorInfo {
  serial: string;
  avdName: string;
  displayName: string;
  consolePort: number;
  grpcPort: number | null;
  phase: EmulatorPhase;
  /** Started by YzPzCode (hidden window, embedded screen). */
  owned: boolean;
  /** The screen can be shown in the app. */
  embeddable: boolean;
  width: number;
  height: number;
  error: string | null;
  /** Absent for Android emulators. */
  platform?: DevicePlatform;
}

export interface IosSnapshot {
  /** Xcode's simulator tools are usable (always false off macOS). */
  available: boolean;
  companionInstalled: boolean;
  devices: AvdInfo[];
  simulators: EmulatorInfo[];
  error: string | null;
}

export interface FlutterDevice {
  id: string;
  name: string;
  targetPlatform: string;
  category: string | null;
  emulator: boolean;
  sdk: string | null;
  supported: boolean;
}

export type FlutterRunPhase = 'Starting' | 'Running' | 'Reloading' | 'Restarting' | 'Stopping' | 'Stopped' | 'Failed';
export type FlutterRunMode = 'debug' | 'profile' | 'release';

export interface FlutterRunState {
  workspaceId: string;
  runId: string;
  cwd: string;
  deviceId: string;
  deviceName: string;
  mode: FlutterRunMode;
  phase: FlutterRunPhase;
  appId: string | null;
  supportsRestart: boolean;
  vmServiceUri: string | null;
  webUrl: string | null;
  message: string | null;
  error: string | null;
  exitCode: number | null;
}

export type FlutterLogLevel = 'stdout' | 'stderr' | 'error' | 'progress' | 'info';

export interface FlutterLogLine {
  workspaceId: string;
  runId: string;
  text: string;
  level: FlutterLogLevel;
}

export type SetupItemStatus = 'ok' | 'missing' | 'warning';

export interface SetupItem {
  id: string;
  label: string;
  status: SetupItemStatus;
  version: string | null;
  detail: string | null;
  path: string | null;
  fixStep: string | null;
}

export interface SetupReport {
  items: SetupItem[];
  ready: boolean;
  androidSdk: string;
  flutterRoot: string | null;
  javaHome: string | null;
  runningStep: string | null;
  /** macOS only: Xcode, a simulator and CocoaPods are ready. */
  iosReady: boolean | null;
}

export type SetupStepPhase = 'running' | 'done' | 'skipped' | 'failed';

export interface SetupProgressEvent {
  step: string;
  phase: SetupStepPhase;
  message: string | null;
  percent: number | null;
}

export interface SetupLogEvent {
  step: string;
  text: string;
  level: 'stdout' | 'stderr' | 'error' | 'info';
}

/** An AVD's device frame from its SDK skin (skin pixels, natural orientation). */
export interface DeviceSkin {
  name: string;
  frameWidth: number;
  frameHeight: number;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  cornerRadius: number | null;
  /** Data URLs. */
  background: string | null;
  mask: string | null;
  overlay: string | null;
}
