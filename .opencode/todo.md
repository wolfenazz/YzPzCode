# Mission: Fix GitHub Actions release build failures (4 errors + 5 warnings)

## M1: Fix release.yml build failures | status: completed
### T1.1: Add agent-harness dependency install step | status: completed
- [x] S1.1.1: Add `npm ci` step (working-directory: app/agent-harness) to build job before Build Tauri app | verified | evidence: release.yml:75-77 step present, between frontend deps (:71-73) and Build Tauri app (:79); package-lock.json git-tracked so npm ci works
- [x] S1.1.2: Bump actions/checkout@v4 -> v7 (3 places), actions/setup-node@v4 -> v7, softprops/action-gh-release@v1 -> v3 (2 places) | verified | evidence: release.yml:18/53/102 checkout@v7, :56 setup-node@v7, :22/105 gh-release@v3 (floating majors resolve to verified latest v7.0.1/v7.0.0/v3.0.2, all Node 24 native)

## M2: Verify fix | status: completed
### T2.1: Workflow validation | status: completed
- [x] S2.1.1: Validate release.yml YAML parses + actionlint (if available) | verified | evidence: python yaml.safe_load OK (jobs: create-release/build/publish-release, build has 7 steps incl. agent-harness install); actionlint not installed locally (substituted structural review)
- [x] S2.1.2: Confirm agent-harness `npm ci && npm run build` works (proves new CI step is correct) | verified | evidence: fresh independent run CI_EXIT 0 (324 pkgs) + BUILD_EXIT 0 (tsc -p tsconfig.json) — proves TS2688 fix (@types/node present)
- [x] S2.1.3: Final review: diff is minimal, no regressions to workflow logic | verified | evidence: diff = 6 action bumps + 1 new step only; matrix/needs/env/tauri-action args untouched; no secrets added (only secrets.* refs)
