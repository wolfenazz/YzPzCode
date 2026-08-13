# Packages - Cline

> Source: https://docs.cline.bot/sdk/architecture/overview
> Cached: 2026-08-13T09:54:43.113Z

---

## On this page

- [Package Stack](#package-stack)
- [Packages](#packages)
[@cline/core](#%40cline%2Fcore)
- [@cline/agents](#%40cline%2Fagents)
- [@cline/llms](#%40cline%2Fllms)
- [@cline/shared](#%40cline%2Fshared)

- [Install](#install)
- [Design Principles](#design-principles)
[Strict dependency direction](#strict-dependency-direction)
- [Browser-compatible agent loop](#browser-compatible-agent-loop)
- [Core as orchestration layer](#core-as-orchestration-layer)

[Architecture](/sdk/architecture/overview)# Packages

How SDK packages fit together, what each package exports, and where boundaries are enforced.

The SDK is split into layered packages. Dependencies flow downward: `core` depends on `agents`, `llms`, and `shared`; `agents` depends on `llms` and `shared`; `llms` depends on `shared`.
## [​](#package-stack)Package Stack

```
Your application / CLI / VS Code / JetBrains
          │
          ▼
@cline/core
Sessions, storage, built-in tools, hub, automation, telemetry
          │
          ├── @cline/agents
          │   Browser-compatible AgentRuntime / Agent loop
          │
          ├── @cline/llms
          │   Provider handlers, gateway, model catalogs
          │
          └── @cline/shared
              Types, schemas, tools, hooks, extension contracts

```

## [​](#packages)Packages

### [​](#@cline/core)@cline/core

Node runtime/orchestration layer.
Key exports include:
ExportDescription`ClineCore`Main runtime entry point`ClineCoreOptions`Constructor options`ClineCoreStartInput`Session start input`CoreSessionConfig`Session configuration`SessionRecord`Persisted session metadata`AgentPlugin`Public plugin type`createTool`Re-export from shared
Capabilities include:

- local/hub/remote runtime backends

- session manifests and message artifacts

- built-in tools

- tool approvals

- automation/scheduling services

- telemetry hooks

- plugin/extension loading

- team/sub-agent tools

Depends on: `@cline/shared`, `@cline/llms`, `@cline/agents`.
### [​](#@cline/agents)@cline/agents

Browser-compatible agent execution loop.
Key exports include:
ExportDescription`AgentRuntime`Core runtime class`Agent`Alias for `AgentRuntime``createAgentRuntime`, `createAgent`Factory functions`AgentRuntimeConfig`Constructor config union`AgentRunInput`, `AgentEventListener`Runtime helper types`createTool`Re-export from `@cline/shared`
Methods on `AgentRuntime` include `run`, `continue`, `abort`, `subscribe`, `restore`, and `snapshot`.
Depends on: `@cline/shared`, `@cline/llms`.
### [​](#@cline/llms)@cline/llms

Provider and model layer.
Key exports include:
ExportDescription`DefaultGateway`, `createGateway`Gateway for creating provider-backed agent models`createHandler`, `createHandlerAsync`Provider handler factories`getAllProviders`, `getProviderIds`, `getModelsForProvider`Catalog helpers`registerProvider`, `registerModel`Runtime registry extension`ModelInfo`, `ProviderInfo`Provider/model metadata
Depends on: `@cline/shared`.
### [​](#@cline/shared)@cline/shared

Foundation package for shared contracts and utilities.
Key exports include:
ExportDescription`createTool`Helper for creating typed tools`AgentTool`, `AgentToolContext`, `ToolPolicy`Tool interfaces`AgentEvent`, `AgentResult`, `AgentConfig`Host-facing agent types`AgentRuntimeEvent`, `AgentRunResult`Runtime-facing agent types`HookEngine`, `HookStage`, `HookPolicies`Hook contracts and engine`ContributionRegistry`, `AgentExtensionApi`Extension registration contracts`ModelInfo`, `Message`, `ContentBlock`Model/message types`BasicLogger`, `noopBasicLogger`Logging contracts
No higher-layer dependencies.
## [​](#install)Install

```
npm install @cline/sdk

```

`@cline/sdk` re-exports everything from `@cline/core`. Install `@cline/agents` or `@cline/llms` directly only if you need lower-level control.
## [​](#design-principles)Design Principles

### [​](#strict-dependency-direction)Strict dependency direction

Dependencies flow downward only. Lower layers stay embeddable without pulling in the full runtime.
### [​](#browser-compatible-agent-loop)Browser-compatible agent loop

`@cline/agents` exposes a browser-compatible runtime. It does not own session storage, built-in file/shell tools, hub transports, or Node-specific orchestration.
### [​](#core-as-orchestration-layer)Core as orchestration layer

`@cline/core` owns Node runtime integration: session persistence, built-in tools, automation, hub/remote transports, telemetry, and extension loading.Was this page helpful?

YesNo[ClineCore](/sdk/clinecore)[Hub & Spoke](/sdk/architecture/hub-spoke)⌘I[x](https://x.com/cline)[github](https://github.com/cline/cline)[discord](https://discord.gg/cline)[Powered byThis documentation is built and hosted on Mintlify, a developer documentation platform](https://www.mintlify.com?utm_campaign=poweredBy&utm_medium=referral&utm_source=cline-efdc8260)