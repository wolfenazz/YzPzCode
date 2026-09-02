export const editorFilesContent = `# Editor and Files

## File Explorer

The file explorer opens on the left side of the workspace.

### Features

- **Tree view**: Click folders to expand, files to open, with virtualized rendering for large projects
- **Git badges**: Color-coded status per file:
  - **Green** (M): Modified
  - **Yellow** (A): Added
  - **Red** (D): Deleted
  - **Gray** (?): Untracked
- **File icons**: Language-aware icons for recognized file types
- **Context menu**: Right-click a file for Copy, Cut, Paste, Rename, Delete, Duplicate, Reveal in File Manager, and Git Stage / Unstage
- **Drag and drop**: Move files by dragging
- **Import**: Import files into the workspace

### Quick Open

Press \`Ctrl+P\` to search and open any file in the workspace instantly.

## Code Editor

Files open as tabs in the editor view.

- **Syntax highlighting** for JavaScript, TypeScript, Python, Rust, Java, C++, HTML, CSS, JSON, Markdown, and more
- **Minimap** for quick navigation
- **Find and Replace** (\`Ctrl+F\`)
- **Word wrap** toggle and **bracket colorization**
- **Line numbers** with on / off / relative modes
- **Auto-save** with a configurable delay
- **Dirty indicator**: A dot on unsaved tabs
- **Tab context menu**: Close, Close Others, Close to the Right, Close Saved

## File Previews

YzPzCode previews common formats directly:

| Format | Preview |
|--------|---------|
| Markdown (\`.md\`) | Rendered markdown |
| PDF (\`.pdf\`) | Embedded viewer |
| Images (\`.png\`, \`.jpg\`, \`.gif\`, \`.svg\`) | Image viewer |
| Spreadsheets (\`.xlsx\`, \`.csv\`) | Table viewer |
| Word documents (\`.docx\`) | Document viewer |

## Image Editor

Open any image from the file editor with the **Image Editor** toolbar button, or start fresh with **New Document** / **Open Image** inside the editor. It is a layer-based editor built for quick visual work.

### Tools

| Category | Tools |
|----------|-------|
| Selection | Rectangular and elliptical marquee, lasso, crop |
| Paint | Brush, eraser, paint bucket, eyedropper |
| Shapes | Rectangle, ellipse, line, text |
| Navigation | Move, hand, zoom |

Each tool has a keyboard shortcut (shown in tooltips), and paint tools expose **Size**, **Opacity**, and **Hardness** sliders. Foreground and background color swatches include a swap button and an HSV color picker.

### Layers

The layers panel supports thumbnails, rename, visibility toggles, opacity, blend modes, drag-to-reorder, and add / duplicate / merge down / flatten / delete actions.

### Saving

- **Save** (\`Ctrl+S\`) and **Save As** (\`Ctrl+Shift+S\`) with an unsaved-changes badge
- Undo / redo, fit and 100% zoom controls, and a status bar showing document dimensions, layer count, active tool, and zoom

> **Tip:** The image editor is handy for screenshots you want to annotate before attaching them to an agent prompt.
`;
