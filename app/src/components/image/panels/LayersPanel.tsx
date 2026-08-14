// ─── Image Editor — layers panel ──────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import type { LayerMeta } from '../types';
import { BLEND_MODES } from '../types';
import { getLayerCanvas, drawLayerOnto, newRasterLayer } from '../editor/model';
import { useImageEditorStore } from '../../../stores/imageEditorStore';

const THUMB = 28;

const LayerThumb: React.FC<{ layer: LayerMeta }> = ({ layer }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, THUMB, THUMB);
    // checkerboard
    const size = 4;
    for (let y = 0; y < THUMB; y += size) {
      for (let x = 0; x < THUMB; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#3a3a3a' : '#2c2c2c';
        ctx.fillRect(x, y, size, size);
      }
    }
    if (!layer.visible) return;
    const w = layer.width;
    const h = layer.height;
    const scale = Math.min(THUMB / w, THUMB / h);
    const dw = w * scale;
    const dh = h * scale;
    const ox = (THUMB - dw) / 2;
    const oy = (THUMB - dh) / 2;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    if (layer.kind === 'raster' || layer.kind === 'image') {
      ctx.drawImage(getLayerCanvas(layer), ox, oy, dw, dh);
    } else {
      const detached: LayerMeta = { ...layer, x: 0, y: 0, rotation: 0, opacity: 1 };
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      drawLayerOnto(ctx, detached);
    }
    ctx.restore();
  }, [layer]);

  return <canvas ref={ref} width={THUMB} height={THUMB} className="shrink-0 rounded-sm border border-[var(--border-primary)]" />;
};

export const LayersPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const doc = useImageEditorStore((s) => s.docs[workspaceId]);
  const activeLayerId = useImageEditorStore((s) => s.activeLayerId[workspaceId]);
  const setActiveLayer = useImageEditorStore((s) => s.setActiveLayer);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const addLayer = useImageEditorStore((s) => s.addLayer);
  const removeLayer = useImageEditorStore((s) => s.removeLayer);
  const duplicateLayer = useImageEditorStore((s) => s.duplicateLayer);
  const mergeDown = useImageEditorStore((s) => s.mergeDown);
  const flatten = useImageEditorStore((s) => s.flatten);
  const reorderLayer = useImageEditorStore((s) => s.reorderLayer);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (!doc) return null;
  const active = doc.layers.find((l) => l.id === activeLayerId) ?? null;
  // top-most layer first (Photoshop convention)
  const rows = [...doc.layers].reverse();

  const rowIndexToStore = (rowIdx: number): number => doc.layers.length - 1 - rowIdx;

  const commitRename = (id: string) => {
    if (renameValue.trim()) updateLayer(workspaceId, id, { name: renameValue.trim() });
    setRenamingId(null);
  };

  const btn =
    'flex h-7 w-7 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed';

  return (
    <div className="flex h-full flex-col border-l border-[var(--border-primary)] bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Layers</span>
        <span className="text-[9px] font-mono text-[var(--text-secondary)]/60">{doc.layers.length}</span>
      </div>

      {active && (
        <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-2 py-1.5">
          <select
            value={active.blendMode}
            onChange={(e) => updateLayer(workspaceId, active.id, { blendMode: e.target.value as LayerMeta['blendMode'] })}
            className="h-6 min-w-0 flex-1 rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 text-[9px] font-mono uppercase text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
            title="Blend mode"
          >
            {BLEND_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(active.opacity * 100)}
            onChange={(e) => updateLayer(workspaceId, active.id, { opacity: Number(e.target.value) / 100 })}
            className="w-14 cursor-pointer"
            title="Opacity"
          />
          <span className="w-7 text-right text-[9px] font-mono text-[var(--text-secondary)]">{Math.round(active.opacity * 100)}%</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {rows.map((layer, rowIdx) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              draggable
              onDragStart={() => setDragIndex(rowIdx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== rowIdx) {
                  reorderLayer(workspaceId, rowIndexToStore(dragIndex), rowIndexToStore(rowIdx));
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              onClick={() => setActiveLayer(workspaceId, layer.id)}
              onDoubleClick={() => {
                setRenamingId(layer.id);
                setRenameValue(layer.name);
              }}
              className={`group flex items-center gap-2 px-2 py-1 cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent-light)] shadow-[inset_2px_0_0_var(--accent)]'
                  : 'hover:bg-[var(--bg-tertiary)]'
              } ${dragIndex === rowIdx ? 'opacity-40' : ''}`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayer(workspaceId, layer.id, { visible: !layer.visible });
                }}
                className={`${btn} h-6 w-6 ${layer.visible ? 'text-[var(--text-secondary)]' : 'text-[var(--text-secondary)]/30'}`}
                title="Toggle visibility"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  {layer.visible ? (
                    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z" />
                  ) : (
                    <path d="M3 3l18 18M10.5 5.7A9.5 9.5 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.3 3M6 6.3A17 17 0 002.5 12S6 18.5 12 18.5a9.5 9.5 0 004-.8" />
                  )}
                </svg>
              </button>

              <LayerThumb layer={layer} />

              {renamingId === layer.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(layer.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(layer.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 rounded border border-[var(--accent-border)] bg-[var(--bg-secondary)] px-1 text-[10px] font-mono text-[var(--text-primary)] outline-none"
                />
              ) : (
                <span className={`min-w-0 flex-1 truncate font-mono text-[10px] ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                  {layer.name}
                </span>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayer(workspaceId, layer.id, { locked: !layer.locked });
                }}
                className={`${btn} h-6 w-6 ${layer.locked ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] opacity-0 group-hover:opacity-100'}`}
                title="Lock layer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  {layer.locked ? (
                    <path d="M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1z" />
                  ) : (
                    <path d="M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1zM7 11V8a5 5 0 00-2 3" />
                  )}
                </svg>
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center text-[9px] font-mono uppercase tracking-widest text-[var(--text-secondary)]/50">
            No layers
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 border-t border-[var(--border-primary)] px-1.5 py-1.5">
        <button
          className={btn}
          title="New layer"
          onClick={() => {
            const d = useImageEditorStore.getState().docs[workspaceId];
            if (d) addLayer(workspaceId, newRasterLayer(d.width, d.height, `Layer ${d.layers.length + 1}`));
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className="h-3.5 w-3.5"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button className={btn} title="Duplicate layer" disabled={!active} onClick={() => active && duplicateLayer(workspaceId, active.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><rect x="9" y="9" width="11" height="11" /><path d="M5 15V5a1 1 0 011-1h10" /></svg>
        </button>
        <button className={btn} title="Delete layer" disabled={!active || doc.layers.length <= 1} onClick={() => active && removeLayer(workspaceId, active.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6" /></svg>
        </button>
        <div className="mx-0.5 h-4 w-px bg-[var(--border-primary)]" />
        <button
          className={btn}
          title="Merge down (Ctrl+E)"
          disabled={!active || doc.layers.findIndex((l) => l.id === active.id) <= 0}
          onClick={() => active && mergeDown(workspaceId, active.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M12 3v12M6 9l6 6 6-6M4 21h16" /></svg>
        </button>
        <button className={btn} title="Flatten image" onClick={() => flatten(workspaceId)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M3 7l4 4 4-4 3 3 3-3 4 4v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
        </button>
      </div>
    </div>
  );
};
