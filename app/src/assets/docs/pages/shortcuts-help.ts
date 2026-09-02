export const shortcutsHelpContent = `# Shortcuts and Help

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Settings | \`Ctrl+,\` |
| Quick Open file | \`Ctrl+P\` |
| Find in file | \`Ctrl+F\` |
| Search documentation | \`Ctrl+K\` |
| Save (image editor) | \`Ctrl+S\` |
| Save As (image editor) | \`Ctrl+Shift+S\` |
| Copy | \`Ctrl+C\` (with text selected) |
| Paste | \`Ctrl+V\` |
| Clear terminal | \`Ctrl+L\` (shell dependent) |
| Exit inspect / pick modes | \`Escape\` |

## Common Tasks

### Opening a File

1. Toggle the file explorer panel
2. Navigate to your file and click it
3. The file opens in the editor, or press \`Ctrl+P\` and type its name

### Checking Git Status

1. Open the **Source Control** panel
2. Review changed files with add and deletion counts
3. Click **Compare with HEAD** on any file to see its diff

### Committing and Pushing

1. In the Source Control panel, stage your files
2. Write a summary and optional description
3. Tick **Push to \<remote\> after commit** and click the commit button

### Sending Work to an Agent

1. Type your prompt in the agent input, or click a quick prompt chip
2. Add images with the paperclip or by pasting
3. If the agent is busy, your prompt joins the **Up next** queue automatically

### Inspecting a Web Page

1. Switch to **Browser view**
2. Navigate to the page and click **Inspect** in the toolbar
3. Hover elements to see their HTML structure

### Capturing a Design Reference

1. In the browser, click **Copy UI**
2. Click any component (card, nav bar, hero section)
3. Send the captured reference to an agent session to rebuild it in your project

## Troubleshooting

### CLI Tools Not Detected

1. Click the refresh button in the Agent Fleet or under **Settings → CLI tools**
2. Verify the CLI is on your system PATH
3. Restart YzPzCode

### Terminals Won't Start

1. Close and reopen the workspace
2. Check that the directory exists and is accessible
3. Restart the app

### Browser Shows Blank

1. Check the URL is valid
2. Try the localhost dev-server menu to find a running server
3. Close and reopen the browser tab

### Discord Presence Not Showing

1. Make sure Discord is running and you are logged in
2. Re-enable the toggle under **Settings → Appearance**
3. The app reconnects automatically, but restarting YzPzCode also helps

### App Feels Slow

1. Reduce the number of terminal sessions
2. Close unused workspaces
3. Disable animations under **Settings → Appearance**

## Platform Notes

### Windows

- Terminals use CMD by default
- External terminals open with automatic grid tiling
- Use winget for CLI installations

### macOS

- The app may require right-click to open on first launch (not code-signed)
- Terminal.app is used for external terminals
- Use Homebrew for CLI installations

### Linux

- Supported external terminals: gnome-terminal, konsole, xfce4-terminal
- wmctrl is required for external terminal tiling
- Use your standard package manager for CLI installations

## FAQ

### Do I need to install Node.js?

Yes. YzPzCode checks for Node.js on first launch and prompts you to install it if missing. It is required by several agent CLIs and the built-in agent harness.

### How many AI assistants can I use at once?

Up to 8 terminals in the grid, and each can run a different AI CLI or tool CLI.

### Can I use YzPzCode without AI tools?

Yes. Unassigned terminals run as regular shell sessions in your workspace directory.

### How do I update YzPzCode?

Check **Settings → Updates**. Choose the Stable, Beta, or Nightly channel, and enable auto-download for hands-off updates.

### Where do my generated designs go?

Saved designs from the AI Designer export to your workspace's \`Design\` folder as \`index.html\`, \`styles.css\`, and \`designer-meta.json\`.

## Getting More Help

- Check the terminal output in the app for agent and command errors
- Browse these docs with \`Ctrl+K\` to search everything
- Open an issue on the GitHub repository
`;
