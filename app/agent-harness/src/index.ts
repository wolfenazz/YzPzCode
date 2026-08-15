import { WebSocketServer } from "ws";
import { parseArgs } from "node:util";
import { resolveDataDir, resolveLoginShellPath } from "./shell-path.js";
import { ProviderConfigStore } from "./store.js";
import { AgentHarness } from "./harness.js";
import { AgentServer } from "./server.js";

// YZPZ Agent sidecar entry point.
//   node dist/index.js [--port <n>] [--data-dir <path>]
// Prints "READY <port>" to stdout once the WS transport is listening so the
// Rust backend can discover the ephemeral port.

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: "string" },
      "data-dir": { type: "string" },
    },
  });

  const dataDir = resolveDataDir(values["data-dir"]);
  const shellPath = await resolveLoginShellPath();
  if (shellPath) {
    process.env.PATH = shellPath;
  }
  process.env.CLION_YZPZ = "1";

  const store = new ProviderConfigStore(dataDir);
  const harness = new AgentHarness(dataDir);
  harness.setProviderStore(store);

  // The Rust host always connects to 127.0.0.1. Binding explicitly to the
  // IPv4 loopback interface avoids Windows failures on systems where Node's
  // default unspecified (often IPv6) listener is unavailable or restricted.
  const wss = new WebSocketServer({
    host: "127.0.0.1",
    port: values.port ? Number(values.port) : 0,
  });
  const server = new AgentServer(harness, store, wss);

  wss.on("listening", () => {
    const address = wss.address();
    const port = typeof address === "object" && address ? address.port : Number(values.port ?? 0);
    // Handshake line consumed by the Rust backend.
    process.stdout.write(`READY ${port}\n`);
  });

  // Initialize the harness lazily on first connection so `READY` is printed
  // fast and the Rust side is never blocked on SDK startup.
  wss.on("connection", () => {
    void harness.init().catch((err) => {
      console.error(`[yzpz-agent] harness init failed: ${err}`);
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[yzpz-agent] received ${signal}, shutting down`);
    try {
      await harness.dispose();
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    // A caught exception usually leaves the harness in an unknown state. Exit
    // (with best-effort dispose) rather than silently serving a broken sidecar.
    console.error(`[yzpz-agent] uncaught exception: ${err}`);
    try {
      void harness.dispose();
    } catch {
      // best-effort
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(`[yzpz-agent] fatal: ${err}`);
  process.exit(1);
});
