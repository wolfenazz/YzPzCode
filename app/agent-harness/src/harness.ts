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
  type CoreSessionEvent,
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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { buildSystemPrompt } from "./branding.js";
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
// The SDK triggers compaction at ~90% of the model's effective context window.
// With today's 1M-token models that lets a single run balloon past 800K tokens
// before anything is compacted. We cap the effective window the runtime budgets
// against (via knownModels) so requests stay small and compaction runs early.
const DEFAULT_CONTEXT_TOKEN_BUDGET = 96_000;
// Cap model output per API call so turns cannot ramble.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
// Hard ceiling on loop iterations (prevents runaway tool loops).
const DEFAULT_MAX_ITERATIONS = 20;
// Recent context preserved verbatim after compaction. PI uses keepRecentTokens
// = 20000 for its default 96K budget; we mirror that here (scaled to our cap).
const COMPACTION_PRESERVE_RECENT_TOKENS = 12_000;

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
  question: string;
  options: string[];
}

/** Instruction injected into the system prompt so agents maintain a task list. */
const TODO_INSTRUCTION = [
  "",
  "TASK LIST MAINTENANCE",
  "Use the `todo_write` tool to keep a visible task list for the user. Break the current task into small steps and create them as `pending` todos.",
  "Mark a todo `in_progress` right before you start working on it, and `completed` when you finish it. Update the whole list in a single call each time it changes.",
  "If the user asks a follow-up that extends the task, add the new steps. Never invent todos for work you are not planning to do.",
].join("\n");

/** Tools that are blocked while a session is in "ask" mode (read-only Q&A). */
const ASK_BLOCKED_TOOLS = new Set([
  "editor",
  "apply_patch",
  "write_file",
  "create_file",
  "delete_file",
  "rename_file",
  "run_commands",
  "skills",
  "spawn_agent",
  "submit_and_exit",
]);

const ASK_MODE_REASON =
  "Ask mode is read-only — it answers questions and can read/search/fetch, but it never edits files or runs commands. Switch to Act or Plan to modify files or execute commands.";

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
  /**
   * Per-session pending user messages received while a turn is in flight.
   * Delivered to the runtime via `delivery: "steer"` (the SDK's native
   * pendingPromptsController drains these after the current turn) and mirrored
   * here as a fallback that survives rehydrate/session-restore paths.
   */
  private steeringBySession = new Map<string, string[]>();
  /** Workspace root per session — used to resolve relative file paths correctly. */
  private sessionCwd = new Map<string, string>();
  /**
   * Cumulative token usage per session, accumulated from `usage` /
   * `usage-updated` agent events. Drives the live usage meter and the
   * total-token budget enforced in afterModelHook.
   */
  private usageBySession = new Map<
    string,
    { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalCost: number }
  >();
  /** Per-session max total tokens (0 = unlimited). */
  private budgets = new Map<string, number>();
  readonly dataDir: string;
  private prefsFile: string;
  private prefs: Record<string, unknown>;

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
      for (const reg of registrations) {
        await this.mcpManager.registerServer(reg);
        if (!reg.disabled) {
          await this.mcpManager.connectServer(reg.name).catch((err: unknown) => {
            console.warn(`[yzpz-agent] MCP server "${reg.name}" connect failed: ${err}`);
          });
        }
      }
    } catch (err) {
      console.warn(`[yzpz-agent] MCP manager init failed: ${err}`);
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
      this.questions.set(requestId, { resolve, timer, question, options });
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
          const prev = this.usageBySession.get(sessionId) ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalCost: 0,
          };
          const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
          const cost = typeof inner.totalCost === "number" ? inner.totalCost : inner.cost;
          const usage = {
            inputTokens: prev.inputTokens + num(inner.inputTokens),
            outputTokens: prev.outputTokens + num(inner.outputTokens),
            cacheReadTokens: prev.cacheReadTokens + num(inner.cacheReadTokens),
            cacheWriteTokens: prev.cacheWriteTokens + num(inner.cacheWriteTokens),
            totalCost: prev.totalCost + num(cost),
          };
          this.usageBySession.set(sessionId, usage);
          this.sink("usage-updated", { sessionId, usage });
          // Keep the current provider-request size separate from cumulative
          // session usage. A compacted conversation can have a small prompt
          // while its lifetime usage is large; displaying the latter as
          // "Context" made successful compaction look like a failure.
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
        if (["running", "working", "starting"].includes(status)) {
          this.runningSessions.add(event.payload.sessionId);
        } else if (["idle", "completed", "failed", "aborted", "stopped"].includes(status)) {
          this.runningSessions.delete(event.payload.sessionId);
        }
        this.sink("session-status", { sessionId: event.payload.sessionId, status: event.payload.status });
      } else if (event.type === "ended") {
        // The SDK removes the session from its in-memory runtime when it ends
        // (failure / teardown). Keep our tracking in sync so a later send can
        // transparently rehydrate it from disk.
        this.activeSessions.delete(event.payload.sessionId);
        this.runningSessions.delete(event.payload.sessionId);
        this.steeringBySession.delete(event.payload.sessionId);
        this.sink("session-ended", event.payload);
      } else if (event.type === "team_progress") {
        this.sink("team-progress", event.payload);
      } else if (event.type === "agent_event" && event.payload?.event?.type === "done") {
        this.runningSessions.delete(event.payload.sessionId);
        // PI-style completion guard: if the model stopped while the visible
        // task list still has unfinished items, steer a follow-up so it keeps
        // working instead of stopping prematurely. Native `delivery:"steer"`
        // drains after the current turn and starts the next one automatically.
        this.maybeAutoContinue(event.payload.sessionId);
      }
    });
  }

  /** Max follow-up nudges per session before we trust the model's stop. */
  private static MAX_COMPLETION_NUDGES = 2;

  /**
   * When the agent reports `done` but the todo list still has pending or
   * in-progress items, queue a steer follow-up (bounded) to keep the task
   * going — PI's shouldStopAfterTurn inverse, implemented at the session
   * level so it works regardless of which runtime backend the SDK selects.
   */
  private maybeAutoContinue(sessionId: string): void {
    const todos = this.todosBySession.get(sessionId);
    if (!todos || todos.length === 0) return;
    const unfinished = todos.filter((t) => t.status === "pending" || t.status === "in_progress");
    if (unfinished.length === 0) return;
    const nudges = this.completionNudges.get(sessionId) ?? 0;
    if (nudges >= AgentHarness.MAX_COMPLETION_NUDGES) return;
    this.completionNudges.set(sessionId, nudges + 1);
    this.sink("notice", {
      sessionId,
      message: `The task list still has ${unfinished.length} unfinished item(s) — continuing the task.`,
    });
    const items = unfinished
      .slice(0, 5)
      .map((t) => t.content ?? `#${t.id ?? "?"}`)
      .join("; ");
    const followUp = `The task list still has ${unfinished.length} unfinished item(s): ${items}. Use todo_write to mark them completed as you finish them, and do not stop until the task list is fully completed.`;
    void this.sendMessage(sessionId, followUp, "act").catch(() => undefined);
  }

  /** Merge global per-tool policies over the built-in defaults. */
  private buildToolPolicies(): Record<string, ToolPolicy> {
    const policies: Record<string, ToolPolicy> = { ...DEFAULT_TOOL_POLICIES };
    for (const [name, entry] of Object.entries(this.getToolPolicyStore().getAll())) {
      policies[name] = { ...(policies[name] ?? {}), enabled: entry.enabled, autoApprove: entry.autoApprove };
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

  private requireCline(): ClineCore {
    if (!this.cline) throw new Error("Harness not initialized");
    return this.cline;
  }

  /**
   * Cap the model's effective context window at DEFAULT_CONTEXT_TOKEN_BUDGET so
   * the runtime budgets/compacts against a small window regardless of the
   * provider's advertised (often enormous) one. Never exceeds the real window.
   */
  private async resolveCappedModelInfo(
    providerId: string,
    modelId: string,
  ): Promise<Record<string, { id: string; contextWindow?: number; maxInputTokens?: number }>> {
    const budget = DEFAULT_CONTEXT_TOKEN_BUDGET;
    try {
      const catalog = (await Llms.getModelsForProvider(providerId)) as Record<
        string,
        { id?: string; contextWindow?: number | null }
      >;
      const realWindow = catalog?.[modelId]?.contextWindow ?? undefined;
      const limit = realWindow != null ? Math.min(budget, realWindow) : budget;
      return { [modelId]: { id: modelId, contextWindow: limit, maxInputTokens: limit } };
    } catch {
      return { [modelId]: { id: modelId, contextWindow: budget, maxInputTokens: budget } };
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
    const cline = this.requireCline();
    const store = this.getProviderStore();
    const stored = store.get(args.providerId);

    // Always own the session id so the read-only (ask-mode) guard can key on it.
    const sessionId = args.sessionId?.trim() || `yzpz-${randomUUID()}`;
    this.sessionCwd.set(sessionId, args.cwd);

    // Per-session cumulative token budget (0 = unlimited). afterModelHook
    // enforces it against the accumulated usage tracked in usageBySession.
    this.budgets.set(sessionId, args.maxTotalTokens ?? 0);
    this.usageBySession.delete(sessionId); // clear any stale entry from a prior run
    this.usageBySession.set(sessionId, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0,
    });

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
          apiKey: args.apiKey ?? stored?.apiKey,
          baseUrl: args.baseUrl ?? stored?.baseUrl,
          systemPrompt: buildSystemPrompt(args.systemPrompt, args.cwd) + TODO_INSTRUCTION,
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
          knownModels: await this.resolveCappedModelInfo(args.providerId, args.modelId),
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
          // PI-style steering: the SDK's local runtime wires its own
          // consumePendingUserMessage to its pendingPromptsController (native
          // `delivery:"steer"` support); this config value is a fallback for
          // non-local runtimes and rehydrate paths.
          consumePendingUserMessage: () => this.consumePendingUserMessage(sessionId),
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
      this.sink("session-created", {
        sessionId: result.sessionId,
        workspaceId: args.workspaceId,
      });
      return {
        sessionId: result.sessionId,
        manifestPath: result.manifestPath,
        messagesPath: result.messagesPath,
      };
    } catch (err) {
      userInstructionService.stop();
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
        },
        { initialMessages: messages },
      );
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

  async sendMessage(
    sessionId: string,
    prompt: string,
    mode?: string,
    userImages: string[] = [],
    userFiles: string[] = [],
  ): Promise<unknown> {
    const cline = this.requireCline();

    // If the session is not alive in the SDK's runtime (closed pane, app
    // restart, prior teardown), rehydrate it from disk first so sending never
    // fails with a hidden "session not found". Surface unresumable sessions.
    if (!this.activeSessions.has(sessionId)) {
      const result = await this.resumeSession(sessionId);
      if (result.error) {
        this.sink("session-error", { sessionId, error: result.error });
        return { accepted: false, error: result.error };
      }
    }

    // Remember the mode for this session so the read-only (ask-mode) guard can
    // block mutating tools on the current turn.
    this.sessionModes.set(sessionId, mode ?? "act");

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

    // PI-style steering: only an in-flight turn receives a follow-up through
    // the SDK's "steer" channel. `activeSessions` only tells us the session
    // exists in memory; treating it as "running" left a new chat's first
    // message queued forever with no turn to drain it.
    const isRunning = this.runningSessions.has(sessionId);
    if (isRunning) {
      this.steerSession(sessionId, runtimePrompt);
    } else {
      // Mark this before the asynchronous send begins so a quick second
      // message is correctly queued as a follow-up rather than starting a
      // competing turn.
      this.runningSessions.add(sessionId);
    }

    // Fire-and-forget: the turn runs in the background and streams events via
    // the subscription. Never block the caller on turn completion. When the
    // session is already running, `delivery: "steer"` queues the message and
    // our consumePendingUserMessage hook feeds it in at the next iteration.
    void cline
      .send({
        sessionId,
        prompt: runtimePrompt,
        mode: sdkMode as never,
        userImages,
        userFiles,
        delivery: isRunning ? ("steer" as never) : undefined,
      })
      .catch((err: unknown) => {
        this.runningSessions.delete(sessionId);
        this.sink("session-error", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return { accepted: true };
  }

  /**
   * Blocks mutating tools while a session is in "ask" mode so the agent answers
   * questions without ever editing files or running commands.
   */
  private beforeToolGuard(sessionId: string, toolName: string): { skip: boolean; reason: string } | undefined {
    if ((this.sessionModes.get(sessionId) ?? "act") !== "ask") return undefined;
    if (ASK_BLOCKED_TOOLS.has(toolName) || toolName.startsWith("team_")) {
      return { skip: true, reason: ASK_MODE_REASON };
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
      if (capped.every((line, i) => line === lines[i])) {
        // No line was truncated; still bound the total via head truncation.
        const r = truncateHead(output, { maxLines: 200, maxBytes: DEFAULT_MAX_BYTES });
        if (!r.truncated) return { output, truncated: false };
        return {
          output: `${r.content}\n\n[Search results truncated: showing ${r.outputLines} of ${r.totalLines} lines.]`,
          truncated: true,
        };
      }
      return { output: capped.join("\n"), truncated: true };
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
    if (limit > 0 && u) {
      const total = u.inputTokens + u.outputTokens + u.cacheReadTokens;
      if (total >= limit) {
        this.sink("session-ended", { sessionId, reason: "token-budget-exceeded", ts: Date.now() });
        this.sink("notice", {
          sessionId,
          message: `Token budget exceeded — stopped at ${total} / ${limit} tokens to prevent runaway usage.`,
        });
        this.sink("session-status", { sessionId, status: "done" });
        return { stop: true, reason: "token-budget-exceeded" };
      }
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

  /**
   * consumePendingUserMessage: PI-style steering. The SDK polls this at the top
   * of each loop iteration (after the first); we return one queued user message
   * at a time so a message typed mid-run is injected after the current turn.
   */
  private consumePendingUserMessage(sessionId: string): string | undefined {
    const queue = this.steeringBySession.get(sessionId);
    if (!queue || queue.length === 0) return undefined;
    const next = queue.shift();
    if (queue.length === 0) this.steeringBySession.delete(sessionId);
    return next;
  }

  /** Queue a user message for delivery after the current turn (steering). */
  private steerSession(sessionId: string, prompt: string): void {
    const queue = this.steeringBySession.get(sessionId) ?? [];
    queue.push(prompt);
    this.steeringBySession.set(sessionId, queue);
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
    const todos = this.todosBySession.get(sessionId);
    if (!todos || todos.length === 0) return undefined;
    const unfinished = todos.filter((t) => t.status === "pending" || t.status === "in_progress");
    if (unfinished.length === 0) return undefined;
    return `The task list still has ${unfinished.length} unfinished item(s). Use todo_write to mark them completed as you finish them, and do not stop until the task list is fully completed.`;
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
    const cline = this.requireCline();
    const session = (await cline.get(sessionId)) as { metadata?: Record<string, unknown> } | undefined;
    const metadata = session?.metadata ?? {};
    const targetProviderId = (update.providerId ?? metadata.providerId) as string | undefined;
    const savedProviderConfig = targetProviderId ? this.getProviderStore().get(targetProviderId) : undefined;

    // Build the SDK update explicitly, dropping undefined/null for the reasoning
    // fields so a model switch never clears an effort the user already chose.
    const sdkUpdate: Record<string, unknown> = {};
    if (update.providerId !== undefined) sdkUpdate.providerId = update.providerId;
    if (update.modelId !== undefined) sdkUpdate.modelId = update.modelId;
    if (update.apiKey !== undefined) {
      sdkUpdate.apiKey = update.apiKey;
    } else if (update.providerId !== undefined && savedProviderConfig?.apiKey) {
      // A UI provider switch does not send secrets back through the renderer.
      // Reuse the key held by the harness for the newly-selected provider.
      sdkUpdate.apiKey = savedProviderConfig.apiKey;
    }
    if (update.baseUrl !== undefined) {
      sdkUpdate.baseUrl = update.baseUrl;
    } else if (update.providerId !== undefined && savedProviderConfig?.baseUrl) {
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
      });
    }
    return {};
  }

  async abort(sessionId: string): Promise<void> {
    await this.requireCline().abort(sessionId);
    this.runningSessions.delete(sessionId);
  }

  /** Unlink a provider (removes its credentials from the global store). */
  removeProviderConfig(providerId: string): { removed: boolean } {
    this.getProviderStore().clear(providerId);
    return { removed: true };
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
    await this.requireCline().abort(sessionId);
    this.sessionModes.delete(sessionId);
    this.steeringBySession.delete(sessionId);
    this.completionNudges.delete(sessionId);
    this.usageBySession.delete(sessionId);
    this.budgets.delete(sessionId);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = await this.requireCline().delete(sessionId);
    if (deleted) {
      this.sink("session-deleted", { sessionId });
    }
    this.activeSessions.delete(sessionId);
    this.runningSessions.delete(sessionId);
    this.sessionModes.delete(sessionId);
    this.steeringBySession.delete(sessionId);
    this.completionNudges.delete(sessionId);
    this.todosBySession.delete(sessionId);
    this.sessionCwd.delete(sessionId);
    this.usageBySession.delete(sessionId);
    this.budgets.delete(sessionId);
    this.userInstructionServices.get(sessionId)?.stop();
    this.userInstructionServices.delete(sessionId);
    return deleted;
  }

  async listSessions(): Promise<unknown[]> {
    return this.requireCline().list(200);
  }

  async getSession(sessionId: string): Promise<unknown> {
    return this.requireCline().get(sessionId);
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
      providerConfigs: this.getProviderStore().list(),
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
    this.steeringBySession.clear();
    this.completionNudges.clear();
    this.todosBySession.clear();
    this.usageBySession.clear();
    this.budgets.clear();
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
