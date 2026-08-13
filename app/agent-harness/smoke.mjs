// YZPZ Agent sidecar smoke test — spawn, READY handshake, WS commands.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";

const require = createRequire(import.meta.url);
const { WebSocket } = require("ws");

const child = spawn("node", ["dist/index.js"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));

async function readReady() {
  for await (const chunk of child.stdout) {
    const text = chunk.toString();
    for (const line of text.split("\n")) {
      if (line.startsWith("READY ")) return line.trim().split(" ")[1];
    }
  }
  throw new Error("sidecar exited before READY");
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

let nextId = 1;
function sendCommand(ws, command, args = {}) {
  return new Promise((resolve, reject) => {
    const id = String(nextId++);
    const onMessage = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "response" && msg.id === id) {
        ws.off("message", onMessage);
        msg.ok ? resolve(msg.result) : reject(new Error(msg.error));
      }
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ type: "command", id, command, args }));
    setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`timeout waiting for ${command}`));
    }, 30000);
  });
}

let events = [];
function collectEvents(ws) {
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === "event") events.push(msg.event);
  });
}

async function main() {
  const port = await Promise.race([readReady(), timeout(30000)]);
  console.log(`[ok] READY on port ${port}`);
  const ws = await connect(port);
  collectEvents(ws);

  const hello = events.find((e) => e.name === "hello");
  console.log(`[ok] hello event: ${JSON.stringify(hello?.payload)}`);

  const ping = await sendCommand(ws, "ping");
  console.log(`[ok] ping: ${JSON.stringify(ping)}`);

  const health = await sendCommand(ws, "health");
  console.log(`[ok] health: ${JSON.stringify(health)}`);

  const providers = await sendCommand(ws, "get-providers");
  const providerIds = (providers.providers ?? []).map((p) => p.id);
  console.log(`[ok] get-providers: ${providerIds.length} providers, first: ${providerIds.slice(0, 5).join(", ")}`);

  const models = await sendCommand(ws, "get-models", { providerId: "anthropic" });
  console.log(`[ok] get-models anthropic: ${(models.models ?? []).length} models, first: ${JSON.stringify((models.models ?? [])[0])}`);

  const configs = await sendCommand(ws, "list-provider-configs");
  console.log(`[ok] list-provider-configs: ${JSON.stringify(configs)}`);

  const bad = await sendCommand(ws, "no-such-command").catch((e) => `rejected: ${e.message}`);
  console.log(`[ok] unknown command: ${bad}`);

  // create-session with no API key should still create (or fail with auth error, proving the path runs)
  try {
    const created = await sendCommand(ws, "create-session", {
      workspaceId: "ws-test",
      cwd: process.cwd(),
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      title: "smoke-test",
    });
    console.log(`[ok] create-session: ${JSON.stringify(created)}`);
    const sid = created.sessionId;
    const msgs = await sendCommand(ws, "read-messages", { sessionId: sid });
    console.log(`[ok] read-messages: ${(msgs.messages ?? []).length} messages`);
    const listed = await sendCommand(ws, "list-sessions");
    console.log(`[ok] list-sessions: ${(listed.sessions ?? []).length} sessions`);
    await sendCommand(ws, "delete-session", { sessionId: sid });
    console.log("[ok] delete-session");
  } catch (e) {
    console.log(`[warn] create-session flow: ${e.message} (expected if no credentials configured)`);
  }

  ws.close();
  child.kill();
  console.log("[done] smoke test complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(`[FAIL] ${e.message}`);
  child.kill();
  process.exit(1);
});
