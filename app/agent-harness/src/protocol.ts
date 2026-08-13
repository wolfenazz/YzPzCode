// YZPZ Agent sidecar — wire protocol types (shared with Rust backend).
// Envelope mirrors Cline's desktop-app transport.

export interface CommandMessage {
  type: "command";
  id: string;
  command: string;
  args?: Record<string, unknown>;
}

export interface ResponseMessage {
  type: "response";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface EventMessage {
  type: "event";
  event: { name: string; payload: unknown };
}

export type ServerMessage = ResponseMessage | EventMessage;
export type ClientMessage = CommandMessage;

export interface ApprovalRequestPayload {
  requestId: string;
  sessionId: string;
  agentId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  policy: string;
  pendingCount: number;
}

/** Emitted when the agent's `ask_question` tool needs a user decision. */
export interface QuestionRequestPayload {
  requestId: string;
  sessionId: string;
  agentId: string;
  question: string;
  options: string[];
}

/** One item in the agent-maintained task list (todo_write tool). */
export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

/** Emitted whenever the agent rewrites its task list. */
export interface TodoUpdatedPayload {
  sessionId: string;
  todos: TodoItem[];
}

/** Read model of an MCP server for the settings/agent UI. */
export interface McpServerView {
  name: string;
  status: "connected" | "connecting" | "disconnected";
  disabled: boolean;
  lastError?: string | null;
  toolCount: number;
  transport: { type: string; command?: string; args?: string[]; url?: string } | null;
}
