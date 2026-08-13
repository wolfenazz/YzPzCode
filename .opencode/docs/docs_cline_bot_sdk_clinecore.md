# ClineCore - Cline

> Source: https://docs.cline.bot/sdk/clinecore
> Cached: 2026-08-13T09:54:53.768Z

---

## On this page

- [When to use which](#when-to-use-which)
- [ClineCore](#clinecore)
[Methods](#methods)

- [Backend Modes](#backend-modes)
- [Session Artifacts](#session-artifacts)
- [Tool Approval](#tool-approval)
- [Using Agent directly](#using-agent-directly)
[Agent Methods](#agent-methods)
- [Multi-Turn Conversations](#multi-turn-conversations)

[Concepts](/sdk/plugins)# ClineCore

The full Cline harness: built-in tools, sessions, approvals, scheduling, and hub support.

`ClineCore` is the full Cline harness as a programmable runtime. It gives you everything Cline ships out of the box: built-in tools for files, shell, search, and web; session persistence and message history; tool approval callbacks; local, hub, and remote backends; scheduling and automation APIs; and plugin support.
Under the hood, `ClineCore` uses the `Agent` class from `@cline/agents`. You can use `Agent` directly if you want to skip the harness and wire everything yourself: your own tools, your own persistence, your own lifecycle.
## [​](#when-to-use-which)When to use which

NeedUseSessions, persistence, message history`ClineCore`Built-in tools for files, shell, search, web fetch`ClineCore`Hub/remote runtime`ClineCore`Scheduling or event automation`ClineCore`Multi-agent teams`ClineCore`Browser-compatible or lightweight in-process agent`Agent`Custom tools only, no built-ins`Agent`Full control over persistence and lifecycle`Agent`
## [​](#clinecore)ClineCore

`ClineCore` wraps runtime execution with application features:

- session manifests and message artifacts

- built-in tools

- tool approval callbacks

- local, hub, and remote backends

- automation/scheduling APIs

- optional plugin paths and extensions

```
import { ClineCore } from "@cline/sdk"

const cline = await ClineCore.create({
  clientName: "my-app",
  backendMode: "auto",
})

const session = await cline.start({
  prompt: "Set up GitHub Actions for this repo",
  config: {
    providerId: "anthropic",
    modelId: "claude-sonnet-4-6",
    apiKey: process.env.ANTHROPIC_API_KEY,
    systemPrompt: "You are a helpful coding assistant.",
    cwd: "/path/to/project",
    workspaceRoot: "/path/to/project",
    enableTools: true,
    enableSpawnAgent: false,
    enableAgentTeams: false,
  },
})

console.log(session.sessionId)
console.log(session.result?.finishReason)

```

### [​](#methods)Methods

MethodPurpose`ClineCore.create(options)`Create the runtime`start(input)`Start a session`send({ sessionId, prompt })`Send a follow-up message`subscribe(listener, options?)`Listen to session events`list(limit?, options?)`List sessions with history metadata`get(sessionId)`Read session metadata`readMessages(sessionId)`Read session messages`getAccumulatedUsage(sessionId)`Read session token/cost totals`abort(sessionId, reason?)`Abort current work`stop(sessionId)`Stop a session`delete(sessionId)`Delete a session`dispose(reason?)`Clean up runtime resources
See [ClineCore reference](/sdk/reference/cline-core) for exact signatures.
## [​](#backend-modes)Backend Modes

ModeBehavior`auto`Prefer a compatible local hub, otherwise use local execution`hub`Require a compatible WebSocket hub`remote`Connect to a configured remote hub`local`Always use local in-process execution and local storage
For process topology, see [Hub & Spoke](/sdk/architecture/hub-spoke).
## [​](#session-artifacts)Session Artifacts

`ClineCore` stores session manifests and messages as files. A session result includes:
FieldMeaning`sessionId`Session identifier`manifest`Parsed session manifest`manifestPath`Path to the session manifest JSON`messagesPath`Path to persisted message JSON`result`Final `AgentResult`, when available
## [​](#tool-approval)Tool Approval

Use tool policies for simple cases:
```
await cline.start({
  prompt: "Audit this repo",
  config: {
    providerId: "anthropic",
    modelId: "claude-sonnet-4-6",
    apiKey: process.env.ANTHROPIC_API_KEY,
    systemPrompt: "You are a helpful coding assistant.",
    cwd: process.cwd(),
    workspaceRoot: process.cwd(),
    enableTools: true,
    enableSpawnAgent: false,
    enableAgentTeams: false,
  },
  toolPolicies: {
    read_files: { autoApprove: true },
    search_codebase: { autoApprove: true },
    run_commands: { autoApprove: false },
    editor: { autoApprove: false },
  },
})

```

Use `requestToolApproval` when your application needs to decide dynamically:
```
const cline = await ClineCore.create({
  clientName: "my-app",
  capabilities: {
    requestToolApproval: async (request) => {
      return { approved: request.toolName !== "run_commands" }
    },
  },
})

```

For tool behavior and policies, see [Tools](/sdk/tools).
## [​](#using-agent-directly)Using Agent directly

`Agent` (also exported as `AgentRuntime`) is the stateless primitive that `ClineCore` builds on. Use it directly when you want full control or don’t need the harness.
`Agent` is an alias for `AgentRuntime`. Use `Agent` when constructing from provider/model IDs. Use `AgentRuntime` when supplying a pre-built `AgentModel`.
`Agent` runs the core loop:
```
run() or continue()
  -> model request
  -> tool calls, if any
  -> tool results
  -> repeat until complete

```

```
import { Agent } from "@cline/sdk"

const agent = new Agent({
  providerId: "anthropic",
  modelId: "claude-sonnet-4-6",
  apiKey: process.env.ANTHROPIC_API_KEY,
  systemPrompt: "You are a helpful coding assistant.",
  tools: [myTool],
})

agent.subscribe((event) => {
  if (event.type === "assistant-text-delta") {
    process.stdout.write(event.text ?? "")
  }
})

const result = await agent.run("Review this diff")
console.log(result.outputText)

```

### [​](#agent-methods)Agent Methods

MethodPurpose`run(input)`Start a run with user input`continue(input?)`Continue with optional new input`abort(reason?)`Abort the active run`subscribe(listener)`Listen to `AgentRuntimeEvent` events`restore(messages)`Replace conversation history`snapshot()`Read runtime state
See [Agent reference](/sdk/reference/agent) for exact signatures.
### [​](#multi-turn-conversations)Multi-Turn Conversations

`AgentRuntime` keeps message state internally. Use `continue()` after the first run:
```
await agent.run("What does this project do?")
await agent.continue("Now identify risky files")

```

If you persist messages externally, restore them with `restore(messages)` before continuing.Was this page helpful?

YesNo[Model Providers](/sdk/model-providers)[Packages](/sdk/architecture/overview)⌘I[x](https://x.com/cline)[github](https://github.com/cline/cline)[discord](https://discord.gg/cline)[Powered byThis documentation is built and hosted on Mintlify, a developer documentation platform](https://www.mintlify.com?utm_campaign=poweredBy&utm_medium=referral&utm_source=cline-efdc8260)