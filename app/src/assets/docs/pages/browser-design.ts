export const browserDesignContent = `# Browser and Design Tools

## In-App Browser

The browser runs inside your workspace. Open it with the **Browser** view button in the header.

### Browsing

- **Start page**: New tabs open a start page that lists the local dev servers it detects (live ones first, rescanned every few seconds), with a search box and a shortcut reference. No page loads until you pick one.
- **Address bar**: Type a URL, a search, or just a port: \`5173\` opens \`http://localhost:5173\`, \`example.com\` opens over HTTPS, and anything else becomes a web search. A badge shows whether the page is secure, local, or not secure. Press \`Esc\` to undo your edit.
- **Tabs**: Tabs show each page's favicon and title. Middle-click closes a tab. Links that open a new window (\`target="_blank"\`) open as a new tab. Open tabs are restored the next time you launch the app.
- **Back / Forward / Stop**: The arrows grey out when there's no history in that direction. While a page loads, Reload becomes Stop.
- **Localhost menu**: Lists running and stopped dev servers found in any terminal, including ones started outside the app.
- **More actions** (⋮): Open in system browser, open in a separate window or dock it back, export a page snapshot, and turn auto-reload on or off.
- **Auto-reload**: Localhost pages reload when workspace files change. Turn it off from the status bar or the ⋮ menu if your dev server already hot-reloads.

### Viewport and Devices

The viewport menu on the right of the toolbar emulates real device widths. The page lays out at the device's actual CSS size (for example 393 px for iPhone 15 Pro), scaled down to fit the pane when needed.

- **Desktop**: Laptop 1280×800, Desktop 1440×900, Full HD 1920×1080
- **Tablet**: iPad Mini, iPad Air, iPad Pro 12.9"
- **Mobile**: iPhone SE, iPhone 15 Pro, iPhone 15 Pro Max, Pixel 8, Galaxy S24
- **Custom**: Any width × height from 240 to 3840
- **Rotate** and **Zoom** (25% to 200%) live in the same menu

The status bar shows the page's viewport in CSS pixels, the zoom, and the last load time.

### Keyboard Shortcuts

These work while the browser view is open, including when the page itself has focus.

| Action | Shortcut |
| --- | --- |
| Focus address bar | \`Ctrl+L\` |
| New tab / close tab | \`Ctrl+T\` / \`Ctrl+W\` |
| Next / previous tab | \`Ctrl+PgDn\` / \`Ctrl+PgUp\` |
| Reload | \`Ctrl+R\` or \`F5\` |
| Back / forward | \`Alt+←\` / \`Alt+→\` |
| Zoom in / out / reset | \`Ctrl+=\` / \`Ctrl+-\` / \`Ctrl+0\` |
| Inspect element | \`Ctrl+Shift+C\` |
| Cancel the active tool | \`Esc\` |

### Snapshots

**Export snapshot** saves a full HTML capture of the current page (plus a JSON file with the URL, device and viewport) to \`.yzpzcode/browser-exports\` in your workspace.

### Security

Web pages open in the browser can only report inspector results back to the app. They can't call any other app command, such as file access or terminal input.

## Visual Design Inspector

The design tools sit in the middle of the browser toolbar. While a tool is active, the status bar shows what to do next and how to cancel it.

### Inspect

Hover over any element to highlight it, then click to open the element inspector: HTML, classes, selectors, attributes and editable styles. Describe a change and send it to an agent terminal with the element's full context.

### Pick Style

Click an element to capture its computed CSS (including \`::before\` and \`::after\`). Captures go to the **Style clipboard** panel, which previews each style with its colours.

### Copy UI

**Capture a UI component from any page and rebuild it in your own project.** A capture records the structure tree, layout, spacing, typography, colours, shadows and assets. In the **UI references** panel, choose **Add new** or **Replace** (pick the element to replace on your page), write a brief, and send it to an agent.

### Apply Style

Click **Apply** on a captured style, then click an element on the page. Hovering previews the result. Afterwards the status bar offers **Undo**, **Keep** and **Copy CSS**.

> **Tip:** A common workflow: capture a reference component with Copy UI, send it to an agent with a brief, then check the result at several device sizes from the viewport menu.
`;
