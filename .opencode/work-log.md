# Work Log — Office Viewer & Editor

## Status: COMPLETE ✅

## Completed Units (all verified)
| File | Status | Verification |
|------|--------|--------------|
| app/src-tauri/src/filesystem/reader.rs | done | cargo check/clippy pass (pptx/ppt ext, write_file_bytes, MAX_FILE_SIZE 100MB) |
| app/src-tauri/src/commands/filesystem_commands.rs | done | cargo check/clippy pass (write_file_bytes command) |
| app/src-tauri/src/lib.rs | done | cargo check/clippy pass (register write_file_bytes) |
| app/src-tauri/capabilities/default.json | done | cargo check pass (opener:allow-open-path) |
| app/src/components/editor/PptxPreview.tsx | done | tsc/build pass (pptx-viewer, slide nav + zoom + refresh) |
| app/src/components/editor/DocxPreview.tsx | done | tsc/build pass (docx-preview renderAsync + refresh + Open in Word) |
| app/src/components/editor/SpreadsheetEditor.tsx | done | tsc/build pass (glide-data-grid + SheetJS edit/save) |
| app/src/components/editor/OpenInOfficeButton.tsx | done | tsc/build pass (openPath) |
| app/src/hooks/usePreviewRefresh.ts | done | tsc/build pass (refreshKey + refresh) |
| app/src/components/editor/FileEditor.tsx | done | tsc/build pass (isPptx, SpreadsheetEditor, PptxPreview) |
| app/src/hooks/useFileEditor.ts | done | tsc/build pass (pptx/ppt BINARY_EXTENSIONS) |
| app/src/components/explorer/FileIcon.tsx | done | tsc/build pass (pptx/ppt colors) |
| app/src/components/editor/SpreadsheetPreview.tsx | DELETED | replaced by SpreadsheetEditor |
| app/vite.config.ts | done | build pass (docx/pptx/glide chunks) |
| app/package.json | done | removed mammoth; added pptx-viewer, docx-preview, glide-data-grid, lodash, react-responsive-carousel |

## Fixes Applied
1. `opener:default` does NOT include open-path permission → added `opener:allow-open-path` to capabilities (was root cause of "Open in Word/PowerPoint" buttons not working).
2. `mammoth` was removed but vite.config.ts manualChunks still referenced it → replaced with docx/pptx/glide chunks.
3. glide-data-grid peer deps (lodash, react-responsive-carousel) needed explicit install via --legacy-peer-deps.
4. Manual refresh suppression race in SpreadsheetEditor → manual reload now calls loadFile() directly and clears suppress flag.

## Verification Results
- npx tsc --noEmit ✅ (exit 0)
- cargo check ✅ (exit 0)
- cargo clippy ✅ (exit 0, only 7 pre-existing warnings in browser.rs/external_terminals.rs/managed.rs)
- npm run build ✅ (exit 0, separate pptx/docx/glide chunks)

## Dependencies Added
- pptx-viewer ^0.2.2 (MIT, PPTX viewing)
- docx-preview ^0.4.0 (MIT, Word viewing)
- @glideapps/glide-data-grid ^6.0.3 (MIT, spreadsheet grid)
- lodash, react-responsive-carousel (glide-data-grid peer deps)
- mammoth REMOVED (replaced by docx-preview)

## Notes
- npm install for glide-data-grid required --legacy-peer-deps (marked@^4 peer vs project's marked@17)
- Capability change requires rebuild (npm run tauri dev / tauri build) to take effect
