// ─── Image Editor — vertical tool rail ────────────────────────────────────

import React, { useState, useRef } from 'react';
import type { EditorTool } from '../types';
import { useImageEditorStore } from '../../../stores/imageEditorStore';
import { ColorPicker } from './ColorPicker';
import { ImgIcon, type ImageIconName } from '../icons';

interface ToolDef {
  id: EditorTool;
  label: string;
  icon: ImageIconName;
}

const TOOLS: ToolDef[] = [
  { id: 'move', label: 'Move (V)', icon: 'move' },
  { id: 'marquee', label: 'Rectangular Marquee (M)', icon: 'marquee' },
  { id: 'ellipse-marquee', label: 'Elliptical Marquee', icon: 'ellipseMarquee' },
  { id: 'lasso', label: 'Lasso (L)', icon: 'lasso' },
  { id: 'crop', label: 'Crop (C)', icon: 'crop' },
  { id: 'eyedropper', label: 'Eyedropper (I)', icon: 'eyedropper' },
  { id: 'brush', label: 'Brush (B)', icon: 'brush' },
  { id: 'eraser', label: 'Eraser (E)', icon: 'eraser' },
  { id: 'fill', label: 'Paint Bucket (G)', icon: 'fill' },
  { id: 'text', label: 'Text (T)', icon: 'text' },
  { id: 'shape-rect', label: 'Rectangle (U)', icon: 'shapeRect' },
  { id: 'shape-ellipse', label: 'Ellipse', icon: 'shapeEllipse' },
  { id: 'shape-line', label: 'Line', icon: 'shapeLine' },
  { id: 'hand', label: 'Hand (H)', icon: 'hand' },
  { id: 'zoom', label: 'Zoom (Z)', icon: 'zoom' },
];

export const Toolbar: React.FC = () => {
  const tool = useImageEditorStore((s) => s.tool);
  const fgColor = useImageEditorStore((s) => s.fgColor);
  const bgColor = useImageEditorStore((s) => s.bgColor);
  const setTool = useImageEditorStore((s) => s.setTool);
  const setFgColor = useImageEditorStore((s) => s.setFgColor);
  const setBgColor = useImageEditorStore((s) => s.setBgColor);
  const swapColors = useImageEditorStore((s) => s.swapColors);

  const [picker, setPicker] = useState<{ target: 'fg' | 'bg'; x: number; y: number } | null>(null);
  const fgRef = useRef<HTMLButtonElement>(null);
  const bgRef = useRef<HTMLButtonElement>(null);

  const openPicker = (target: 'fg' | 'bg') => {
    const el = target === 'fg' ? fgRef.current : bgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPicker({ target, x: r.left, y: r.bottom + 6 });
  };

  return (
    <div className="image-toolbar flex h-full w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[var(--border-primary)] bg-[var(--bg-secondary)]/60 py-2.5 backdrop-blur-sm">
      <div className="flex w-9 items-center justify-center pb-1 text-[var(--text-secondary)]/50" title="Tools">
        <ImgIcon name="sliders" className="h-3.5 w-3.5" />
      </div>

      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          title={t.label}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 cursor-pointer ${
            tool === t.id
              ? 'bg-[var(--accent-light)] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_14px_-4px_var(--accent-glow)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {tool === t.id && (
            <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
          )}
          <ImgIcon name={t.icon} className="h-[18px] w-[18px]" />
        </button>
      ))}

      <div className="my-1 h-px w-7 bg-[var(--border-primary)]" />

      <div className="flex flex-col items-center gap-1.5 pt-0.5">
        <button
          ref={fgRef}
          onClick={() => openPicker('fg')}
          title="Foreground color"
          className="relative h-7 w-7 overflow-hidden rounded-lg border border-[var(--border-primary)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] cursor-pointer transition-transform hover:scale-105"
          style={{ background: fgColor }}
        />
        <button
          ref={bgRef}
          onClick={() => openPicker('bg')}
          title="Background color"
          className="relative h-7 w-7 overflow-hidden rounded-lg border border-[var(--border-primary)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] cursor-pointer transition-transform hover:scale-105"
          style={{ background: bgColor }}
        >
          <span className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/40" />
        </button>
        <button
          onClick={swapColors}
          title="Swap colors (X)"
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <ImgIcon name="swap" className="h-3.5 w-3.5" />
        </button>
      </div>

      {picker && (
        <ColorPicker
          value={picker.target === 'fg' ? fgColor : bgColor}
          onChange={(hex) => (picker.target === 'fg' ? setFgColor(hex) : setBgColor(hex))}
          onClose={() => setPicker(null)}
          anchor={{ x: picker.x, y: picker.y }}
        />
      )}
    </div>
  );
};
