// Colour maths for the design system editor: contrast, readable fixes, a dark palette made
// from a light one, and palette alternatives. Dependency-free (`npm run test:design`).

import type { DesignPalette } from './types';

export interface Rgb { r: number; g: number; b: number }
export interface Hsl { h: number; s: number; l: number }

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function parseHex(value: string): Rgb | null {
  const raw = value.trim().replace(/^#/, '');
  const full = /^[0-9a-f]{3}$/i.test(raw) ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

const hslHex = (hsl: Hsl): string => toHex(hslToRgb({ h: ((hsl.h % 360) + 360) % 360, s: clamp(hsl.s, 0, 1), l: clamp(hsl.l, 0, 1) }));

function luminance(rgb: Rgb): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio of two hex colours (1–21); 1 when either cannot be read. */
export function contrastRatio(a: string, b: string): number {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return 1;
  const [high, low] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** The foreground moved toward black or white, in small steps, until it reads on the background. */
export function fixContrast(foreground: string, background: string, minimum = 4.5): string {
  const rgb = parseHex(foreground);
  if (!rgb || contrastRatio(foreground, background) >= minimum) return foreground;
  const hsl = rgbToHsl(rgb);
  const bg = parseHex(background);
  const darkBackground = bg ? luminance(bg) < 0.4 : false;
  for (let step = 1; step <= 40; step += 1) {
    const candidate = hslHex({ ...hsl, l: darkBackground ? hsl.l + step * 0.02 : hsl.l - step * 0.02 });
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return darkBackground ? '#ffffff' : '#000000';
}

export const isDarkColor = (hex: string): boolean => {
  const rgb = parseHex(hex);
  return rgb ? luminance(rgb) < 0.35 : false;
};

/** A dark theme for a light palette (or the reverse): surfaces swap ends, accents keep their hue and lift. */
export function deriveDarkPalette(palette: DesignPalette): DesignPalette {
  const bg = parseHex(palette.background);
  const base = bg ? rgbToHsl(bg) : { h: 220, s: 0.1, l: 0.97 };
  const wasLight = base.l >= 0.5;
  const hue = base.h;
  const tint = Math.min(0.18, Math.max(0.04, base.s));
  const accent = (hex: string): string => {
    const rgb = parseHex(hex);
    if (!rgb) return hex;
    const hsl = rgbToHsl(rgb);
    return hslHex({ h: hsl.h, s: hsl.s * 0.95, l: wasLight ? clamp(hsl.l + 0.12, 0.45, 0.78) : clamp(hsl.l - 0.12, 0.3, 0.6) });
  };
  const background = wasLight ? hslHex({ h: hue, s: tint, l: 0.08 }) : hslHex({ h: hue, s: tint, l: 0.97 });
  const surface = wasLight ? hslHex({ h: hue, s: tint, l: 0.13 }) : hslHex({ h: hue, s: tint, l: 1 });
  const text = wasLight ? hslHex({ h: hue, s: tint * 0.5, l: 0.95 }) : hslHex({ h: hue, s: tint, l: 0.1 });
  const muted = wasLight ? hslHex({ h: hue, s: tint * 0.6, l: 0.68 }) : hslHex({ h: hue, s: tint * 0.6, l: 0.4 });
  const next: DesignPalette = {
    background, surface, text, muted,
    primary: accent(palette.primary), secondary: accent(palette.secondary), accent: accent(palette.accent),
  };
  next.muted = fixContrast(next.muted, next.background, 3);
  next.text = fixContrast(next.text, next.background, 7);
  return next;
}

export interface PaletteIdea {
  name: string;
  palette: DesignPalette;
}

/**
 * Alternatives around a primary colour: same lightness structure as the current palette
 * (light stays light), other hue relationships. The first idea is the colour as it is.
 */
export function paletteIdeas(palette: DesignPalette, count = 5): PaletteIdea[] {
  const primary = parseHex(palette.primary);
  const base = primary ? rgbToHsl(primary) : { h: 220, s: 0.6, l: 0.5 };
  const bg = parseHex(palette.background);
  const light = bg ? rgbToHsl(bg).l >= 0.5 : true;
  const relations: Array<[string, number, number]> = [
    ['Analogous', 30, -30],
    ['Complementary', 180, 150],
    ['Triadic', 120, 240],
    ['Split', 150, 210],
    ['Warm shift', -40, 40],
    ['Cool shift', 40, -50],
  ];
  return relations.slice(0, count).map(([name, a, b]) => {
    const tint = Math.min(0.16, base.s * 0.25);
    const background = hslHex({ h: base.h, s: tint, l: light ? 0.975 : 0.08 });
    const surface = hslHex({ h: base.h, s: tint, l: light ? 1 : 0.13 });
    const textColor = hslHex({ h: base.h, s: tint * 1.2, l: light ? 0.1 : 0.95 });
    const muted = fixContrast(hslHex({ h: base.h, s: tint, l: light ? 0.42 : 0.68 }), background, 3.5);
    const primaryColor = hslHex({ h: base.h, s: clamp(base.s, 0.35, 0.9), l: clamp(base.l, 0.35, 0.6) });
    return {
      name,
      palette: {
        background, surface, text: textColor, muted,
        primary: primaryColor,
        secondary: hslHex({ h: base.h + a, s: clamp(base.s * 0.8, 0.3, 0.8), l: light ? 0.55 : 0.62 }),
        accent: hslHex({ h: base.h + b, s: clamp(base.s, 0.4, 0.9), l: light ? 0.52 : 0.6 }),
      },
    };
  });
}

/** Type sizes from a body size and a ratio: caption below, then body, h2, h1, display. */
export function typeScale(body: number, ratio: number): { display: number; h1: number; h2: number; body: number; caption: number } {
  const size = (power: number): number => Math.round(body * ratio ** power);
  return { caption: Math.max(8, Math.round(body / ratio)), body: Math.round(body), h2: size(2), h1: size(3), display: size(5) };
}

export const TYPE_RATIOS: Array<{ id: string; label: string; ratio: number }> = [
  { id: 'minor-second', label: 'Minor second · 1.125', ratio: 1.125 },
  { id: 'major-second', label: 'Major second · 1.2', ratio: 1.2 },
  { id: 'minor-third', label: 'Minor third · 1.25', ratio: 1.25 },
  { id: 'major-third', label: 'Major third · 1.333', ratio: 1.333 },
  { id: 'fourth', label: 'Perfect fourth · 1.5', ratio: 1.5 },
];

/** Every `#rrggbb` in a piece of SVG (or CSS) replaced through `map`; a colour the map cannot handle stays. */
export function recolorHexes(text: string, map: (hex: string) => string): string {
  return text.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
    try {
      return map(hex);
    } catch {
      return hex;
    }
  });
}

const GENERIC_FACES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'inherit', 'initial', 'unset', 'var']);
const FONT_FAMILY = /font-family\s*=\s*"([^"]*)"|font-family\s*=\s*'([^']*)'|font-family\s*:\s*([^;"}<]*)/gi;
const FONT_SIZE = /font-size\s*(?:=\s*["']|:\s*)\s*([\d.]+)/i;
const faceKey = (name: string): string => name.replace(/['"]/g, '').trim().toLowerCase();
const firstFace = (stack: string): string => faceKey(stack.split(',')[0] ?? '');

/**
 * Swaps the typeface of drawn text: every `font-family` (attribute or style) whose first family is
 * `from.heading` / `from.body` takes the matching face of `to`. A drawing often uses faces the system
 * never named (the AI picked its own); with `headingMin` (px) those follow the system too: a face
 * drawn at heading size becomes the heading face and one only at text size the body face (a single
 * face used for both is decided per element by its size). Generic and monospace faces are kept.
 */
export function refontSvg(svg: string, from: { heading: string; body: string }, to: { heading: string; body: string }, headingMin?: number): string {
  const swaps = new Map<string, string>();
  if (from.body && to.body && faceKey(from.body) !== faceKey(to.body)) swaps.set(faceKey(from.body), to.body);
  if (from.heading && to.heading && faceKey(from.heading) !== faceKey(to.heading)) swaps.set(faceKey(from.heading), to.heading);
  const known = new Set([from.heading, from.body, to.heading, to.body].map(faceKey));
  const foreign = (face: string): boolean => Boolean(face) && !known.has(face) && !GENERIC_FACES.has(face) && !/mono|code|courier|consolas|icon|symbol|emoji|wingding/.test(face);

  // The sizes each foreign face is drawn at.
  const sizes = new Map<string, number[]>();
  if (headingMin && headingMin > 0) {
    for (const tag of svg.match(/<[a-z][^<>]*font-family[^<>]*>/gi) ?? []) {
      FONT_FAMILY.lastIndex = 0;
      const found = FONT_FAMILY.exec(tag);
      const face = found ? firstFace(found[1] ?? found[2] ?? found[3] ?? '') : '';
      if (!foreign(face)) continue;
      const size = FONT_SIZE.exec(tag);
      const list = sizes.get(face) ?? [];
      if (size) list.push(parseFloat(size[1]));
      sizes.set(face, list);
    }
  }
  const atHeadingSize = (list: number[]): boolean => list.some((size) => size >= (headingMin ?? Infinity));
  const headingFaces = [...sizes].filter(([, list]) => atHeadingSize(list)).map(([face]) => face);
  const bodyFaceExists = [...sizes].some(([, list]) => !atHeadingSize(list));
  /** null = decide by the element's own size. */
  const roleOf = (face: string): 'heading' | 'body' | null => {
    if (!headingFaces.includes(face)) return 'body';
    return bodyFaceExists || headingFaces.length > 1 ? 'heading' : null;
  };
  if (swaps.size === 0 && sizes.size === 0) return svg;

  const quoteFace = (name: string): string => `'${name.replace(/['"\<>&;]/g, '')}'`;
  const swapStack = (stack: string, size: number | null): string => {
    const parts = stack.split(',');
    const face = firstFace(stack);
    let next = swaps.get(face);
    if (!next && sizes.has(face)) {
      const role = roleOf(face) ?? (size !== null && size >= (headingMin ?? Infinity) ? 'heading' : 'body');
      next = role === 'heading' ? to.heading : to.body;
    }
    if (!next) return stack;
    const rest = parts.slice(1).filter((part) => faceKey(part) !== faceKey(next));
    return [quoteFace(next), ...rest].join(',');
  };
  const swapAll = (text: string, size: number | null): string => text.replace(FONT_FAMILY, (_match, dq: string | undefined, sq: string | undefined, css: string | undefined) => {
    if (dq !== undefined) return `font-family="${swapStack(dq, size)}"`;
    if (sq !== undefined) return `font-family="${swapStack(sq, size)}"`;
    return `font-family:${swapStack(css ?? '', size)}`;
  });
  // Tags first (each knows its own size), then whatever is left in style sheets.
  return svg
    .replace(/<[a-z][^<>]*font-family[^<>]*>/gi, (tag) => {
      const size = FONT_SIZE.exec(tag);
      return swapAll(tag, size ? parseFloat(size[1]) : null);
    })
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_match, open: string, css: string, close: string) => `${open}${swapAll(css, null)}${close}`);
}
