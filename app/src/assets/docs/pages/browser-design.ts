export const browserDesignContent = `# Browser and Design Tools

## In-App Browser

The browser runs inside your workspace. Open it with the **Browser** view button in the header.

### Browsing

- **URL bar**: Type any URL and press Enter
- **Multi-tab**: Open, switch, and close multiple browser tabs
- **Back / Forward**: Standard navigation history
- **Localhost menu**: The URL bar doubles as a dev-server picker that probes common ports (5173, 3000, 8080, and more) across all your terminals, so you can jump straight to a running dev server
- **Open externally**: Send the current URL to your system browser
- **Pop-out / Dock**: Open the browser in a separate app window, or dock it back into the workspace

### Preview Controls

The bottom workbench bar holds the responsive preview controls:

- **Device presets**: Responsive, iPhone 14 Pro (393×852), iPad (820×1180)
- **Rotate orientation**: Switch between portrait and landscape (disabled for Responsive)
- **Zoom**: 50% to 200% with reset
- **Status metrics**: Viewport size, page load duration, history count, page title, and current URL

### Snapshots

**Export snapshot** saves a full HTML capture of the current page into your workspace, useful as a design reference for agents.

## Visual Design Inspector

The browser includes four design-inspection modes, available from the browser toolbar.

### Inspect Mode

Hover over any element to see its HTML, classes, ID, and CSS selectors. Click the Inspect button to toggle it, or press \`Escape\` to exit.

### Pick Style Mode

Click an element to capture its computed CSS styles (including \`::before\` and \`::after\` pseudo-elements). Captures are saved to the **Style clipboard**, shown in a sidebar with a count badge.

### Copy UI Mode

**Copy a UI element from any page and rebuild it in your local project.** Clicking an element captures a full reference: structure tree, layout grid, spacing, typography, colors, shadows, and assets. The capture feeds a rich prompt, which you can:

- Send to any terminal session running an agent, or to the built-in YzPz Agent
- Use in **replace** mode or **insert** mode, depending on whether you are replacing an element in your project or adding a new one

### Apply Mode

Apply captured styles from the Style clipboard to target elements in the page. Hover previews the result before you click, and the undo button reverts applications. Generated CSS classes are injected into the page.

> **Tip:** A common workflow: capture a reference component with Copy UI, send it to an agent session with a prompt describing how to adapt it, then preview the result in the browser's device presets.
`;
