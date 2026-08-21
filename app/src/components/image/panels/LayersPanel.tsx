// ─── Image Editor — layers panel ──────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import type { LayerMeta } from '../types';
import { BLEND_MODES } from '../types';
import { getLayerCanvas, drawLayerOnto, newRasterLayer } from '../editor/model';
import { useImageEditorStore } from '../../../stores/imageEditorStore';
import { ImgIcon } from '../icons';

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

  return <canvas ref={ref} width={THUMB} height={THUMB} className="shrink-0 rounded-md border border-[var(--border-primary)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]" />;
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
    'flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors';

  return (
    <div className="flex h-full flex-col border-l border-[var(--border-primary)] bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          <ImgIcon name="layers" className="h-3 w-3 text-[var(--accent-text)]" />
          Layers
        </span>
        <span className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1.5 py-px font-mono text-[9px] text-[var(--text-secondary)]/70">
          {doc.layers.length}
        </span>
      </div>

      {active && (
        <div className="flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/40 px-2 py-1.5">
          <select
            value={active.blendMode}
            onChange={(e) => updateLayer(workspaceId, active.id, { blendMode: e.target.value as LayerMeta['blendMode'] })}
            className="h-6 min-w-0 flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 text-[9px] font-mono uppercase text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
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
          <span className="w-7 text-right font-mono text-[9px] text-[var(--text-secondary)]">{Math.round(active.opacity * 100)}%</span>
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
              className={`group flex items-center gap-2 rounded-md px-1.5 py-1 mx-1 cursor-pointer ${
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
                <ImgIcon name={layer.visible ? 'visibilityOn' : 'visibilityOff'} className="h-3.5 w-3.5" />
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
                  className="min-w-0 flex-1 rounded-md border border-[var(--accent-border)] bg-[var(--bg-secondary)] px-1 font-mono text-[10px] text-[var(--text-primary)] outline-none"
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
                <ImgIcon name={layer.locked ? 'lock' : 'unlock'} className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/50">
            No layers
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/40 px-1.5 py-1.5">
        <button
          className={btn}
          title="New layer"
          onClick={() => {
            const d = useImageEditorStore.getState().docs[workspaceId];
            if (d) addLayer(workspaceId, newRasterLayer(d.width, d.height, `Layer ${d.layers.length + 1}`));
          }}
        >
          <ImgIcon name="plus" className="h-3.5 w-3.5" />
        </button>
        <button className={btn} title="Duplicate layer" disabled={!active} onClick={() => active && duplicateLayer(workspaceId, active.id)}>
          <ImgIcon name="copy" className="h-3.5 w-3.5" />
        </button>
        <button className={btn} title="Delete layer" disabled={!active || doc.layers.length <= 1} onClick={() => active && removeLayer(workspaceId, active.id)}>
          <ImgIcon name="trash" className="h-3.5 w-3.5" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-[var(--border-primary)]" />
        <button
          className={btn}
          title="Merge down (Ctrl+E)"
          disabled={!active || doc.layers.findIndex((l) => l.id === active.id) <= 0}
          onClick={() => active && mergeDown(workspaceId, active.id)}
        >
          <ImgIcon name="mergeDown" className="h-3.5 w-3.5" />
        </button>
        <button className={btn} title="Flatten image" onClick={() => flatten(workspaceId)}>
          <ImgIcon name="flatten" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
