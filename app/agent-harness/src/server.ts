import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "./protocol.js";
import { AgentHarness } from "./harness.js";
import type { ProviderConfigStore } from "./store.js";
import type { CatalogSync } from "./catalog-sync.js";

type CommandHandler = (args: Record<string, unknown>) => Promise<unknown>;

/** Credentials stay in the harness process. The renderer only needs to know
 * whether a provider has a saved key in order to present connection controls. */
const toSafeProviderConfigs = (configs: ReturnType<ProviderConfigStore["list"]>) =>
  configs.map(({ apiKey, ...config }) => ({
    ...config,
    hasApiKey: Boolean(apiKey),
  }));

export class AgentServer {
  private wss: WebSocketServer;
  private harness: AgentHarness;
  private store: ProviderConfigStore;
  private catalogSync: CatalogSync | undefined;
  private clients = new Set<WebSocket>();

  constructor(harness: AgentHarness, store: ProviderConfigStore, wss: WebSocketServer, catalogSync?: CatalogSync) {
    this.harness = harness;
    this.store = store;
    this.wss = wss;
    this.catalogSync = catalogSync;
    this.harness.setEventSink((name, payload) => this.broadcast({ type: "event", event: { name, payload } }));
    this.catalogSync?.setEventSink((name, payload) => this.broadcast({ type: "event", event: { name, payload } }));
    this.wss.on("connection", (socket) => this.onConnection(socket));
  }

  private onConnection(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on("message", (data) => {
      void this.onMessage(socket, data.toString());
    });
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
    // Push a small hello so the Rust side knows the transport is live.
    this.send(socket, {
      type: "event",
      event: { name: "hello", payload: { pid: process.pid, version: "0.1.0" } },
    });
  }

  private handlers(): Record<string, CommandHandler> {
    return {
      health: async () => ({
        pid: process.pid,
        ready: true,
        pendingApprovals: this.harness.pendingApprovalCount(),
      }),
      "create-session": async (args) => {
        const required = ["workspaceId", "cwd", "providerId", "modelId"];
        for (const key of required) {
          if (!args[key]) throw new Error(`Missing required arg: ${key}`);
        }
        return this.harness.createSession({
          sessionId: args.sessionId as string | undefined,
          workspaceId: args.workspaceId as string,
          cwd: args.cwd as string,
          providerId: args.providerId as string,
          modelId: args.modelId as string,
          apiKey: args.apiKey as string | undefined,
          baseUrl: args.baseUrl as string | undefined,
          systemPrompt: args.systemPrompt as string | undefined,
          title: args.title as string | undefined,
          enableAgentTeams: args.enableAgentTeams as boolean | undefined,
          teamName: args.teamName as string | undefined,
          compactionStrategy: args.compactionStrategy as "basic" | "agentic" | undefined,
          maxTotalTokens: args.maxTotalTokens as number | undefined,
        });
      },
      "resume-session": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        return this.harness.resumeSession(args.sessionId as string);
      },
      "update-connection": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        await this.harness.updateConnection(args.sessionId as string, {
          providerId: args.providerId as string | undefined,
          modelId: args.modelId as string | undefined,
          apiKey: args.apiKey as string | undefined,
          baseUrl: args.baseUrl as string | undefined,
          thinking: args.thinking as boolean | undefined,
          reasoningEffort: args.reasoningEffort as string | undefined,
        });
        return {};
      },
      "get-settings": async () => this.harness.getSettings(),
      "update-settings": async (args) =>
        this.harness.updateSettings((args.update as Record<string, unknown>) ?? {}),
      "set-tool-policy": async (args) => {
        if (!args.name) throw new Error("name is required");
        return this.harness.setToolPolicy(args.name as string, {
          enabled: args.enabled as boolean | undefined,
          autoApprove: args.autoApprove as boolean | undefined,
        });
      },
      "clear-tool-policy": async (args) => {
        if (!args.name) throw new Error("name is required");
        return this.harness.clearToolPolicy(args.name as string);
      },
      "list-user-instructions": async (args) => {
        if (!args.type) throw new Error("type is required");
        return { items: await this.harness.listUserInstructions(args.type as "skill" | "workflow" | "rule") };
      },
      "add-user-instruction": async (args) => {
        if (!args.type || !args.name) throw new Error("type and name are required");
        return this.harness.addUserInstruction(
          args.type as "skill" | "workflow" | "rule",
          args.name as string,
          args.description as string | undefined,
          args.instructions as string | undefined,
        );
      },
      "toggle-user-instruction": async (args) => {
        if (!args.type || !args.id) throw new Error("type and id are required");
        return this.harness.toggleUserInstruction(
          args.type as "skill" | "workflow" | "rule",
          args.id as string,
          args.enabled !== false,
        );
      },
      "list-runtime-commands": async () => ({ commands: this.harness.listRuntimeCommands() }),
      "answer-question": async (args) => {
        if (!args.requestId) throw new Error("requestId is required");
        if (typeof args.answer !== "string") throw new Error("answer is required");
        const resolved = this.harness.answerQuestion(args.requestId as string, args.answer as string);
        return { resolved };
      },
      "list-mcp-servers": async () => ({ servers: await this.harness.listMcpServers() }),
      "add-mcp-server": async (args) => {
        if (!args.name) throw new Error("name is required");
        if (!args.transport || typeof args.transport !== "object") {
          throw new Error("transport is required (e.g. { type: 'stdio', command, args } or { type: 'sse', url })");
        }
        return { server: await this.harness.addMcpServer(args.name as string, args.transport as never) };
      },
      "remove-mcp-server": async (args) => {
        if (!args.name) throw new Error("name is required");
        return this.harness.removeMcpServer(args.name as string);
      },
      "set-mcp-server-disabled": async (args) => {
        if (!args.name) throw new Error("name is required");
        return { server: await this.harness.setMcpServerDisabled(args.name as string, args.disabled !== false) };
      },
      "send-message": async (args) => {
        if (!args.sessionId || !args.prompt) throw new Error("sessionId and prompt are required");
        return this.harness.sendMessage(
          args.sessionId as string,
          args.prompt as string,
          args.mode as string | undefined,
          Array.isArray(args.userImages) ? args.userImages.filter((path): path is string => typeof path === "string") : [],
          Array.isArray(args.userFiles) ? args.userFiles.filter((path): path is string => typeof path === "string") : [],
        );
      },
      abort: async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        await this.harness.abort(args.sessionId as string);
        return {};
      },
      "pending-prompts": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        return { prompts: await this.harness.listPendingPrompts(args.sessionId as string) };
      },
      "remove-pending-prompt": async (args) => {
        if (!args.sessionId || !args.promptId) throw new Error("sessionId and promptId are required");
        return { removed: await this.harness.removePendingPrompt(args.sessionId as string, args.promptId as string) };
      },
      stop: async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        await this.harness.stop(args.sessionId as string);
        return {};
      },
      "delete-session": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        return { deleted: await this.harness.deleteSession(args.sessionId as string) };
      },
      "list-sessions": async () => ({ sessions: await this.harness.listSessions() }),
      "get-session": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        return { session: (await this.harness.getSession(args.sessionId as string)) ?? null };
      },
      "read-messages": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        return { messages: await this.harness.readMessages(args.sessionId as string) };
      },
      "get-session-preview": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        return { preview: await this.harness.getSessionPreview(args.sessionId as string) };
      },
      "update-title": async (args) => {
        if (!args.sessionId || !args.title) throw new Error("sessionId and title are required");
        await this.harness.updateTitle(args.sessionId as string, args.title as string);
        return {};
      },
      "update-model": async (args) => {
        if (!args.sessionId || !args.modelId) throw new Error("sessionId and modelId are required");
        await this.harness.updateModel(args.sessionId as string, args.modelId as string);
        return {};
      },
      "set-fast-mode": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        await this.harness.setFastMode(args.sessionId as string, args.enabled !== false);
        return {};
      },
      "approve-tool": async (args) => {
        if (!args.requestId) throw new Error("requestId is required");
        const resolved = this.harness.resolveApproval(
          args.requestId as string,
          args.approved !== false,
          args.reason as string | undefined,
        );
        return { resolved };
      },
      "get-providers": async () => ({ providers: await AgentHarness.getProviders() }),
      "get-provider-ids": async () => ({ providers: await AgentHarness.getProviderIds() }),
      "get-models": async (args) => {
        if (!args.providerId) throw new Error("providerId is required");
        return { models: await AgentHarness.getModels(args.providerId as string) };
      },
      "refresh-catalogs": async (args) => {
        if (!this.catalogSync) throw new Error("catalog sync unavailable");
        return this.catalogSync.sync({ force: args.force === true });
      },
      "set-provider-config": async (args) => {
        if (!args.providerId) throw new Error("providerId is required");
        this.store.set({
          providerId: args.providerId as string,
          apiKey: args.apiKey as string | undefined,
          baseUrl: args.baseUrl as string | undefined,
          modelId: args.modelId as string | undefined,
        });
        return { configs: toSafeProviderConfigs(this.store.list()) };
      },
      "list-provider-configs": async () => ({ configs: toSafeProviderConfigs(this.store.list()) }),
      "remove-provider-config": async (args) => {
        if (!args.providerId) throw new Error("providerId is required");
        return this.harness.removeProviderConfig(args.providerId as string);
      },
      "get-usage": async (args) => {
        if (!args.sessionId) throw new Error("sessionId is required");
        return { usage: (await this.harness.getUsage(args.sessionId as string)) ?? null };
      },
      ping: async () => ({ pong: true, ts: Date.now() }),
    };
  }

  // Commands that only need static Llms data, the provider store, or global
  // settings and never touch ClineCore; everything else waits for the harness
  // to be initialized. Settings/skills/tool-policy commands still wait for init
  // so setClineDir() has rebranded the data dir to ~/.yzpzcode/agent.
  private static readonly NO_INIT_COMMANDS = new Set([
    "ping",
    "health",
    "get-providers",
    "get-provider-ids",
    "get-models",
    "refresh-catalogs",
    "list-provider-configs",
    "set-provider-config",
  ]);

  private async onMessage(socket: WebSocket, raw: string): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      this.send(socket, { type: "response", id: "0", ok: false, error: "Invalid JSON" });
      return;
    }

    if (message.type !== "command" || !message.command || !message.id) {
      this.send(socket, { type: "response", id: message?.id ?? "0", ok: false, error: "Malformed command" });
      return;
    }

    const handler = this.handlers()[message.command];
    if (!handler) {
      this.send(socket, {
        type: "response",
        id: message.id,
        ok: false,
        error: `Unknown command: ${message.command}`,
      });
      return;
    }

    try {
      if (!AgentServer.NO_INIT_COMMANDS.has(message.command)) {
        await this.harness.ensureInit();
      }
      const result = await handler(message.args ?? {});
      this.send(socket, { type: "response", id: message.id, ok: true, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[yzpz-agent] command ${message.command} failed: ${error}`);
      this.send(socket, { type: "response", id: message.id, ok: false, error });
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    const raw = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  async close(): Promise<void> {
    for (const client of this.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
