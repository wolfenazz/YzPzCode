// graphify Kilo plugin
// Injects a knowledge graph reminder before bash tool calls when the graph exists.
import { existsSync } from "fs";
import { join } from "path";

export const GraphifyPlugin = async ({ directory }) => {
  let reminded = false;

  return {
    "tool.execute.before": async (input, output) => {
      if (reminded) return;
      if (!existsSync(join(directory, "graphify-out", "graph.json"))) return;

      if (input.tool === "bash") {
        // Separate with ';' not '&&' — Windows PowerShell 5.1 rejects '&&' as a
        // statement separator ("not a valid statement separator"), which broke
        // the first bash command in every OpenCode session on Windows (#1646).
        // ';' works in PowerShell 5.1, Bash, and POSIX shells alike.
        output.args.command =
          'echo "[graphify] Knowledge graph available. Read graphify-out/GRAPH_REPORT.md for god nodes and architecture context before searching files." ; ' +
          output.args.command;
        reminded = true;
      }
    },
  };
};
