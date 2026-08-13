# Project Context

## Environment
- Repo: yzpzcode (Tauri v2 desktop app, React 19 frontend + Rust backend)
- CI: GitHub Actions — `.github/workflows/release.yml` (tag-triggered release workflow)
- App dir: `app/` (npm root), subproject `app/agent-harness/` (Cline SDK sidecar, own package.json)
- Platform: win32 (local), CI: macos/ubuntu/windows

## Build Commands (from CLAUDE.md / AGENTS.md)
- `cd app && npm run build` = `node scripts/ensure-drawio.mjs && tsc && vite build`
- `npm run build:agent` = `npm --prefix agent-harness run build` (NEW in v3.3.0)
- Tauri build invoked via `tauri-apps/tauri-action@v0` with beforeBuildCommand `npm run build && npm run build:agent`

## Diagnosis (2026-08-14) — Failed run #31752764187 (v3.3.0)
- **4 errors**: all 4 build jobs fail identically with `TS2688: Cannot find type definition file for 'node'`
- **5 warnings**: Node 20 deprecation on `actions/checkout@v4`, `actions/setup-node@v4`, `softprops/action-gh-release@v1`

### Root cause (errors)
- The v3.3.0 "The New update" added `app/agent-harness/` subproject + `build:agent` script.
- `agent-harness/tsconfig.json` has `"types": ["node"]` → requires `@types/node` in `agent-harness/node_modules`.
- CI workflow only runs `npm ci` in `app/` (root). `agent-harness` deps never installed → tsc fails TS2688.
- Local builds work because `agent-harness/node_modules` exists locally (gitignored).

### Root cause (warnings)
- Actions target Node 20, forced to Node 24 via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`.
- Fix: bump `actions/checkout@v4`→`v7.0.1`, `actions/setup-node@v4`→`v7.0.0`, `softprops/action-gh-release@v1`→`v3.0.2` (verified latest via GitHub API; all run Node 24 natively, no input breaking changes).

## Fix Plan
1. Add `npm ci` step for `app/agent-harness` in the `build` job (after root `npm ci`).
2. Bump deprecated actions to latest majors.
3. Verify: YAML parses, actionlint if available, workflow diff correct.

## Verification Commands
- `npx actionlint` (if installed) or YAML parse of release.yml
- Local sanity: `npm --prefix app/agent-harness ci && npm --prefix app/agent-harness run build` (Windows; proves the new step works)
