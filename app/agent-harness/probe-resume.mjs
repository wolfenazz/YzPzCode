// Probe: send a real message, then dump the raw persisted transcript shape to
// validate the frontend normalization (XML-wrapped user text, block types).
import { spawn } from "node:child_process";
import { once } from "node:events";

const SIDECAR = "C:/Users/nasee/Desktop/files/CODING/yzpzcode/app/agent-harness/dist/index.js";
const DATA_DIR = "C:/Users/nasee/.yzpzcode/agent";
const CWD = "C:/Users/nasee/Desktop/files/CODING/yzpzcode/app/agent-harness";

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
  } else if (msg.type === "event") events.push(msg.event);
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
  const created = await cmd("create-session", {
    workspaceId: "probe-ws", cwd: CWD, providerId: cfg.providerId, modelId: cfg.modelId, title: "resume-probe",
  });
  const sid = created.sessionId;
  await cmd("send-message", { sessionId: sid, prompt: "Read the first 10 lines of index.ts and summarize what it does." });
  let done = false;
  const timer = setTimeout(() => (done = true), 240000);
  while (!done) {
    if (events.some((e) => e.name === "session-event" && e.payload?.payload?.event?.type === "done")) break;
    if (events.some((e) => e.name === "session-event" && e.payload?.payload?.event?.type === "error")) break;
    await sleep(500);
  }
  clearTimeout(timer);

  const res = await cmd("read-messages", { sessionId: sid });
  const msgs = res.messages || [];
  console.log("[probe] total messages:", msgs.length);
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const blocks = Array.isArray(m.content) ? m.content : [];
    const types = blocks.map((b) => b.type);
    let textSnippet = "";
    for (const b of blocks) {
      if (b.type === "text" && typeof b.text === "string") { textSnippet = b.text.slice(0, 160).replace(/\n/g, " "); break; }
    }
    console.log(`[probe] msg#${i} role=${m.role} blocks=${JSON.stringify(types)}`);
    if (textSnippet) console.log(`        text: ${textSnippet}`);
  }
  console.log("[probe] ---");
  // Second read to confirm history is stable/reloadable (resume path).
  const res2 = await cmd("read-messages", { sessionId: sid });
  console.log("[probe] re-read message count:", (res2.messages || []).length);
  await cmd("delete-session", { sessionId: sid });
  console.log("[probe] OK");
}

main().then(() => { ws.close(); child.kill(); process.exit(0); })
  .catch((err) => { console.error("[probe] FAILED:", err.message || err); ws.close(); child.kill(); process.exit(1); });
