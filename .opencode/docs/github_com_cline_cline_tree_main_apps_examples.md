# cline/apps/examples at main · cline/cline · GitHub

> Source: https://github.com/cline/cline/tree/main/apps/examples
> Cached: 2026-08-13T09:55:27.836Z

---

# Cline SDK Examples

[](#cline-sdk-examples)
Learn how to build with the Cline SDK through working examples, ordered from simple to complex.

## SDK Skill

[](#sdk-skill)
If you use a coding agent (Claude Code, Codex, Cline, etc.), install the [Cline SDK skill](https://github.com/cline/sdk-skill) to give your agent context on the SDK's APIs and best practices to help you build with the Cline SDK.

npx skills add cline/sdk-skill
Prompt it to scaffold agents, create custom tools, wire up plugins, configure providers, and more.

## Getting started

[](#getting-started)
All examples live in this directory. Each is a standalone project with its own `package.json` and README. To run any example:

cd apps/examples/<example-name>
bun install
bun run build:sdk
export CLINE_API_KEY="cline_..."
bun dev
Requires Node.js 22+.

## Examples

[](#examples)
### Beginner

[](#beginner)

Example
Description
Concepts

[quickstart](/cline/cline/blob/main/apps/examples/quickstart)
Send one prompt, stream the response. ~15 lines of code.
`Agent`, `subscribe`, `run()`

[cli-agent](/cline/cline/blob/main/apps/examples/cli-agent)
Interactive terminal chat with a shell tool.
`createTool`, multi-turn `run()`/`continue()`, streaming

[cline-core-cli-agent](/cline/cline/blob/main/apps/examples/cline-core-cli-agent)
Interactive terminal chat powered by ClineCore.
`ClineCore.create()`, `cline.start()`, `cline.send()`, built-in tools, streaming

### Intermediate

[](#intermediate)

Example
Description
Concepts

[code-review-bot](/cline/cline/blob/main/apps/examples/code-review-bot)
AI code reviewer that reads git diffs and produces structured comments.
Multiple tools, `completesRun` lifecycle, `systemPrompt`, zod schemas

[multi-agent](/cline/cline/blob/main/apps/examples/multi-agent)
Web app that fans out to three specialist agents in parallel, streams results via SSE, then synthesizes a unified answer.
Concurrent agents, `Promise.all`, per-agent `subscribe()`, SSE streaming, agent composition

### Advanced

[](#advanced)

Example
Description
Concepts

[desktop-app](/cline/cline/blob/main/apps/examples/desktop-app)
Full Tauri + Next.js desktop app for running and inspecting chat sessions.
Sidecar runtime, websocket transport, session persistence

[menubar](/cline/cline/blob/main/apps/examples/menubar)
macOS menu bar app with Tauri.
Native app integration, compact UI

[vscode](/cline/cline/blob/main/apps/examples/vscode)
VS Code extension with chat panel.
Extension API, webview, workspace context

## SDK packages

[](#sdk-packages)
When building your own app, install the public SDK package:

npm add @cline/sdk
`@cline/sdk` re-exports everything from `@cline/core`. You only need `@cline/agents` or `@cline/llms` if you want lower-level control over the agent runtime or model gateway directly.

## Learn more

[](#learn-more)

- [SDK package docs](/cline/cline/blob/main/sdk/packages/README.md)

- [Architecture guide](/cline/cline/blob/main/ARCHITECTURE.md)

- [Plugin examples](/cline/cline/blob/main/examples/plugins) - extend the Cline SDK and CLI with custom tools and event hooks

- [Hook examples](/cline/cline/blob/main/examples/hooks) - lifecycle hooks for logging, blocking, and injection for Cline SDK and CLI