export const designStudioContent = `# Design Studio

The Design studio turns a description into app screens, web pages or graphics on one canvas. You describe it, the AI designs a system (colours, fonts, shapes) and draws every board, and you refine the result by asking for changes or editing it directly.

## Starting a Design

Choose **Design** on the setup page, then describe what you want in the box.

- **App**: mobile app screens drawn as a coherent flow. Pick a phone or tablet size
- **Web**: website pages drawn at a desktop, laptop or mobile width
- **Graphic**: banners, posts, posters and thumbnails at any size. Pick one or several sizes, or add a custom width and height; each size becomes a board
- **Style**: let the AI decide, or choose one of the looks in the list
- **Files**: attach pictures, PDFs, Word, Excel or text files. Pictures can be placed in the design or set the look. You can also drop or paste files into the box

Press the arrow or Ctrl+Enter. The canvas opens at once and the boards fill in as they are drawn. Stop cancels the run.

## The Canvas

- **Pan**: scroll, or hold Space and drag, or use the hand tool (H)
- **Zoom**: Ctrl+scroll, the zoom menu, 0 to fit everything, 1 for 100%
- **Select**: click a board; Shift or Ctrl+click adds to the selection. Drag to move boards
- **Design system board**: the first board shows the palette and type the AI chose

## Asking for Changes

The bar under the canvas changes whatever is selected: the whole design, the selected boards, or one picked element.

- **Pick an element** (P): hover a screen and click the part you mean, then say what should change
- **Quick actions**: more whitespace, bolder, dark mode, translate to Arabic, add a web photo, make 3 versions, add a blank board
- **Ask for boards, not edits**: the composer understands "make 3 versions", "create another image at 1200x628", "another story about the new menu" or "add an empty canvas 800x600" and creates the boards instead of editing one
- **New**: adds a board at any size: a preset like an Instagram post or a story, or a custom width and height. Choose **Blank board** for an empty canvas (draw it later with **Draw again** or a description), or **Draw from the description** to have the AI draw it in the same system
- **Versions**: makes three alternatives of the board in scope; keep the ones you like
- **Review**: every change waits for **Keep** or **Discard**. Hold **Hold for before** to compare. Keep is one undo step

## Editing Directly

- **Text**: double-click a line of text on an app or web screen and type (Enter confirms, Esc cancels). On a graphic, select the board, then click a text to edit it
- **Pictures**: double-click a picture on a screen, or click one on a selected graphic, to replace it from a file
- **Design tab**: change colours, fonts and corner radius. App and web screens follow at once; drawn graphics are recoloured
- **Board tab**: rename, hide, duplicate or delete a board, draw it again, make variations, or edit its code and apply it. A graphic can also be made at another size
- **Undo**: Ctrl+Z and Ctrl+Y

## Exporting

Export (Ctrl+Shift+E) writes into the design's \`exports\` folder.

- **PNG and JPG**: one image per board at 1x, 2x or 3x
- **PDF**: one page per board at its own size
- **HTML and code**: a page per screen with \`tokens.css\`, the pictures and \`DESIGN.md\`
- **SVG**: graphic boards as vector files
- **Send to a coding agent**: exports the code and tells an open agent terminal to build it

## Where Designs Are Kept

Designs are saved in \`Documents/YzPzCode/Designs\`, one folder each, with their pictures, history and exports. The folder stays in place if you reinstall the app.

## Photos

When web photos are on (Settings > Presentation > Images), the AI asks for real photographs and the studio downloads openly licensed ones into the design. Credits are kept with the design. A photo that cannot be found leaves a plain placeholder.

## Right-to-Left Languages

Arabic, Hebrew, Persian and Urdu designs are laid out right to left. Set the language in Settings > Design, or write the description in that language.

## Settings

Settings > Design chooses the AI engine and model, the language new designs are written in, the AI timeout and how many history snapshots are kept.
`;
