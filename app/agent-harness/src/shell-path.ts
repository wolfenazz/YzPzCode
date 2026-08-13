import { execFile } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";

// YZPZ Agent data directory — fully rebranded away from ~/.cline.
export function resolveDataDir(override?: string): string {
  return override || join(homedir(), ".yzpzcode", "agent");
}

// Apps launched from Finder/Dock (macOS) or desktop shortcuts (Windows/Linux)
// can inherit a minimal PATH. Agent-spawned commands (run_commands, MCP
// servers) must see the user's real PATH or `gh`, `node`, etc. will be missing.
export function resolveLoginShellPath(): Promise<string> {
  const current = process.env.PATH || "";

  if (process.env.YZPZ_SKIP_SHELL_PATH === "1") {
    return Promise.resolve(current);
  }

  if (platform() === "darwin") {
    const shell = process.env.SHELL || "/bin/zsh";
    return exec(shell, ["-l", "-c", "echo $PATH"]).then((out) => {
      const loginPath = out.trim();
      return loginPath ? `${loginPath}:${current}` : current;
    });
  }

  if (platform() === "linux") {
    const shell = process.env.SHELL || "/bin/bash";
    return exec(shell, ["-lc", "echo $PATH"]).then((out) => {
      const loginPath = out.trim();
      return loginPath ? `${loginPath}:${current}` : current;
    });
  }

  // Windows: GUI processes launched from Explorer inherit the user PATH from
  // the registry; nothing extra is needed.
  return Promise.resolve(current);
}

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000 }, (err, stdout) => {
      if (err) {
        resolve("");
        return;
      }
      resolve(stdout);
    });
  });
}
