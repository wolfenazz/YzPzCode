#!/usr/bin/env node
/**
 * shadcn MCP launcher (YzPzCode monorepo).
 *
 * The shadcn project lives in ./app (its components.json, Tailwind setup and
 * src/ tree), but AI agents open this repository at the root. The shadcn MCP
 * server resolves components.json and its registries (@shadcn, @react-bits, …)
 * from its own working directory, so this launcher starts it inside app/ and
 * passes stdio through unchanged.
 *
 * Used by:
 *   - .mcp.json            (Claude Code)
 *   - .vscode/mcp.json     (VS Code / Copilot)
 *   - .cursor/mcp.json     (Cursor)
 *   - .codex/config.toml   (Codex, project config)
 *   - .gemini/settings.json(Gemini CLI, project config)
 */
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectDir = path.resolve(__dirname, "..", "app");
const cwd = fs.existsSync(path.join(projectDir, "components.json"))
  ? projectDir
  : process.cwd();

const child = spawn("npx shadcn@latest mcp", {
  cwd,
  shell: true,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`[shadcn-mcp] failed to start: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(code === null ? (signal ? 1 : 0) : code);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    try {
      child.kill(signal);
    } catch {
      /* ignore */
    }
  });
}
