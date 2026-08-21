# Mission: YZPZ Agent self-updating provider/model catalog

Goal: When OpenCode (or any provider) publishes new models on models.dev, the
YZPZ Agent UI picks them up automatically — no app release required.

## M1: Harness live catalog sync (TypeScript sidecar) | agent:Worker | status: completed
### T1.1: CatalogSync module | size:L
- [x] S1.1.1: Create app/agent-harness/src/catalog-sync.ts exporting CatalogSync class
      | verified: file exists (417 lines); npm run build + typecheck exit 0
- [x] S1.1.2: Additive-only merge via Llms.registerModel/registerProvider with
      npm→client mapping + baseUrl guard; cache at <dataDir>/catalog-cache.json;
      offline startup re-applies cache; TTL 12h; interval unref'd
      | verified: runtime smoke +10 providers/+5072 models; cache file valid
      (193 providers); second sync returns source=skipped
### T1.2: Wire into sidecar | size:S
- [x] S1.1.3: server.ts "refresh-catalogs" handler + NO_INIT_COMMANDS;
      index.ts constructs/starts/stops CatalogSync, event sink → broadcast
      | verified: E2E over real sidecar WS: refresh-catalogs ok=true source=network
### T1.3: SYNC-5 cost delta fix | size:S
- [x] S1.1.4: Already fixed pre-mission in budget.ts accumulateUsage (per-turn cost,
      cumulative seed only on first sample); harness.ts:728 uses it
      | verified: read budget.ts:39-52 + harness.ts:42,728
### T1.4: Verify builds + smoke | size:S
- [x] S1.1.5: npm run build && typecheck exit 0; direct-import smoke PASS;
      E2E sidecar WS PASS (get-models opencode=66 incl x-preview-f-free)

## M2: Rust bridge command | agent:Worker | status: completed
### T2.1: refresh_agent_catalogs command | size:S
- [x] S2.1.1: agent_host_commands.rs:310 command + lib.rs:289 registration
      | verified: git diff shows exact contract implementation
- [x] S2.1.2: cargo check OK; cargo clippy 0 NEW warnings (3 pre-existing accepted);
      cargo test agent_host 12/12 pass

## M3: Frontend auto-refresh UI | agent:Worker | status: completed
### T3.1: Types + hook | size:S
- [x] S3.1.1: types/index.ts:517 AgentCatalogSyncResult + :526 AgentCatalogUpdate
      | verified: matches frozen contract field-for-field
- [x] S3.1.2: useAgentHost.ts refreshCatalogs (:250) + onCatalogUpdated (:369),
      both exported | verified: grep + tsc
### T3.2: Components react to catalog-updated | size:M
- [x] S3.2.1: AgentPane.tsx:277-307 subscription refetches providers + current models
      | verified: code review, mounted-guarded unlisten pattern
- [x] S3.2.2: NewAgentDialog.tsx:116-140 refetch while open (preserves selection)
      | verified: code review
- [x] S3.2.3: SettingsAgent.tsx:246-261 event refetch + :316-330 manual Refresh button
      (disabled when host disconnected, animate-spin-slow busy state)
      | verified: code review; animate-spin-slow exists styles.css:378
- [x] S3.2.4: npx tsc --noEmit exit 0

## M4: Full verification | agent:Reviewer | status: completed
- [x] S4.1: All build/typecheck/test commands re-run green (see evidence above)
- [x] S4.2: E2E smoke via real sidecar binary over WebSocket: health ok,
      refresh-catalogs(force) → network +5460 models, get-models opencode=66
      includes x-preview-f-free, catalog-updated event payload matches contract
- [x] S4.3: sync-issues resolved (SYNC-5 verified fixed); work-log updated
