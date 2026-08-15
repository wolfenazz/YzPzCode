// End-to-end probe: create a session on the configured provider, send a real
// question, capture streaming events + usage, and verify get-session-preview.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";

const SIDECAR = join(import.meta.dirname, "dist", "index.js");
// Use the real data dir so the user's provider configs (e.g. opencode-go) are found.
const DATA_DIR = join(homedir(), ".yzpzcode", "agent");
const CWD = import.meta.dirname;

const child = spawn(process.execPath, [SIDECAR, "--data-dir", DATA_DIR], { stdio: ["ignore", "pipe", "inherit"] });
const ready = await new Promise((resolve, reject) => {
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    const m = buf.match(/READY (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  setTimeout(() => reject(new Error("no READY")), 20000);
});

const { WebSocket } = await import("ws");
const ws = new WebSocket(`ws://127.0.0.1:${ready}`);
await once(ws, "open");

let nextId = 1;
const pending = new Map();
const events = [];
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "response" && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
  } else if (msg.type === "event") {
    events.push(msg.event);
  }
});

const cmd = (command, args = {}) =>
  new Promise((resolve, reject) => {
    const id = String(nextId++);
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: "command", id, command, args }));
    setTimeout(() => reject(new Error(`timeout: ${command}`)), 120000);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const configs = await cmd("list-provider-configs");
  const cfg = configs.configs[0];
  if (!cfg) throw new Error("no provider config found in real data dir");
  console.log("[probe] using provider:", cfg.providerId, "model:", cfg.modelId);

  const created = await cmd("create-session", {
    workspaceId: "probe-ws",
    cwd: CWD,
    providerId: cfg.providerId,
    modelId: cfg.modelId,
    title: "efficiency-probe",
  });
  const sid = created.sessionId;
  console.log("[probe] session:", sid);

  const started = Date.now();
  await cmd("send-message", { sessionId: sid, prompt: "List the files in this folder and what each one is for. Be concise." });
  console.log("[probe] sent, waiting for done...");

  // Wait for the session to finish (event.type === 'done' wrapped in agent_event).
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; }, 240000);
  while (!timedOut) {
    if (events.some((e) => e.name === "session-event" && e.payload?.payload?.event?.type === "done")) break;
    if (events.some((e) => e.name === "session-event" && e.payload?.payload?.event?.type === "error")) break;
    await sleep(500);
  }
  clearTimeout(timer);

  const dur = ((Date.now() - started) / 1000).toFixed(1);
  const sessEvents = events.filter((e) => e.name === "session-event").map((e) => e.payload);
  const agentEvents = sessEvents.map((s) => s.payload?.event).filter(Boolean);
  const byType = {};
  for (const ev of agentEvents) byType[ev.type] = (byType[ev.type] || 0) + 1;
  const textChunks = agentEvents.filter((e) => e.type === "content_start" && e.contentType === "text" && e.text).length;
  const reasoningChunks = agentEvents.filter((e) => e.type === "content_start" && e.contentType === "reasoning" && (e.reasoning || e.text)).length;
  const toolStarts = agentEvents.filter((e) => e.type === "content_start" && e.contentType === "tool").map((e) => e.toolName);
  const lastUsage = agentEvents.filter((e) => e.type === "usage").pop();
  const doneEv = agentEvents.find((e) => e.type === "done");
  console.log(`[probe] finished in ${dur}s (timeout=${timedOut})`);
  console.log("[probe] event counts:", JSON.stringify(byType));
  console.log("[probe] text deltas:", textChunks, "reasoning deltas:", reasoningChunks);
  console.log("[probe] tools used:", JSON.stringify(toolStarts));
  if (lastUsage) console.log("[probe] last usage event:", JSON.stringify({ inputTokens: lastUsage.inputTokens, outputTokens: lastUsage.outputTokens, totalInputTokens: lastUsage.totalInputTokens, totalOutputTokens: lastUsage.totalOutputTokens, totalCost: lastUsage.totalCost }));
  if (doneEv) console.log("[probe] done reason:", doneEv.reason, "iterations:", doneEv.iterations);

  const msgs = await cmd("read-messages", { sessionId: sid });
  const textLen = (msgs.messages || []).reduce((n, m) => {
    const blocks = Array.isArray(m.content) ? m.content : [];
    for (const b of blocks) if (b.type === "text" && typeof b.text === "string") n += b.text.length;
    return n;
  }, 0);
  console.log("[probe] message count:", (msgs.messages || []).length, "total text chars:", textLen);

  const preview = await cmd("get-session-preview", { sessionId: sid });
  console.log("[probe] preview:", JSON.stringify(preview));

  const usage = await cmd("get-usage", { sessionId: sid });
  console.log("[probe] get-usage:", JSON.stringify(usage));

  await cmd("delete-session", { sessionId: sid });
  console.log("[probe] OK");
}

main().then(() => { ws.close(); child.kill(); process.exit(0); })
  .catch((err) => { console.error("[probe] FAILED:", err.message || err); ws.close(); child.kill(); process.exit(1); });
