# Hub-Spoke Architecture - Cline

> Source: https://docs.cline.bot/sdk/architecture/hub-spoke
> Cached: 2026-08-13T09:54:53.540Z

---

## On this page

- [Why Hub-Spoke?](#why-hub-spoke)
- [Three Roles](#three-roles)
- [Communication Flow](#communication-flow)
- [Backend Modes](#backend-modes)
[When to Use Each Mode](#when-to-use-each-mode)

- [Capability Brokerage](#capability-brokerage)
- [Session Persistence](#session-persistence)
- [Managing the Hub](#managing-the-hub)
- [Multi-Client Access](#multi-client-access)
- [Process Isolation](#process-isolation)

[Architecture](/sdk/architecture/overview)# Hub-Spoke Architecture

A local daemon coordinates sessions across clients, while spoke workers handle agent execution.

The SDK uses a hub-spoke architecture for production deployments. A background daemon (the hub) coordinates session state and event routing, spoke workers execute the agent loop, and clients (CLI, VS Code, JetBrains, etc.) attach as peers over WebSocket.
## [​](#why-hub-spoke)Why Hub-Spoke?

A single-process architecture works for simple scripts, but breaks down when you need:

- Sessions that survive when a window closes or the CLI exits

- Multiple clients viewing and controlling the same session

- Scheduled agents that run when no client is connected

- Process isolation so a runaway agent doesn’t freeze the UI

The hub-spoke model solves all of these by separating coordination from execution, and both from the client UI.
## [​](#three-roles)Three Roles

## Hub

Singleton daemon per machine. Coordinates sessions, routes events and approvals, manages schedules, brokers capabilities between clients. Does not run the agent loop.## Spoke

Worker process running `@cline/core`. Executes the agent loop, calls tools, streams output. Reports events back to the hub. Owned by the daemon, not by any client.## Client

CLI, VS Code, JetBrains, or any custom app. Discovers the hub, registers over WebSocket, attaches to sessions, sends user input, receives streamed events.
The single rule that keeps it clean: clients participate, spokes execute, the hub coordinates. No two roles should overlap.
## [​](#communication-flow)Communication Flow

Clients connect to the hub over WebSocket. The hub routes commands and streams events. Spokes report back to the hub, never directly to clients.
1Client discovers or starts the hub

The hub is a singleton daemon per machine. If one isn’t running, `ClineCore` starts it automatically. Discovery uses lock files at `~/.cline/locks/hub/owners/`.2Client registers and attaches to a session

The client sends a `client.register` command over WebSocket, advertising its capabilities (shell access, file editing, diff viewing, etc.). It then creates or attaches to a session.3Hub assigns a spoke to execute

The hub spawns or assigns a spoke worker to run the agent loop. The spoke executes tools, streams partial output, and handles abort/cancel.4Hub fans out events to all attached clients

As the spoke produces events (text deltas, tool calls, usage), the hub relays them to every client attached to that session. Clients can come and go without interrupting execution.5Client disconnects, session keeps running

If the CLI exits or a window closes, the spoke continues executing. Another client can attach to the same session and pick up the event stream mid-flight.
## [​](#backend-modes)Backend Modes

`ClineCore` selects the execution mode based on configuration:
```
const cline = await ClineCore.create({
  clientName: "my-app",
  backendMode: "auto",
})

```

ModeBehavior`auto`Prefers a compatible local hub when available, falls back to local in-process execution when not. This is the default.`hub`Requires a compatible WebSocket hub. Throws if one is not reachable.`remote`Requires an explicit remote WebSocket hub endpoint. For deployments where the hub doesn’t live on the user’s machine.`local`Always uses local in-process execution with local SQLite/file storage. No hub, no shared sessions.
### [​](#when-to-use-each-mode)When to Use Each Mode

Use `local` for:

- Simple scripts and one-off tasks

- Testing and development

- Environments where a background process isn’t appropriate

Use `hub` (or `auto`) for:

- Session persistence across client restarts

- Multiple clients sharing the same session

- Scheduled agents

- Connector integrations (Telegram, Slack, etc.)

Use `remote` for:

- Cloud deployments where the hub runs on a server

- Team-shared hub instances

## [​](#capability-brokerage)Capability Brokerage

When multiple clients are attached to a session, the hub routes capability requests to whichever client can handle them. Clients advertise their capabilities at registration.
For example, VS Code might register `open-file`, `reveal-diff`, and `run-build` capabilities. The CLI might register `shell` and `run-tests`. When the agent needs to open a diff, the hub routes the request to VS Code. When it needs to run a shell command, the hub routes to the CLI.
This means a session gets richer as more clients join. A CLI session can later be enriched by VS Code attaching — an IDE selection can be sent into a running terminal session, or a diff created by one client can be opened by another.
## [​](#session-persistence)Session Persistence

Sessions are stored with full conversation history, tool call records, and metadata. The hub maintains a SQLite index for efficient listing and JSON snapshots as the source of truth for each session’s state.
```
~/.cline/data/sessions/
  sessions.db                    # SQLite index
  [session-id].json              # Authoritative session record

```

Sessions can have multiple participants, each tracked with a role (`creator`, `participant`, `observer`). The session persists independently of any single client’s lifecycle.
## [​](#managing-the-hub)Managing the Hub

The hub starts automatically when `ClineCore` needs it. You can also manage it manually:
```
cline hub start      # Start the hub daemon
cline hub stop       # Stop it
cline hub status     # Check if running
cline hub ensure     # Start if not running, return URL

```

The hub listens on `127.0.0.1:25463` by default and logs to `~/.cline/logs/hub-daemon.log`.
## [​](#multi-client-access)Multi-Client Access

Multiple clients can connect to the same hub and attach to the same session simultaneously:
```
# Terminal 1: start a task
cline "Work on feature X"

# Terminal 2: attach to the same session from VS Code or another CLI

# Terminal 3: Telegram connector
cline connect telegram -k $TOKEN

# All three share the same hub and can access the same sessions

```

## [​](#process-isolation)Process Isolation

If a client crashes, the hub and its running spokes are unaffected. The session continues executing in the spoke worker. When the client reconnects (or a different client attaches), it receives the full session history and resumes the live event stream.
The spoke also has a process boundary from the hub itself. A runaway model call in a spoke doesn’t degrade the hub’s ability to coordinate other sessions, route approvals, or fan out events.Was this page helpful?

YesNo[Packages](/sdk/architecture/overview)[Building an Agent](/sdk/guides/building-an-agent)⌘I[x](https://x.com/cline)[github](https://github.com/cline/cline)[discord](https://discord.gg/cline)[Powered byThis documentation is built and hosted on Mintlify, a developer documentation platform](https://www.mintlify.com?utm_campaign=poweredBy&utm_medium=referral&utm_source=cline-efdc8260)