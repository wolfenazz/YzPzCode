// ─── Image Editor — main pane (top bar + tool rail + canvas + panels) ────

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/appStore';
import { useImageEditorStore, getDocument } from '../../stores/imageEditorStore';
import { createNewDocument, createDocumentFromImage, loadImageElement, flattenToDataUrl } from './editor/model';
import { rectSelection } from './editor/selection';
import { ImageStage } from './canvas/ImageStage';
import { Toolbar } from './toolbar/Toolbar';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ImgIcon } from './icons';
import './ImageEditor.css';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const extOf = (p: string): string => {
  const i = p.lastIndexOf('.');
  return i >= 0 ? p.slice(i + 1).toLowerCase() : '';
};
const fileNameOf = (p: string): string => p.split(/[/\\]/).pop() ?? 'untitled';

interface ImageEditorPaneProps {
  workspaceId: string | null;
}

const TOOL_LABELS: Record<string, string> = {
  move: 'Move', marquee: 'Marquee', 'ellipse-marquee': 'Ellipse Marquee', lasso: 'Lasso',
  crop: 'Crop', eyedropper: 'Eyedropper', brush: 'Brush', eraser: 'Eraser', fill: 'Fill',
  text: 'Text', 'shape-rect': 'Rectangle', 'shape-ellipse': 'Ellipse', 'shape-line': 'Line',
  hand: 'Hand', zoom: 'Zoom',
};

export const ImageEditorPane: React.FC<ImageEditorPaneProps> = ({ workspaceId }) => {
  const stageSizeRef = useRef({ w: 0, h: 0 });
  const loadedPathRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const doc = useImageEditorStore((s) => (workspaceId ? s.docs[workspaceId] : undefined));
  const isDirty = useImageEditorStore((s) => (workspaceId ? s.isDirty[workspaceId] : false));
  const tool = useImageEditorStore((s) => s.tool);
  const canUndo = useImageEditorStore((s) => s.canUndo);
  const canRedo = useImageEditorStore((s) => s.canRedo);
  const zoom = useImageEditorStore((s) => (workspaceId ? s.zoom[workspaceId] ?? 1 : 1));
  const brushSize = useImageEditorStore((s) => s.brushSize);
  const brushOpacity = useImageEditorStore((s) => s.brushOpacity);
  const brushHardness = useImageEditorStore((s) => s.brushHardness);

  const filePath = useAppStore((s) => (workspaceId ? s.imageEditorByWorkspace[workspaceId]?.path ?? null : null));

  const onStageSize = useCallback((size: { w: number; h: number }) => {
    stageSizeRef.current = size;
  }, []);

  const openPath = useCallback(async (path: string, wsId: string) => {
    setError(null);
    try {
      const dataUrl = await invoke<string>('read_file_as_base64', { path });
      const img = await loadImageElement(dataUrl);
      useImageEditorStore.getState().loadDocument(wsId, createDocumentFromImage(img, fileNameOf(path)));
      loadedPathRef.current = path;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Load the open image (if any) for the active workspace when it becomes active,
  // and (re)load when the user picks a different image via "Open in Image Editor".
  useEffect(() => {
    if (!workspaceId) return;
    const st = useImageEditorStore.getState();
    const path = useAppStore.getState().imageEditorByWorkspace[workspaceId]?.path ?? null;
    if (!path) return;
    if (st.docs[workspaceId] && loadedPathRef.current === path) return;
    void openPath(path, workspaceId);
  }, [workspaceId, openPath, filePath]);

  const handleOpen = useCallback(async () => {
    if (!workspaceId) return;
    const path = await open({
      multiple: false,
      title: 'Open Image',
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }],
    });
    if (typeof path === 'string') {
      useAppStore.getState().setImageEditorPathForWorkspace(workspaceId, path);
      await openPath(path, workspaceId);
    }
  }, [workspaceId, openPath]);

  const handleNew = useCallback(() => {
    if (!workspaceId) return;
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Start a new document anyway?');
      if (!confirmed) return;
    }
    loadedPathRef.current = null;
    useImageEditorStore.getState().loadDocument(workspaceId, createNewDocument(1024, 1024, 'white'));
    useAppStore.getState().setImageEditorPathForWorkspace(workspaceId, null);
  }, [workspaceId, isDirty]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }, []);

  const handleSave = useCallback(async (asNew: boolean) => {
    if (!workspaceId) return;
    const d = getDocument(workspaceId);
    if (!d) return;
    let target = useAppStore.getState().imageEditorByWorkspace[workspaceId]?.path ?? null;
    const allowed = ['png', 'jpg', 'jpeg', 'webp'];
    if (asNew || !target || !allowed.includes(extOf(target))) {
      const base = target ? fileNameOf(target).replace(/\.[^.]+$/, '') : 'untitled';
      const p = await save({
        title: 'Save Image',
        defaultPath: `${base}.png`,
        filters: [
          { name: 'PNG', extensions: ['png'] },
          { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
          { name: 'WebP', extensions: ['webp'] },
        ],
      });
      if (!p) return;
      target = p;
    }
    const ext = extOf(target);
    const mime: 'image/png' | 'image/jpeg' | 'image/webp' =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    try {
      const dataUrl = flattenToDataUrl(d, mime);
      const base64 = dataUrl.split(',')[1];
      await invoke('write_file_bytes', { path: target, base64Data: base64 });
      useImageEditorStore.getState().markDirty(workspaceId, false);
      useAppStore.getState().setImageEditorPathForWorkspace(workspaceId, target);
      showToast('Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [workspaceId, showToast]);

  const fit = useCallback(() => {
    if (!workspaceId) return;
    const d = getDocument(workspaceId);
    if (!d) return;
    const { w, h } = stageSizeRef.current;
    if (w <= 0 || h <= 0) return;
    const z = clamp(Math.min(w / d.width, h / d.height, 1) * 0.94, 0.02, 32);
    useImageEditorStore.getState().setZoom(workspaceId, z);
    useImageEditorStore.getState().setPan(workspaceId, { x: (w - d.width * z) / 2, y: (h - d.height * z) / 2 });
  }, [workspaceId]);

  const zoomTo = useCallback(
    (z: number) => {
      if (!workspaceId) return;
      const d = getDocument(workspaceId);
      if (!d) return;
      const { w, h } = stageSizeRef.current;
      useImageEditorStore.getState().setZoom(workspaceId, z);
      useImageEditorStore.getState().setPan(workspaceId, { x: (w - d.width * z) / 2, y: (h - d.height * z) / 2 });
    },
    [workspaceId],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      if (!workspaceId) return;
      const st = useImageEditorStore.getState();
      const z = st.zoom[workspaceId] ?? 1;
      const nz = clamp(z * factor, 0.02, 32);
      const pan = st.pan[workspaceId] ?? { x: 0, y: 0 };
      const { w, h } = stageSizeRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const dx = (cx - pan.x) / z;
      const dy = (cy - pan.y) / z;
      st.setZoom(workspaceId, nz);
      st.setPan(workspaceId, { x: cx - dx * nz, y: cy - dy * nz });
    },
    [workspaceId],
  );

  const handleClose = useCallback(() => {
    if (!workspaceId) return;
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Close the image editor?');
      if (!confirmed) return;
    }
    loadedPathRef.current = null;
    useAppStore.getState().clearImageEditorForWorkspace(workspaceId);
    useImageEditorStore.getState().closeDocument(workspaceId);
    useAppStore.getState().setActiveView('editor');
  }, [workspaceId, isDirty]);

  // Global keyboard shortcuts (active only while the Image view is shown).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const view = useAppStore.getState().activeView;
      if (view !== 'image' || !workspaceId) return;
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      const st = useImageEditorStore.getState();

      const mod = e.ctrlKey || e.metaKey;
      if (mod && !typing) {
        const k = e.key.toLowerCase();
        if (k === 's') {
          e.preventDefault();
          void handleSave(e.shiftKey);
          return;
        }
        if (k === 'z') {
          e.preventDefault();
          if (e.shiftKey) st.redo(workspaceId);
          else st.undo(workspaceId);
          return;
        }
        if (k === 'y') {
          e.preventDefault();
          st.redo(workspaceId);
          return;
        }
        if (k === 'd') {
          e.preventDefault();
          st.setSelection(null);
          return;
        }
        if (k === 'a') {
          e.preventDefault();
          const d = getDocument(workspaceId);
          if (d) st.setSelection(rectSelection(0, 0, d.width, d.height, d.width, d.height));
          return;
        }
        if (k === 'e') {
          e.preventDefault();
          const d = getDocument(workspaceId);
          const id = d ? d.layers.length : 0;
          if (d && id > 1) {
            const activeId = st.activeLayerId[workspaceId] ?? null;
            if (activeId) st.mergeDown(workspaceId, activeId);
          }
          return;
        }
      }

      if (!typing) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (st.selection && st.selection.bounds) {
            e.preventDefault();
            st.deleteSelection(workspaceId);
          }
          return;
        }
        const shortcuts: Record<string, string> = {
          v: 'move', m: 'marquee', l: 'lasso', b: 'brush', e: 'eraser', g: 'fill',
          i: 'eyedropper', c: 'crop', t: 'text', h: 'hand', z: 'zoom', u: 'shape-rect',
        };
        const t = shortcuts[e.key.toLowerCase()];
        if (t && !mod) st.setTool(t as typeof st.tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspaceId, handleSave]);

  const barBtn =
    'premium-btn flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed';

  const iconBtn =
    'premium-btn-icon flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed';

  const fileName = filePath ? fileNameOf(filePath) : 'Untitled';

  return (
    <div className="image-editor flex h-full flex-col bg-[var(--bg-primary)] font-mono">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <button
          onClick={handleClose}
          title="Back to code editor"
          className="premium-btn-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <ImgIcon name="back" className="h-3.5 w-3.5" />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{fileName}</span>
          {isDirty && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
              </span>
              unsaved
            </span>
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-[var(--border-primary)]" />

        <button className={barBtn} onClick={handleNew} title="New document">
          <ImgIcon name="newFile" className="h-3 w-3" />
          New
        </button>
        <button className={barBtn} onClick={() => void handleOpen()} title="Open image">
          <ImgIcon name="openFile" className="h-3 w-3" />
          Open
        </button>
        <button className={barBtn} onClick={() => void handleSave(false)} title="Save (Ctrl+S)">
          <ImgIcon name="save" className="h-3 w-3" />
          Save
        </button>
        <button className={barBtn} onClick={() => void handleSave(true)} title="Save As (Ctrl+Shift+S)">
          <ImgIcon name="saveAs" className="h-3 w-3" />
          Save As
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--border-primary)]" />

        <button className={iconBtn} onClick={() => workspaceId && useImageEditorStore.getState().undo(workspaceId)} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <ImgIcon name="undo" className="h-3.5 w-3.5" />
        </button>
        <button className={iconBtn} onClick={() => workspaceId && useImageEditorStore.getState().redo(workspaceId)} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <ImgIcon name="redo" className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5">
          <button className={iconBtn} onClick={fit} title="Fit to view">
            <ImgIcon name="fit" className="h-3.5 w-3.5" />
          </button>
          <button className={barBtn} onClick={() => zoomTo(1)} title="100%">100%</button>
          <button className={iconBtn} onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
            <ImgIcon name="zoomOut" className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[44px] text-center font-mono text-[9px] text-[var(--text-secondary)]">{Math.round(zoom * 100)}%</span>
          <button className={iconBtn} onClick={() => zoomBy(1.25)} title="Zoom in">
            <ImgIcon name="zoomIn" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Brush settings (only for paint tools) */}
      {(tool === 'brush' || tool === 'eraser') && (
        <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1.5">
          <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">
            Size
            <input type="range" min={1} max={200} value={brushSize} onChange={(e) => useImageEditorStore.getState().setBrushSize(Number(e.target.value))} className="w-32 cursor-pointer" />
            <span className="w-7 text-[var(--text-primary)]">{brushSize}</span>
          </label>
          <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">
            Opacity
            <input type="range" min={1} max={100} value={Math.round(brushOpacity * 100)} onChange={(e) => useImageEditorStore.getState().setBrushOpacity(Number(e.target.value) / 100)} className="w-24 cursor-pointer" />
            <span className="w-7 text-[var(--text-primary)]">{Math.round(brushOpacity * 100)}%</span>
          </label>
          <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">
            Hard
            <input type="range" min={0} max={100} value={Math.round(brushHardness * 100)} onChange={(e) => useImageEditorStore.getState().setBrushHardness(Number(e.target.value) / 100)} className="w-24 cursor-pointer" />
            <span className="w-7 text-[var(--text-primary)]">{Math.round(brushHardness * 100)}%</span>
          </label>
        </div>
      )}

      {/* Main area */}
      <div className="flex min-h-0 flex-1">
        <Toolbar />

        <div className="relative min-w-0 flex-1">
          {doc ? (
            <ImageStage workspaceId={workspaceId ?? ''} onStageSize={onStageSize} />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#1f1f1f]">
              <div className="premium-surface flex flex-col items-center gap-5 rounded-2xl px-10 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-light)] shadow-[0_0_24px_-8px_var(--accent-glow)]">
                  <ImgIcon name="palette" className="h-7 w-7 text-[var(--accent)]" />
                </div>
                <div className="text-center">
                  <div className="premium-hero-gradient text-xs font-semibold uppercase tracking-[0.22em]">Image Editor</div>
                  <div className="mt-1.5 max-w-[260px] font-mono text-[10px] leading-5 text-[var(--text-secondary)]/70">
                    Open an image from the explorer, or start from scratch.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="premium-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] cursor-pointer" onClick={handleNew}>
                    <ImgIcon name="newFile" className="h-3.5 w-3.5" />
                    New Document
                  </button>
                  <button className="premium-btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] cursor-pointer" onClick={() => void handleOpen()}>
                    <ImgIcon name="openFile" className="h-3.5 w-3.5" />
                    Open Image
                  </button>
                </div>
                {error && <div className="font-mono text-[10px] text-rose-400">{error}</div>}
              </div>
            </div>
          )}
          {toast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--accent-border)] bg-[#303030] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--accent)] shadow-lg">
              {toast}
            </div>
          )}
          {error && doc && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-rose-500/40 bg-[#3a1f1f] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-rose-300 shadow-lg">
              {error}
            </div>
          )}
        </div>

        <div className="flex w-[240px] shrink-0 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <LayersPanel workspaceId={workspaceId ?? ''} />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden border-t border-[var(--border-primary)]">
            <PropertiesPanel workspaceId={workspaceId ?? ''} />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        <div className="flex items-center gap-3">
          <span>{doc ? `${doc.width} × ${doc.height}` : '—'}</span>
          <span>{doc ? `${doc.layers.length} layer${doc.layers.length === 1 ? '' : 's'}` : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[var(--accent-text)]">{TOOL_LABELS[tool] ?? tool}</span>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
      </div>
    </div>
  );
};
