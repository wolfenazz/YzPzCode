// Deck theme presets. Fonts are limited to ones PowerPoint has everywhere, so
// exported files look the same on other machines. Dependency-free.

import type { DeckTheme, Decoration, ThemePalette } from './types';

/** Fonts that ship with Office on Windows and macOS. */
export const SAFE_FONTS = ['Aptos', 'Calibri', 'Segoe UI', 'Arial', 'Georgia', 'Garamond', 'Trebuchet MS'] as const;

// Single quotes: these stacks also go into inline style attributes.
const FALLBACKS: Record<string, string> = {
  aptos: "'Aptos', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  calibri: "Calibri, Carlito, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  'segoe ui': "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  arial: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  garamond: "Garamond, 'EB Garamond', 'Iowan Old Style', Georgia, serif",
  'trebuchet ms': "'Trebuchet MS', 'Segoe UI', Arial, sans-serif",
};

/** A CSS font stack for a PowerPoint font name. */
export function fontStack(name: string): string {
  const key = name.trim().toLowerCase();
  if (FALLBACKS[key]) return FALLBACKS[key];
  const serif = /serif|garamond|times|georgia|cambria|book|palatino|minion/i.test(name) && !/sans/i.test(name);
  return `'${name.replace(/['"\\]/g, '')}', ${serif ? 'Georgia, serif' : "'Segoe UI', Arial, sans-serif"}`;
}

interface PresetInput {
  id: string;
  name: string;
  tagline: string;
  dark?: boolean;
  palette: ThemePalette;
  headingFont: string;
  bodyFont: string;
  titleSize?: number;
  bodySize?: number;
  decoration: Decoration;
  titleFill: DeckTheme['titleFill'];
  extraChart?: string[];
}

const preset = (input: PresetInput): DeckTheme => ({
  id: input.id,
  name: input.name,
  tagline: input.tagline,
  dark: Boolean(input.dark),
  palette: input.palette,
  headingFont: input.headingFont,
  bodyFont: input.bodyFont,
  titleSize: input.titleSize ?? 32,
  bodySize: input.bodySize ?? 20,
  decoration: input.decoration,
  titleFill: input.titleFill,
  chartColors: [input.palette.accent1, input.palette.accent2, input.palette.accent3, ...(input.extraChart ?? ['#8b8f98', '#c9ccd3'])],
});

export const DECK_THEMES: DeckTheme[] = [
  preset({
    id: 'executive',
    name: 'Executive',
    tagline: 'Navy and gold, serif titles. Board meetings and investor updates.',
    palette: { background: '#ffffff', surface: '#f2f4f8', text: '#14213d', muted: '#5b6478', accent1: '#1f4e9e', accent2: '#d99a2b', accent3: '#2a9d8f', onAccent: '#ffffff' },
    headingFont: 'Georgia',
    bodyFont: 'Calibri',
    titleSize: 32,
    decoration: 'rule',
    titleFill: 'accent',
    extraChart: ['#7d8bb1', '#c7cfdf'],
  }),
  preset({
    id: 'midnight',
    name: 'Midnight',
    tagline: 'Deep navy canvas with bright accents. Keynotes and product launches.',
    dark: true,
    palette: { background: '#0e1220', surface: '#1a2238', text: '#f2f4f8', muted: '#a3abc2', accent1: '#7aa2ff', accent2: '#f7b267', accent3: '#6ee7b7', onAccent: '#0e1220' },
    headingFont: 'Segoe UI',
    bodyFont: 'Segoe UI',
    decoration: 'corner',
    titleFill: 'background',
    extraChart: ['#c4b5fd', '#64748b'],
  }),
  preset({
    id: 'minimal-light',
    name: 'Minimal Light',
    tagline: 'Black on white, generous space, one red accent.',
    palette: { background: '#ffffff', surface: '#f5f5f4', text: '#1c1917', muted: '#78716c', accent1: '#1c1917', accent2: '#dc2626', accent3: '#a8a29e', onAccent: '#ffffff' },
    headingFont: 'Aptos',
    bodyFont: 'Aptos',
    decoration: 'none',
    titleFill: 'background',
    extraChart: ['#57534e', '#d6d3d1'],
  }),
  preset({
    id: 'bold-gradient',
    name: 'Bold Gradient',
    tagline: 'Violet-to-pink title slides and a gradient band. Marketing and launches.',
    palette: { background: '#ffffff', surface: '#f4f0ff', text: '#1e1b3a', muted: '#625d80', accent1: '#6d28d9', accent2: '#db2777', accent3: '#f59e0b', onAccent: '#ffffff' },
    headingFont: 'Trebuchet MS',
    bodyFont: 'Segoe UI',
    decoration: 'band',
    titleFill: 'gradient',
    extraChart: ['#a78bfa', '#f9a8d4'],
  }),
  preset({
    id: 'academic',
    name: 'Academic',
    tagline: 'Ivory paper, oxblood accents, Garamond titles. Lectures and defences.',
    palette: { background: '#fffdf8', surface: '#f3eee2', text: '#22201c', muted: '#6b655a', accent1: '#8c1c13', accent2: '#2f4858', accent3: '#b08d57', onAccent: '#fffdf8' },
    headingFont: 'Garamond',
    bodyFont: 'Calibri',
    titleSize: 34,
    decoration: 'rule',
    titleFill: 'background',
    extraChart: ['#8a9a9f', '#d8cdb5'],
  }),
  preset({
    id: 'startup-pitch',
    name: 'Startup Pitch',
    tagline: 'Crisp blue and green, big numbers. Pitch decks and demo days.',
    palette: { background: '#ffffff', surface: '#f1f5f9', text: '#0f172a', muted: '#64748b', accent1: '#2563eb', accent2: '#10b981', accent3: '#f97316', onAccent: '#ffffff' },
    headingFont: 'Segoe UI',
    bodyFont: 'Segoe UI',
    decoration: 'corner',
    titleFill: 'accent',
    extraChart: ['#93c5fd', '#cbd5e1'],
  }),
  preset({
    id: 'nature',
    name: 'Nature',
    tagline: 'Moss, ochre and sand. Sustainability, health and field reports.',
    palette: { background: '#f7f5ee', surface: '#ebe7d8', text: '#1f2a1f', muted: '#5e6b5a', accent1: '#3a6b35', accent2: '#c08b3b', accent3: '#7fa77a', onAccent: '#ffffff' },
    headingFont: 'Georgia',
    bodyFont: 'Calibri',
    decoration: 'band',
    titleFill: 'accent',
    extraChart: ['#a3b18a', '#d9cfb0'],
  }),
  preset({
    id: 'mono-editorial',
    name: 'Mono Editorial',
    tagline: 'Newsprint black and cream with a rust accent. Strategy and essays.',
    palette: { background: '#f4f1ea', surface: '#e8e3d8', text: '#111111', muted: '#5a5a5a', accent1: '#111111', accent2: '#c2410c', accent3: '#6b7280', onAccent: '#f4f1ea' },
    headingFont: 'Georgia',
    bodyFont: 'Arial',
    titleSize: 34,
    decoration: 'rule',
    titleFill: 'accent',
    extraChart: ['#9ca3af', '#d1cbbd'],
  }),
  preset({
    id: 'ocean',
    name: 'Ocean',
    tagline: 'Teal and coral on a pale sea. Research and analytics.',
    palette: { background: '#f3f8fa', surface: '#e1eef3', text: '#0b2a3c', muted: '#4f6b7a', accent1: '#0e7490', accent2: '#f4845f', accent3: '#264653', onAccent: '#ffffff' },
    headingFont: 'Aptos',
    bodyFont: 'Aptos',
    decoration: 'band',
    titleFill: 'accent',
    extraChart: ['#7fc8d6', '#b8c9d1'],
  }),
  preset({
    id: 'carbon',
    name: 'Carbon',
    tagline: 'Charcoal with orange and aqua. Engineering reviews and tech talks.',
    dark: true,
    palette: { background: '#161616', surface: '#262626', text: '#f4f4f4', muted: '#a8a8a8', accent1: '#ff6b35', accent2: '#4ecdc4', accent3: '#ffe66d', onAccent: '#161616' },
    headingFont: 'Arial',
    bodyFont: 'Arial',
    decoration: 'corner',
    titleFill: 'background',
    extraChart: ['#9b8cff', '#6f6f6f'],
  }),
  preset({
    id: 'corporate',
    name: 'Corporate Blue',
    tagline: 'The classic Office look, done properly. Team and client updates.',
    palette: { background: '#ffffff', surface: '#eef3fa', text: '#1a1a1a', muted: '#595959', accent1: '#0f6cbd', accent2: '#00a3ad', accent3: '#f2c14e', onAccent: '#ffffff' },
    headingFont: 'Calibri',
    bodyFont: 'Calibri',
    titleSize: 34,
    decoration: 'band',
    titleFill: 'accent',
    extraChart: ['#6aa6dd', '#bfbfbf'],
  }),
  preset({
    id: 'sunset',
    name: 'Warm Sunset',
    tagline: 'Vermilion and saffron on warm white. Workshops and storytelling.',
    palette: { background: '#fff8f1', surface: '#fcebdc', text: '#2b1b12', muted: '#7a5c4b', accent1: '#e4572e', accent2: '#f3a712', accent3: '#29335c', onAccent: '#ffffff' },
    headingFont: 'Trebuchet MS',
    bodyFont: 'Calibri',
    decoration: 'rule',
    titleFill: 'gradient',
    extraChart: ['#f6ae8f', '#c9b8ab'],
  }),
];

export const DEFAULT_THEME_ID = 'executive';

export function getTheme(id: string | null | undefined): DeckTheme {
  return DECK_THEMES.find((theme) => theme.id === id) ?? DECK_THEMES[0];
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalises a colour to lower-case #rrggbb, or returns null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = HEX.exec(value.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].split('').map((ch) => ch + ch).join('') : match[1];
  return `#${hex.toLowerCase()}`;
}

function channel(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

/** Mixes two #rrggbb colours; `amount` is the share of `b`. */
export function mixHex(a: string, b: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const out = [0, 1, 2].map((index) => Math.round(channel(a, index) * (1 - t) + channel(b, index) * t));
  return `#${out.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = [0, 1, 2].map((index) => {
    const value = channel(hex, index) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#111111') ? '#ffffff' : '#111111';
}

const PALETTE_KEYS: Array<keyof ThemePalette> = ['background', 'surface', 'text', 'muted', 'accent1', 'accent2', 'accent3', 'onAccent'];

/** Repairs a theme from a file, falling back to the preset of the same id. */
export function sanitizeTheme(value: unknown): DeckTheme {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<DeckTheme>;
  const base = getTheme(typeof raw.id === 'string' ? raw.id : DEFAULT_THEME_ID);
  const palette = { ...base.palette };
  for (const key of PALETTE_KEYS) {
    const color = normalizeHex(raw.palette?.[key]);
    if (color) palette[key] = color;
  }
  const size = (input: unknown, fallback: number, min: number, max: number): number => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const chartColors = Array.isArray(raw.chartColors)
    ? raw.chartColors.map(normalizeHex).filter((color): color is string => color !== null)
    : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 60) : base.name,
    tagline: typeof raw.tagline === 'string' ? raw.tagline.slice(0, 160) : base.tagline,
    dark: typeof raw.dark === 'boolean' ? raw.dark : luminance(palette.background) < 0.2,
    palette,
    headingFont: typeof raw.headingFont === 'string' && raw.headingFont.trim() ? raw.headingFont.trim().slice(0, 60) : base.headingFont,
    bodyFont: typeof raw.bodyFont === 'string' && raw.bodyFont.trim() ? raw.bodyFont.trim().slice(0, 60) : base.bodyFont,
    titleSize: size(raw.titleSize, base.titleSize, 20, 54),
    bodySize: size(raw.bodySize, base.bodySize, 12, 32),
    decoration: (['rule', 'corner', 'band', 'none'] as const).includes(raw.decoration as Decoration) ? raw.decoration as Decoration : base.decoration,
    titleFill: (['background', 'accent', 'gradient'] as const).includes(raw.titleFill as DeckTheme['titleFill']) ? raw.titleFill as DeckTheme['titleFill'] : base.titleFill,
    chartColors: chartColors.length >= 3 ? chartColors : [palette.accent1, palette.accent2, palette.accent3, ...base.chartColors.slice(3)],
  };
}

/** A theme from a PowerPoint colour and font scheme (Rebuild in a theme). */
export function themeFromScheme(scheme: {
  name?: string;
  dk1?: string;
  lt1?: string;
  dk2?: string;
  lt2?: string;
  accents?: string[];
  majorFont?: string;
  minorFont?: string;
}): DeckTheme {
  const background = normalizeHex(scheme.lt1) ?? '#ffffff';
  const text = normalizeHex(scheme.dk1) ?? '#1a1a1a';
  const accents = (scheme.accents ?? []).map(normalizeHex).filter((color): color is string => color !== null);
  const accent1 = accents[0] ?? normalizeHex(scheme.dk2) ?? '#0f6cbd';
  const lt2 = normalizeHex(scheme.lt2);
  return sanitizeTheme({
    id: 'imported',
    name: scheme.name ? `${scheme.name} (imported)` : 'Imported theme',
    tagline: 'Colours and fonts taken from the original presentation.',
    palette: {
      background,
      surface: lt2 && contrastRatio(lt2, background) < 1.6 ? lt2 : mixHex(background, text, 0.06),
      text,
      muted: mixHex(text, background, 0.4),
      accent1,
      accent2: accents[1] ?? mixHex(accent1, background, 0.35),
      accent3: accents[2] ?? mixHex(accent1, text, 0.4),
      onAccent: readableOn(accent1),
    },
    headingFont: scheme.majorFont || 'Calibri',
    bodyFont: scheme.minorFont || scheme.majorFont || 'Calibri',
    titleSize: 32,
    bodySize: 20,
    decoration: 'rule',
    titleFill: 'background',
    chartColors: accents.length >= 3 ? accents : undefined,
  });
}
