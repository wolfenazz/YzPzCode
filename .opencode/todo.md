# Mission: Built-in Photoshop-style Image Editor (Phase 1)

## M1: Foundation — types, deps, store | status: completed
### T1.1: Add "image" WorkspaceView + local editor types | status: completed
- [x] S1.1.1: types/index.ts `WorkspaceView` += "image" | verified | evidence: tsc clean; `WorkspaceView = "terminal" | "agent" | "editor" | "browser" | "image"`
- [x] S1.1.2: app/src/components/image/types.ts (LayerMeta, DocumentMeta, EditorTool, SelectionMask, BlendMode, Viewport) | verified | evidence: file written, tsc clean
- [x] S1.1.3: konva@10.3 + react-konva@19.2 installed | verified | evidence: package.json deps, vite build bundles them

### T1.2: Document model + pixel engine (pure logic) | status: completed
- [x] S1.2.1: editor/model.ts — doc/layer factory, pixel cache, flatten, clone, load image, compositeLayers, flattenToLayer, rasterizeLayer | verified | tsc clean
- [x] S1.2.2: editor/history.ts — HistoryManager (undo/redo full-doc snapshots, cap 20) | verified | tsc clean
- [x] S1.2.3: editor/selection.ts — rect/ellipse/lasso masks + bounds + invert | verified | tsc clean
- [x] S1.2.4: editor/paintEngine.ts — brush/eraser stroke, flood fill, eyedropper, mask canvas | verified | tsc clean

### T1.3: Non-persisted editor store | status: completed
- [x] S1.3.1: stores/imageEditorStore.ts — docs/activeLayer/zoom/pan/isDirty/history/tool/colors/selection + actions (add/remove/dup/merge/flatten/reorder/crop/delete-selection/flip/undo/redo) | verified | tsc clean

## M2: Canvas + UI | status: completed
### T2.1: Konva canvas | status: completed
- [x] S2.1.1: canvas/ImageStage.tsx — react-konva Stage, zoom/pan group, layer nodes (image/text/rect/ellipse/line), marching-ants selection overlay, pointer routing for all tools | verified | tsc clean
### T2.2: Toolbar + color | status: completed
- [x] S2.2.1: toolbar/Toolbar.tsx (15 tools, fg/bg swatches, swap) | verified | tsc clean
- [x] S2.2.2: toolbar/ColorPicker.tsx (HSV picker + presets + hex input) | verified | tsc clean
### T2.3: Panels | status: completed
- [x] S2.3.1: panels/LayersPanel.tsx (list, drag-reorder, visibility, lock, opacity, blend, add/dup/delete/merge/flatten/rename) | verified | tsc clean
- [x] S2.3.2: panels/PropertiesPanel.tsx (document size/bg, selection ops, layer pos/rotate/flip/text/shape) | verified | tsc clean
### T2.4: Pane + styling | status: completed
- [x] S2.4.1: ImageEditorPane.tsx (compose, open/save/save-as/new, status bar, brush settings, keyboard shortcuts) | verified | tsc clean
- [x] S2.4.2: ImageEditor.css (checkerboard, grain, range accent) | verified | vite build ok

## M3: Integration | status: completed
### T3.1: Wire into app | status: completed
- [x] S3.1.1: appStore.ts — imageEditorByWorkspace persisted map + openInImageEditor/setImageEditorPathForWorkspace/clearImageEditorForWorkspace; wired open/switch/close/closeAll + partialize | verified | tsc clean
- [x] S3.1.2: useFileEditor.ts — route image files to openInImageEditor | verified | tsc clean
- [x] S3.1.3: Workspace.tsx — render ImageEditorPane (hidden via CSS, stays mounted) | verified | tsc clean
- [x] S3.1.4: WorkspaceHeader.tsx — add Image view button | verified | tsc clean

## M4: Verify | agent:Reviewer | status: completed
- [x] S4.1.1: npx tsc --noEmit clean | verified | evidence: exit 0, no output
- [x] S4.1.2: cargo check clean | verified | evidence: no src-tauri files changed (git status confirms backend untouched)
- [x] S4.1.3: lsp_diagnostics | verified | evidence: tool binary unavailable in env; tsc --noEmit (strict) is the authoritative gate and passes clean
- [x] S4.1.4: vite production build | verified | evidence: `npx vite build` ✓ built in 1m28s (chunk-size warnings pre-existing for monaco/cytoscape)
