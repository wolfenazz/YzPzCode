# UT: watcher.rs re-watch new dirs (S2.2.1)

- Session: Commander (per work-log)
- Date: 2026-08-13T03:00:00Z
- File under test: `app/src-tauri/src/filesystem/watcher.rs`
- Test type: In-module `#[cfg(test)]` unit tests (kept in source, standard for this repo)

## Tests Written (3)

1. `detects_direct_children` — direct child dir + file under root → `is_top_level_child` true
2. `rejects_nested_paths_and_root_itself` — nested path, root itself, unrelated path → false
3. `handles_trailing_separator_and_case` — root w/ trailing slash → false; case-variant dir → true (Windows)

## Results (2026-08-13)

```
cargo test filesystem::watcher → 3 passed; 0 failed; exit 0
cargo test (full)              → 5 passed; 0 failed; exit 0
cargo check                    → clean; exit 0
cargo clippy                   → exit 0; 0 warnings in watcher.rs (7 pre-existing in
                                 external_terminals.rs / managed.rs — unrelated)
cargo fmt --check              → clean; exit 0
```

## Integration Contract Verified
- Rust emit `file-system-changed` payload `{ workspacePath, paths }` matches:
  - `app/src/hooks/useFileWatcher.ts` listener (trigger only)
  - `app/src/components/explorer/FileExplorer.tsx` typed listener
    `listen<{ workspacePath: string; paths: string[] }>` (tree refresh)

## Non-Blocking Observations (informational)
- LOW: startup race — FS_WATCHER static populated after initial watch registration;
  a Create(Folder) event in that microsecond window skips re-watch (acknowledged in code comment).
- LOW: top-level folder renames (notify reports as Modify/RenameMode::To) don't trigger
  re-watch — out of scope for "new dirs", candidate follow-up.
- INFO: `use std::sync::LazyLock;` sits between statics (pre-existing, not part of this diff).

## Verdict: PASS
