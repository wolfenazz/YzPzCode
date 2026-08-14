# Unit Test Record: max_total_tokens round-trip

## Target File
`app/src-tauri/src/agent_host/protocol.rs`

## Related File (payload plumbing)
`app/src-tauri/src/commands/agent_host_commands.rs`

## Mission
M2 (T2.1.1 + T2.1.2) — Rust plumbing for per-session `maxTotalTokens` token budget.

## Test Code (added to protocol.rs tests module, kept in place — cargo test passes)
```rust
#[test]
fn parses_create_session_request_with_max_total_tokens() {
    let raw = r#"{"workspaceId":"w1","cwd":"C:\\dev","providerId":"anthropic","modelId":"claude-sonnet-4-6","maxTotalTokens":1000000}"#;
    let req: CreateAgentSessionRequest = serde_json::from_str(raw).unwrap();
    assert_eq!(req.max_total_tokens, Some(1_000_000));
    assert!(req.compaction_strategy.is_none());

    // Absent field defaults to None (backwards compatible).
    let raw2 = r#"{"workspaceId":"w2","cwd":"C:\\dev","providerId":"openai","modelId":"gpt-5"}"#;
    let req2: CreateAgentSessionRequest = serde_json::from_str(raw2).unwrap();
    assert!(req2.max_total_tokens.is_none());

    // Serializes back out as camelCase `maxTotalTokens`.
    let out: serde_json::Value = serde_json::to_value(&req).unwrap();
    assert_eq!(out["maxTotalTokens"], 1_000_000);
}
```

## Edits Made
1. `protocol.rs` `CreateAgentSessionRequest`: added after `compaction_strategy`
   ```rust
   #[serde(default)]
   pub max_total_tokens: Option<u64>,
   ```
   (camelCase serde rename → wire field `maxTotalTokens`; `#[serde(default)]` keeps backward compat)
2. `agent_host_commands.rs` `create_agent_session` json! payload: added after `"compactionStrategy"`
   ```rust
   "maxTotalTokens": request.max_total_tokens,
   ```
3. `lib.rs:232` — `commands::create_agent_session` already registered; no change needed (confirmed).

## Test Result
- `cargo test` (app/src-tauri): **17 passed; 0 failed** (16 pre-existing + 1 new `parses_create_session_request_with_max_total_tokens`)
- `cargo check` (app/src-tauri): Finished dev profile, **zero errors/warnings**
- Session: ses_t2_rust
- Timestamp: 2026-08-14T18:05Z
