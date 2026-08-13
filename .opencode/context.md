# Project Context — YzPzCode Office Viewer & Editor

## Mission
Add Microsoft Office viewer & editor: view Word/Excel/PowerPoint in-app (professional),
edit Excel in-app, open Word/PPT in desktop Office for editing, auto-refresh previews.

## Decisions (from user)
- View all 3 + edit Excel in-app + open Word/PPT in desktop Office
- Spreadsheet editor: `@glideapps/glide-data-grid` (MIT)
- Word viewer: upgrade `mammoth` → `docx-preview` (MIT)
- PPT viewer: `pptx-viewer` (MIT, TS, fflate dep) — NOT jQuery pptxjs
- Excel save: SheetJS community (values-only first; xlsx-js-style if styling matters)

## Tech Stack
- Tauri v2 + React 19 + TypeScript strict + Vite 6 + Tailwind v4 + Zustand
- Existing previews: PdfPreview (pdfjs), DocxPreview (mammoth), SpreadsheetPreview (xlsx, read-only), DrawioPreview (iframe), ImagePreview, MarkdownPreview
- File I/O: `read_file_content` (text), `read_file_as_base64` (data URL), `write_file_content` (text only)

## Key Integration Points
1. `app/src/components/editor/FileEditor.tsx` — routes by ext: isDocx/isSpreadsheet/isPdf + isPreviewable (lines 139-148)
2. `app/src/hooks/useFileEditor.ts` — BINARY_EXTENSIONS set (line 6-9); binary files open with empty content → previews read bytes directly
3. `app/src-tauri/src/filesystem/reader.rs` — MAX_FILE_SIZE=10MB (line 9), detect_language, detect_mime_type, is_binary_file need pptx/ppt
4. `app/src-tauri/src/commands/filesystem_commands.rs` — needs `write_file_bytes` (base64) for binary saves
5. `app/src-tauri/src/lib.rs` — command registration (line 194-215)
6. `app/src-tauri/capabilities/default.json` — has `opener:default` → openPath available
7. `@tauri-apps/plugin-opener` — registered lib.rs:62, in package.json, NOT yet imported in frontend
8. `file-system-changed` event (watcher.rs:109) — auto-refresh mechanism
9. `app/src/components/explorer/FileIcon.tsx` — EXTENSION_COLORS (add pptx)
10. `app/src-tauri/src/types.rs` — FileContent type

## Dependencies to Add (app/)
- `pptx-viewer` (MIT) — PPTX viewing
- `docx-preview` (MIT) — Word viewing (replace mammoth usage)
- `@glideapps/glide-data-grid` (MIT) — editable spreadsheet grid

## Verification
- `npx tsc --noEmit` (from app/)
- `cargo check` / `cargo clippy` (from app/src-tauri/)
- Manual: open pptx/docx/xlsx; edit+save xlsx round-trip; "Open in Word" launches desktop app; external save refreshes preview
