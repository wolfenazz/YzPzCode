// Synthetic cwd-resolution probe (S1.x): verifies the read_files path fix.
// The SDK's built-in readFile executor resolves relative paths against
// process.cwd() (the harness's own dir). Our harness wrapper resolves them
// against the session's workspace root first. This probe reproduces the
// wrapper exactly and proves the bug + the fix against the real SDK executor.
import { createDefaultExecutors } from "@cline/sdk";
import { isAbsolute, join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  [ok] ${name}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${name} ${detail}`);
  }
}

// Two real directories: one acts as the "workspace root", the other as the
// "harness process cwd" (where the SDK would wrongly look).
const workspace = mkdtempSync(join(tmpdir(), "yzpz-ws-"));
const harnessCwd = mkdtempSync(join(tmpdir(), "yzpz-harness-"));
writeFileSync(join(workspace, "documentation.md"), "Hello from the workspace root\n", "utf8");

// Harness process would live in its own dir; make sure process.cwd() differs.
process.chdir(harnessCwd);

// The default SDK executor (what read_files used before the fix).
const defaultRead = createDefaultExecutors().readFile;

// 1. Reproduce the ORIGINAL bug: relative path resolves against harness cwd.
console.log("1. default SDK executor (pre-fix behavior)");
{
  try {
    await defaultRead({ path: "documentation.md" }, { agentId: "a" });
    check("relative read fails when file lives in workspace", false, "should have thrown ENOENT");
  } catch (e) {
    check(
      "relative read fails when file lives in workspace",
      e.code === "ENOENT" && e.path.includes("yzpz-harness-"),
      `err=${e.message}`,
    );
  }
}

// 2. The harness wrapper: resolve relative paths against the session cwd.
console.log("2. harness wrapper executor (the fix)");
{
  const sessionCwd = new Map([["s1", workspace]]);
  const wrapped = async (request, context) => {
    const cwd = sessionCwd.get(context.sessionId ?? "");
    const path = cwd && !isAbsolute(request.path) ? join(cwd, request.path) : request.path;
    return defaultRead({ ...request, path }, context);
  };
  const result = await wrapped({ path: "documentation.md" }, { sessionId: "s1", agentId: "a" });
  const text = Array.isArray(result) ? result.map((b) => b.text ?? "").join("") : String(result);
  check("relative path reads from workspace root", text.includes("Hello from the workspace root"), text);
}

// 3. Absolute paths still work unchanged.
console.log("3. absolute path passthrough");
{
  const sessionCwd = new Map([["s1", workspace]]);
  const wrapped = async (request, context) => {
    const cwd = sessionCwd.get(context.sessionId ?? "");
    const path = cwd && !isAbsolute(request.path) ? join(cwd, request.path) : request.path;
    return defaultRead({ ...request, path }, context);
  };
  const result = await wrapped({ path: join(workspace, "documentation.md") }, { sessionId: "s1", agentId: "a" });
  const text = Array.isArray(result) ? result.map((b) => b.text ?? "").join("") : String(result);
  check("absolute path unchanged and read", text.includes("Hello from the workspace root"), text);
}

// 4. Subdirectory relative path (search output style: docs\\workflow.md).
console.log("4. subdirectory relative path");
{
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(workspace, "docs"), { recursive: true });
  writeFileSync(join(workspace, "docs", "workflow.md"), "workflow body\n", "utf8");
  const sessionCwd = new Map([["s1", workspace]]);
  const wrapped = async (request, context) => {
    const cwd = sessionCwd.get(context.sessionId ?? "");
    const path = cwd && !isAbsolute(request.path) ? join(cwd, request.path) : request.path;
    return defaultRead({ ...request, path }, context);
  };
  const result = await wrapped({ path: join("docs", "workflow.md") }, { sessionId: "s1", agentId: "a" });
  const text = Array.isArray(result) ? result.map((b) => b.text ?? "").join("") : String(result);
  check("docs\\workflow.md resolves under workspace root", text.includes("workflow body"), text);
}

console.log(failures === 0 ? "ALL CWD PROBE CHECKS PASSED" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
