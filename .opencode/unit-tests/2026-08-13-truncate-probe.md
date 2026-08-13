# Unit Test Record — probe-truncate.mjs (S3.1.3)
Date: 2026-08-13
Command: node probe-truncate.mjs  (app/agent-harness)
Result: ALL TRUNCATE PROBE CHECKS PASSED (exit 0)

Covers the afterTool hook policy mapping used in harness.ts:
1. read_files -> truncateHead (keeps beginning, reports total lines, small passthrough)
2. run_commands -> truncateTail (keeps end/errors, drops start)
3. search_codebase -> truncateLine (per-line cap at GREP_MAX_LINE_LENGTH, short lines preserved)
4. generic fallback -> truncateHead
5. non-string output passthrough (identity preserved)

All checks green. Probe retained at app/agent-harness/probe-truncate.mjs.
