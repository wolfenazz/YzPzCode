# Token Optimization Analysis — RTK + Graphify

> Before/after analysis of token consumption for AI coding agents (Claude Code, Codex, Cursor, OpenCode, Kilo, Hermes, Pi, Gemini, Antigravity) working on **YzPzCode**.
>
> Measured: 2026-10-16 · rtk **0.50.0** · graphifyy **0.9.91** · Claude Code **2.1.300** · repo: 3,285 code files

---

## TL;DR — how much will be saved?

| Layer | Before → After (measured) | Efficiency |
|---|---|---|
| **Shell command output** (rtk hook) | `git status` 126 → 31 tokens · `git log -n 15` 1,151 → 609 · `ls` 670 → 234 | **47–83% less** per command |
| **Codebase exploration** (graphify) | grep + reading 5–8 matching files (16k–42k tokens) → graph query + targeted read (~2.1k tokens) | **~87–95% less** per question |
| **Whole-corpus reference** (graphify benchmark) | 2,945,733-token corpus → 1,627-token average query | **1,810×** per question |
| **Realistic agent session** (estimate) | ~100k–260k → ~25k–60k tool-context tokens | **~75–85% less (est.)** |
| Fixed overhead added | ~1,100 tokens/session of instruction files | negligible vs. savings |

**Net effect: roughly 4–6× more work per token budget on code-heavy sessions.** Actual *bill* reduction will be smaller than the token reduction (system prompt, conversation history, and output tokens are unaffected) — see [§7 Caveats](#7-caveats-and-where-savings-do-not-apply).

---

## 1. What was deployed

| Tool | Role | Hook mechanism |
|---|---|---|
| **rtk 0.50.0** | Compresses shell command output before the agent reads it | `PreToolUse` hook rewrites `git status` → `rtk git status` transparently (Claude, Codex, Cursor, OpenCode, Hermes, Pi, Gemini; rule files for Kilo/Cline/Antigravity/Command Code) |
| **graphify 0.9.91** | Knowledge graph queried **instead of** grepping + reading source files | `Read`/`Grep`/`Glob` guards inject *"MANDATORY: run graphify before reading source files"*; skills + rules make graph-first the default |

Graph built for this repo (fully local, zero API keys):
**44,186 nodes · 87,891 edges · 1,184 communities · 3,285 code files.**

---

## 2. How an optimized session behaves (verified end-to-end)

1. **Bash call** → hook rewrites the command. Live session log: Claude ran `ls graphify-out/… && graphify query "CliLauncher struct"`; the rtk hook rewrote it to `rtk ls … && graphify query …` and rtk tracked the savings (`rtk gain`).
2. **First source read** → graphify guard injects the mandatory graph-first context (395 chars) once per session; repeat nudges are suppressed.
3. **Claude complied**: asked about `CliLauncher`, it queried the graph first and then **read only lines 1–50 of a 243-line file** — its own answer notes: *"method bodies are from the graph's summary, not from source."*

---

## 3. Measurement method & honesty notes

- Token counts use the **`bytes ÷ 4`** convention (rtk/graphify ship no tokenizer) → **percentages are reliable, absolute numbers are approximations.**
- Sources: `rtk gain --history` (raw vs filtered, per command), `graphify benchmark` (corpus vs query cost), `claude --debug` session logs, file byte counts, `git grep` baselines — all on this repo.
- Not measured here: model reasoning/output tokens (these tools don't change them).

---

## 4. Baseline — what agents paid *before*

| Artifact | Size | Tokens (~bytes/4) |
|---|---|---|
| Whole code corpus (naive full read) | 2,209,300 words | **2,945,733** |
| `CLAUDE.md` (loaded every session) | 79 KB | 19,752 |
| `agents.md` | 14 KB | 3,547 |
| Largest single source file (`browser.rs`) | 130 KB | 32,622 |
| Files matching one symbol (`CliLauncher`: 8 text files) | 168 KB | **41,948** |
| Core Rust files only for the same symbol (5 files) | 65 KB | 16,363 |
| `graphify-out/GRAPH_REPORT.md` (if read raw) | 232 KB | 58,100 |

A typical "how does X work?" question *before* meant: `grep -r` → read several matching files → follow references → often 15k–45k tokens of source per question.

---

## 5. Measured results — after optimization

### 5.1 rtk per-command compression (live runs on this repo)

| Command | Raw → Filtered (tokens) | Saved |
|---|---|---|
| `rtk git status` (mixed tree) | 126 → 31 | **75.4%** |
| `rtk git status` (busy tree) | ~60 → ~10 | **83.0%** |
| `rtk git log -n 15` | 1,151 → 609 | **47.1%** |
| `rtk ls app/src/utils` | 670 → 234 | **65.1%** |
| `rtk find … -name "*.rs"` | 144 → 90 | **37.5%** |
| `rtk read browser.rs --max-lines 120` (structural preview) | 32,622 → ~650 | **98.0%** |
| `rtk read browser.rs -l minimal` (light trim) | 32,622 → ~31,000 | 5% |
| `rtk read browser.rs` (default = full content) | 32,622 → 32,622 | 0% |
| `rtk grep -rn "launch_cli"` (4 hits) | tiny → tiny | 0% |
| `rtk git status --short` (already compact) | passthrough | 0% |

**Reading the table:** savings scale with output verbosity. Noisy commands (`git status/diff/log`, `ls`, trees, test runners, package managers) save 47–90%; already-minimal output (`--short`, tiny greps) saves ~0 at zero cost. Sample aggregate (12 commands incl. deliberately-passing cases): 100.2k → 65.6k tokens (**34.7k saved**). RTK's supported command families typically reach **60–90%**.

### 5.2 graphify benchmark (built from this repo)

```
Corpus:          2,209,300 words → ~2,945,733 tokens (naive)
Graph:           44,186 nodes, 87,891 edges
Avg query cost:  ~1,627 tokens
Reduction:       1,810.5x fewer tokens per query

  [1753.4x] how does authentication work
  [1820.6x] what is the main entry point
  [1839.9x] how are errors handled
  [1821.7x] what connects the data layer to the api
  [1819.5x] what are the core abstractions
```

### 5.3 Worked example — *"What does `CliLauncher` do and what does it reference?"*

| Step | Before (typical agent) | After (measured live) |
|---|---|---|
| Discovery | `grep -rn` sweep (~700 tokens of output) | `graphify query` (~1,600 tokens, scoped subgraph) |
| Reading | core 5 Rust files **16,363** tokens (or all 8 matching files: 41,948) | **~450 tokens** — lines 1–50 only, after the graph located them |
| **Total** | **~17,000 – 42,600** | **~2,100** |
| **Savings** | — | **≈ 88–95%** |

---

## 6. Session-level projection (estimates)

Assumptions: an agent working this repo; ~10–15 file reads + greps and ~40–60 shell commands per session; graph queries at the measured ~1.6k tokens each.

| Session type | Tool-context tokens before | After | Savings |
|---|---|---|---|
| Single code question | 17k – 43k | ~2 – 3k | **85 – 95%** |
| Focused bugfix / feature (~1 h) | 100k – 260k | 25k – 60k | **~75 – 85%** |
| Long build/debug session (~3 h+) | 300k – 800k | 60k – 160k | **~75 – 85%** |

Efficiency factor ≈ **4–6× fewer tool-result tokens** per session, i.e. the same context window holds ~4–6× more exploration. On pay-per-token providers this translates to roughly **40–70% lower input cost** (diluted by prompt/cache/output costs — see below).

**Added overhead (both sides counted):** rtk hook ≈ 330 ms per Bash call; graphify guards ≈ 0.3–0.6 s per guarded call; instruction-file additions ≈ 1,100 tokens/session (`RTK.md` ~200 + `CLAUDE.md`/`agents.md` sections ~900). Latency and context cost are constant while savings scale with session size.

---

## 7. Caveats and where savings do NOT apply

- **Bill ≠ token count.** Bash output is one of several input contributors, and output tokens are untouched. Expect the *bill* to drop less than the percentages above.
- **Built-in tools bypass rtk.** rtk only intercepts shell calls — its own docs say `Read`/`Grep`/`Glob` built-ins don't pass the hook. That gap is what graphify covers (query before read; agents still read the exact lines the graph points at).
- **Passthrough cases.** Commands without a filter, already-compact output (`--short`), and `rtk read` at default full-content mode save ~0% — by design, never worse.
- **Windows note.** `rtk ls/find/grep` delegate to native coreutils — available in Git Bash (which Claude Code's Bash tool uses on Windows) but not in a bare PowerShell PATH. `rtk git/*`, `cargo`, `npm` filters work everywhere.
- Estimates in §6 are projections from measured unit costs, not measured sessions; verify with the commands below.

---

## 8. How to verify (anytime)

```bash
rtk gain                       # per-command savings dashboard (live)
rtk gain --graph               # ASCII graph, last 30 days
rtk gain --history             # last commands, % saved each
graphify benchmark             # corpus vs query token comparison
graphify query "…"             # ~1.6k-token scoped subgraph
graphify explain "<symbol>"    # node + connections, tags EXTRACTED/INFERRED
```

---

## 9. Conclusion

- **Per shell command:** 47–83% measured here (60–90% typical for RTK's supported command families).
- **Per code question:** ~88–95% fewer tokens than grep-and-read sweeps (graph query + targeted read).
- **Per session (estimate):** ~75–85% fewer tool-context tokens → **roughly 4–6× efficiency** for context-window usage, with a current tooling overhead of ~1.1k tokens and <1 s per hooked call.
- Both layers are local, free, and fail open: commands without filters pass through, agents without a graph behave exactly as before.
