// ─── Image Editor — vertical tool rail ────────────────────────────────────

import React, { useState, useRef } from 'react';
import type { EditorTool } from '../types';
import { useImageEditorStore } from '../../../stores/imageEditorStore';
import { ColorPicker } from './ColorPicker';

interface ToolDef {
  id: EditorTool;
  label: string;
  icon: React.ReactNode;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TOOLS: ToolDef[] = [
  {
    id: 'move',
    label: 'Move (V)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M12 2v20M2 12h20" />
        <path d="M12 2l-2.5 2.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5M2 12l2.5-2.5M2 12l2.5 2.5M22 12l-2.5-2.5M22 12l-2.5 2.5" />
      </svg>
    ),
  },
  {
    id: 'marquee',
    label: 'Rectangular Marquee (M)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <rect x="3.5" y="3.5" width="17" height="17" strokeDasharray="4 3" />
      </svg>
    ),
  },
  {
    id: 'ellipse-marquee',
    label: 'Elliptical Marquee',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <ellipse cx="12" cy="12" rx="8.5" ry="6" strokeDasharray="4 3" />
      </svg>
    ),
  },
  {
    id: 'lasso',
    label: 'Lasso (L)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M4 11c0-4 2.5-7 6.5-7 2 0 3.5 1 4.5 2.5L12 9l-4 2-2.5 5c-.5 2 .5 3.5 2.5 3.5 2.5 0 5-1.5 6-4.5" />
      </svg>
    ),
  },
  {
    id: 'crop',
    label: 'Crop (C)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M6 2v14a2 2 0 002 2h14M6 6h14v14M2 6h4M18 18v4M6 2H2" />
      </svg>
    ),
  },
  {
    id: 'eyedropper',
    label: 'Eyedropper (I)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M15 3l6 6-5 5-7-7 5-5" />
        <path d="M13 10l-7 8a2 2 0 01-3-3l7-7" />
      </svg>
    ),
  },
  {
    id: 'brush',
    label: 'Brush (B)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M12 3c-4 0-6.5 2.8-6.5 6.5V12c0 .8.5 1.5 1.5 1.5h.5c1.1 0 2 .9 2 2v.5c0 .8.7 1.5 1.5 1.5h2c.8 0 1.5-.7 1.5-1.5V16c0-1.1.9-2 2-2h.5c1 0 1.5-.7 1.5-1.5V9.5C18.5 5.8 16 3 12 3z" />
      </svg>
    ),
  },
  {
    id: 'eraser',
    label: 'Eraser (E)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M8 20H21M5.5 15.5l8-9 5 5-8.5 8H4v-3l1.5-1z" />
      </svg>
    ),
  },
  {
    id: 'fill',
    label: 'Paint Bucket (G)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M12 3s-6.5 6-6.5 10.5a6.5 6.5 0 0013 0C18.5 9 12 3 12 3z" />
        <path d="M5 8l8-4" />
      </svg>
    ),
  },
  {
    id: 'text',
    label: 'Text (T)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M4 6h16M12 6v13M9 19h6" />
      </svg>
    ),
  },
  {
    id: 'shape-rect',
    label: 'Rectangle (U)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <rect x="4" y="5" width="16" height="14" />
      </svg>
    ),
  },
  {
    id: 'shape-ellipse',
    label: 'Ellipse',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <ellipse cx="12" cy="12" rx="8" ry="5.5" />
      </svg>
    ),
  },
  {
    id: 'shape-line',
    label: 'Line',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M4 20L20 4" />
      </svg>
    ),
  },
  {
    id: 'hand',
    label: 'Hand (H)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 12V3.5a1.5 1.5 0 013 0V12M14 12V5a1.5 1.5 0 013 0v9a6 6 0 01-6 6h-1.5a6.5 6.5 0 01-5-3L3 14a1.4 1.4 0 012.4-1.4L8 13" />
      </svg>
    ),
  },
  {
    id: 'zoom',
    label: 'Zoom (Z)',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
      </svg>
    ),
  },
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
    <div className="flex h-full w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[var(--border-primary)] bg-[var(--bg-primary)] py-2">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          title={t.label}
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-100 cursor-pointer ${
            tool === t.id
              ? 'bg-[var(--accent-light)] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_12px_-4px_var(--accent-glow)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span className="h-5 w-5">{t.icon}</span>
        </button>
      ))}

      <div className="my-1 h-px w-6 bg-[var(--border-primary)]" />

      <div className="flex flex-col items-center gap-1.5 pt-1">
        <button
          ref={fgRef}
          onClick={() => openPicker('fg')}
          title="Foreground color"
          className="relative h-7 w-7 overflow-hidden rounded-md border border-[var(--border-primary)] shadow-inner cursor-pointer"
          style={{ background: fgColor }}
        />
        <button
          ref={bgRef}
          onClick={() => openPicker('bg')}
          title="Background color"
          className="relative h-7 w-7 overflow-hidden rounded-md border border-[var(--border-primary)] shadow-inner cursor-pointer"
          style={{ background: bgColor }}
        >
          <span className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/40" />
        </button>
        <button
          onClick={swapColors}
          title="Swap colors (X)"
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <svg viewBox="0 0 24 24" {...stroke}>
            <path d="M7 8h10l-3-3M17 16H7l3 3" />
          </svg>
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
