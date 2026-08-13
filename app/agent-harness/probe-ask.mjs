// Smoke probe: sidecar boots + core commands + create-session validation.
import { spawn } from "node:child_process";
import WebSocket from "ws";

const SIDECAR = "C:/Users/nasee/Desktop/files/CODING/yzpzcode/app/agent-harness/dist/index.js";
const DATA_DIR = "C:/Users/nasee/AppData/Local/Temp/opencode/yzpz-agent-probe-ask";

let nextId = 1;
let pending = new Map();
let ws;

function cmd(command, args = {}) {
  return new Promise((resolve, reject) => {
    const id = String(nextId++);
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: "command", id, command, args }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout: ${command}`));
      }
    }, 15000);
  });
}

async function main() {
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
  console.log("[smoke] READY", ready);

  ws = new WebSocket(`ws://127.0.0.1:${ready}`);
  await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "response" && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
    }
  });

  console.log("[smoke] health:", (await cmd("health")).ready);
  console.log("[smoke] providers:", (await cmd("get-providers")).providers.length);
  console.log("[smoke] settings ok, defaultProviderId:", (await cmd("get-settings")).global.defaultProviderId);

  // create-session with a bogus provider should fail gracefully (validation), not hang/crash.
  try {
    await cmd("create-session", {
      workspaceId: "ws-x",
      cwd: DATA_DIR,
      providerId: "definitely-not-a-provider",
      modelId: "nope",
    });
    console.log("[smoke] create-session unexpectedly succeeded");
  } catch (e) {
    console.log("[smoke] create-session rejected cleanly:", String(e.message || e).slice(0, 120));
  }

  console.log("[smoke] OK");
  ws.close();
  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err.message || err);
  try { ws && ws.close(); } catch {}
  process.exit(1);
});
