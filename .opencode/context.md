# Mission: YZPZ Agent self-updating provider/model catalog

## Root cause (VERIFIED with live probes)
The YZPZ Agent UI reads providers/models from `Llms.getModelsForProvider()` /
`Llms.getAllProviders()` (@cline/sdk). That catalog is **static, baked into
@cline/llms at publish time**, and the harness pins `@cline/sdk: 0.0.74` exactly.
When OpenCode (or any provider) adds models on models.dev, the UI never sees them.

Proof (2026-08-21 probes):
- Static catalog `opencode`: 62 models. Live models.dev `opencode`: 66.
- Live-only models found: x-preview-f-free, gemini-3.7-flash, muse-spark-1.2,
  muse-spark-1.2-contributor-free.
- Static registry total: 187 providers; models.dev live: 179+ (both directions exist).

## SDK capabilities verified at runtime (node probe, @cline/llms 0.0.74)
Exported and working:
- `fetchModelsDevProviderModels(url)` → Record<providerId, Record<modelId, ModelInfo>>
  (already normalized: id/name/contextWindow/maxInputTokens/maxTokens/capabilities/
  reasoningOptions/pricing). Live test vs https://models.dev/api.json: OK (179 providers).
- `registerModel(providerId, modelId, info)`, `registerProvider(collection)`,
  `unregisterProvider/Model`, `resetRegistry`, `hasProvider`, `getProviderIds`,
  `getProviderCollectionSync(id)`.
NOT exported despite .d.ts claims: normalizeModelsDev*, fetchModelsDevCatalog,
resolveMaxInputTokens — do NOT rely on them.

## models.dev api.json provider-level fields (raw fetch)
{ id?, name, doc, env[], npm ("@ai-sdk/openai-compatible" | "@ai-sdk/groq" | ...),
  api (baseUrl string when present) }
npm→client mapping for registering NEW providers:
- @ai-sdk/openai-compatible → client "openai-compatible", protocol "openai-chat"
- @ai-sdk/openai            → client "openai", protocol "openai-chat"
- @ai-sdk/anthropic         → client "anthropic", protocol "anthropic"
- @ai-sdk/google            → client "gemini", protocol "gemini"
- other @ai-sdk/*           → client "ai-sdk-community", protocol "openai-chat"
- missing/unmappable npm or no baseUrl → skip registration (count as skipped)

## Architecture / event flow (existing)
sidecar AgentServer.broadcast({type:"event",event:{name,payload}})
→ Rust handle_sidecar_text → forward_event → app.emit("yzpz-agent:<name>")
→ frontend listen("yzpz-agent:<name>"). New events need ZERO Rust changes to flow.

## Contracts (frozen — all workers implement exactly these)
1. Sidecar command "refresh-catalogs" args {force?: boolean} → result:
   { syncedAt: string|null, providersAdded: string[],
     modelsAdded: Array<{providerId,modelId}>, skippedProviders: number,
     source: "network"|"cache"|"skipped" }
2. Sidecar event "catalog-updated" payload:
   { syncedAt: string, providersAdded: string[],
     modelsAdded: Array<{providerId,modelId}>, skippedProviders: number,
     source: "network"|"cache" }
   (auto-forwarded by Rust; NO Rust event changes needed)
3. Tauri command refresh_agent_catalogs(manager, force: Option<bool>) forwards to
   quick_command("refresh-catalogs", {"force": force}); registered in lib.rs.
4. Frontend hook useAgentHost additions:
   - refreshCatalogs(force?: boolean): Promise<AgentCatalogSyncResult>
     → invoke('refresh_agent_catalogs', { force: force ?? null })
   - onCatalogUpdated(cb): listen<AgentCatalogUpdate>('yzpz-agent:catalog-updated', cb)
5. types/index.ts new interfaces AgentCatalogSyncResult + AgentCatalogUpdate
   (camelCase fields matching contract #1/#2).
6. Merge policy: ADDITIVE ONLY. Never overwrite/remove existing static entries or
   existing model ids. Only add missing model ids to known providers; register
   brand-new providers only when client-mappable AND baseUrl present.

## Files
- NEW app/agent-harness/src/catalog-sync.ts (CatalogSync class)
- app/agent-harness/src/index.ts (wire startup sync + interval + dispose)
- app/agent-harness/src/server.ts ("refresh-catalogs" handler + NO_INIT_COMMANDS)
- app/src-tauri/src/commands/agent_host_commands.rs (+lib.rs registration)
- app/src/types/index.ts, app/src/hooks/useAgentHost.ts
- app/src/components/agent/{AgentPane,NewAgentDialog}.tsx
- app/src/components/settings/sections/SettingsAgent.tsx
- SYNC-5 fix: app/agent-harness/src/harness.ts usage cost delta (~line 492):
  prefer per-turn `inner.cost`; only fall back to totalCost when cost is absent
  AND prev.totalCost is 0 (first sample).

## Verification commands
- harness: cd app/agent-harness && npm run build && npm run typecheck
- frontend: cd app && npx tsc --noEmit
- rust: cd app/src-tauri && cargo check && cargo clippy && cargo test agent_host
- runtime smoke: node probe against dist sidecar or direct CatalogSync import

---

## MISSION RESULT (2026-08-21): Self-updating catalog — COMPLETE
- Root cause: static catalog baked into pinned @cline/sdk 0.0.74; live models.dev
  data never reached the registry.
- Fix: app/agent-harness/src/catalog-sync.ts — CatalogSync fetches
  https://models.dev/api.json (SDK fetchModelsDevProviderModels + raw metadata),
  ADDITIVELY merges via Llms.registerModel/registerProvider (npm→client map,
  baseUrl guard), caches to <dataDir>/catalog-cache.json for offline re-apply,
  TTL 12h + unref'd interval, emits 'catalog-updated' event.
- Chain: sidecar event → Rust forward_event → yzpz-agent:catalog-updated →
  useAgentHost.onCatalogUpdated → AgentPane/NewAgentDialog/SettingsAgent refetch;
  manual refresh: refresh_agent_catalogs Tauri cmd → refresh-catalogs WS command.
- Forced-refresh serialization fix: inFlight promise (boot sync no longer swallows
  manual force).
- SYNC-5 verified pre-fixed in budget.ts accumulateUsage.
- Evidence: harness build/typecheck exit 0; tsc --noEmit exit 0; cargo check/
  clippy(0 new)/test agent_host 12/12; direct smoke +10p/+5072m; E2E WS PASS.
