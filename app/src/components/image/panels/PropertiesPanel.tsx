// ─── Image Editor — properties panel (document / selection / layer / fx) ─

import React, { useState } from 'react';
import type { LayerMeta } from '../types';
import { rectSelection, invertSelection } from '../editor/selection';
import { useImageEditorStore } from '../../../stores/imageEditorStore';
import { ImgIcon } from '../icons';

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 pb-1 pt-3 text-[8px] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)]/60">{children}</div>
);

const Field: React.FC<{ label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }> = ({ label, value, onChange, min, max }) => (
  <label className="flex items-center gap-1">
    <span className="w-4 font-mono text-[9px] text-[var(--text-secondary)]">{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-6 min-w-0 flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 font-mono text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
    />
  </label>
);

export const PropertiesPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const doc = useImageEditorStore((s) => s.docs[workspaceId]);
  const activeLayerId = useImageEditorStore((s) => s.activeLayerId[workspaceId]);
  const selection = useImageEditorStore((s) => s.selection);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const updateDocument = useImageEditorStore((s) => s.updateDocument);
  const setSelection = useImageEditorStore((s) => s.setSelection);
  const deleteSelection = useImageEditorStore((s) => s.deleteSelection);
  const flipLayer = useImageEditorStore((s) => s.flipLayer);
  const rotateLayer = useImageEditorStore((s) => s.rotateLayer);
  const applyFilter = useImageEditorStore((s) => s.applyFilter);

  const [docW, setDocW] = useState<number | null>(null);
  const [docH, setDocH] = useState<number | null>(null);

  if (!doc) return null;
  const active: LayerMeta | null = doc.layers.find((l) => l.id === activeLayerId) ?? null;

  const applyDocSize = () => {
    if (docW && docW > 0) updateDocument(workspaceId, { width: Math.round(docW) });
    if (docH && docH > 0) updateDocument(workspaceId, { height: Math.round(docH) });
    setDocW(null);
    setDocH(null);
  };

  const btn =
    'flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-30 disabled:hover:border-[var(--border-primary)] disabled:hover:text-[var(--text-secondary)] cursor-pointer disabled:cursor-not-allowed transition-colors';

  const filterBtn =
    'flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--accent)] cursor-pointer transition-colors';

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-[var(--border-primary)] bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          <ImgIcon name="sliders" className="h-3 w-3 text-[var(--accent-text)]" />
          Properties
        </span>
      </div>

      <SectionLabel>Selection</SectionLabel>
      <div className="flex flex-wrap gap-1 px-3">
        <button className={btn} onClick={() => setSelection(rectSelection(0, 0, doc.width, doc.height, doc.width, doc.height))}>All</button>
        <button className={btn} disabled={!selection} onClick={() => setSelection(null)}>None</button>
        <button className={btn} disabled={!selection || !selection.bounds} onClick={() => selection && setSelection(invertSelection(selection))}>Invert</button>
        <button className={btn} disabled={!selection || !selection.bounds || !active} onClick={() => deleteSelection(workspaceId)}>Delete</button>
      </div>

      <SectionLabel>Document</SectionLabel>
      <div className="flex flex-col gap-1.5 px-3">
        <div className="flex gap-1.5">
          <Field label="W" value={docW ?? doc.width} onChange={(n) => setDocW(n)} min={1} />
          <Field label="H" value={docH ?? doc.height} onChange={(n) => setDocH(n)} min={1} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] text-[var(--text-secondary)]">Bg</span>
          <select
            value={doc.background}
            onChange={(e) => updateDocument(workspaceId, { background: e.target.value as typeof doc.background })}
            className="h-6 min-w-0 flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 font-mono text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
          >
            <option value="transparent">Transparent</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </div>
        {(docW !== null || docH !== null) && (
          <button className={btn} onClick={applyDocSize}>Apply size</button>
        )}
      </div>

      <SectionLabel>Adjustments</SectionLabel>
      <div className="flex flex-wrap gap-1 px-3">
        <button className={filterBtn} onClick={() => applyFilter(workspaceId, 'grayscale')}>
          <ImgIcon name="grayscale" className="h-3 w-3" /> Gray
        </button>
        <button className={filterBtn} onClick={() => applyFilter(workspaceId, 'invert')}>
          <ImgIcon name="invertColors" className="h-3 w-3" /> Invert
        </button>
        <button className={filterBtn} onClick={() => applyFilter(workspaceId, 'sepia')}>
          <ImgIcon name="sepia" className="h-3 w-3" /> Sepia
        </button>
        <button className={filterBtn} onClick={() => applyFilter(workspaceId, 'brightness', 1.25)}>
          <ImgIcon name="brightness" className="h-3 w-3" /> Bright
        </button>
        <button className={filterBtn} onClick={() => applyFilter(workspaceId, 'contrast', 1.3)}>
          <ImgIcon name="contrast" className="h-3 w-3" /> Contrast
        </button>
        <button className={filterBtn} onClick={() => applyFilter(workspaceId, 'saturate', 1.5)}>
          <ImgIcon name="saturation" className="h-3 w-3" /> Saturate
        </button>
      </div>

      {active && (
        <>
          <SectionLabel>Layer</SectionLabel>
          <div className="flex flex-col gap-1.5 px-3 pb-3">
            <div className="truncate font-mono text-[10px] text-[var(--text-primary)]">{active.name}</div>
            <div className="flex gap-1.5">
              <Field label="X" value={Math.round(active.x)} onChange={(n) => updateLayer(workspaceId, active.id, { x: n })} />
              <Field label="Y" value={Math.round(active.y)} onChange={(n) => updateLayer(workspaceId, active.id, { y: n })} />
            </div>
            <div className="flex gap-1.5">
              <Field label="W" value={Math.round(active.width)} onChange={(n) => updateLayer(workspaceId, active.id, { width: Math.max(1, n) })} />
              <Field label="H" value={Math.round(active.height)} onChange={(n) => updateLayer(workspaceId, active.id, { height: Math.max(1, n) })} />
            </div>
            <Field label="R°" value={Math.round(active.rotation)} onChange={(n) => updateLayer(workspaceId, active.id, { rotation: n })} min={-360} max={360} />

            <div className="flex gap-1">
              <button className={btn} onClick={() => flipLayer(workspaceId, 'h')}>Flip H</button>
              <button className={btn} onClick={() => flipLayer(workspaceId, 'v')}>Flip V</button>
            </div>
            <div className="flex gap-1">
              <button className={btn} onClick={() => rotateLayer(workspaceId, -90)} title="Rotate 90° counter-clockwise">⟲ -90°</button>
              <button className={btn} onClick={() => rotateLayer(workspaceId, 90)} title="Rotate 90° clockwise">⟳ +90°</button>
            </div>

            {active.kind === 'text' && (
              <>
                <textarea
                  value={active.text ?? ''}
                  onChange={(e) => updateLayer(workspaceId, active.id, { text: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-1.5 font-mono text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
                  placeholder="Text"
                />
                <div className="flex gap-1.5">
                  <Field label="px" value={active.fontSize ?? 36} onChange={(n) => updateLayer(workspaceId, active.id, { fontSize: Math.max(4, n) })} min={4} />
                  <select
                    value={active.fontStyle ?? 'normal'}
                    onChange={(e) => updateLayer(workspaceId, active.id, { fontStyle: e.target.value as LayerMeta['fontStyle'] })}
                    className="h-6 min-w-0 flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 font-mono text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
                  >
                    <option value="normal">Regular</option>
                    <option value="bold">Bold</option>
                    <option value="italic">Italic</option>
                  </select>
                </div>
                <input
                  type="color"
                  value={active.fill ?? '#ffffff'}
                  onChange={(e) => updateLayer(workspaceId, active.id, { fill: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                />
              </>
            )}

            {(active.kind === 'shape') && (
              <input
                type="color"
                value={active.fill ?? '#ffffff'}
                onChange={(e) => updateLayer(workspaceId, active.id, { fill: e.target.value })}
                className="h-7 w-full cursor-pointer rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};
