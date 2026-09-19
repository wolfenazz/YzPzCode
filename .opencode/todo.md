# Mission: Remediate exposed Discord webhook (FriendlyScanner finding a3d46c4b)

Baseline: `app/src-tauri/src/commands/feedback_commands.rs:28-29` hardcoded a Discord webhook URL (full secret REDACTED — removed).
Scanner reports webhook deleted permanently (HTTP 200 at discovery). Old URL is dead but was in git history + working tree.
Verification: `cargo check` (src-tauri), `npx tsc --noEmit` (app), `grep` sweep for webhook URLs = zero matches.

## M1: Emergency remediation — remove hardcoded secret | agent:Worker | status:completed
### T1.1: Purge secret from working tree | size:S | status:completed
- [x] S1.1.1: `feedback_commands.rs` — delete hardcoded fallback URL, env-only lookup | verified Reviewer 2026-09-19 (re-read 281 lines: env-only `map_err("not configured")`, no `unwrap_or_else` fallback; `git grep discord.com/api/webhooks` = only prefix-validation lines + todo baseline docs; full-URL+digits = only todo baseline; `cargo check` exit 0)
- [x] S1.1.2: Confirm no other hardcoded webhook/token in `app/src-tauri`, `app/src` (discord, ghp_, sk- real keys) | verified Reviewer 2026-09-19 (token frag redacted — 0 hits in source, only todo pattern-desc line; frontend modal only `placeholder="Email or Discord"`, no URL literal)

## M2: Harden feedback pipeline | agent:Worker | depends:T1.1 | status:completed
### T2.1: Secure `send_feedback` implementation | size:M | status:completed
- [x] S2.1.1: Require `DISCORD_WEBHOOK_URL` env at runtime, return user-friendly "not configured" error if missing/empty (no fallback, no panic, no URL in error text) | verified Reviewer 2026-09-19 (lines 28-33: `map_err("not configured")` + trim + empty check, zero URL in error text)
- [x] S2.1.2: Input hardening — trim, reject empty message, enforce limits (message 4000, name 100, contact 160 to mirror frontend), validate webhook URL is https discord webhook shape | verified Reviewer 2026-09-19 (lines 34-69: 3-prefix allowlist discord/canary/ptb, trim, empty-reject, 4000/100/160 with char-boundary truncate)
- [x] S2.1.3: Network hardening — reqwest client with 10s timeout, check HTTP success status, map errors without leaking URL | verified Reviewer 2026-09-19 (lines 94-105: `Client::builder().timeout(10s)`, `error_for_status`, `format!("Failed to send feedback: {}")` no URL; `cargo check` Finished dev-profile exit 0)

## M3: Prevent recurrence | agent:Worker
### T3.1: Env hygiene + docs | size:S
- [x] S3.1.1: Strengthen root `.gitignore` (cover `.env*` + `!.env.example`), add `app/src-tauri/.env.example` + root `.env.example` with `DISCORD_WEBHOOK_URL=` placeholder + comment never commit real URL | verified Reviewer 2026-09-19 (tsc 0, cargo 0, files on disk correct; advisory: add literal `.env*` wildcard + stage untracked examples)
- [x] S3.1.2: Verify no `.env` file is git-tracked (`git ls-files | grep env` = only `*.example`) | verified Reviewer 2026-09-19 (only tracked `.env*` is `app/desgin/deploy/.env.example`; no real `.env` tracked)
- [x] S3.1.3: Frontend `FeedbackModal.tsx` already surfaces backend error via `errorMessage` — no secret added there, confirm no change leaks URL | verified Reviewer 2026-09-19 (full read 322 lines: only `invoke('send_feedback')`, `String(err)` display, zero webhook literals)

## M4: Final verification | agent:Reviewer | depends:M1,M2,M3
- [x] S4.1: `cargo check` clean in `app/src-tauri` | verified Reviewer 2026-09-19 (`Finished dev profile in 36.05s`, exit 0)
- [x] S4.2: `npx tsc --noEmit` clean in `app` | verified Reviewer 2026-09-19 (exit `TSC-EXIT:0`, empty output)
- [x] S4.3: Secret sweep — `discord.com/api/webhooks/<digits>` full-URL pattern = 0 hits in tracked files; old token fragment (redacted) = 0 hits | verified Reviewer 2026-09-19 (digits-pattern 0 hits tracked after baseline redaction; token-frag 0 hits tracked after note redaction; source hits limited to 3 allowlist-prefix lines without digits/token)
- [x] S4.4: Reviewer sign-off + rotation/runbook for user (new webhook steps, history-purge guidance, proxy recommendation) | signed off 2026-09-19 (cargo check exit 0 re-verified directly; old+new secret sweeps = 0 hits in tracked files; local .env with new URL deleted per user request)
