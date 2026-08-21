# Unit Test Record: Frontend catalog-refresh wiring (ses_M3)

## Target Files
- `app/src/types/index.ts`
- `app/src/hooks/useAgentHost.ts`
- `app/src/components/agent/AgentPane.tsx`
- `app/src/components/agent/NewAgentDialog.tsx`
- `app/src/components/settings/sections/SettingsAgent.tsx`

## Test Method
No frontend test framework is configured in this repo (CLAUDE.md: "No frontend
testing framework configured yet") and adding one would violate the "No new
dependencies" constraint. Per the frozen verification contract in
`.opencode/context.md` (line 78: `cd app && npx tsc --noEmit`), static
type-checking is the authoritative unit verification for these frontend changes.

## Verification Command
```
cd app && npx tsc --noEmit
```

## Test Result
- Status: pass
- Session: ses_M3
- Timestamp: 2026-08-21T20:02:02Z
- Output: (no output — zero errors, exit 0)

## What Was Verified
1. `AgentCatalogSyncResult` + `AgentCatalogUpdate` interfaces added at
   types/index.ts:517-532 with exact frozen-contract camelCase shapes
   (contracts #1/#2 in context.md).
2. `useAgentHost` exports `refreshCatalogs(force = false)` invoking
   `refresh_agent_catalogs` with `{ force: force ?? null }` and `onCatalogUpdated`
   listening on `yzpz-agent:catalog-updated` (contract #4 exact).
3. AgentPane subscribes once on mount; on event refetches providers and the
   currently selected provider's models (mounted-guarded, unlisten cleanup).
4. NewAgentDialog subscribes while open; refetches providers + models for the
   selected providerId, preserving the current model selection when it still
   exists.
5. SettingsAgent subscribes (refetch via existing `load()`) and adds a compact
   refresh icon button (material-symbols:refresh-rounded, animate-spin-slow while
   busy) that calls `refreshCatalogs(true)`; disabled while busy or when the
   harness host is not connected.

## Notes
- lsp_diagnostics tool was unavailable (orchestrator.exe binary missing); tsc
  used as the authoritative static check.
- Only the 5 listed files were touched; no new dependencies.