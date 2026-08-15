// Probe: verify MCP server commands + provider info + default-provider prefs.
// Resolves the harness from its own location so it runs on any machine.
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const SIDECAR = join(import.meta.dirname, "dist", "index.js");
const DATA_DIR = join(tmpdir(), `yzpz-agent-probe-mcp-${process.pid}`);

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
  const child = spawn(process.execPath, [SIDECAR, "--data-dir", DATA_DIR], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  const ready = await new Promise((resolve, reject) => {
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const m = buf.match(/READY (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    setTimeout(() => reject(new Error("no READY")), 20000);
  });
  console.log("[probe] sidecar READY on", ready);

  ws = new WebSocket(`ws://127.0.0.1:${ready}`);
  await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "response" && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    }
  });

  const health = await cmd("health");
  console.log("[probe] health ok:", health.ready === true);

  // 1. Providers include baseUrl + defaultModelId
  const prov = await cmd("get-providers");
  const p0 = prov.providers[0];
  console.log("[probe] providers:", prov.providers.length, "| first:", p0.id, "| baseUrl:", p0.baseUrl, "| defaultModelId:", p0.defaultModelId);

  // 2. Default provider pref round-trip
  const s0 = await cmd("get-settings");
  console.log("[probe] initial defaultProviderId:", s0.global.defaultProviderId);
  await cmd("update-settings", { update: { defaultProviderId: "openai" } });
  const s1 = await cmd("get-settings");
  console.log("[probe] defaultProviderId after update:", s1.global.defaultProviderId);

  // 3. MCP: list empty → add → list → disable → remove → list
  const m0 = await cmd("list-mcp-servers");
  console.log("[probe] mcp initial:", JSON.stringify(m0.servers));

  const added = await cmd("add-mcp-server", { name: "probe-fs", transport: { type: "stdio", command: "node", args: ["-e", "console.error('probe mcp stdio');process.exit(1)"] } });
  console.log("[probe] mcp add:", JSON.stringify(added.server));

  const m1 = await cmd("list-mcp-servers");
  console.log("[probe] mcp after add:", JSON.stringify(m1.servers));

  const disabled = await cmd("set-mcp-server-disabled", { name: "probe-fs", disabled: true });
  console.log("[probe] mcp disabled:", JSON.stringify(disabled.server));

  const m2 = await cmd("list-mcp-servers");
  console.log("[probe] mcp after disable:", JSON.stringify(m2.servers));

  const removed = await cmd("remove-mcp-server", { name: "probe-fs" });
  console.log("[probe] mcp remove:", JSON.stringify(removed));

  const m3 = await cmd("list-mcp-servers");
  console.log("[probe] mcp final:", JSON.stringify(m3.servers));

  // 4. answer-question with unknown id → resolved:false (proves command wired)
  const aq = await cmd("answer-question", { requestId: "nope", answer: "x" });
  console.log("[probe] answer-question unknown id:", JSON.stringify(aq));

  // 5. remove-provider-config wired
  const rpc = await cmd("remove-provider-config", { providerId: "openai" });
  console.log("[probe] remove-provider-config:", JSON.stringify(rpc));

  console.log("[probe] ALL OK");
  ws.close();
  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("[probe] FAILED:", err.message || err);
  try { ws && ws.close(); } catch {}
  process.exit(1);
});
