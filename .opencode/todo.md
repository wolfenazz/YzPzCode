# Mission: Add Cline CLI agent to YzPzCode

Baseline: clean tree. Logo already copied to `app/src/assets/cline.webp`.
Verification: `cargo check` + `cargo clippy` (src-tauri), `node ./node_modules/typescript/bin/tsc --noEmit` + `npm run build` (app).

## M1: Rust backend integration | agent:Worker | status: pending
### T1.1: AgentType + provider plumbing | size:M
- [ ] S1.1.1: `types.rs` — add `Cline` variant to AgentType (AI agents block, after CommandCode)
- [ ] S1.1.2: Create `agent_cli/providers/cline.rs` modeled on kilo.rs
      (binary "cline", display "Cline CLI", desc "Cline's agentic coding CLI with TUI and headless automation",
       provider "Cline", install `npm install -g cline`, version cmd `--version`,
       docs https://docs.cline.bot/cli/overview, prereqs NodeJs+Git, icon "/assets/cline.webp",
       npm package "cline")
- [ ] S1.1.3: Register in providers/mod.rs (mod + pub use), provider.rs get_provider match arm
- [ ] S1.1.4: detector.rs detect_all array += AgentType::Cline
      | verify: cargo check exit 0
### T1.2: Auth detection + prerequisites | size:S
- [ ] S1.2.1: auth_detector.rs — match arm, check_all list entry, new check_cline_auth()
      (authenticated if ~/.cline/data/settings/providers.json exists; config_path set; else NotAuthenticated),
      get_auth_instructions arm ("Run 'cline auth' to authenticate with the Cline Provider or configure your own provider key")
- [ ] S1.2.2: prerequisites.rs — append "Cline CLI" to the 3 Node.js-dependent agent lists
      | verify: cargo check exit 0
### T1.3: Backend quality gate | agent:Reviewer | depends:T1.1,T1.2
- [ ] S1.3.1: cargo check + cargo clippy zero errors/warnings on new code; cargo test pass

## M2: Frontend integration | agent:Worker | status: pending
### T2.1: Types + state defaults | size:M
- [ ] S2.1.1: types/index.ts — add "cline" to AgentType union (position mirrors Rust enum order)
- [ ] S2.1.2: useAgentAllocation.ts — AGENT_TYPES + DEFAULT_ALLOCATION += cline:0
- [ ] S2.1.3: useWorkspace.ts — TOOL_ZEROS/defaults + all 6 seed template allocations += cline:0
- [ ] S2.1.4: stores/appStore.ts — cliStatuses/authInfos default records += cline
      | verify: tsc --noEmit exit 0
### T2.2: UI surfaces | size:L
- [ ] S2.2.1: TerminalHeader.tsx — import clineLogo from '../../assets/cline.webp' + AGENT_LOGOS map entry
- [ ] S2.2.2: AgentTargetSelect.tsx — logo import + map entry
- [ ] S2.2.3: NewTerminalDialog.tsx — AGENT_OPTIONS entry {type:'cline', label:'Cline',
      description:'Agentic coding CLI with TUI and headless mode', logo, color} + DESCRIPTIONS entry
- [ ] S2.2.4: TerminalPane.tsx — BINARY_NAMES cline:'cline'; retry agentTypes arr += 'cline';
      omit NEW_SESSION_COMMANDS (no documented /new for cline)
- [ ] S2.2.5: DesignerPage.tsx — agents list += { id:'cline', label:'Cline' }; update 'Local CLI'
      copy to include Cline
- [ ] S2.2.6: AgentFleetConfig.tsx — AGENT_INFO { label:'Cline', color class, logo } + agentTypes arr
- [ ] S2.2.7: WorkspaceTemplatePicker.tsx — LABELS/COLORS/EMPTY_ALLOCATION entries
- [ ] S2.2.8: SettingsAgents.tsx — logo import + map entry
- [ ] S2.2.9: Docs/text mentions: userguide.ts table row (| **Cline** | `cline` | Interactive TUI + headless coding agent |) and intro line; NodeJsCheckScreen L163 + SettingsEnvironment L122 mention Cline
      | verify each: tsc --noEmit exit 0

## M3: Final verification | agent:Reviewer | depends:M1,M2
- [ ] S3.1: cargo check + cargo clippy clean (no new warnings)
- [ ] S3.2: tsc --noEmit exit 0
- [ ] S3.3: npm run build exit 0
- [ ] S3.4: rg sweep — every file listing agent arrays contains cline consistently; no missed exhaustive Records (tsc enforces); report evidence
