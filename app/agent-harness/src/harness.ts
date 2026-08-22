import {
  ClineCore,
  setClineDir,
  Llms,
  createUserInstructionConfigService,
  createDefaultExecutors,
  getCoreBuiltinToolCatalog,
  readGlobalSettings,
  setCompactionModeGlobally,
  setPlanActModeGlobally,
  setToolAutoApproveGlobally,
  setDisabledTools,
  setTelemetryOptOutGlobally,
  setAutoUpdateEnabledGlobally,
  parseSkillConfigFromMarkdown,
  parseWorkflowConfigFromMarkdown,
  parseRuleConfigFromMarkdown,
  InMemoryMcpManager,
  createDefaultMcpServerClientFactory,
  resolveDefaultMcpSettingsPath,
  resolveMcpServerRegistrations,
  registerMcpServersFromSettingsFile,
  isOAuthProvider,
  getProviderConfigFields,
  loginOpenAICodex,
  getValidOpenAICodexCredentials,
  formatProviderOAuthApiKey,
  ProviderSettingsManager,
  saveProviderOAuthCredentials,
  getProviderAuthStorageId,
  type CoreSessionEvent,
  type OAuthCredentials,
  type UserInstructionConfigService,
  type UserInstructionConfigType,
  type UserInstructionConfigRecord,
  type ToolCatalogEntry,
  type AgentTool,
  type AgentToolContext,
  type AskQuestionExecutor,
  type ToolExecutors,
  type McpServerRegistration,
  type McpServerSnapshot,
  type McpServerTransportConfig,
} from "@cline/sdk";
import type { ToolApprovalRequest, ToolApprovalResult, ToolPolicy } from "@cline/core";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";
import { buildSystemPrompt } from "./branding.js";
import { accumulateUsage, enforceBudget, usageTotal, zeroUsage, type UsageTotals } from "./budget.js";
import { ProviderConfigStore } from "./store.js";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  GREP_MAX_LINE_LENGTH,
  formatSize,
  truncateHead,
  truncateLine,
  truncateTail,
} from "./truncate.js";
import type {
  ApprovalRequestPayload,
  McpServerView,
  QuestionRequestPayload,
  TodoItem,
  TodoUpdatedPayload,
} from "./protocol.js";

export type EventSink = (name: string, payload: unknown) => void;

const APPROVAL_TIMEOUT_MS = 600_000; // 10 min; auto-deny on timeout

// ── Token-efficiency knobs ────────────────────────────────────────────────
// The SDK triggers compaction relative to the model's effective context window.
// Always preserve the provider-advertised window here: replacing it with a
// smaller local budget makes a 1M-token session compact around 90k tokens.
// Cap model output per API call so turns cannot ramble.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
// Hard ceiling on loop iterations (prevents runaway tool loops). 40 lets a
// single turn grind through a genuinely long multi-file task; the completion
// guard + error recovery drive additional turns when needed.
const DEFAULT_MAX_ITERATIONS = 40;
// Recent context preserved verbatim after compaction. Scaled to today's larger
// context windows: 12k was proportionally tiny and made long tasks lose track
// of what they had just done after a compaction.
const COMPACTION_PRESERVE_RECENT_TOKENS = 24_000;

// @cline/llms validates image content before building the provider request.
// `userImages` must be a data URL or base64 string; a local Windows path is
// not a valid image payload and becomes "[media omitted...]". Keep these
// limits aligned with the SDK's default media budget so failures are explicit
// before the request is handed to the model adapter.
const MAX_IMAGE_ENCODED_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DECODED_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const imageDataUrl = (path: string, index: number, totalBytes: number): string => {
  const extension = extname(path).toLowerCase();
  const mediaType = SUPPORTED_IMAGE_MIME_TYPES[extension];
  if (!mediaType) {
    throw new Error(`Image ${index + 1} has an unsupported format. Use PNG, JPEG, GIF, or WebP.`);
  }

  if (totalBytes > MAX_IMAGE_DECODED_BYTES) {
    throw new Error(`Image ${index + 1} is too large (${totalBytes} bytes). Images must be 6 MB or smaller.`);
  }

  const base64 = readFileSync(path).toString("base64");
  const encodedBytes = Buffer.byteLength(base64, "ascii");
  if (encodedBytes > MAX_IMAGE_ENCODED_BYTES) {
    throw new Error(`Image ${index + 1} is too large after encoding. Choose an image under about 3.7 MB.`);
  }

  return `data:${mediaType};base64,${base64}`;
};

const resolveUserImages = (userImages: string[]): string[] => {
  let totalBytes = 0;
  return userImages.map((image, index) => {
    if (image.trim().toLowerCase().startsWith("data:image/")) return image;

    let size: number;
    try {
      size = statSync(image).size;
    } catch {
      throw new Error(`Could not read image ${index + 1}. The file may have been moved or deleted.`);
    }
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_MEDIA_BYTES) {
      throw new Error("The selected images are too large together. Send fewer images or smaller copies.");
    }
    return imageDataUrl(image, index, size);
  });
};

/** Extract a useful message from SDK errors before they cross the JSON
 * sidecar boundary. Native Error objects serialize as `{}`, which used to
 * turn actionable provider failures into "The task stopped unexpectedly.". */
const errorMessageFromUnknown = (value: unknown): string => {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["message", "error", "reason", "details"]) {
    const message = errorMessageFromUnknown(record[key]);
    if (message) return message;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" ? serialized : "";
  } catch {
    return "";
  }
};

/** Shared skills are user-level capabilities, never workspace-local state. */
const uniqueDirectories = (directories: string[]): string[] => {
  const seen = new Set<string>();
  return directories.filter((directory) => {
    const key = process.platform === "win32" ? directory.toLowerCase() : directory;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const globalSkillDirectories = (dataDir?: string): string[] => {
  const home = homedir();
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  return uniqueDirectories([
    ...(dataDir ? [join(dataDir, "skills")] : []),
    join(home, ".config", "opencode", "skills"),
    ...(xdgConfigHome ? [join(xdgConfigHome, "opencode", "skills")] : []),
    join(home, ".codex", "skills"),
    join(home, ".claude", "skills"),
    join(home, ".agents", "skills"),
  ]);
};

const compatibleSkillDirectories = (dataDir: string): string[] => globalSkillDirectories(dataDir);

/**
 * Compact one-line hints for every installed skill, read from the skill
 * directories so the model knows what is available without probing the tool
 * catalog. Scans `<skill>/SKILL.md` packages (one level deep) plus loose
 * `.md` files. Returns `name: short description` lines, deduped, disabled
 * skills skipped, bounded to keep the prompt cheap.
 */
// Hints are a pure function of the data dir, so cache them: every session
// create used to re-scan every skill package, adding disk I/O to the
// create/resume hot path.
const skillHintsCache = new Map<string, string[]>();
const skillHints = (dataDir: string): string[] => {
  const cached = skillHintsCache.get(dataDir);
  if (cached) return cached;

  const MAX_SKILL_HINTS = 40;
  const hints: string[] = [];
  const seen = new Set<string>();
  const consider = (name: string, raw: string): void => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    try {
      const item = parseSkillConfigFromMarkdown(raw, name);
      if (item.disabled) return;
      const desc = (item.description ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
      hints.push(desc ? `${name}: ${desc}` : name);
    } catch {
      hints.push(name);
    }
  };
  for (const directory of compatibleSkillDirectories(dataDir)) {
    if (!existsSync(directory)) continue;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (hints.length >= MAX_SKILL_HINTS) break;
      if (entry.isDirectory()) {
        const skillFile = join(directory, entry.name, "SKILL.md");
        if (existsSync(skillFile)) {
          try {
            consider(entry.name, readFileSync(skillFile, "utf8"));
          } catch {
            // unparsable — skip
          }
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const name = entry.name.replace(/\.md$/, "");
        try {
          consider(name, readFileSync(join(directory, entry.name), "utf8"));
        } catch {
          // unparsable — skip
        }
      }
    }
  }
  skillHintsCache.set(dataDir, hints);
  return hints;
};


const markdownFilesUnder = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  const directories = [directory];
  while (directories.length > 0) {
    const current = directories.pop();
    if (!current) continue;
    try {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const filePath = join(current, entry.name);
        if (entry.isDirectory()) {
          directories.push(filePath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          files.push(filePath);
        }
      }
    } catch {
      // An unreadable global skill directory should not hide the remaining catalog.
    }
  }
  return files;
};

// Read-only tools are auto-approved by default; mutations require approval.
// Keys must match the SDK's resolved tool IDs (getCoreBuiltinToolCatalog):
// the newer runtime folds file ops into `editor` and exposes a `teams` group.
const DEFAULT_TOOL_POLICIES: Record<string, ToolPolicy> = {
  read_files: { enabled: true, autoApprove: true },
  search_codebase: { enabled: true, autoApprove: true },
  run_commands: { enabled: true, autoApprove: false },
  fetch_web_content: { enabled: true, autoApprove: true },
  editor: { enabled: true, autoApprove: false },
  skills: { enabled: true, autoApprove: true },
  ask_question: { enabled: true, autoApprove: true },
  spawn_agent: { enabled: true, autoApprove: true },
  teams: { enabled: true, autoApprove: true },
  // Custom harness tool (registered via extraTools) — never blocks on approval.
  todo_write: { enabled: true, autoApprove: true },
};

interface PendingApproval {
  resolve: (result: ToolApprovalResult) => void;
  timer: NodeJS.Timeout;
  request: ToolApprovalRequest;
}

interface PendingQuestion {
  resolve: (answer: string) => void;
  timer: NodeJS.Timeout;
  sessionId: string;
  question: string;
  options: string[];
}

/** One user prompt queued behind the running turn (authoritative queue view). */
interface QueuedPromptEntry {
  /** Stable id used by the renderer to cancel or track this prompt. */
  id: string;
  prompt: string;
  delivery: "queue";
  attachmentCount: number;
  mode?: string;
  userImages: string[];
  userFiles: string[];
}

/** Instruction injected into the system prompt so agents maintain a task list. */
const TODO_INSTRUCTION = [
  "",
  "TASK LIST MAINTENANCE",
  "Use the `todo_write` tool to keep a visible task list for the user. Break the current task into small steps and create them as `pending` todos.",
  "Mark a todo `in_progress` right before you start working on it, and `completed` when you finish it. Update the whole list in a single call each time it changes.",
  "If the user asks a follow-up that extends the task, add the new steps. Never invent todos for work you are not planning to do.",
].join("\n");

/** Per-message directive prepended when the session is in Fast mode. */
const FAST_MODE_DIRECTIVE = [
  "",
  "FAST MODE — SPEED IS THE PRIORITY",
  "The user enabled Fast mode: complete this request as fast as possible. Follow these rules strictly:",
  "- Do not think out loud or show chain-of-thought. Skip deliberation entirely and act.",
  "- Pick the simplest correct approach on the first try and execute it immediately. Do not explore alternatives.",
  "- Minimize tool round-trips: read only what you strictly need (no full-file dumps), make edits in the fewest operations, and never re-read files you already saw.",
  "- Do not ask clarifying questions unless the task is genuinely impossible to start — make the most reasonable assumption and proceed.",
  "- Do not create a task list for simple tasks. Only use todo_write for genuinely multi-step work, and keep it short.",
  "- Do not run tests or extra verification unless the change is risky or the user asked for it.",
  "- Final reply: one or two short sentences on what was done. No step-by-step narration.",
  "Execute now, fast.",
].join("\n");

/** One-time notice injected when Fast mode is turned OFF, so the model stops
 *  applying fast-mode rules that are still present in the conversation history. */
const FAST_MODE_OFF_NOTICE = [
  "",
  "FAST MODE IS NOW OFF",
  "The user disabled Fast mode. You are back in normal mode: stop following the fast-mode rules you were given earlier. Reason normally, explain your work, and take whatever steps the task requires.",
].join("\n");

/**
 * Tools that are blocked while a session is in a read-only mode ("ask" Q&A or
 * "plan" planning). Mirrors the SDK's real built-in tool names (read_files,
 * search_codebase, run_commands, fetch_web_content, apply_patch, editor,
 * skills, ask_question, submit_and_exit). Extra aliases are kept defensively in
 * case tool naming changes between SDK versions. `team_*` tools are blocked
 * separately (prefix match) because spawning/running teammates would let an
 * agent side-step read-only enforcement.
 */
const READONLY_BLOCKED_TOOLS = new Set([
  "editor",
  "apply_patch",
  "run_commands",
  "skills",
  "spawn_agent",
  "submit_and_exit",
  // Defensive aliases (older/newer SDK tool names)
  "write_file",
  "create_file",
  "delete_file",
  "rename_file",
]);

/** True when a session's mode is hard-enforced read-only. */
const isReadOnlyMode = (mode: string | undefined): boolean => mode === "ask" || mode === "plan";

const ASK_MODE_REASON =
  "Ask mode is read-only — it answers questions and can read/search/fetch, but it never edits files or runs commands. Switch to Act to modify files or execute commands.";

const PLAN_MODE_REASON =
  "Plan mode is read-only — explore, analyze, and present a plan. You may read/search/fetch, but you never edit, create, or delete files and you never run commands. Switch to Act to execute changes.";

interface CreateSessionArgs {
  sessionId?: string;
  workspaceId: string;
  cwd: string;
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  title?: string;
  enableAgentTeams?: boolean;
  teamName?: string;
  compactionStrategy?: "basic" | "agentic";
  /** Max cumulative total tokens for the session (input + output + cacheRead);
   *  0 or omitted = unlimited. Enforced in afterModelHook against the
   *  per-session accumulated usage. */
  maxTotalTokens?: number;
}

/** Per-tool policy persisted globally in the YZPZ Agent data dir. */
export interface ToolPolicyEntry {
  enabled: boolean;
  autoApprove: boolean;
}

export class ToolPolicyStore {
  private file: string;
  private policies: Record<string, ToolPolicyEntry> = {};

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "tool-policies.json");
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.file)) {
        this.policies = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, ToolPolicyEntry>;
      }
    } catch {
      this.policies = {};
    }
  }

  private save(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.policies, null, 2), "utf8");
    } catch (err) {
      console.warn(`[yzpz-agent] failed to persist tool policies: ${err}`);
    }
  }

  getAll(): Record<string, ToolPolicyEntry> {
    return { ...this.policies };
  }

  set(name: string, policy: Partial<ToolPolicyEntry>): void {
    const cur = this.policies[name] ?? { enabled: true, autoApprove: false };
    this.policies[name] = {
      enabled: policy.enabled ?? cur.enabled,
      autoApprove: policy.autoApprove ?? cur.autoApprove,
    };
    this.save();
  }

  clear(name: string): void {
    delete this.policies[name];
    this.save();
  }
}

export class AgentHarness {
  private cline: ClineCore | null = null;
  private started = false;
  private initPromise: Promise<void> | null = null;
  private approvals = new Map<string, PendingApproval>();
  private questions = new Map<string, PendingQuestion>();
  private sessionModes = new Map<string, string>();
  /**
   * Per-session team state captured from `team_progress` events. Drives the
   * completion-guard dedup (skip todo nudges while teammates still work) and
   * the "teammates still running" notice on abort/stop.
   */
  private teamStateBySession = new Map<string, { activeRunIds: string[]; activeTasks: number }>();
  private mcpManager: InMemoryMcpManager | null = null;
  private stores = new Map<string, ProviderConfigStore>();
  private toolPolicyStore: ToolPolicyStore | null = null;
  private sink: EventSink = () => undefined;
  private userInstructionServices = new Map<string, UserInstructionConfigService>();
  private globalUserInstructionService: UserInstructionConfigService | null = null;
  /** Sessions currently alive in the SDK's in-memory runtime (resumable in place). */
  private activeSessions = new Set<string>();
  /**
   * Sessions with a model turn currently in flight. This is deliberately
   * separate from `activeSessions`: a freshly created or completed session is
   * alive, but its next user message must start a normal turn rather than be
   * queued as a follow-up steer message.
   */
  private runningSessions = new Set<string>();
  /** Sessions between queue selection/resume and the synchronous SDK send. */
  private startingSessions = new Set<string>();
  /**
   * Authoritative per-session queue of user prompts received while a turn is
   * in flight. This queue intentionally does not use the SDK's `steer` channel:
   * steering injects text into the active task, while the composer promises
   * that queued prompts start only after that task has completed.
   */
  private queuedPromptsBySession = new Map<string, QueuedPromptEntry[]>();
  /** Workspace root per session — used to resolve relative file paths correctly. */
  private sessionCwd = new Map<string, string>();
  /**
   * Cumulative token usage per session, accumulated from `usage` /
   * `usage-updated` agent events. Drives the live usage meter and the
   * total-token budget enforced in afterModelHook.
   */
  private usageBySession = new Map<string, UsageTotals>();
  /** Per-session max total tokens (0 = unlimited). */
  private budgets = new Map<string, number>();
  /**
   * Sessions whose cumulative token budget was hit. Suppresses the completion
   * guard / auto-continue so a budget stop doesn't burn extra model calls
   * chasing unfinished todos. Cleared when the session is (re)started.
   */
  private budgetStoppedSessions = new Set<string>();
  /**
   * Automatic error-recovery state. When a run fails, the harness steers a
   * bounded recovery turn (retry transient provider errors, otherwise continue
   * unfinished work) so a transient failure never dead-ends the session.
   */
  private recoveryAttempts = new Map<string, number>();
  /** Timestamp of the last recovery steer per session — dedups the same error surfacing via multiple channels (agent_event + status + send rejection). */
  private recoveryWindow = new Map<string, number>();
  /** Sessions the user explicitly aborted/stopped — never auto-recover those. */
  private suppressRecovery = new Set<string>();
  /** Error captured while the SDK is still unwinding a failed turn. */
  private pendingRecoveryErrors = new Map<string, string>();
  /** Delayed fallback for send() rejections that do not emit an ended event. */
  private recoveryTimers = new Map<string, NodeJS.Timeout>();
  /** Sessions with Fast mode enabled (persisted in session metadata). */
  private fastModes = new Map<string, boolean>();
  /** Last fast-mode state applied per session — lets sendMessage inject the
   *  speed directive only on ON/OFF transitions instead of every message. */
  private previousFastModes = new Map<string, boolean>();
  /** Sessions that already got the "recovery exhausted" notice (emit once). */
  private recoveryExhausted = new Set<string>();
  readonly dataDir: string;
  private prefsFile: string;
  private prefs: Record<string, unknown>;
  /** Open id-style prompt resolvers used during an OAuth login flow (requestId -> answer). */
  private oauthPromptResolvers = new Map<string, (answer: string) => void>();
  /** Cache of the SDK's provider-settings store, used to persist OAuth
   *  credentials so the local runtime can refresh them mid-session. Lazily
   *  created after `setClineDir` so it resolves to the same file the runtime
   *  reads. */
  private oauthSettingsManager: ProviderSettingsManager | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.prefsFile = join(dataDir, "prefs.json");
    this.prefs = this.loadPrefs();
  }

  private loadPrefs(): Record<string, unknown> {
    try {
      if (existsSync(this.prefsFile)) {
        return JSON.parse(readFileSync(this.prefsFile, "utf8")) as Record<string, unknown>;
      }
    } catch {
      // ignore malformed prefs
    }
    return {};
  }

  private savePrefs(): void {
    try {
      writeFileSync(this.prefsFile, JSON.stringify(this.prefs, null, 2), "utf8");
    } catch (err) {
      console.warn(`[yzpz-agent] failed to persist prefs: ${err}`);
    }
  }

  setEventSink(sink: EventSink): void {
    this.sink = sink;
    if (this.cline) {
      this.attachSubscriptions();
    }
  }

  setProviderStore(store: ProviderConfigStore): void {
    this.stores.set("default", store);
  }

  getProviderStore(): ProviderConfigStore {
    const store = this.stores.get("default");
    if (store) return store;
    const created = new ProviderConfigStore(this.dataDir);
    this.stores.set("default", created);
    return created;
  }

  getToolPolicyStore(): ToolPolicyStore {
    if (!this.toolPolicyStore) {
      this.toolPolicyStore = new ToolPolicyStore(this.dataDir);
    }
    return this.toolPolicyStore;
  }

  async init(): Promise<void> {
    if (this.started) return;
    // Rebrand the data directory away from ~/.cline.
    try {
      setClineDir(this.dataDir);
    } catch (err) {
      console.warn(`[yzpz-agent] setClineDir failed (${err}); using default location`);
    }

    this.cline = await ClineCore.create({
      clientName: "yzpz-agent",
      backendMode: "local",
      toolPolicies: this.buildToolPolicies() as never,
      capabilities: {
        requestToolApproval: async (request: ToolApprovalRequest) => this.handleApproval(request),
        toolExecutors: {
          askQuestion: this.handleAskQuestion.bind(this) as AskQuestionExecutor,
          readFile: this.buildReadFileExecutor(),
        } as ToolExecutors,
      },
    });
    await this.initMcpManager();
    this.started = true;
    this.attachSubscriptions();
  }

  /** Connect the persistent MCP manager so the UI can show live server status. */
  private async initMcpManager(): Promise<void> {
    try {
      const settingsPath = resolveDefaultMcpSettingsPath();
      this.mcpManager = new InMemoryMcpManager({
        clientFactory: createDefaultMcpServerClientFactory({ settingsPath, clientName: "yzpz-agent" }),
      });
      let registrations: McpServerRegistration[] = [];
      try {
        registrations = resolveMcpServerRegistrations();
      } catch {
        // settings file not created yet — nothing to register
        registrations = [];
      }
      // Register every server so `list-mcp-servers` is correct immediately, but
      // connect enabled servers in the background: a slow or misconfigured MCP
      // endpoint used to block ClineCore readiness by seconds and put that wait
      // on the critical path of the first create-session/resume.
      for (const reg of registrations) {
        try {
          await this.mcpManager.registerServer(reg);
        } catch (err) {
          console.warn(`[yzpz-agent] failed to register MCP server "${reg.name}": ${err}`);
        }
      }
      const enabled = registrations.filter((reg) => !reg.disabled);
      if (enabled.length > 0) {
        void Promise.allSettled(enabled.map((reg) => this.connectMcpServer(reg.name)));
      }
    } catch (err) {
      console.warn(`[yzpz-agent] MCP manager init failed: ${err}`);
    }
  }

  /** Best-effort MCP connect with a bounded timeout so one flaky server can
   *  never stall the harness. Connects proceed in the background; availability
   *  is surfaced live through server-status events. */
  private async connectMcpServer(name: string): Promise<void> {
    const manager = this.mcpManager;
    if (!manager) return;
    const timeoutMs = 10_000;
    let timer: NodeJS.Timeout | undefined;
    const timed = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`connect timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      await Promise.race([manager.connectServer(name), timed]);
    } catch (err) {
      console.warn(`[yzpz-agent] MCP server "${name}" connect failed: ${err}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * The agent's `ask_question` tool. Emits a question to the UI and resolves
   * when the user answers (or times out to the first option).
   */
  private async handleAskQuestion(
    question: string,
    options: string[],
    context: AgentToolContext,
  ): Promise<string> {
    const requestId = randomUUID();
    const payload: QuestionRequestPayload = {
      requestId,
      sessionId: context.sessionId ?? "",
      agentId: context.agentId,
      question,
      options: options.length > 0 ? options : ["Continue"],
    };
    const answer = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.questions.delete(requestId);
        resolve(payload.options[0]);
      }, 600_000); // 10 min; auto-pick first option on timeout
      this.questions.set(requestId, { resolve, timer, sessionId: context.sessionId ?? "", question, options });
      this.sink("question-request", payload);
    });
    this.questions.delete(requestId);
    return answer;
  }

  /** Resolve a pending ask_question request with the user's chosen answer. */
  answerQuestion(requestId: string, answer: string): boolean {
    const pending = this.questions.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.questions.delete(requestId);
    pending.resolve(answer);
    return true;
  }

  /**
   * Custom `read_files` executor. The SDK's built-in executor resolves relative
   * paths against `process.cwd()` (the harness's own directory), not the user's
   * workspace — so search results like `documentation.md` could never be read.
   * We resolve relative paths against the session's workspace root first, then
   * delegate to the SDK's default executor (keeps image support, line ranges,
   * size limits, and error formatting intact).
   */
  private buildReadFileExecutor(): NonNullable<ToolExecutors["readFile"]> {
    const defaultExecutors = createDefaultExecutors();
    const defaultRead = defaultExecutors.readFile;
    const self = this;
    if (!defaultRead) {
      throw new Error("SDK did not provide a default readFile executor");
    }
    return async (
      request: { path: string; start_line?: number | null; end_line?: number | null },
      context: AgentToolContext,
    ) => {
      const cwd = self.sessionCwd.get(context.sessionId ?? "");
      const path = cwd && !isAbsolute(request.path) ? join(cwd, request.path) : request.path;
      return defaultRead({ ...request, path }, context);
    };
  }

  /** Custom `todo_write` tool registered on every session via extraTools. */
  private buildTodoWriteTool(): AgentTool {
    const self = this;
    return {
      name: "todo_write",
      description:
        "Create or update the visible task list. Break the current task into steps, create them as 'pending', mark one 'in_progress' before starting it, and 'completed' when finished. Send the full updated list every time.",
      inputSchema: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            description: "The full task list.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable identifier for the item." },
                content: { type: "string", description: "What needs to be done." },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              },
              required: ["content"],
            },
          },
        },
        required: ["todos"],
      },
      async execute(input: unknown, context: AgentToolContext): Promise<string> {
        const raw = (input ?? {}) as { todos?: Array<{ id?: string; content?: string; status?: string }> };
        const todos: TodoItem[] = (raw.todos ?? [])
          .filter((t) => t && typeof t.content === "string" && t.content.trim().length > 0)
          .map((t, i) => ({
            id: t.id?.trim() || `t${i + 1}`,
            content: t.content as string,
            status: t.status === "completed" || t.status === "in_progress" ? t.status : "pending",
          }));
        const payload: TodoUpdatedPayload = { sessionId: context.sessionId ?? "", todos };
        self.recordTodos(context.sessionId ?? "", todos);
        self.sink("todo-updated", payload);
        return `Task list updated: ${todos.length} item(s).`;
      },
    };
  }

  /** Await a single shared init so concurrent commands don't race ClineCore.create. */
  ensureInit(): Promise<void> {
    if (this.started) return Promise.resolve();
    if (!this.initPromise) {
      this.initPromise = this.init().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private attachSubscriptions(): void {
    if (!this.cline) return;
    this.cline.subscribe((event: CoreSessionEvent) => {
      // Queue events are handled authoritatively by this harness. Native SDK
      // pending prompts are steering messages, which have deliberately
      // different semantics from the composer's run-after-completion queue.
      if (event.type === "pending_prompt_submitted") {
        return;
      }
      if (event.type === "pending_prompts") {
        return; // mirror-driven events are emitted on every queue change
      }
      this.sink("session-event", event);
      // Cumulative usage telemetry: intercept usage deltas from the SDK and
      // accumulate them per session so the frontend can render a live meter
      // and the afterModelHook budget guard can enforce a total-token cap.
      // The inner event shape is event.payload.event (see the `done` handling
      // below); malformed payloads are skipped, never thrown on.
      if (
        event.type === "agent_event" &&
        (event.payload?.event?.type === "usage" || event.payload?.event?.type === "usage-updated")
      ) {
        const sessionId =
          typeof event.payload?.sessionId === "string" ? event.payload.sessionId : undefined;
        const inner = (event.payload?.event ?? {}) as Record<string, unknown>;
        if (sessionId) {
          const prev = this.usageBySession.get(sessionId) ?? zeroUsage();
          const usage = accumulateUsage(prev, inner);
          this.usageBySession.set(sessionId, usage);
          this.sink("usage-updated", { sessionId, usage });
          // Keep the current provider-request size separate from cumulative
          // session usage. A compacted conversation can have a small prompt
          // while its lifetime usage is large; displaying the latter as
          // "Context" made successful compaction look like a failure.
          const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
          this.sink("context-updated", {
            sessionId,
            inputTokens: num(inner.inputTokens),
            cacheReadTokens: num(inner.cacheReadTokens),
            totalTokens: num(inner.inputTokens) + num(inner.cacheReadTokens),
          });
        }
      }
      if (event.type === "status") {
        const status = String(event.payload.status ?? "").toLowerCase();
        // Do NOT derive the in-flight turn state from the SDK's status events.
        // The SDK emits a spurious "running" while a session is being created
        // (and can re-emit statuses out of order), which made a freshly opened
        // session look busy and pushed the user's very first message into the
        // steer queue with no running turn to drain it. `runningSessions` is
        // now owned by sendMessage/lifecycle handlers only.
        this.sink("session-status", { sessionId: event.payload.sessionId, status: event.payload.status });
        // A run that ended in "failed" without a matching error agent_event
        // (e.g. loop-detection hard stop) still deserves recovery. The dedup
        // window keeps this from double-steering when the error event also
        // fired for the same failure.
        if (status === "failed") {
          // A failed turn is no longer eligible for user steering. Clear the
          // flag now, but wait for `ended` before starting recovery so the SDK
          // has fully released the failed runtime.
          this.runningSessions.delete(event.payload.sessionId);
          this.deferRecoveryAfterError(event.payload.sessionId, "The task stopped before completing.");
        }
      } else if (event.type === "ended") {
        // The SDK removes the session from its in-memory runtime when it ends
        // (failure / teardown). Keep our tracking in sync so a later send can
        // transparently rehydrate it from disk.
        this.activeSessions.delete(event.payload.sessionId);
        this.runningSessions.delete(event.payload.sessionId);
        this.startingSessions.delete(event.payload.sessionId);
        this.teamStateBySession.delete(event.payload.sessionId);
        this.sink("session-ended", event.payload);
        // `agent_event:error` arrives before the SDK has finished tearing down
        // the runtime. Start recovery only after `ended`, otherwise the retry
        // races the old turn and the SDK rejects it with state="running".
        const pendingError = this.pendingRecoveryErrors.get(event.payload.sessionId);
        if (pendingError) {
          this.clearRecoveryTimer(event.payload.sessionId);
          this.pendingRecoveryErrors.delete(event.payload.sessionId);
          this.maybeRecoverAfterError(event.payload.sessionId, pendingError);
        }
      } else if (event.type === "team_progress") {
        this.recordTeamProgress(event.payload);
        this.sink("team-progress", event.payload);
      } else if (event.type === "agent_event" && event.payload?.event?.type === "done") {
        this.runningSessions.delete(event.payload.sessionId);
        // PI-style completion guard: if the model stopped while the visible
        // task list still has unfinished items, steer a follow-up so it keeps
        // working instead of stopping prematurely. Native `delivery:"steer"`
        // drains after the current turn and starts the next one automatically.
        const continuingCurrentTask = this.maybeAutoContinue(event.payload.sessionId);
        if (!continuingCurrentTask) {
          // Let the SDK finish publishing the current `done` event before a
          // separate queued turn enters the runtime.
          setTimeout(() => void this.startNextQueuedPrompt(event.payload.sessionId), 0);
        }
      } else if (event.type === "agent_event" && event.payload?.event?.type === "error") {
        // Automatic error recovery: never leave the user at a dead end after a
        // failed turn. Retry transient provider errors, or steer a recovery
        // turn when there is unfinished work (bounded + deduped + suppressed
        // after a user abort).
        this.runningSessions.delete(event.payload.sessionId);
        const inner = (event.payload?.event ?? {}) as Record<string, unknown>;
        const errorMessage =
          errorMessageFromUnknown(inner.error) ||
          errorMessageFromUnknown(inner.message) ||
          "The task stopped unexpectedly.";
        // The SDK emits this event before it transitions the session to
        // `failed`/`ended`; defer until the runtime is safe to re-enter.
        this.deferRecoveryAfterError(event.payload.sessionId, errorMessage);
      }
    });
  }

  /** Max follow-up nudges per session before we trust the model's stop. Kept
   *  deliberately small: forcing many continuations makes the model invent
   *  extra work (hallucinate) instead of stopping when the task is done. */
  private static MAX_COMPLETION_NUDGES = 3;

  /** Max automatic recovery turns after errors before handing control back to the user. */
  private static MAX_RECOVERY_ATTEMPTS = 2;
  /** Dedup window: the same failure often surfaces via agent_event + status + send rejection. */
  private static RECOVERY_DEDUP_MS = 3000;
  /** Transient provider failures worth an automatic retry even with no unfinished todos. */
  private static RETRYABLE_ERROR_RE =
    /(429|5\d\d|rate.?limit|quota|timeout|timed out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|temporarily|overloaded|unavailable|too many requests|try again|busy)/i;

  private isRetryableError(message: string): boolean {
    return AgentHarness.RETRYABLE_ERROR_RE.test(message);
  }

  private clearRecoveryTimer(sessionId: string): void {
    const timer = this.recoveryTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.recoveryTimers.delete(sessionId);
  }

  /**
   * Hold recovery until the failed SDK runtime is fully settled. Most failures
   * emit `ended`, while an early `send()` rejection may not, so keep a bounded
   * delayed fallback for the latter.
   */
  private deferRecoveryAfterError(sessionId: string, errorMessage: string): void {
    const message = errorMessageFromUnknown(errorMessage) || "The task stopped unexpectedly.";
    const existing = this.pendingRecoveryErrors.get(sessionId);
    // Preserve the provider's detailed message when a later lifecycle event
    // contributes only its generic "stopped" fallback.
    if (
      !existing ||
      existing === "The task stopped before completing." ||
      existing === "The task stopped unexpectedly."
    ) {
      this.pendingRecoveryErrors.set(sessionId, message);
    }
    if (this.recoveryTimers.has(sessionId)) return;

    const settleDeadline = Date.now() + 5_000;
    const recoverPending = (): void => {
      const pending = this.pendingRecoveryErrors.get(sessionId);
      if (!pending) return;
      this.pendingRecoveryErrors.delete(sessionId);
      this.maybeRecoverAfterError(sessionId, pending);
    };
    const retryWhenSettled = (): void => {
      this.recoveryTimers.delete(sessionId);
      const runtimeStillSettling = this.runningSessions.has(sessionId) || this.activeSessions.has(sessionId);
      if (runtimeStillSettling && Date.now() < settleDeadline) {
        const timer = setTimeout(retryWhenSettled, 250);
        this.recoveryTimers.set(sessionId, timer);
        return;
      }

      if (runtimeStillSettling) {
        // A runtime that never publishes `ended` used to leave a 250 ms timer
        // alive forever. Abort the stale turn once, then recover from a clean
        // boundary rather than starting a competing request.
        this.runningSessions.delete(sessionId);
        void this.requireCline()
          .abort(sessionId)
          .catch(() => undefined)
          .finally(recoverPending);
        return;
      }
      recoverPending();
    };

    this.recoveryTimers.set(sessionId, setTimeout(retryWhenSettled, 500));
  }

  /**
   * Automatic error recovery. After a failed turn, steer a recovery turn so the
   * agent can diagnose the failure and keep going WITHOUT waiting for the user
   * to click "Continue". This is unconditional: transient provider errors
   * (rate limits, 5xx, timeouts) AND any other failure — including SDK errors
   * that carry an empty message and task lists with no unfinished items (a
   * Q&A turn, a short edit) — all get a recovery attempt. Safety is provided
   * by the per-session attempt budget, the dedup window, and the user-abort /
   * budget-stop / team-work suppression below.
   */
  private maybeRecoverAfterError(sessionId: string, errorMessage: string): void {
    if (this.budgetStoppedSessions.has(sessionId)) return;
    if (this.teamWorkPending(sessionId)) return;
    if (this.suppressRecovery.has(sessionId)) return;

    const now = Date.now();
    const lastRecovery = this.recoveryWindow.get(sessionId) ?? 0;
    if (now - lastRecovery < AgentHarness.RECOVERY_DEDUP_MS) return;

    const attempts = this.recoveryAttempts.get(sessionId) ?? 0;
    if (attempts >= AgentHarness.MAX_RECOVERY_ATTEMPTS) {
      // Tell the user once that auto-recovery gave up, so they know a manual
      // nudge is needed instead of silently stopping.
      if (!this.recoveryExhausted.has(sessionId)) {
        this.recoveryExhausted.add(sessionId);
        this.sink("notice", {
          sessionId,
          message: "Automatic recovery is exhausted for this task — the agent needs your input to continue.",
        });
      }
      return;
    }

    const retryable = this.isRetryableError(errorMessage);

    this.recoveryWindow.set(sessionId, now);
    this.recoveryAttempts.set(sessionId, attempts + 1);

    const brief = errorMessage.trim().replace(/\s+/g, " ").slice(0, 160);
    const mode = this.sessionModes.get(sessionId) ?? "act";
    this.sink("notice", {
      sessionId,
      message: retryable
        ? `The provider request failed (${brief}). Retrying automatically — no action needed.`
        : `The agent hit an error (${brief}). Recovering and continuing the task.`,
    });
    const followUp = retryable
      ? `Your previous attempt was interrupted by a transient provider error: ${errorMessage}. Retry the last step and continue the task.`
      : `Your previous attempt failed with: ${errorMessage}. Recover from this error and continue the task to completion.`;
    // Steer with the session's own mode so read-only/orchestrator enforcement
    // is preserved on the recovery turn.
    void this.sendMessage(sessionId, followUp, mode, [], [], true).catch(() => undefined);
  }

  /**
   * When the agent reports `done` but the todo list still has pending or
   * in-progress items, queue a steer follow-up (bounded) to keep the task
   * going — PI's shouldStopAfterTurn inverse, implemented at the session
   * level so it works regardless of which runtime backend the SDK selects.
   */
  private maybeAutoContinue(sessionId: string): boolean {
    // A token-budget stop is final for this run: never steer follow-ups (each
    // would burn another model call just to hit the same limit again).
    if (this.budgetStoppedSessions.has(sessionId)) return false;
    // The user explicitly stopped this session — don't restart it behind
    // their back.
    if (this.suppressRecovery.has(sessionId)) return false;
    // Orchestration: the SDK's own team completion guard already steers the
    // lead while teammates have active runs or unfinished tasks. Nudging the
    // same todos from here would double-steer with competing instructions.
    if (this.teamWorkPending(sessionId)) return false;
    const todos = this.todosBySession.get(sessionId);
    if (!todos || todos.length === 0) return false;
    const unfinished = todos.filter((t) => t.status === "pending" || t.status === "in_progress");
    if (unfinished.length === 0) return false;
    const nudges = this.completionNudges.get(sessionId) ?? 0;
    if (nudges >= AgentHarness.MAX_COMPLETION_NUDGES) return false;
    this.completionNudges.set(sessionId, nudges + 1);
    this.sink("notice", {
      sessionId,
      message: `The task list still has ${unfinished.length} unfinished item(s) — continuing the task.`,
    });
    const items = unfinished
      .slice(0, 5)
      .map((t) => t.content ?? `#${t.id ?? "?"}`)
      .join("; ");
    const followUp = `The task list still has ${unfinished.length} unfinished item(s): ${items}. Finish them now. If any item is no longer needed or was already done, update the list with todo_write to mark it completed or remove it — then continue until the user's request is genuinely complete. Do not invent new work; when the list is accurate and the request is done, stop and summarize.`;
    // Steer with the session's own mode so an orchestrator follow-up keeps
    // its delegation directive instead of silently dropping to act.
    const mode = this.sessionModes.get(sessionId) ?? "act";
    void this.sendMessage(sessionId, followUp, mode, [], [], true).catch(() => undefined);
    return true;
  }

  /** Capture active teammate runs/tasks from a `team_progress` payload. */
  private recordTeamProgress(payload: unknown): void {
    const body = (payload ?? {}) as { sessionId?: unknown; summary?: Record<string, unknown> };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const summary = (body.summary ?? {}) as Record<string, unknown>;
    const runs = (summary.runs ?? {}) as Record<string, unknown>;
    const activeRunIds = Array.isArray(runs.activeRunIds)
      ? (runs.activeRunIds as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    const tasks = (summary.tasks ?? {}) as Record<string, unknown>;
    const byStatus = (tasks.byStatus ?? {}) as Record<string, unknown>;
    const activeTasks = Object.entries(byStatus).reduce(
      (sum, [status, count]) =>
        sum + (["pending", "in_progress", "running"].includes(status) && typeof count === "number" ? count : 0),
      0,
    );
    if (sessionId) {
      this.teamStateBySession.set(sessionId, { activeRunIds, activeTasks });
    }
  }

  /** True while the session's team still has active runs or unfinished tasks. */
  private teamWorkPending(sessionId: string): boolean {
    const state = this.teamStateBySession.get(sessionId);
    if (!state) return false;
    return state.activeRunIds.length > 0 || state.activeTasks > 0;
  }

  /**
   * Merge global per-tool policies over the built-in defaults. The SDK runtime
   * decides approval purely from this map (it only asks when a tool's effective
   * policy explicitly sets `autoApprove: false`) and never reads the persisted
   * `toolAutoApprove` global setting — so the "Global tool auto-approve" toggle
   * is folded into the policies here.
   */
  private buildToolPolicies(): Record<string, ToolPolicy> {
    const policies: Record<string, ToolPolicy> = { ...DEFAULT_TOOL_POLICIES };
    for (const [name, entry] of Object.entries(this.getToolPolicyStore().getAll())) {
      policies[name] = { ...(policies[name] ?? {}), enabled: entry.enabled, autoApprove: entry.autoApprove };
    }
    if (readGlobalSettings().toolAutoApprove === true) {
      for (const name of Object.keys(policies)) {
        policies[name] = { ...policies[name], autoApprove: true };
      }
    }
    return policies;
  }

  private async buildUserInstructionService(cwd: string): Promise<UserInstructionConfigService> {
    const svc = createUserInstructionConfigService({
      skills: {
        directories: compatibleSkillDirectories(this.dataDir),
      },
      rules: {
        workspacePath: cwd,
        directories: [join(this.dataDir, "rules")],
      },
      workflows: {
        workspacePath: cwd,
        directories: [join(this.dataDir, "workflows")],
      },
    });
    await svc.start();
    return svc;
  }

  /** Global-only service used by the settings surface (no workspace coupling). */
  private getGlobalUserInstructionService(): UserInstructionConfigService {
    if (!this.globalUserInstructionService) {
      this.globalUserInstructionService = createUserInstructionConfigService({
        skills: { directories: compatibleSkillDirectories(this.dataDir) },
        rules: { directories: [join(this.dataDir, "rules")] },
        workflows: { directories: [join(this.dataDir, "workflows")] },
      });
      void this.globalUserInstructionService.start().catch((err: unknown) => {
        console.error(`[yzpz-agent] global user-instruction service failed: ${err}`);
      });
    }
    return this.globalUserInstructionService;
  }

  private async handleApproval(request: ToolApprovalRequest): Promise<ToolApprovalResult> {
    // Read-only modes ("ask"/"plan") must never mutate. The beforeTool guard
    // blocks the known mutating tools before approval; this check is a second
    // line for in-flight requests and re-checks after a mid-run mode switch.
    const mode = this.sessionModes.get(request.sessionId) ?? "act";
    if (
      isReadOnlyMode(mode) &&
      (READONLY_BLOCKED_TOOLS.has(request.toolName) || request.toolName.startsWith("team_"))
    ) {
      return { approved: false, reason: mode === "plan" ? PLAN_MODE_REASON : ASK_MODE_REASON };
    }
    // Read-only modes must ALSO never silently execute unknown tools (e.g. MCP
    // write tools whose names the guard cannot enumerate): skip the global
    // auto-approve short-circuit and force explicit user consent instead.
    const globalAutoApprove = readGlobalSettings().toolAutoApprove === true;
    if (!isReadOnlyMode(mode) && globalAutoApprove) {
      return { approved: true, reason: "Global tool auto-approve is enabled" };
    }
    const requestId = randomUUID();
    const payload: ApprovalRequestPayload = {
      requestId,
      sessionId: request.sessionId,
      agentId: request.agentId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      input: request.input,
      policy: String(request.policy?.autoApprove ?? "ask"),
      pendingCount: this.approvals.size + 1,
    };

    const result = await new Promise<ToolApprovalResult>((resolve) => {
      const timer = setTimeout(() => {
        this.approvals.delete(requestId);
        resolve({ approved: false, reason: "Approval timed out" });
      }, APPROVAL_TIMEOUT_MS);
      this.approvals.set(requestId, { resolve, timer, request });
      this.sink("approval-request", payload);
    });

    this.sink("approval-resolved", { requestId, sessionId: request.sessionId });
    return result;
  }

  resolveApproval(requestId: string, approved: boolean, reason?: string): boolean {
    const pending = this.approvals.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.approvals.delete(requestId);
    pending.resolve({ approved, reason });
    return true;
  }

  pendingApprovalCount(): number {
    return this.approvals.size;
  }

  /**
   * List prompts queued behind the running turn. Internal delivery details are
   * omitted so image data and local paths never leak back through the renderer.
   */
  async listPendingPrompts(sessionId: string): Promise<unknown[]> {
    return this.pendingPromptViews(sessionId);
  }

  /** Remove a single queued prompt so it never runs. */
  async removePendingPrompt(sessionId: string, promptId: string): Promise<boolean> {
    const queue = this.queuedPromptsBySession.get(sessionId);
    if (!queue?.some((entry) => entry.id === promptId)) return false;
    const remaining = queue.filter((entry) => entry.id !== promptId);
    if (remaining.length > 0) this.queuedPromptsBySession.set(sessionId, remaining);
    else this.queuedPromptsBySession.delete(sessionId);
    this.emitPendingPrompts(sessionId);
    return true;
  }

  private requireCline(): ClineCore {
    if (!this.cline) throw new Error("Harness not initialized");
    return this.cline;
  }

  /**
   * Resolve the model's actual provider-advertised limits. The SDK relies on
   * this value to determine when compaction is necessary, so it must never be
   * replaced with an arbitrary local cap.
   */
  private async resolveModelInfo(
    providerId: string,
    modelId: string,
  ): Promise<Record<string, { id: string; contextWindow?: number; maxInputTokens?: number }>> {
    try {
      const catalog = (await Llms.getModelsForProvider(providerId)) as Record<
        string,
        { id?: string; contextWindow?: number | null }
      >;
      const contextWindow = catalog?.[modelId]?.contextWindow;
      if (typeof contextWindow === "number" && contextWindow > 0) {
        return { [modelId]: { id: modelId, contextWindow, maxInputTokens: contextWindow } };
      }
    } catch {
      // Fall through and let the SDK resolve its provider default.
    }

    // Do not invent a smaller fallback window. Provider-specific defaults can
    // still be resolved by the SDK, while an artificial value forces early
    // compaction for models whose catalog metadata is incomplete.
    return { [modelId]: { id: modelId } };
  }

  /**
   * Fail fast on a bogus provider instead of creating a session that only
   * errors (confusingly) on the first message. A provider is considered valid
   * when the SDK catalog knows it, or the user has saved credentials or passed
   * an apiKey/baseUrl (custom OpenAI-compatible providers live outside the
   * catalog). The model id is intentionally NOT validated against the catalog:
   * providers accept arbitrary model ids (aliases, previews, custom endpoints)
   * that the catalog may not list yet.
   */
  private async validateConnection(
    providerId: string,
    apiKey?: string,
    baseUrl?: string,
  ): Promise<void> {
    const saved = this.getProviderStore().get(providerId);
    if (saved?.apiKey || saved?.baseUrl) return;
    if (apiKey || baseUrl) return;
    if (isOAuthProvider(providerId)) {
      // OAuth providers are valid once they have saved credentials; session-start
      // resolution refreshes/validates them. Missing creds fail fast with a
      // actionable "sign in" message instead of a cryptic auth error later.
      if (saved?.oauth) return;
      throw new Error(
        `Provider "${providerId}" requires OAuth sign-in. Open Settings → Agent, select "${providerId}", and link your subscription.`,
      );
    }
    let ids: string[] = [];
    try {
      ids = await Llms.getProviderIds();
    } catch {
      ids = [];
    }
    if (!ids.includes(providerId)) {
      throw new Error(
        `Unknown provider "${providerId}". Pick one from the provider list, or add its API key in Settings → Agent to use a custom provider.`,
      );
    }
  }

  /**
   * Shared session bootstrap for both fresh creation and resume. Sessions are
   * started as `interactive: true` so the SDK keeps them alive across turns
   * (non-interactive sessions are torn down after the FIRST turn, which made
   * the second prompt fail silently with "session not found").
   */
  private async startClineSession(
    args: CreateSessionArgs,
    opts: { initialMessages?: unknown[] } = {},
  ): Promise<{ sessionId: string; manifestPath: string; messagesPath: string }> {
    await this.validateConnection(args.providerId, args.apiKey, args.baseUrl);
    const cline = this.requireCline();
    const store = this.getProviderStore();
    const stored = store.get(args.providerId);

    // Resolve an auth credential for the session. API-key/baseUrl providers use
    // the passed-in or stored key directly; OAuth providers (e.g. openai-codex)
    // get a freshly-validated access token formatted as the SDK's apiKey.
    let apiKey = args.apiKey ?? stored?.apiKey;
    if (!apiKey && isOAuthProvider(args.providerId)) {
      apiKey = await this.resolveOAuthApiKey(args.providerId);
    }

    // Always own the session id so the read-only (ask-mode) guard can key on it.
    const sessionId = args.sessionId?.trim() || `yzpz-${randomUUID()}`;
    this.sessionCwd.set(sessionId, args.cwd);

    // Per-session cumulative token budget (0 = unlimited). afterModelHook
    // enforces it against the accumulated usage tracked in usageBySession.
    this.budgets.set(sessionId, args.maxTotalTokens ?? 0);
    this.budgetStoppedSessions.delete(sessionId); // a new run may spend more
    this.usageBySession.delete(sessionId); // clear any stale entry from a prior run
    this.usageBySession.set(sessionId, zeroUsage());

    // Skills are global user capabilities; workflows and rules remain scoped
    // to the current workspace.
    const userInstructionService = await this.buildUserInstructionService(args.cwd);

    try {
      const result = await cline.start({
        source: "desktop",
        sessionMetadata: {
          workspaceId: args.workspaceId,
          title: args.title,
          providerId: args.providerId,
          modelId: args.modelId,
          yzpz: true,
          maxTotalTokens: args.maxTotalTokens ?? 0,
        },
        config: {
          providerId: args.providerId,
          modelId: args.modelId,
          apiKey,
          baseUrl: args.baseUrl ?? stored?.baseUrl,
          systemPrompt:
            buildSystemPrompt(args.systemPrompt, args.cwd, skillHints(this.dataDir)) +
            TODO_INSTRUCTION,
          cwd: args.cwd,
          workspaceRoot: args.cwd,
          enableTools: true,
          enableSpawnAgent: true,
          // Team tools are available to every session, but only orchestration
          // mode instructs the model to delegate. This lets a user switch into
          // orchestration after creating an agent without silently disabling
          // the runtime capability it needs.
          enableAgentTeams: args.enableAgentTeams ?? true,
          teamName: args.teamName ?? "YZPZ",
          maxTokensPerTurn: DEFAULT_MAX_OUTPUT_TOKENS,
          maxIterations: DEFAULT_MAX_ITERATIONS,
          knownModels: await this.resolveModelInfo(args.providerId, args.modelId),
          execution: {
            maxConsecutiveMistakes: 4,
            loopDetection: { softThreshold: 3, hardThreshold: 5 },
          },
          compaction: {
            enabled: true,
            strategy: args.compactionStrategy ?? "basic",
            preserveRecentTokens: COMPACTION_PRESERVE_RECENT_TOKENS,
          },
          toolPolicies: this.buildToolPolicies(),
          sessionId,
          interactive: true,
          // PI-style completion guard (belt + suspenders): the SDK's local
          // runtime computes its own completionPolicy and may ignore this config
          // value; the reliable guard lives in the subscription's maybeAutoContinue
          // (see attachSubscriptions), which steers a follow-up when the agent
          // reports done while the task list is unfinished.
          completionPolicy: {
            completionGuard: () => this.completionGuard(sessionId),
          },
          // PI-style transformContext: bound tool-result sizes per request. The
          // local runtime substitutes its own compaction-based prepareTurn; this
          // config value is a fallback for non-local runtimes. The always-on
          // truncation is enforced in the afterTool/beforeModel hooks below.
          prepareTurn: (ctx: {
            sessionId?: string;
            apiMessages?: Array<{ role?: string; content?: unknown }>;
            overflowRecovery?: boolean;
          }) => this.prepareTurnHook(ctx),
        },
        initialMessages: opts.initialMessages,
        localRuntime: {
          userInstructionService,
          configExtensions: ["rules", "skills", "workflows", "plugins"],
          extraTools: [this.buildTodoWriteTool()],
          hooks: {
            beforeTool: (ctx: { tool: { name: string } }) => this.beforeToolGuard(sessionId, ctx.tool.name),
            beforeModel: (ctx: {
              snapshot?: { iteration?: number };
              overflowRecovery?: boolean;
            }) => this.beforeModelHook(sessionId, ctx),
            afterTool: (ctx: {
              tool: { name: string };
              result?: { output?: unknown; isError?: boolean };
            }) => this.afterToolHook(sessionId, ctx),
            afterModel: (ctx: { finishReason?: string }) => this.afterModelHook(sessionId, ctx),
          },
        },
      });
      this.userInstructionServices.set(result.sessionId, userInstructionService);
      this.activeSessions.add(result.sessionId);
      // A newly created/resumed session is idle by definition. `cline.start`
      // can emit a spurious "running" status synchronously; if that leaked into
      // `runningSessions`, the next user message would be queued as a follow-up
      // steer with no turn to drain it. Clear both ids to be safe against the
      // SDK returning a different session id than the one we requested.
      this.runningSessions.delete(result.sessionId);
      this.runningSessions.delete(sessionId);
      this.startingSessions.delete(result.sessionId);
      this.startingSessions.delete(sessionId);
      this.queuedPromptsBySession.delete(result.sessionId);
      this.queuedPromptsBySession.delete(sessionId);
      this.emitPendingPrompts(result.sessionId);
      this.sink("session-created", {
        sessionId: result.sessionId,
        workspaceId: args.workspaceId,
      });
      this.sink("session-status", { sessionId: result.sessionId, status: "idle" });
      return {
        sessionId: result.sessionId,
        manifestPath: result.manifestPath,
        messagesPath: result.messagesPath,
      };
    } catch (err) {
      userInstructionService.stop();
      // A failed start must not leave orphaned budget/usage/cwd state behind —
      // those maps key on sessionId and would otherwise linger until delete.
      this.budgets.delete(sessionId);
      this.usageBySession.delete(sessionId);
      this.budgetStoppedSessions.delete(sessionId);
      this.sessionCwd.delete(sessionId);
      throw err;
    }
  }

  async createSession(args: CreateSessionArgs): Promise<unknown> {
    return this.startClineSession(args);
  }

  /**
   * Rehydrate a persisted session into the SDK's in-memory runtime so it can
   * accept new messages again. Idempotent: already-active sessions are a no-op.
   * Restores the conversation history so the agent keeps its context.
   */
  async resumeSession(
    sessionId: string,
  ): Promise<{ resumed: boolean; sessionId: string; error?: string }> {
    if (this.activeSessions.has(sessionId)) {
      return { resumed: false, sessionId };
    }
    const cline = this.requireCline();
    let persisted:
      | {
          metadata?: Record<string, unknown>;
          provider?: string;
          model?: string;
          cwd?: string;
          workspaceRoot?: string;
          enableTools?: boolean;
          enableSpawn?: boolean;
          enableTeams?: boolean;
          teamName?: string;
          status?: string;
        }
      | undefined;
    try {
      persisted = (await cline.get(sessionId)) as typeof persisted;
    } catch {
      persisted = undefined;
    }
    if (!persisted) {
      return {
        resumed: false,
        sessionId,
        error: `Session ${sessionId} no longer exists and cannot be resumed.`,
      };
    }

    const metadata = persisted.metadata ?? {};
    const providerId = (metadata.providerId as string) || (persisted.provider as string) || "";
    const modelId = (metadata.modelId as string) || (persisted.model as string) || "";
    const cwd = persisted.cwd || (metadata.cwd as string) || "";
    const workspaceId = (metadata.workspaceId as string) || "";
    if (!providerId || !modelId || !cwd) {
      return {
        resumed: false,
        sessionId,
        error: `Cannot resume session ${sessionId}: connection details are missing.`,
      };
    }

    let messages: unknown[] = [];
    try {
      messages = (await cline.readMessages(sessionId)) as unknown[];
    } catch (err) {
      console.warn(`[yzpz-agent] failed to read history for resume of ${sessionId}: ${err}`);
    }

    try {
      await this.startClineSession(
        {
          sessionId,
          workspaceId,
          cwd,
          providerId,
          modelId,
          systemPrompt: undefined,
          title: typeof metadata.title === "string" ? metadata.title : undefined,
          enableAgentTeams: persisted.enableTeams,
          teamName: persisted.teamName,
          // Restore the session's cumulative token budget. `sessionMetadata`
          // persists it at creation time; WITHOUT this, a resumed session would
          // silently become unlimited (0 = no cap), defeating the runaway-cost
          // guard after any stop→resume or app restart.
          maxTotalTokens:
            typeof metadata.maxTotalTokens === "number" && metadata.maxTotalTokens > 0
              ? metadata.maxTotalTokens
              : undefined,
        },
        { initialMessages: messages },
      );

      // Re-seed the usage tracker from the SDK's cumulative totals. The SDK
      // resets per-run usage on every start, so without this the budget would
      // compare against only post-resume deltas instead of the full lifetime.
      try {
        const acc = await cline.getAccumulatedUsage(sessionId);
        const u = acc?.usage;
        if (u) {
          const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
          this.usageBySession.set(sessionId, {
            inputTokens: n(u.inputTokens),
            outputTokens: n(u.outputTokens),
            cacheReadTokens: n(u.cacheReadTokens),
            cacheWriteTokens: n(u.cacheWriteTokens),
            totalCost: n(u.totalCost),
          });
        }
      } catch {
        // Best-effort: if the SDK can't report cumulative usage, keep the
        // zeroed tracker; the budget then enforces post-resume usage only.
      }

      // Restore the session's mode so read-only (ask/plan) enforcement survives
      // stop→resume and app restarts; the frontend restores the mode tab from
      // the same persisted metadata.
      const persistedMode = typeof metadata.mode === "string" ? metadata.mode : undefined;
      if (persistedMode === "ask" || persistedMode === "plan" || persistedMode === "orchestrator") {
        this.sessionModes.set(sessionId, persistedMode);
      }
      // Restore Fast mode so auto-continue / recovery follow-ups keep the
      // speed directive after a stop→resume or app restart. Seed the previous
      // state too so a resumed fast-mode session does not re-inject the
      // directive (it is already present in the conversation history).
      const restoredFastMode = metadata.fastMode === true;
      this.fastModes.set(sessionId, restoredFastMode);
      this.previousFastModes.set(sessionId, restoredFastMode);
    } catch (err) {
      return {
        resumed: false,
        sessionId,
        error: `Failed to resume session: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // The SDK's start emits a spurious "running"; settle it to idle.
    this.sink("session-status", { sessionId, status: "idle" });
    return { resumed: true, sessionId };
  }

  /**
   * Make sure a session is loaded in the SDK's in-memory runtime before an
   * in-place mutation (connection/model/title). After a turn completes the SDK
   * can drop the session from memory; mutation commands then fail with
   * "session not found" even though the session is still persisted on disk.
   * Rehydrating first matches what sendMessage already does.
   */
  private async ensureSessionActive(sessionId: string): Promise<void> {
    if (this.activeSessions.has(sessionId)) return;
    const result = await this.resumeSession(sessionId);
    if (result.error) {
      throw new Error(result.error);
    }
  }

  async sendMessage(
    sessionId: string,
    prompt: string,
    mode?: string,
    userImages: string[] = [],
    userFiles: string[] = [],
    // Internal: set by the completion-guard's auto-continue so it does not
    // reset the nudge budget it just incremented (see maybeAutoContinue).
    autoContinue = false,
    // Internal queue drain: start this prompt as a distinct turn even though
    // the session is reserved in `startingSessions`.
    bypassQueue = false,
  ): Promise<unknown> {
    if (
      !bypassQueue &&
      !autoContinue &&
      (this.runningSessions.has(sessionId) ||
        this.startingSessions.has(sessionId) ||
        this.queuedPromptsBySession.has(sessionId))
    ) {
      const queued = this.enqueuePrompt(sessionId, prompt, mode, userImages, userFiles);
      return { accepted: true, queued: true, promptId: queued.id };
    }

    // Reserve the session before the first await. Without this, two rapid sends
    // can both observe an idle runtime and start competing turns.
    this.startingSessions.add(sessionId);
    const cline = this.requireCline();
    // The public UI stores local paths because that keeps IPC payloads small.
    // Resolve them only inside the Node sidecar, immediately before the SDK
    // call, where the files are available and can become valid image data URLs.
    let resolvedUserImages: string[];
    try {
      resolvedUserImages = resolveUserImages(userImages);
    } catch (err) {
      this.startingSessions.delete(sessionId);
      const message = errorMessageFromUnknown(err) || "The selected attachments could not be prepared.";
      this.sink("session-error", { sessionId, error: message });
      return { accepted: false, error: message };
    }

    // A fresh user request (not an auto-continue) resets the completion-guard
    // nudge budget and re-enables automatic recovery, so long tasks keep
    // getting follow-ups after the user intervenes. The recovery budget is
    // refreshed too — otherwise a session that exhausted its auto-retries
    // would stay permanently unable to recover for the rest of its life.
    if (!autoContinue) {
      this.completionNudges.delete(sessionId);
      this.suppressRecovery.delete(sessionId);
      this.pendingRecoveryErrors.delete(sessionId);
      this.clearRecoveryTimer(sessionId);
      this.recoveryAttempts.delete(sessionId);
      this.recoveryWindow.delete(sessionId);
      this.recoveryExhausted.delete(sessionId);
    }

    // If the session is not alive in the SDK's runtime (closed pane, app
    // restart, prior teardown), rehydrate it from disk first so sending never
    // fails with a hidden "session not found". Surface unresumable sessions.
    if (!this.activeSessions.has(sessionId)) {
      const result = await this.resumeSession(sessionId);
      if (result.error) {
        this.startingSessions.delete(sessionId);
        this.sink("session-error", { sessionId, error: result.error });
        return { accepted: false, error: result.error };
      }
    }

    // Remember the mode for this session so the read-only (ask/plan) guard can
    // block mutating tools on the current turn.
    this.sessionModes.set(sessionId, mode ?? "act");

    // Fast mode is injected on state transitions only: once when enabled and
    // once (explicitly) when disabled. Re-injecting the full directive on every
    // send would spam the conversation history, and the model cannot infer a
    // toggle-off from a prompt that merely stopped carrying the directive.
    const fastMode = this.fastModes.get(sessionId) ?? false;
    const previousFastMode = this.previousFastModes.get(sessionId) ?? false;

    // Persist the mode in session metadata so stop→resume / app-restart keeps
    // read-only (ask/plan) enforcement instead of silently falling back to act.
    if (mode === "ask" || mode === "plan" || mode === "orchestrator") {
      void this.persistSessionMode(sessionId, mode).catch(() => undefined);
    }

    // The SDK has no "ask" mode: reuse "plan" (read-only preset + guarded shell)
    // and enforce hard read-only via the beforeTool guard above.
    const sdkMode =
      mode === "ask"
        ? "plan"
        : mode === "plan"
          ? "plan"
          : mode === "orchestrator"
            ? "act"
            : undefined;
    const runtimePrompt =
      mode === "orchestrator"
        ? [
            "ORCHESTRATION MODE",
            "You are the coordinating lead. For work that benefits from parallel or independent investigation, create and direct focused teammates through the available team tools. Keep ownership clear, monitor their results, and integrate the final answer yourself. Do not delegate a tiny task merely for show.",
            "User request:",
            prompt,
          ].join("\n\n")
        : prompt;
    let finalPrompt = runtimePrompt;
    if (fastMode && !previousFastMode) {
      finalPrompt = `${FAST_MODE_DIRECTIVE}\n\nUser request:\n${runtimePrompt}`;
    } else if (!fastMode && previousFastMode) {
      finalPrompt = `${FAST_MODE_OFF_NOTICE}\n\nUser request:\n${runtimePrompt}`;
    }
    this.previousFastModes.set(sessionId, fastMode);

    // Mark this before the asynchronous send begins so a quick second message
    // is held in our FIFO rather than starting a competing turn.
    this.runningSessions.add(sessionId);

    // Acknowledge admission before starting the SDK on the next event-loop
    // tick. This keeps the user's transcript entry ahead of synchronous status
    // or content events and still never blocks IPC on turn completion.
    setTimeout(() => {
      try {
        void cline.send({
          sessionId,
          prompt: finalPrompt,
          mode: sdkMode as never,
          userImages: resolvedUserImages,
          userFiles,
        })
          .catch((err: unknown) => this.handleSendFailure(sessionId, err));
      } catch (err) {
        this.handleSendFailure(sessionId, err);
      }
    }, 0);
    this.startingSessions.delete(sessionId);
    return { accepted: true, queued: false };
  }

  private handleSendFailure(sessionId: string, error: unknown): void {
    this.startingSessions.delete(sessionId);
    this.runningSessions.delete(sessionId);
    const message = errorMessageFromUnknown(error) || "The task stopped unexpectedly.";
    this.sink("session-error", { sessionId, error: message });
    // The run loop also emits an error agent_event in most cases. Defer
    // recovery until the failed runtime is no longer active.
    this.deferRecoveryAfterError(sessionId, message);
  }

  /**
   * Blocks mutating tools while a session is in a read-only mode ("ask" Q&A or
   * "plan" planning) so the agent never edits files or runs commands. The SDK's
   * own plan-mode guard only inspects run_commands AND only registers when a
   * session is STARTED in plan mode — this harness starts sessions in act mode
   * and switches per-send, so this hook is the only reliable enforcement. It
   * also inherits to subagents/teammates (the SDK reuses the parent session's
   * hooks), closing the "spawn a subagent to edit files in plan mode" bypass.
   */
  private beforeToolGuard(sessionId: string, toolName: string): { skip: boolean; reason: string } | undefined {
    const mode = this.sessionModes.get(sessionId) ?? "act";
    if (!isReadOnlyMode(mode)) return undefined;
    if (READONLY_BLOCKED_TOOLS.has(toolName) || toolName.startsWith("team_")) {
      return { skip: true, reason: mode === "plan" ? PLAN_MODE_REASON : ASK_MODE_REASON };
    }
    return undefined;
  }

  // ── PI-style efficiency hooks ─────────────────────────────────────────

  /**
   * PI-grade tool-output truncation. Applies head/tail/line truncation to tool
   * results before they enter the transcript, so oversized outputs never bloat
   * the provider request. Mirrors PI's truncate.ts policy:
   *   - reads keep the beginning (head)
   *   - shell output keeps the end (tail — errors are at the end)
   *   - grep/search keeps at most GREP_MAX_LINE_LENGTH chars per line
   */
  private truncateToolOutput(toolName: string, output: unknown): { output: unknown; truncated: boolean } {
    if (typeof output !== "string") return { output, truncated: false };

    // Read-like tools: keep the head (the beginning of the file).
    if (toolName === "read" || toolName === "read_files") {
      const r = truncateHead(output);
      if (!r.truncated) return { output, truncated: false };
      return {
        output: `${r.content}\n\n[Output truncated: showing ${r.outputLines} of ${r.totalLines} lines (${formatSize(r.maxBytes)} limit). Use offset/limit to read more.]`,
        truncated: true,
      };
    }

    // Shell-like tools: keep the tail (final output / errors).
    if (toolName === "bash" || toolName === "run_commands" || toolName === "execute_command") {
      const r = truncateTail(output);
      if (!r.truncated) return { output, truncated: false };
      return {
        output: `${r.content}\n\n[Output truncated: showing the last ${r.outputLines} of ${r.totalLines} lines (${formatSize(r.maxBytes)} limit).]`,
        truncated: true,
      };
    }

    // Grep/search: cap each line to GREP_MAX_LINE_LENGTH chars.
    if (toolName === "grep" || toolName === "search_codebase" || toolName === "find" || toolName === "glob") {
      const lines = output.split("\n");
      const capped = lines.map((line) => truncateLine(line, GREP_MAX_LINE_LENGTH).text);
      const cappedText = capped.join("\n");
      if (!capped.every((line, i) => line === lines[i])) {
        // Some lines were capped. Still keep the TOTAL bounded (lines AND
        // bytes), otherwise a pathological result (e.g. 100k long lines) would
        // return up to 500 chars x N lines and blow the output budget.
        const r = truncateHead(cappedText, { maxLines: 200, maxBytes: DEFAULT_MAX_BYTES });
        if (!r.truncated) return { output: cappedText, truncated: true };
        return {
          output: `${r.content}\n\n[Search results truncated: showing ${r.outputLines} of ${r.totalLines} lines.]`,
          truncated: true,
        };
      }
      // No line was truncated; still bound the total via head truncation.
      const r = truncateHead(output, { maxLines: 200, maxBytes: DEFAULT_MAX_BYTES });
      if (!r.truncated) return { output, truncated: false };
      return {
        output: `${r.content}\n\n[Search results truncated: showing ${r.outputLines} of ${r.totalLines} lines.]`,
        truncated: true,
      };
    }

    // Generic fallback: head-truncate at the shared limits.
    const r = truncateHead(output);
    if (!r.truncated) return { output, truncated: false };
    return {
      output: `${r.content}\n\n[Output truncated: showing ${r.outputLines} of ${r.totalLines} lines (${formatSize(r.maxBytes)} limit).]`,
      truncated: true,
    };
  }

  /**
   * afterTool hook: truncate oversized tool results and surface a notice when a
   * result was cut, so the user (and model) know the output was bounded.
   */
  private afterToolHook(
    sessionId: string,
    ctx: { tool: { name: string }; result?: { output?: unknown; isError?: boolean } },
  ): { result: { output: unknown; isError?: boolean } } | undefined {
    if (!ctx.result) return undefined;
    const output = ctx.result.output;
    const { output: newOutput, truncated } = this.truncateToolOutput(ctx.tool.name, output);
    if (!truncated) return undefined;
    if (newOutput !== output) {
      ctx.result.output = newOutput;
    }
    this.sink("notice", {
      sessionId,
      message: `Tool result from "${ctx.tool.name}" was truncated to keep the context small.`,
    });
    return { result: { output: ctx.result.output, isError: ctx.result.isError } };
  }

  /**
   * prepareTurn request projection: bound tool-result sizes per provider call
   * without mutating the canonical transcript. This is the PI transformContext
   * analogue — it caps what the model actually sees this turn.
   */
  private prepareTurnHook(ctx: {
    sessionId?: string;
    apiMessages?: Array<{
      role?: string;
      content?: unknown;
    }>;
    overflowRecovery?: boolean;
  }): { messages?: unknown[] } | undefined {
    if (ctx.overflowRecovery) {
      this.sink("notice", {
        sessionId: ctx.sessionId ?? "",
        message: "Context window was exceeded — compacting conversation before continuing.",
      });
    }
    const apiMessages = ctx.apiMessages;
    if (!Array.isArray(apiMessages)) return undefined;
    let changed = false;
    const projected = apiMessages.map((msg) => {
      const content = msg.content;
      if (!Array.isArray(content)) return msg;
      let msgChanged = false;
      const blocks = content.map((block) => {
        const b = block as { type?: string; text?: string; content?: unknown };
        if (b && b.type === "tool_result" && typeof b.content === "string") {
          const bounded = this.boundToolResultText(b.content);
          if (bounded !== b.content) {
            msgChanged = true;
            return { ...b, content: bounded };
          }
        }
        return block;
      });
      if (!msgChanged) return msg;
      changed = true;
      return { ...msg, content: blocks };
    });
    if (!changed) return undefined;
    return { messages: projected };
  }

  /** Bound a single tool-result text block to the shared byte limit (tail). */
  private boundToolResultText(text: string): string {
    const r = truncateTail(text);
    if (!r.truncated) return text;
    return `${r.content}\n\n[Output truncated: showing the last ${r.outputLines} of ${r.totalLines} lines (${formatSize(r.maxBytes)} limit).]`;
  }

  /**
   * afterModel hook: when the model hits the output-token cap ("max-tokens"),
   * surface a notice instead of silently stopping. The SDK continues the loop
   * when there are pending tool calls; this only informs the user.
   */
  private afterModelHook(
    sessionId: string,
    ctx: { finishReason?: string },
  ): { stop?: boolean; reason?: string } | undefined {
    // Enforce the cumulative total-token budget (0 = unlimited). Count input +
    // output + cache-read tokens; once the limit is hit, stop the loop and tell
    // the UI why instead of letting the session keep burning tokens.
    const u = this.usageBySession.get(sessionId);
    const limit = this.budgets.get(sessionId) ?? 0;
    const stop = enforceBudget(u, limit);
    if (stop) {
      this.budgetStoppedSessions.add(sessionId);
      this.sink("session-ended", { sessionId, reason: stop.reason, ts: Date.now() });
      this.sink("notice", {
        sessionId,
        message: `Token budget exceeded — stopped at ${u ? usageTotal(u) : 0} / ${limit} tokens to prevent runaway usage.`,
      });
      this.sink("session-status", { sessionId, status: "done" });
      return stop;
    }
    if (ctx.finishReason === "max-tokens") {
      this.sink("notice", {
        sessionId,
        message: "The model hit its output-token limit for this turn — continuing the task.",
      });
      return undefined; // allow the loop to continue
    }
    return undefined;
  }

  /**
   * beforeModel hook: surface a status notice as the run progresses so the UI
   * can reflect iteration/overflow state before each model call. Mirrors PI's
   * agent-loop progress signals without touching the request itself.
   */
  private beforeModelHook(
    sessionId: string,
    ctx: { snapshot?: { iteration?: number }; overflowRecovery?: boolean },
  ): { stop?: boolean; reason?: string } | undefined {
    const iteration = ctx.snapshot?.iteration ?? 0;
    if (ctx.overflowRecovery) {
      this.sink("notice", {
        sessionId,
        message: "Context window was exceeded — compacting the conversation before continuing.",
      });
    } else if (iteration > 0 && iteration % 5 === 0) {
      this.sink("notice", {
        sessionId,
        message: `Still working — iteration ${iteration} of the task.`,
      });
    }
    return undefined;
  }

  /** Hold a user message until the active task has genuinely completed. */
  private enqueuePrompt(
    sessionId: string,
    prompt: string,
    mode: string | undefined,
    userImages: string[],
    userFiles: string[],
  ): QueuedPromptEntry {
    const queue = this.queuedPromptsBySession.get(sessionId) ?? [];
    const entry: QueuedPromptEntry = {
      id: `queue-${randomUUID()}`,
      prompt,
      delivery: "queue",
      attachmentCount: userImages.length + userFiles.length,
      mode,
      userImages: [...userImages],
      userFiles: [...userFiles],
    };
    queue.push(entry);
    this.queuedPromptsBySession.set(sessionId, queue);
    this.emitPendingPrompts(sessionId);
    return entry;
  }

  private pendingPromptViews(sessionId: string): Array<Pick<QueuedPromptEntry, "id" | "prompt" | "delivery" | "attachmentCount">> {
    return (this.queuedPromptsBySession.get(sessionId) ?? []).map(({ id, prompt, delivery, attachmentCount }) => ({
      id,
      prompt,
      delivery,
      attachmentCount,
    }));
  }

  /** Emit the authoritative queue state so the UI stays truthful. */
  private emitPendingPrompts(sessionId: string): void {
    this.sink("session-event", {
      type: "pending_prompts",
      payload: { sessionId, prompts: this.pendingPromptViews(sessionId) },
    });
  }

  /** Start exactly one queued prompt as a fresh SDK turn. */
  private async startNextQueuedPrompt(sessionId: string): Promise<void> {
    if (this.runningSessions.has(sessionId) || this.startingSessions.has(sessionId)) return;
    const queue = this.queuedPromptsBySession.get(sessionId);
    if (!queue || queue.length === 0) return;

    const next = queue[0];
    this.startingSessions.add(sessionId);
    const result = (await this.sendMessage(
      sessionId,
      next.prompt,
      next.mode,
      next.userImages,
      next.userFiles,
      false,
      true,
    )) as { accepted?: boolean; error?: string };

    if (!result.accepted) {
      this.startingSessions.delete(sessionId);
      this.sink("notice", {
        sessionId,
        message: `The next queued task could not start${result.error ? `: ${result.error}` : "."}`,
      });
      return;
    }

    // Remove only after the SDK accepted the new turn. The explicit event lets
    // the renderer append the correct prompt even when another queue item was
    // cancelled earlier.
    queue.shift();
    if (queue.length === 0) this.queuedPromptsBySession.delete(sessionId);
    this.emitPendingPrompts(sessionId);
    this.sink("session-event", {
      type: "queued_prompt_started",
      payload: {
        sessionId,
        prompt: {
          id: next.id,
          prompt: next.prompt,
          delivery: next.delivery,
          attachmentCount: next.attachmentCount,
        },
      },
    });
  }

  /**
   * Per-session task lists, updated by the todo_write tool. Used by the
   * completion guard to prevent the model from stopping with unfinished work.
   */
  private todosBySession = new Map<string, TodoItem[]>();

  /** How many completion-guard follow-ups were steered per session (bounded). */
  private completionNudges = new Map<string, number>();

  private recordTodos(sessionId: string, todos: TodoItem[]): void {
    this.todosBySession.set(sessionId, todos);
  }

  /**
   * completionPolicy.completionGuard — PI's shouldStopAfterTurn inverse. Runs
   * when the model returns no tool calls. If the visible task list still has
   * pending/in-progress items, return a nudge so the loop continues instead of
   * stopping prematurely.
   */
  private completionGuard(sessionId: string): string | undefined {
    // A token-budget stop is final: don't nudge the loop back into more calls.
    if (this.budgetStoppedSessions.has(sessionId)) return undefined;
    // Orchestration: defer to the SDK's team completion guard while teammates
    // still have active runs or unfinished tasks.
    if (this.teamWorkPending(sessionId)) return undefined;
    const todos = this.todosBySession.get(sessionId);
    if (!todos || todos.length === 0) return undefined;
    const unfinished = todos.filter((t) => t.status === "pending" || t.status === "in_progress");
    if (unfinished.length === 0) return undefined;
    return `The task list still has ${unfinished.length} unfinished item(s). Finish them now. If an item is no longer needed or was already done, update the list with todo_write to mark it completed or remove it. Do not invent new work — when the list is accurate and the user's request is complete, stop and summarize.`;
  }

  /** Live switch of provider/model/credentials on an existing session. */
  async updateConnection(
    sessionId: string,
    update: {
      providerId?: string;
      modelId?: string;
      apiKey?: string;
      baseUrl?: string;
      thinking?: boolean;
      reasoningEffort?: string;
    },
  ): Promise<unknown> {
    await this.ensureSessionActive(sessionId);
    const cline = this.requireCline();
    const session = (await cline.get(sessionId)) as { metadata?: Record<string, unknown> } | undefined;
    const metadata = session?.metadata ?? {};
    const targetProviderId = (update.providerId ?? metadata.providerId) as string | undefined;
    const savedProviderConfig = targetProviderId ? this.getProviderStore().get(targetProviderId) : undefined;

    // Build the SDK update explicitly, dropping undefined/null for the reasoning
    // fields so a model switch never clears an effort the user already chose.
    // `null` (sent by the renderer for "not provided") also means no change —
    // a partial update must never wipe the session's provider/model/key.
    const sdkUpdate: Record<string, unknown> = {};
    if (update.providerId !== undefined && update.providerId !== null) {
      sdkUpdate.providerId = update.providerId;
    }
    if (update.modelId !== undefined && update.modelId !== null) {
      sdkUpdate.modelId = update.modelId;
    }
    if (update.apiKey !== undefined && update.apiKey !== null) {
      sdkUpdate.apiKey = update.apiKey;
    } else if (targetProviderId && isOAuthProvider(targetProviderId)) {
      // OAuth providers never carry a secret through the renderer: resolve the
      // stored token (refreshing when needed) into the SDK's apiKey format.
      sdkUpdate.apiKey = await this.resolveOAuthApiKey(targetProviderId);
    } else if (update.providerId && savedProviderConfig?.apiKey) {
      // A UI provider switch does not send secrets back through the renderer.
      // Reuse the key held by the harness for the newly-selected provider.
      sdkUpdate.apiKey = savedProviderConfig.apiKey;
    }
    if (update.baseUrl !== undefined && update.baseUrl !== null) {
      sdkUpdate.baseUrl = update.baseUrl;
    } else if (update.providerId && savedProviderConfig?.baseUrl) {
      sdkUpdate.baseUrl = savedProviderConfig.baseUrl;
    }
    if (update.thinking !== undefined && update.thinking !== null) sdkUpdate.thinking = update.thinking;
    if (update.reasoningEffort !== undefined && update.reasoningEffort !== null) sdkUpdate.reasoningEffort = update.reasoningEffort;
    await cline.updateSessionConnection(sessionId, sdkUpdate);

    // Persist the new connection in session metadata so it survives restores.
    await cline.update(sessionId, {
      metadata: {
        ...metadata,
        providerId: update.providerId ?? metadata.providerId,
        modelId: update.modelId ?? metadata.modelId,
        reasoningEffort: update.reasoningEffort ?? (metadata.reasoningEffort as string | undefined),
        thinking: update.thinking ?? (metadata.thinking as boolean | undefined),
      },
    });

    // Persist credentials/defaults globally so future sessions inherit them.
    const providerId = (update.providerId ?? metadata.providerId) as string;
    if (providerId) {
      const store = this.getProviderStore();
      const existing = store.get(providerId) ?? { providerId };
      store.set({
        providerId,
        apiKey: update.apiKey ?? existing.apiKey,
        baseUrl: update.baseUrl ?? existing.baseUrl,
        modelId: update.modelId ?? existing.modelId,
        oauth: existing.oauth,
      });
    }
    return {};
  }

  async abort(sessionId: string): Promise<void> {
    // A user abort is intentional: never auto-recover afterwards (a failed
    // status event or send rejection would otherwise restart the task the
    // user just stopped). A new user message re-enables recovery.
    this.suppressRecovery.add(sessionId);
    this.pendingRecoveryErrors.delete(sessionId);
    this.clearRecoveryTimer(sessionId);
    await this.requireCline().abort(sessionId);
    this.runningSessions.delete(sessionId);
    this.startingSessions.delete(sessionId);
    this.queuedPromptsBySession.delete(sessionId);
    this.emitPendingPrompts(sessionId);
    this.emitTeammatesStillWorking(sessionId);
  }

  /**
   * The SDK only aborts the lead run; async teammate runs keep going until the
   * session is deleted. Surface that explicitly so it isn't mistaken for a
   * full stop.
   */
  private emitTeammatesStillWorking(sessionId: string): void {
    const active = this.teamStateBySession.get(sessionId)?.activeRunIds ?? [];
    if (active.length === 0) return;
    this.sink("notice", {
      sessionId,
      message: `The lead agent was stopped, but ${active.length} teammate run(s) are still active. Closing the session stops them.`,
    });
  }

  /** Unlink a provider (removes its credentials from the global store and, for
   *  OAuth providers, from the SDK provider-settings store so the runtime stops
   *  refreshing a token nobody can use). */
  removeProviderConfig(providerId: string): { removed: boolean } {
    this.getProviderStore().clear(providerId);
    this.clearProviderOAuthCredentials(providerId);
    return { removed: true };
  }

  // ── OAuth (ChatGPT / OpenAI Codex subscription) ──────────────────────

  /** Whether a provider authenticates via a browser OAuth flow rather than an API key. */
  static isOAuthProvider(providerId: string): boolean {
    return isOAuthProvider(providerId);
  }

  /** Project a provider into the configure-UI fields the SDK expects:
   *  `{ authMethod: "api-key" | "oauth" | "local", fields, description? }`.
   *  OAuth providers return `authMethod: "oauth"` with no fields. */
  static getProviderConfigFields(providerId: string): ReturnType<typeof getProviderConfigFields> {
    return getProviderConfigFields(providerId);
  }

  /**
   * Run the ChatGPT (OpenAI Codex) OAuth browser flow for the `openai-codex`
   * provider and persist the resulting credentials. The auth URL is pushed to
   * the renderer through the `oauth-auth-url` event (which must open it in the
   * user's browser); a manual-code prompt, should the flow require one, is
   * pushed via `oauth-prompt` and answered with `resolveOAuthPrompt`.
   */
  async loginOpenAICodex(originator = "yzpz-agent"): Promise<{ providerId: string; email?: string; accountId?: string }> {
    await this.ensureInit();
    const providerId = "openai-codex";
    const credentials = await loginOpenAICodex({
      originator,
      onAuth: (info: { url: string; instructions?: string }) => {
        this.sink("oauth-auth-url", { providerId, url: info.url, instructions: info.instructions });
      },
      onPrompt: async (prompt: { message: string; defaultValue?: string }) => {
        const requestId = randomUUID();
        const answer = await new Promise<string>((resolve) => {
          this.oauthPromptResolvers.set(requestId, resolve);
          this.sink("oauth-prompt", { providerId, requestId, message: prompt.message, defaultValue: prompt.defaultValue });
        });
        return answer;
      },
      onProgress: (message: string) => this.sink("oauth-progress", { providerId, message }),
    });
    this.persistOAuthCredentials(providerId, credentials);
    return { providerId, email: credentials.email, accountId: credentials.accountId };
  }

  /** Fulfill a pending OAuth manual-code prompt pushed to the renderer. */
  resolveOAuthPrompt(requestId: string, answer: string): boolean {
    const resolve = this.oauthPromptResolvers.get(requestId);
    if (!resolve) return false;
    resolve(answer);
    this.oauthPromptResolvers.delete(requestId);
    return true;
  }

  /** Resolve a currently-valid access token for an OAuth provider, refreshing
   *  the token when required and persisting the refreshed creds. Returns the
   *  SDK-formatted apiKey string the provider handler expects, or `undefined`
   *  when no credentials are saved. Falls back to the stored (un-refreshed)
   *  token if validation/refresh hits a transient error so a flaky network call
   *  can't block session creation. */
  async resolveOAuthApiKey(providerId: string): Promise<string | undefined> {
    if (providerId !== "openai-codex") return undefined;
    const entry = this.getProviderStore().get(providerId);
    if (!entry?.oauth) return undefined;
    const creds = await this.getValidOpenAICodexCredentials(entry.oauth);
    if (creds) return formatProviderOAuthApiKey(providerId, creds);
    // Could not obtain a fresh token (expired + non-refreshable): hand the
    // stored access token through anyway rather than dropping the session. A
    // genuinely revoked token surfaces as a provider auth error, at which point
    // the user re-signs in via Settings → Agent.
    return formatProviderOAuthApiKey(providerId, entry.oauth);
  }

  /** Refresh (when needed) and return valid Codex OAuth credentials, persisting
   *  them back to the store. Returns `null` if the session cannot be reused
   *  (e.g. the refresh token is gone) and the user must sign in again. */
  private async getValidOpenAICodexCredentials(
    current: OAuthCredentials,
  ): Promise<OAuthCredentials | null> {
    try {
      const valid = await getValidOpenAICodexCredentials(current);
      if (valid) {
        this.persistOAuthCredentials("openai-codex", valid);
        return valid;
      }
    } catch (err) {
      console.warn(`[yzpz-agent] openai-codex token validation failed: ${err}`);
    }
    return null;
  }

  /** Persist OAuth credentials to both the harness store (drives the UI) and the
   *  SDK provider-settings store (lets the local runtime refresh mid-session). */
  private persistOAuthCredentials(providerId: string, credentials: OAuthCredentials): void {
    try {
      this.getProviderStore().setOAuth(providerId, credentials);
    } catch (err) {
      console.warn(`[yzpz-agent] failed to persist OAuth credentials to store: ${err}`);
    }
    try {
      const manager = this.getOauthSettingsManager();
      if (manager && providerId === "openai-codex") {
        saveProviderOAuthCredentials({
          manager,
          providerId,
          credentials,
          setLastUsed: true,
          save: true,
        });
      }
    } catch (err) {
      // The SDK settings file is a bonus for mid-session refresh; a write
      // failure here must never block login — the harness store is authoritative
      // for the session-start apiKey we always pass through.
      console.warn(`[yzpz-agent] failed to persist OAuth credentials to SDK settings: ${err}`);
    }
  }

  /** Drop OAuth credentials for a provider from the SDK settings store. */
  private clearProviderOAuthCredentials(providerId: string): void {
    try {
      const manager = this.getOauthSettingsManager();
      if (manager) {
        const storageId = getProviderAuthStorageId(providerId);
        const settings = manager.read();
        if (storageId && settings.providers?.[storageId]?.settings) {
          settings.providers[storageId].settings.oauth = undefined;
          settings.providers[storageId].tokenSource = "manual";
          manager.write(settings);
        }
      }
    } catch (err) {
      console.warn(`[yzpz-agent] failed to clear OAuth credentials from SDK settings: ${err}`);
    }
  }

  /** Lazily create the SDK provider-settings manager rooted at the harness data
   *  dir (after `setClineDir` has rebranded it, so it matches the runtime's). */
  private getOauthSettingsManager(): ProviderSettingsManager | null {
    if (this.oauthSettingsManager) return this.oauthSettingsManager;
    try {
      this.oauthSettingsManager = new ProviderSettingsManager();
      return this.oauthSettingsManager;
    } catch (err) {
      console.warn(`[yzpz-agent] failed to create provider settings manager: ${err}`);
      return null;
    }
  }


  // ── MCP servers ───────────────────────────────────────────────────

  private requireMcpManager(): InMemoryMcpManager {
    if (!this.mcpManager) throw new Error("MCP manager not initialized");
    return this.mcpManager;
  }

  private transportView(transport: McpServerTransportConfig | null): McpServerView["transport"] {
    if (!transport) return null;
    if (transport.type === "stdio") {
      return { type: transport.type, command: transport.command, args: transport.args };
    }
    return { type: transport.type, url: transport.url };
  }

  private toMcpView(snap: McpServerSnapshot | null, reg: McpServerRegistration): McpServerView {
    return {
      name: reg.name,
      status: snap?.status ?? "disconnected",
      disabled: reg.disabled ?? false,
      lastError: snap?.lastError ?? null,
      toolCount: snap?.toolCount ?? 0,
      transport: this.transportView(reg.transport),
    };
  }

  private readMcpSettings(filePath: string): {
    mcpServers: Record<string, { transport: McpServerTransportConfig; disabled?: boolean }>;
  } {
    try {
      if (existsSync(filePath)) {
        const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (parsed && typeof parsed.mcpServers === "object" && parsed.mcpServers) {
          return { mcpServers: parsed.mcpServers as Record<string, { transport: McpServerTransportConfig; disabled?: boolean }> };
        }
      }
    } catch (err) {
      console.warn(`[yzpz-agent] failed to read MCP settings: ${err}`);
    }
    return { mcpServers: {} };
  }

  private writeMcpSettings(filePath: string, settings: { mcpServers: Record<string, unknown> }): void {
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }

  async listMcpServers(): Promise<McpServerView[]> {
    const manager = this.requireMcpManager();
    let registered: McpServerRegistration[] = [];
    try {
      registered = resolveMcpServerRegistrations();
    } catch {
      registered = [];
    }
    const snaps = manager.listServers();
    return registered.map((reg: McpServerRegistration) => {
      const snap = snaps.find((s: McpServerSnapshot) => s.name === reg.name) ?? null;
      return this.toMcpView(snap, reg);
    });
  }

  async addMcpServer(name: string, transport: McpServerTransportConfig): Promise<McpServerView> {
    const manager = this.requireMcpManager();
    const filePath = resolveDefaultMcpSettingsPath();
    const settings = this.readMcpSettings(filePath);
    if (settings.mcpServers[name]) throw new Error(`MCP server "${name}" already exists`);
    settings.mcpServers[name] = { transport, disabled: false };
    this.writeMcpSettings(filePath, settings);

    await manager.registerServer({ name, transport, disabled: false });
    await manager.connectServer(name).catch((err: unknown) => {
      console.warn(`[yzpz-agent] MCP server "${name}" connect failed: ${err}`);
    });
    const snap = manager.listServers().find((s: McpServerSnapshot) => s.name === name) ?? null;
    return this.toMcpView(snap, { name, transport, disabled: false });
  }

  async removeMcpServer(name: string): Promise<{ removed: boolean }> {
    const filePath = resolveDefaultMcpSettingsPath();
    const settings = this.readMcpSettings(filePath);
    if (settings.mcpServers[name]) {
      delete settings.mcpServers[name];
      this.writeMcpSettings(filePath, settings);
    }
    if (this.mcpManager) {
      await this.mcpManager.unregisterServer(name).catch(() => undefined);
    }
    return { removed: true };
  }

  async setMcpServerDisabled(name: string, disabled: boolean): Promise<McpServerView> {    const manager = this.requireMcpManager();
    const filePath = resolveDefaultMcpSettingsPath();
    const settings = this.readMcpSettings(filePath);
    if (!settings.mcpServers[name]) throw new Error(`MCP server "${name}" not found`);
    settings.mcpServers[name].disabled = disabled;
    this.writeMcpSettings(filePath, settings);

    await manager.setServerDisabled(name, disabled);
    if (disabled) {
      await manager.disconnectServer(name).catch(() => undefined);
    } else {
      await manager.connectServer(name).catch((err: unknown) => {
        console.warn(`[yzpz-agent] MCP server "${name}" connect failed: ${err}`);
      });
    }
    const snap = manager.listServers().find((s: McpServerSnapshot) => s.name === name) ?? null;
    const reg = { name, transport: settings.mcpServers[name].transport, disabled };
    return this.toMcpView(snap, reg);
  }

  async stop(sessionId: string): Promise<void> {
    // Stop any in-flight turn but KEEP the session alive in the SDK runtime so
    // it can be resumed instantly later. `cline.stop()` tears the session down
    // (removing it from memory and breaking later sends); `deleteSession` is
    // the real teardown.
    this.suppressRecovery.add(sessionId);
    this.pendingRecoveryErrors.delete(sessionId);
    this.clearRecoveryTimer(sessionId);
    await this.requireCline().abort(sessionId);
    this.sessionModes.delete(sessionId);
    this.queuedPromptsBySession.delete(sessionId);
    this.runningSessions.delete(sessionId);
    this.startingSessions.delete(sessionId);
    this.completionNudges.delete(sessionId);
    this.emitTeammatesStillWorking(sessionId);
    this.emitPendingPrompts(sessionId);
    this.sink("session-status", { sessionId, status: "idle" });
    // Keep budgets + usageBySession intact: `stop` only PAUSES the session
    // (it stays alive for instant resume). Wiping them here would silently
    // disable the token budget for every follow-up send (0 = unlimited) and
    // reset the live usage meter.
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = await this.requireCline().delete(sessionId);
    if (deleted) {
      this.sink("session-deleted", { sessionId });
    }
    this.activeSessions.delete(sessionId);
    this.runningSessions.delete(sessionId);
    this.startingSessions.delete(sessionId);
    this.sessionModes.delete(sessionId);
    this.queuedPromptsBySession.delete(sessionId);
    this.completionNudges.delete(sessionId);
    this.recoveryAttempts.delete(sessionId);
    this.recoveryWindow.delete(sessionId);
    this.recoveryExhausted.delete(sessionId);
    this.suppressRecovery.delete(sessionId);
    this.pendingRecoveryErrors.delete(sessionId);
    this.clearRecoveryTimer(sessionId);
    this.fastModes.delete(sessionId);
    this.todosBySession.delete(sessionId);
    this.sessionCwd.delete(sessionId);
    this.usageBySession.delete(sessionId);
    this.budgets.delete(sessionId);
    this.budgetStoppedSessions.delete(sessionId);
    this.teamStateBySession.delete(sessionId);
    // Resolve any pending approvals/questions for the deleted session so the
    // UI is never left waiting on a dead session's decision.
    for (const [requestId, pending] of this.approvals) {
      if (pending.request.sessionId === sessionId) {
        clearTimeout(pending.timer);
        this.approvals.delete(requestId);
        pending.resolve({ approved: false, reason: "Session deleted" });
      }
    }
    for (const [requestId, pending] of this.questions) {
      if (pending.sessionId === sessionId) {
        clearTimeout(pending.timer);
        this.questions.delete(requestId);
        pending.resolve(pending.options[0] ?? "");
      }
    }
    this.userInstructionServices.get(sessionId)?.stop();
    this.userInstructionServices.delete(sessionId);
    return deleted;
  }

  async listSessions(): Promise<unknown[]> {
    return this.requireCline().list(200);
  }

  async getSession(sessionId: string): Promise<unknown> {
    const session = (await this.requireCline().get(sessionId)) as
      | { metadata?: Record<string, unknown> }
      | undefined;
    if (!session) return session;
    // Surface the live session mode (falling back to persisted metadata) so the
    // frontend can restore the correct read-only tab after re-attach/resume.
    const metadata = session.metadata ?? {};
    const mode = this.sessionModes.get(sessionId) ?? metadata.mode;
    const fastMode = this.fastModes.get(sessionId) ?? metadata.fastMode === true;
    return { ...session, mode, fastMode };
  }

  /**
   * Best-effort persist of a session's mode into the SDK manifest metadata so
   * stop→resume and app restarts can restore read-only enforcement. Written only
   * when the value changed to avoid redundant manifest writes.
   */
  private async persistSessionMode(sessionId: string, mode: string): Promise<void> {
    try {
      const cline = this.requireCline();
      const session = (await cline.get(sessionId)) as { metadata?: Record<string, unknown> } | undefined;
      const metadata = session?.metadata ?? {};
      if (metadata.mode === mode) return;
      await cline.update(sessionId, { metadata: { ...metadata, mode } });
    } catch (err) {
      console.warn(`[yzpz-agent] failed to persist mode for ${sessionId}: ${err}`);
    }
  }

  /**
   * Toggle Fast mode for a session and persist it in the SDK manifest metadata
   * so it survives stop→resume and app restarts. Every later send (including
   * auto-continue and error-recovery follow-ups) then prepends the speed
   * directive to the prompt.
   */
  async setFastMode(sessionId: string, enabled: boolean): Promise<void> {
    this.fastModes.set(sessionId, enabled);
    const cline = this.requireCline();
    try {
      const session = (await cline.get(sessionId)) as { metadata?: Record<string, unknown> } | undefined;
      const metadata = session?.metadata ?? {};
      if (metadata.fastMode === enabled) return;
      await cline.update(sessionId, { metadata: { ...metadata, fastMode: enabled } });
    } catch (err) {
      console.warn(`[yzpz-agent] failed to persist fast mode for ${sessionId}: ${err}`);
    }
  }

  async readMessages(sessionId: string): Promise<unknown[]> {
    const cline = this.requireCline();
    try {
      return await cline.readLiveMessages(sessionId);
    } catch {
      return cline.readMessages(sessionId);
    }
  }

  /**
   * Cheap history-browser preview: message count + last assistant text (falling
   * back to the last user prompt). Reads only the session's transcript.
   */
  async getSessionPreview(sessionId: string): Promise<{ messageCount: number; preview: string }> {
    const msgs = (await this.readMessages(sessionId)) as Array<{
      role?: string;
      content?: unknown;
      text?: string;
    }>;
    let preview = "";
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m?.role === "assistant") {
        const text = extractPlainText(m.content ?? m.text);
        if (text.trim()) {
          preview = text.trim();
          break;
        }
      } else if (m?.role === "user" && !preview) {
        const text = extractPlainText(m.content ?? m.text);
        if (text.trim()) preview = text.trim().slice(0, 240);
      }
    }
    if (preview.length > 320) preview = `${preview.slice(0, 317)}…`;
    return { messageCount: msgs.length, preview };
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    await this.requireCline().update(sessionId, { title });
  }

  async updateModel(sessionId: string, modelId: string): Promise<void> {
    await this.ensureSessionActive(sessionId);
    await this.requireCline().updateSessionModel(sessionId, modelId);
  }

  async getUsage(sessionId: string): Promise<unknown> {
    return this.requireCline().getAccumulatedUsage(sessionId);
  }

  // ── Settings / controls ────────────────────────────────────────────

  async getSettings(): Promise<Record<string, unknown>> {
    const catalog = getCoreBuiltinToolCatalog();
    const policies = this.getToolPolicyStore().getAll();
    return {
      global: {
        ...readGlobalSettings(),
        defaultProviderId: this.prefs.defaultProviderId ?? null,
      },
      tools: catalog.map((t: ToolCatalogEntry) => ({
        id: t.id,
        description: t.description,
        defaultEnabled: t.defaultEnabled,
        policy: policies[t.id] ?? null,
      })),
      // Never expose provider secrets (apiKey / OAuth refresh tokens) to the
      // renderer, even through the settings view — project them into a safe,
      // status-only shape just like list-provider-configs does.
      providerConfigs: this.getProviderStore().list().map(({ apiKey, oauth, ...config }) => ({
        ...config,
        hasApiKey: Boolean(apiKey),
        hasOAuth: Boolean(oauth),
        oauthEmail: oauth?.email ?? null,
      })),
    };
  }

  async updateSettings(update: Record<string, unknown>): Promise<Record<string, unknown>> {
    const {
      compactionMode,
      planActMode,
      toolAutoApprove,
      telemetryOptOut,
      autoUpdateEnabled,
      disabledTools,
      defaultProviderId,
    } = update as {
      compactionMode?: "off" | "basic" | "agentic";
      planActMode?: "plan" | "act";
      toolAutoApprove?: boolean;
      telemetryOptOut?: boolean;
      autoUpdateEnabled?: boolean;
      disabledTools?: string[];
      defaultProviderId?: string | null;
    };
    if (compactionMode !== undefined) setCompactionModeGlobally(compactionMode);
    if (planActMode !== undefined) setPlanActModeGlobally(planActMode);
    if (toolAutoApprove !== undefined) setToolAutoApproveGlobally(Boolean(toolAutoApprove));
    if (telemetryOptOut !== undefined) setTelemetryOptOutGlobally(Boolean(telemetryOptOut));
    if (autoUpdateEnabled !== undefined) setAutoUpdateEnabledGlobally(Boolean(autoUpdateEnabled));
    if (disabledTools !== undefined) setDisabledTools(disabledTools, true);
    if (defaultProviderId !== undefined) {
      if (defaultProviderId === null || defaultProviderId === "") {
        delete this.prefs.defaultProviderId;
      } else {
        this.prefs.defaultProviderId = defaultProviderId;
      }
      this.savePrefs();
    }
    return this.getSettings();
  }

  setToolPolicy(name: string, policy: { enabled?: boolean; autoApprove?: boolean }): Record<string, unknown> {
    this.getToolPolicyStore().set(name, policy);
    return { ok: true };
  }

  clearToolPolicy(name: string): Record<string, unknown> {
    this.getToolPolicyStore().clear(name);
    return { ok: true };
  }

  async listUserInstructions(type: UserInstructionConfigType): Promise<unknown[]> {
    const svc = this.getGlobalUserInstructionService();
    const out: Array<{
      id: string;
      filePath: string;
      name: string;
      description: string | null;
      disabled: boolean;
      instructions: string;
    }> = svc.listRecords(type).map((r: UserInstructionConfigRecord) => ({
      id: r.id,
      filePath: r.filePath,
      name: r.item.name,
      description: (r.item as { description?: string }).description ?? null,
      disabled: Boolean((r.item as { disabled?: boolean }).disabled),
      instructions: r.item.instructions,
    }));

    // Merge a direct scan so global skill packages (normally nested as
    // `<skill>/SKILL.md`) are visible immediately, independent of the config
    // watcher's debounce.
    const directories =
      type === "skill"
        ? compatibleSkillDirectories(this.dataDir)
        : [join(this.dataDir, type === "workflow" ? "workflows" : "rules")];
    for (const directory of directories) {
      for (const filePath of markdownFilesUnder(directory)) {
        if (out.some((r) => r.filePath === filePath)) continue;
        try {
          const raw = readFileSync(filePath, "utf8");
          const fallback = basename(filePath).replace(/\.md$/, "");
          const item =
            type === "skill"
              ? parseSkillConfigFromMarkdown(raw, fallback)
              : type === "workflow"
                ? parseWorkflowConfigFromMarkdown(raw, fallback)
                : parseRuleConfigFromMarkdown(raw, fallback);
          out.push({
            id: fallback,
            filePath,
            name: item.name,
            description: item.description ?? null,
            disabled: Boolean(item.disabled),
            instructions: item.instructions,
          });
        } catch {
          // unparsable file — skip
        }
      }
    }
    return out;
  }

  async addUserInstruction(
    type: UserInstructionConfigType,
    name: string,
    description?: string,
    instructions?: string,
  ): Promise<Record<string, unknown>> {
    const dir =
      type === "skill"
        ? join(this.dataDir, "skills")
        : type === "workflow"
          ? join(this.dataDir, "workflows")
          : join(this.dataDir, "rules");
    mkdirSync(dir, { recursive: true });
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "untitled";
    const filePath = join(dir, `${slug}.md`);
    if (existsSync(filePath)) throw new Error(`File already exists: ${filePath}`);
    const body = `---\nname: ${name}\ndescription: ${description ?? ""}\ndisabled: false\n---\n\n${instructions ?? ""}\n`;
    writeFileSync(filePath, body, "utf8");
    const svc = this.getGlobalUserInstructionService();
    await svc.refreshType(type);
    return { filePath };
  }

  async toggleUserInstruction(
    type: UserInstructionConfigType,
    id: string,
    enabled: boolean,
  ): Promise<Record<string, unknown>> {
    const items = (await this.listUserInstructions(type)) as Array<{
      id: string;
      filePath: string;
      name: string;
    }>;
    const rec = items.find((r) => r.id === id || r.name === id || r.filePath.endsWith(`${id}.md`));
    if (!rec) throw new Error(`Not found: ${id}`);
    await this.setFrontmatterDisabled(rec.filePath, !enabled);
    const svc = this.getGlobalUserInstructionService();
    await svc.refreshType(type).catch(() => undefined);
    return { id: rec.id, enabled };
  }

  /** Flip the `disabled:` key in a markdown frontmatter file, in place. */
  private async setFrontmatterDisabled(filePath: string, disabled: boolean): Promise<void> {
    const raw = readFileSync(filePath, "utf8");
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
    if (!match) throw new Error(`Not a frontmatter file: ${filePath}`);
    const lines = match[1].split(/\r?\n/);
    let hasDisabled = false;
    const out = lines.map((line) => {
      if (/^disabled\s*:/.test(line)) {
        hasDisabled = true;
        return `disabled: ${disabled}`;
      }
      return line;
    });
    if (!hasDisabled) out.push(`disabled: ${disabled}`);
    writeFileSync(filePath, `---\n${out.join("\n")}\n---\n${match[2]}`, "utf8");
  }

  listRuntimeCommands(): unknown[] {
    return this.getGlobalUserInstructionService().listRuntimeCommands();
  }

  async dispose(): Promise<void> {
    for (const pending of this.questions.values()) {
      clearTimeout(pending.timer);
      pending.resolve(pending.options[0] ?? "");
    }
    this.questions.clear();
    this.sessionModes.clear();
    this.activeSessions.clear();
    this.runningSessions.clear();
    this.startingSessions.clear();
    for (const timer of this.recoveryTimers.values()) clearTimeout(timer);
    this.recoveryTimers.clear();
    this.pendingRecoveryErrors.clear();
    this.queuedPromptsBySession.clear();
    this.completionNudges.clear();
    this.todosBySession.clear();
    this.usageBySession.clear();
    this.budgets.clear();
    this.budgetStoppedSessions.clear();
    this.teamStateBySession.clear();
    this.recoveryAttempts.clear();
    this.recoveryWindow.clear();
    this.recoveryExhausted.clear();
    this.suppressRecovery.clear();
    this.fastModes.clear();
    for (const svc of this.userInstructionServices.values()) {
      try {
        svc.stop();
      } catch {
        // best-effort
      }
    }
    this.userInstructionServices.clear();
    if (this.globalUserInstructionService) {
      try {
        this.globalUserInstructionService.stop();
      } catch {
        // best-effort
      }
      this.globalUserInstructionService = null;
    }
    if (this.mcpManager) {
      try {
        await this.mcpManager.dispose();
      } catch {
        // best-effort
      }
      this.mcpManager = null;
    }
    if (this.cline) {
      try {
        await this.cline.dispose();
      } catch {
        // best-effort
      }
      this.cline = null;
      this.started = false;
    }
  }

  static async getProviders(): Promise<unknown[]> {
    const providers = (await Llms.getAllProviders()) as Array<{
      id: string;
      name?: string;
      baseUrl?: string;
      defaultModelId?: string;
    }>;
    return providers.map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
      baseUrl: p.baseUrl ?? null,
      defaultModelId: p.defaultModelId ?? null,
    }));
  }

  static async getModels(providerId: string): Promise<unknown[]> {
    const result = (await Llms.getModelsForProvider(providerId)) as Record<
      string,
      {
        id?: string;
        name?: string;
        contextWindow?: number | null;
        maxOutput?: number | null;
        capabilities?: string[];
        reasoningOptions?: Array<{ type: string; values?: Array<string | null>; min?: number; max?: number }>;
      }
    >;
    const models = Object.values(result ?? {});
    return models.map((m) => ({
      id: m.id ?? "",
      name: m.name ?? m.id ?? "",
      contextWindow: m.contextWindow ?? null,
      maxOutput: m.maxOutput ?? null,
      capabilities: m.capabilities ?? [],
      reasoningOptions: m.reasoningOptions ?? [],
    }));
  }

  static async getProviderIds(): Promise<string[]> {
    return (await Llms.getProviderIds()) as string[];
  }
}

/** Flatten a message's content blocks (text/thinking/tool-result) to plain text. */
function extractPlainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (typeof b.text === "string" && b.text.trim()) parts.push(b.text);
      else if (b.type === "tool_result" && typeof b.content === "string" && b.content.trim()) {
        parts.push(b.content);
      }
    }
    return parts.join("\n");
  }
  return "";
}
