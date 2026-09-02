export const terminalsContent = `# Terminals

## The Terminal Grid

Terminals are arranged in a resizable grid within the workspace:

| Layout | Sessions | Grid Size |
|--------|----------|-----------|
| 1 Terminal | 1 session | 1×1 |
| 2 Terminals | 2 sessions | 2×1 |
| 4 Terminals | 4 sessions | 2×2 |
| 6 Terminals | 6 sessions | 3×2 |
| 8 Terminals | 8 sessions | 4×2 |

Each pane has a title bar showing the TTY number, the assigned agent, and a status indicator (green for active, yellow for running, red for error).

## Using Terminals

- **Click**: Focus a terminal
- **Type**: Enter commands exactly as in a native terminal (full xterm.js emulation)
- **Drag**: Reorder panes with drag and drop
- **Right-click**: Context menu with agent launch options

## Quick Prompts in Terminals

Every terminal pane can show a **quick prompt strip**: a horizontally scrollable row of preset prompt chips below the header.

- Toggle it per-pane with the sparkle button in the terminal header ("Show quick prompts")
- Clicking a chip runs its prompt text immediately in that terminal session
- The same presets you configure under **Settings → Quick prompts** appear here and in the agent input

## Terminal Colors

Personalize each terminal's canvas under **Settings → Terminal → Colors**:

- **Background** and **Text** color pickers, each showing the current hex value or "Theme default"
- One-click **presets**: Theme, Graphite, Midnight, Solarized, and Paper
- **Reset colors** returns both values to the app theme
- A live preview in the settings page shows the result before you commit to it

## Managed Commands

Run non-interactive commands inside app terminals with full status tracking. A managed command moves through Idle → Starting → Running → Stopping, and ends as Completed or Failed, with the PID and exit code monitored and output streamed in real time.

## Quick Actions

The **Quick Actions** menu in the workspace header auto-detects your project's dev and build commands (from package.json scripts and similar) and runs them in the active terminal with one click.

## External Terminals

Prefer native windows? Launch OS terminal windows with the workspace directory pre-configured:

- **Windows**: CMD windows with automatic grid tiling
- **macOS**: Terminal.app windows with positioned bounds
- **Linux**: The detected system terminal (gnome-terminal, konsole, xfce4-terminal) tiled via wmctrl

This is also the mode selected by the **Open Terminals Externally** toggle in workspace setup. Use external terminals for long-lived processes, additional terminals beyond the grid, or a full OS terminal experience.

> **Tip:** Keep agent CLIs in the app grid where you can watch all of them at once, and push long-running dev servers to external windows.
`;
