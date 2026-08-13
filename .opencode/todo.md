# Mission: Microsoft Office Viewer & Editor for YzPzCode

## M1: Dependencies & Rust backend plumbing
### T1.1: Install npm deps | agent:Worker
- [x] S1.1.1: Install pptx-viewer, docx-preview, @glideapps/glide-data-grid (from app/)
### T1.2: Rust: pptx/ppt extension plumbing | agent:Worker
- [x] S1.2.1: Add pptx/ppt to detect_language in reader.rs
- [x] S1.2.2: Add pptx/ppt to detect_mime_type in reader.rs
- [x] S1.2.3: Add pptx/ppt to is_binary_file binary list in reader.rs
### T1.3: Rust: write_file_bytes command | agent:Worker
- [x] S1.3.1: Add write_file_bytes (base64) fn to reader.rs
- [x] S1.3.2: Register write_file_bytes in filesystem_commands.rs
- [x] S1.3.3: Register command in lib.rs generate_handler
- [x] S1.3.4: Raise MAX_FILE_SIZE from 10MB to 100MB

## M2: PowerPoint viewer
### T2.1: PptxPreview component | agent:Worker | depends:M1
- [x] S2.1.1: Create PptxPreview.tsx using pptx-viewer (load from base64, slide nav, zoom)
- [x] S2.1.2: Wire into FileEditor.tsx (isPptx + render + isPreviewable)
- [x] S2.1.3: Add pptx/ppt to BINARY_EXTENSIONS in useFileEditor.ts
- [x] S2.1.4: Add pptx color/icon to FileIcon.tsx

## M3: Word viewer upgrade (docx-preview)
### T3.1: Upgrade DocxPreview | agent:Worker | depends:M1
- [x] S3.1.1: Swap mammoth → docx-preview in DocxPreview.tsx (renderAsync)
- [x] S3.1.2: Keep same props/UI shell, dark theme styling

## M4: Excel editor (glide-data-grid + SheetJS)
### T4.1: SpreadsheetEditor component | agent:Worker | depends:M1
- [x] S4.1.1: Create SpreadsheetEditor.tsx (glide-data-grid + SheetJS read/write)
- [x] S4.1.2: Multi-sheet tabs, cell editing, dirty tracking, Save via write_file_bytes
- [x] S4.1.3: Wire into FileEditor.tsx (replace SpreadsheetPreview usage)

## M5: External editing + auto-refresh
### T5.1: Open in desktop Office | agent:Worker | depends:M2,M3
- [x] S5.1.1: Add "Open in Word" button to DocxPreview via openPath (plugin-opener)
- [x] S5.1.2: Add "Open in PowerPoint" button to PptxPreview via openPath
- [x] S5.1.3: Add "Open in Excel" button to SpreadsheetEditor via openPath
### T5.2: Auto-refresh previews | agent:Worker | depends:M2,M3
- [x] S5.2.1: Subscribe to file-system-changed; refresh active preview file
- [x] S5.2.2: Manual refresh button fallback on previews

## M6: Verification & review
### T6.1: Full verification | agent:Reviewer | depends:all
- [x] S6.1.1: npx tsc --noEmit passes (from app/)
- [x] S6.1.2: cargo check passes (from app/src-tauri/)
- [x] S6.1.3: Review all changed files for correctness & code style
- [x] S6.1.4: Update .opencode/context.md and work-log.md
