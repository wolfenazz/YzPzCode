// Quick smoke test: spawn the built sidecar, wait for READY, then issue
// `health` (no-init) and `list-sessions` (init-gated) commands over WS to
// prove the decoupled init path still answers commands.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const dataDir = process.env.SMOKE_DATA_DIR ?? mkdtempSync(join(tmpdir(), "yzpz-smoke-"));
const child = spawn(process.execPath, ["dist/index.js", "--port", "0", "--data-dir", dataDir], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (d) => (stderr += d.toString()));

const ready = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout waiting for READY")), 15000);
  child.stdout.on("data", (d) => {
    const m = d.toString().match(/READY (\d+)/);
    if (m) {
      clearTimeout(timer);
      resolve(Number(m[1]));
    }
  });
});

const ws = new WebSocket(`ws://127.0.0.1:${ready}`);
await new Promise((resolve, reject) => {
  ws.once("open", resolve);
  ws.once("error", reject);
});

const command = (id, name, args) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), 20000);
    const onMessage = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "response" && msg.id === id) {
        clearTimeout(timer);
        resolve(msg);
      }
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ type: "command", id, command: name, args }));
  });

const health = await command("1", "health", {});
console.log("[ok] health:", JSON.stringify(health));

const list = await command("2", "list-sessions", { workspaceId: "w1" });
console.log("[ok] list-sessions (init-gated):", JSON.stringify(list).slice(0, 300));

ws.close();
child.kill("SIGTERM");
if (stderr.trim()) console.log("--- sidecar stderr ---\n" + stderr.trim());
process.exit(0);
