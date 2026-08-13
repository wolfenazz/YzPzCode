# Unit Test Record: watcher.rs — re-watch newly created top-level dirs (S2.2.1)

## Target File
`app/src-tauri/src/filesystem/watcher.rs`

## Test File
Embedded `#[cfg(test)] mod tests` at the bottom of the target file (project pattern:
Rust unit tests live alongside modules — no separate test file to delete).

## Test Code (Preserved)
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn detects_direct_children() {
        let root = Path::new(r"C:\workspace");
        assert!(is_top_level_child(Path::new(r"C:\workspace\src"), root));
        assert!(is_top_level_child(
            Path::new(r"C:\workspace\package.json"),
            root
        ));
    }

    #[test]
    fn rejects_nested_paths_and_root_itself() {
        let root = Path::new(r"C:\workspace");
        assert!(!is_top_level_child(
            Path::new(r"C:\workspace\src\deep"),
            root
        ));
        assert!(!is_top_level_child(Path::new(r"C:\workspace"), root));
        assert!(!is_top_level_child(Path::new(r"C:\other"), root));
    }

    #[test]
    fn handles_trailing_separator_and_case() {
        let root = Path::new(r"C:\workspace");
        // Trailing-separator spelling of the root itself is NOT a child.
        assert!(!is_top_level_child(Path::new(r"C:\workspace\"), root));
        assert!(is_top_level_child(Path::new(r"C:\WORKSPACE\SRC"), root));
    }
}
```

## Implementation Notes (helper under test)
`fn is_top_level_child(child: &Path, root: &Path) -> bool` — returns true only when
`child` is a direct child of `root`. First compares `child.parent() == root` (raw
`Path` equality), then falls back to case-insensitive string comparison with
trailing-separator trimming (Windows-safe). The root itself and nested paths
return false.

## Test Result
- Status: pass
- Session: ses_watcher_s221
- Timestamp: 2026-08-13T02:44Z
- Command: `cargo test filesystem::watcher` → 3 passed; 0 failed

## Verification Evidence
- `cargo check --all-targets` → Finished dev profile, 0 errors
- `cargo test filesystem::watcher` → 3 passed; 0 failed
- `cargo test` (full) → 5 passed; 0 failed (3 watcher + 2 browser)
- `cargo clippy --all-targets` → 0 warnings in watcher.rs (7 pre-existing warnings
  only in src/terminal/managed.rs, unrelated)
- `cargo fmt --check` → clean

## Defects Fixed During Review (were present in concurrent implementation)
1. Import error: `notify::CreateKind` is NOT re-exported at crate root (only
   `Event` + `EventKind`); fixed to `use notify::event::CreateKind;`. Verified
   against notify-6.1.1 source (lib.rs L168-170, L245).
2. Test defect: `handles_trailing_separator_and_case` asserted
   `is_top_level_child(r"C:\workspace\", r"C:\workspace")` is true, but that path
   IS the root (trailing-separator form); `Path::parent()` = `C:\` →
   comparison false. Fixed assertion to `!is_top_level_child(...)`. Verified
   empirically with a standalone Rust probe.
