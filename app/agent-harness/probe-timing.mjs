// Timing probe: measures each step of the "new agent / resume" hot path.
//   node probe-timing.mjs [--warm] [--cold]
//   --warm : assume a warm sidecar (measure only command latencies)
//   --cold : full boot + init + create (default when no flag)
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const args = process.argv.slice(2);
const cold = args.includes("--cold") || args.length === 0;
const dataDir = process.env.SMOKE_DATA_DIR ?? mkdtempSync(join(tmpdir(), "yzpz-timing-"));

const t = () => performance.now();
const times = {};
const mark = (name) => {
  const now = t();
  console.log(`[timing] ${name}: ${(now - (times._prev ?? now)).toFixed(0)} ms (cum ${(now - times._start).toFixed(0)} ms)`);
  times._prev = now;
};

async function main() {
  times._start = t();
  times._prev = times._start;

  let port;
  let child;
  if (cold) {
    child = spawn(process.execPath, ["dist/index.js", "--port", "0", "--data-dir", dataDir], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for READY\n" + stderr)), 30000);
      child.stdout.on("data", (d) => {
        const m = d.toString().match(/READY (\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
    });
    mark("boot to READY (server listening)");
  } else {
    port = Number(process.env.WARM_PORT);
  }

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  mark("ws connect");

  const command = (name, args2) =>
    new Promise((resolve, reject) => {
      const id = `${name}-${Math.random()}`;
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), 60000);
      const onMessage = (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "response" && msg.id === id) {
          clearTimeout(timer);
          resolve(msg);
        }
      };
      ws.on("message", onMessage);
      ws.send(JSON.stringify({ type: "command", id, command: name, args: args2 }));
    });

  await command("health", {});
  mark("health (no-init)");

  await command("list-sessions", { workspaceId: "w1" });
  mark("list-sessions (init gate)");

  await command("get-providers", {});
  mark("get-providers");

  await command("get-models", { providerId: "openai" });
  mark("get-models");

  await command("list-provider-configs", {});
  mark("list-provider-configs");

  await command("get-settings", {});
  mark("get-settings");

  await command("set-provider-config", {
    providerId: "openai",
    apiKey: "sk-timing-probe",
    baseUrl: undefined,
    modelId: "gpt-5",
  });
  mark("set-provider-config (fake saved key)");

  const created = await command("create-session", {
    workspaceId: "w1",
    cwd: tmpdir(),
    providerId: "openai",
    modelId: "gpt-5",
    title: "timing probe",
    maxTotalTokens: null,
  });
  mark("create-session");
  if (!created.ok) console.log("[warn] create-session:", JSON.stringify(created).slice(0, 300));

  ws.close();
  if (child) child.kill("SIGTERM");
  process.exit(0);
}

main().catch((err) => {
  console.error("[probe] failed:", err);
  process.exit(1);
});
