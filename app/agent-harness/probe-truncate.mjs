// Synthetic truncation probe (S3.1.3): exercises the PI-style tool-output
// truncation policy through the same functions the harness's afterTool hook
// calls (truncateHead for reads, truncateTail for shell, truncateLine for
// grep/search). Uses oversized synthetic tool results — no LLM needed.
import {
  truncateHead,
  truncateTail,
  truncateLine,
  formatSize,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
  GREP_MAX_LINE_LENGTH,
} from "./dist/truncate.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  [ok] ${name}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${name} ${detail}`);
  }
}

// Replicates the harness.ts truncateToolOutput policy mapping exactly.
function truncateToolOutput(toolName, output) {
  if (typeof output !== "string") return { output, truncated: false };
  if (toolName === "read" || toolName === "read_files") {
    const r = truncateHead(output);
    if (!r.truncated) return { output, truncated: false };
    return {
      output: `${r.content}\n\n[Output truncated: showing ${r.outputLines} of ${r.totalLines} lines (${formatSize(r.maxBytes)} limit). Use offset/limit to read more.]`,
      truncated: true,
    };
  }
  if (toolName === "bash" || toolName === "run_commands" || toolName === "execute_command") {
    const r = truncateTail(output);
    if (!r.truncated) return { output, truncated: false };
    return {
      output: `${r.content}\n\n[Output truncated: showing the last ${r.outputLines} of ${r.totalLines} lines (${formatSize(r.maxBytes)} limit).]`,
      truncated: true,
    };
  }
  if (toolName === "grep" || toolName === "search_codebase" || toolName === "find" || toolName === "glob") {
    const lines = output.split("\n");
    const capped = lines.map((line) => truncateLine(line, GREP_MAX_LINE_LENGTH).text);
    const cappedText = capped.join("\n");
    if (!capped.every((line, i) => line === lines[i])) {
      // Some lines were capped. Keep the TOTAL bounded too (lines AND bytes),
      // mirroring the harness fix so a pathological result cannot exceed the
      // output budget (500 chars x N lines would otherwise be unbounded).
      const r = truncateHead(cappedText, { maxLines: 200, maxBytes: DEFAULT_MAX_BYTES });
      if (!r.truncated) return { output: cappedText, truncated: true };
      return {
        output: `${r.content}\n\n[Search results truncated: showing ${r.outputLines} of ${r.totalLines} lines.]`,
        truncated: true,
      };
    }
    const r = truncateHead(output, { maxLines: 200, maxBytes: DEFAULT_MAX_BYTES });
    if (!r.truncated) return { output, truncated: false };
    return {
      output: `${r.content}\n\n[Search results truncated: showing ${r.outputLines} of ${r.totalLines} lines.]`,
      truncated: true,
    };
  }
  const r = truncateHead(output);
  if (!r.truncated) return { output, truncated: false };
  return {
    output: `${r.content}\n\n[Output truncated: showing ${r.outputLines} of ${r.totalLines} lines (${formatSize(r.maxBytes)} limit).]`,
    truncated: true,
  };
}

// 1. Oversized file read -> head truncation keeps the beginning.
console.log("1. read_files (head)");
{
  const big = Array.from({ length: 3000 }, (_, i) => `line ${i}: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`).join("\n");
  const { output, truncated } = truncateToolOutput("read_files", big);
  check("truncated flagged", truncated === true);
  check("keeps beginning", output.includes("line 0:"));
  check("drops end", !output.includes("line 2999:"));
  check("total lines reported", output.includes("of 3000 lines"), output.slice(0, 80));
  check("small result untouched", truncateToolOutput("read_files", "hello\nworld").truncated === false);
}

// 2. Oversized shell output -> tail truncation keeps the end (errors).
console.log("2. run_commands (tail)");
{
  const big = Array.from({ length: 3000 }, (_, i) => `step ${i}: ok`).join("\n") + "\nERROR: build failed at step 2999";
  const { output, truncated } = truncateToolOutput("run_commands", big);
  check("truncated flagged", truncated === true);
  check("keeps end (error)", output.includes("ERROR: build failed"), output.slice(-120));
  check("drops start", !output.includes("step 0: ok"));
}

// 3. grep/search -> per-line cap at GREP_MAX_LINE_LENGTH.
console.log("3. search_codebase (line)");
{
  const longLine = "x".repeat(2000);
  const { output, truncated } = truncateToolOutput("search_codebase", `fileA:1:${longLine}\nfileB:2:short`);
  check("truncated flagged", truncated === true);
  const lines = output.split("\n");
  check("long line capped", lines[0].length <= GREP_MAX_LINE_LENGTH + 60, `len=${lines[0].length}`);
  check("short line preserved", lines[1] === "fileB:2:short");
}

// 4. Generic fallback (editor) -> head truncation.
console.log("4. generic fallback (head)");
{
  const big = Array.from({ length: 2500 }, (_, i) => `row ${i}`).join("\n");
  const { output, truncated } = truncateToolOutput("editor", big);
  check("truncated flagged", truncated === true);
  check("keeps beginning", output.includes("row 0:") || output.includes("row 0"));
  check("drops end", !output.includes("row 2499"));
}

// 5. Non-string output passes through untouched (e.g. structured results).
console.log("5. non-string passthrough");
{
  const obj = { ok: true, nested: [1, 2, 3] };
  const { output, truncated } = truncateToolOutput("read_files", obj);
  check("not truncated", truncated === false);
  check("identity preserved", output === obj);
}

// 6. A result that needed per-line capping is STILL bounded in total — the
//    harness fix (previously uncapped: 500 chars x line count could exceed the
//    50KB output budget indefinitely).
console.log("6. capped search output remains total-bounded");
{
  const huge = Array.from({ length: 3000 }, (_, i) => `z${i.toString().padStart(4, "0")}${"z".repeat(880)}`).join("\n");
  const { output, truncated } = truncateToolOutput("search_codebase", huge);
  check("truncated flagged", truncated === true);
  check("total capped to 50KB budget", Buffer.byteLength(output, "utf8") <= DEFAULT_MAX_BYTES + 2000, `len=${Buffer.byteLength(output, "utf8")}`);
  check("truncation notice present", output.includes("[Search results truncated:"), output.slice(-120));
  check("drops the tail", !output.includes("z2999"), "head should not contain the final line");
}
const manyShort = Array.from({ length: 5000 }, (_, i) => `hit ${i}`).join("\n");
{
  const { output, truncated } = truncateToolOutput("search_codebase", manyShort);
  check("no-capping path flags truncation", truncated === true);
  check("no-capping path bounded to 200 lines", (output.match(/\n/g) || []).length <= 200 + 5, `lines=${output.split("\n").length}`);
}

console.log(failures === 0 ? "ALL TRUNCATE PROBE CHECKS PASSED" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
