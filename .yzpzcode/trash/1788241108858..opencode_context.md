# Project Context — YzPzCode (Cline Agent Integration)

## Environment
- Windows 11, pwsh. App root: `app/`.
- Verify: `cd app/src-tauri && cargo check` (Rust), `cd app && node ./node_modules/typescript/bin/tsc --noEmit` (TS), `npm run build`.

## Mission
Add **Cline** as the 10th AI agent CLI (currently 9: claude, codex, gemini, opencode, cursor, kilo, hermes, pi, commandcode).
- Binary: `cline`, install: `npm i -g cline`, npm package: `cline`
- Logo: copied to `app/src/assets/cline.webp` (was in dist/, now safe)
- Docs URL: https://docs.cline.bot/cli/overview (CLI overview)
- Auth: `cline auth`; config dir `~/.cline/data/settings/providers.json`
- Interactive TUI via `-i/--tui`; default invocation starts act mode w/ auto-approve

## Integration Map (discovered via rg "\bkilo\b")
### Backend Rust (`app/src-tauri/src/`)
1. `types.rs` — `AgentType` enum: insert `Cline,` after `CommandCode,` (AI agents block, before `Gh,`)
2. `agent_cli/providers/cline.rs` — NEW file, model on `kilo.rs`: struct `ClineCliProvider`, impl `AgentCliProvider` (agent_type=Cline, binary="cline", display="Cline CLI", icon="/assets/cline.webp", npm="cline", prereqs NodeJs+Git)
3. `agent_cli/providers/mod.rs` — `mod cline;` + `pub use cline::ClineCliProvider;`
4. `agent_cli/provider.rs` — import + match arm in `get_provider`
5. `agent_cli/detector.rs` — add `AgentType::Cline` to `detect_all` array (~line 104)
6. `agent_cli/auth_detector.rs` — match arm (~line 36), add to check_all list (~line 60), new `check_cline_auth()` (model on check_kilo_auth ~line 300; check `~/.cline/data/settings/providers.json` exists), instructions entry (~line 737)
7. `agent_cli/prerequisites.rs` — append "Cline CLI" to the 3 node-dependent agent name lists (~lines 69, 105, 138)

### Frontend TS (`app/src/`)
8. `types/index.ts` — `"cline"` added to AgentType union (after "commandcode"? keep AI agents together: after "pi"/before... place logically: `... | "commandcode"` then insert `"cline"` — order should mirror Rust enum)
9. `hooks/useAgentAllocation.ts` — AGENT_TYPES arr, DEFAULT_ALLOCATION
10. `hooks/useWorkspace.ts` — TOOL_ZEROS def + 6 seed template allocations
11. `stores/appStore.ts` — cliStatuses/authInfos default records (~line 368)
12. `components/workspace/TerminalHeader.tsx` — logo import + AGENT_LOGOS map
13. `components/workspace/AgentTargetSelect.tsx` — logo import + map
14. `components/workspace/NewTerminalDialog.tsx` — AGENT_OPTIONS + DESCRIPTIONS entries (color pick, e.g. '#04A5F0'-ish cline brand or neutral)
15. `components/workspace/TerminalPane.tsx` — BINARY_NAMES (`cline: 'cline'`), retry agentTypes arr (~1209); NEW_SESSION_COMMANDS: OMIT (no documented /new for cline TUI)
16. `components/designer/DesignerPage.tsx` — agents list `{ id: 'cline', label: 'Cline' }`
17. `components/setup/AgentFleetConfig.tsx` — AGENT_INFO entry + agentTypes arr (~262)
18. `components/setup/WorkspaceTemplatePicker.tsx` — LABELS/COLORS/EMPTY_ALLOCATION
19. `components/settings/sections/SettingsAgents.tsx` — logo import + map
20. Text mentions (optional): SettingsEnvironment.tsx L122, NodeJsCheckScreen.tsx L163, assets/docs/userguide.ts table+intro, DesignerPage.tsx L1080 "Local CLI" copy

### Notes
- Allocation sanitizer auto-fills missing persisted keys with 0 → backward compatible.
- installer.rs is provider-generic (uses get_install_command) — NO changes needed.
- cli_launcher.rs: launch uses binary name generically; CommandCode has special-case only.
- agentCommands.tsx: only add cline slash-commands if type demands exhaustiveness — do NOT invent undocumented commands.
