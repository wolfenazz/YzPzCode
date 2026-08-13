# Cline SDK - Cline

> Source: https://docs.cline.bot/cline-sdk/overview
> Cached: 2026-08-13T09:54:31.447Z

---

## On this page

- [Install](#install)
- [SDK Skill](#sdk-skill)
- [Your First Agent](#your-first-agent)
- [Packages](#packages)
- [Next Steps](#next-steps)

[Start](/sdk/overview)# Cline SDK

TypeScript packages for embedding Cline’s agent runtime in your own applications.

The Cline SDK is an open source framework for building agentic applications, and is the same harness used in the Cline IDE extensions and CLI. It uses a plugin architecture that makes it easy to customize and comes with all the features you expect from agents like checkpoints, web fetch, MCPs, cron jobs, subagents, and more.
Use the Cline SDK to run agents from CI/CD pipelines, create automations for end-to-end workflows, or embed agents directly inside your products.
## [​](#install)Install

```
npm install @cline/sdk

```

`@cline/sdk` exports all SDK packages: `@cline/core` for the full agent harness, `@cline/agents` for the stateless agent loop, `@cline/llms` for control over the model gateway, and `@cline/shared` for common utilities.
Requires Node.js 22 or later.
## [​](#sdk-skill)SDK Skill

If you use a coding agent (Claude Code, Codex, Cline, etc.), install the [Cline SDK skill](https://github.com/cline/sdk-skill) to give your agent context on the SDK’s APIs and best practices to help you build with the Cline SDK.
```
npx skills add cline/sdk-skill

```

Prompt it to scaffold agents, create custom tools, wire up plugins, configure providers, and more.
## [​](#your-first-agent)Your First Agent

```
import { Agent } from "@cline/sdk"

const agent = new Agent({
  providerId: "anthropic",
  modelId: "claude-sonnet-4-6",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxIterations: 1,
})

agent.subscribe((event) => {
  if (event.type === "assistant-text-delta") {
    process.stdout.write(event.text ?? "")
  }
})

const result = await agent.run("Explain what an SDK is in two sentences.")

```

Here is a complete [quickstart example](https://github.com/cline/cline/tree/main/apps/examples/quickstart). Clone it and run `bun dev` to try it.
## [​](#packages)Packages

PackagePurpose`@cline/sdk`Public SDK surface (re-exports `@cline/core`)`@cline/core`Node runtime for sessions, built-in tools, persistence, hub support, automation`@cline/agents`Browser-compatible stateless agent execution loop`@cline/llms`Provider gateway and model catalogs`@cline/shared`Types, schemas, tool helpers, hooks, storage helpers
See [Packages](/sdk/architecture/overview) for package boundaries and exports.
## [​](#next-steps)Next Steps

## Examples

Browse complete, runnable SDK examples.## Plugins

Extend Cline’s functionality.## Tools

Add actions the model can call.## Building an Agent

Build a complete SDK agent from a tutorial.Was this page helpful?

YesNo[Examples](/sdk/examples)⌘I[x](https://x.com/cline)[github](https://github.com/cline/cline)[discord](https://discord.gg/cline)[Powered byThis documentation is built and hosted on Mintlify, a developer documentation platform](https://www.mintlify.com?utm_campaign=poweredBy&utm_medium=referral&utm_source=cline-efdc8260)