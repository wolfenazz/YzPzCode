// ─── Image Editor — HSV color picker popover ──────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
  anchor: { x: number; y: number };
}

const PRESETS = [
  '#d87757', '#ffffff', '#000000', '#808080',
  '#f14444', '#f97316', '#f1c40f', '#10b981',
  '#1b7ede', '#8b5cf6', '#ec4899', '#06b6d4',
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [216, 119, 87];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
};

const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
};

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, onClose, anchor }) => {
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const [hexInput, setHexInput] = useState(value);
  const [hsv, setHsv] = useState<[number, number, number]>(() => rgbToHsv(...hexToRgb(value)));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.image-colorpicker')) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const setFromPointer = useCallback((e: React.PointerEvent, kind: 'sv' | 'hue') => {
    const el = kind === 'sv' ? svRef.current : hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    setHsv(([h, s, v]) => {
      const nh = kind === 'hue' ? px * 360 : h;
      const ns = kind === 'sv' ? px : s;
      const nv = kind === 'sv' ? 1 - py : v;
      const next: [number, number, number] = [nh, ns, nv];
      const [r, g, b] = hsvToRgb(next[0], next[1], next[2]);
      const hex = rgbToHex(r, g, b);
      onChange(hex);
      setHexInput(hex);
      return next;
    });
  }, [onChange]);

  const commitHexInput = useCallback(() => {
    const [r, g, b] = hexToRgb(hexInput);
    const next = rgbToHsv(r, g, b);
    setHsv(next);
    onChange(rgbToHex(r, g, b));
    setHexInput(rgbToHex(r, g, b));
  }, [hexInput, onChange]);

  const [r, g, b] = hsvToRgb(hsv[0], hsv[1], hsv[2]);
  const hueHex = rgbToHex(...hsvToRgb(hsv[0], 1, 1));

  return (
    <div
      className="image-colorpicker"
      style={{ position: 'fixed', left: Math.min(anchor.x, window.innerWidth - 240), top: Math.min(anchor.y, window.innerHeight - 340), zIndex: 9999 }}
    >
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-primary)] bg-[#303030] p-3 shadow-2xl w-[220px]">
        <div
          ref={svRef}
          className="relative h-[120px] w-full cursor-crosshair rounded-sm"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})` }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            setFromPointer(e, 'sv');
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) setFromPointer(e, 'sv');
          }}
        >
          <div
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: rgbToHex(r, g, b) }}
          />
        </div>

        <div
          ref={hueRef}
          className="relative h-3 w-full cursor-crosshair rounded-full"
          style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            setFromPointer(e, 'hue');
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) setFromPointer(e, 'hue');
          }}
        >
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${(hsv[0] / 360) * 100}%`, background: hueHex }}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="h-7 w-7 shrink-0 rounded border border-[var(--border-primary)]" style={{ background: rgbToHex(r, g, b) }} />
          <input
            className="h-7 w-full rounded border border-[var(--border-primary)] bg-[#262626] px-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={commitHexInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitHexInput();
            }}
          />
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              className="h-5 w-full rounded-sm border border-[var(--border-primary)] transition-transform hover:scale-110 cursor-pointer"
              style={{ background: p }}
              onClick={() => {
                const [pr, pg, pb] = hexToRgb(p);
                setHsv(rgbToHsv(pr, pg, pb));
                onChange(p);
                setHexInput(p);
              }}
              aria-label={p}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
