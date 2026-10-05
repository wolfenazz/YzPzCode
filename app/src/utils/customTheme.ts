/*
 * Custom theme engine.
 *
 * A custom theme is deliberately small: nine colors, a light/dark base and one
 * corner radius. Everything else the interface needs (sidebar, inputs, rings,
 * accent tints, the Tailwind zinc ramp, shadows, radii) is derived here so a
 * theme stays coherent no matter which nine colors someone picks.
 *
 * This file is dependency-free on purpose: it is shared by the live app, the
 * editor preview and the node test runner.
 */
import type { CustomTheme, CustomThemeBase, CustomThemeColors } from '../types';

export const MAX_CUSTOM_THEMES = 24;
export const THEME_NAME_MAX_LENGTH = 40;
export const THEME_RADIUS_MIN = 0;
export const THEME_RADIUS_MAX = 20;
export const THEME_RADIUS_DEFAULT = 10;
export const THEME_FILE_FORMAT = 'yzpzcode-theme';
export const THEME_FILE_VERSION = 1;
export const THEME_FILE_MAX_CHARS = 64 * 1024;

export const THEME_COLOR_KEYS: ReadonlyArray<keyof CustomThemeColors> = [
  'background',
  'surface',
  'elevated',
  'text',
  'textMuted',
  'border',
  'accent',
  'danger',
  'terminal',
];

/* ── Color math ───────────────────────────────────────────────────────── */

type Rgb = [number, number, number];

/** Accepts `#rgb`, `#rrggbb` with or without the hash; returns `#rrggbb` or null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let hex = value.trim().toLowerCase();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[\da-f]{3}$/.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return /^#[\da-f]{6}$/.test(hex) ? hex : null;
}

const toRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('')}`;

/** Linear sRGB blend: 0 returns `from`, 1 returns `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const a = toRgb(from);
  const b = toRgb(to);
  const t = Math.min(1, Math.max(0, amount));
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000})`;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whichever of `light` / `dark` reads better on `background`. */
export function readableOn(background: string, light = '#ffffff', dark = '#111111'): string {
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

/** Nudge `color` toward `toward` until it reaches `minimum` contrast against `background`. */
function ensureContrast(color: string, background: string, minimum: number, toward: string): string {
  let result = color;
  for (let step = 1; step <= 10 && contrastRatio(result, background) < minimum; step += 1) {
    result = mixColors(color, toward, step / 10);
  }
  return result;
}

/* ── Presets ──────────────────────────────────────────────────────────── */

export type ThemePresetGroup = 'built-in' | 'platform' | 'editor';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  group: ThemePresetGroup;
  base: CustomThemeBase;
  colors: CustomThemeColors;
}

/** Colors in the order: background, surface, elevated, text, textMuted, border, accent, danger, terminal. */
type PaletteTuple = readonly [string, string, string, string, string, string, string, string, string];

const palette = (
  id: string,
  name: string,
  group: ThemePresetGroup,
  base: CustomThemeBase,
  description: string,
  [background, surface, elevated, text, textMuted, border, accent, danger, terminal]: PaletteTuple,
): ThemePreset => ({
  id,
  name,
  description,
  group,
  base,
  colors: { background, surface, elevated, text, textMuted, border, accent, danger, terminal },
});

/*
 * The first two entries double as the fallback palette for a malformed dark or
 * light theme, so keep them first. "Inspired by" palettes approximate the public
 * look of a design system; they are not official assets.
 */
export const THEME_PRESETS: ReadonlyArray<ThemePreset> = [
  // Built-in
  palette('dark', 'Dark', 'built-in', 'dark', 'The built-in deep neutral theme', ['#0b0b0b', '#111111', '#1a1a1a', '#f5f5f5', '#a1a1a1', '#262626', '#d0d0d0', '#d95d58', '#050505']),
  palette('light', 'Light', 'built-in', 'light', 'The built-in bright neutral theme', ['#f6f6f4', '#fbfbfa', '#ededeb', '#20201f', '#62625e', '#dcdcd8', '#4f5358', '#c42b1c', '#151515']),
  palette('claude', 'Claude', 'built-in', 'light', 'Warm Crail and Pampas', ['#f4f3ee', '#ffffff', '#e9e7e0', '#2d2a26', '#6f6a62', '#d8d5cd', '#c15f3c', '#b44237', '#1f1e1b']),
  palette('yzpz', 'YzPzCode', 'built-in', 'dark', 'Midnight violet with Burple', ['#0c081b', '#17102c', '#221743', '#f8f6ff', '#bdb3d7', '#372e50', '#8c4edd', '#ef8169', '#080611']),

  // Platforms and brands
  palette('apple-light', 'Apple Light', 'platform', 'light', 'Inspired by macOS and iOS: soft system grays, iOS blue', ['#f5f5f7', '#ffffff', '#e8e8ed', '#1d1d1f', '#6e6e73', '#d2d2d7', '#0071e3', '#d70015', '#1d1d1f']),
  palette('apple-dark', 'Apple Dark', 'platform', 'dark', 'Inspired by iOS dark mode: true black, layered grays', ['#000000', '#1c1c1e', '#2c2c2e', '#f5f5f7', '#a1a1a6', '#38383a', '#0a84ff', '#ff453a', '#000000']),
  palette('google-light', 'Google Light', 'platform', 'light', 'Inspired by Google Workspace: clean white, Google blue', ['#f8f9fa', '#ffffff', '#f1f3f4', '#202124', '#5f6368', '#dadce0', '#1a73e8', '#d93025', '#202124']),
  palette('google-dark', 'Google Dark', 'platform', 'dark', 'Inspired by Google dark mode: charcoal with a soft blue', ['#202124', '#292a2d', '#35363a', '#e8eaed', '#9aa0a6', '#3c4043', '#8ab4f8', '#f28b82', '#171717']),
  palette('material-light', 'Material You Light', 'platform', 'light', 'Inspired by Material 3: tonal violet surfaces', ['#fef7ff', '#f7f2fa', '#ece6f0', '#1d1b20', '#49454f', '#cac4d0', '#6750a4', '#b3261e', '#141218']),
  palette('material-dark', 'Material You Dark', 'platform', 'dark', 'Inspired by Material 3 dark: deep violet, lilac accent', ['#141218', '#1d1b20', '#2b2930', '#e6e0e9', '#cac4d0', '#49454f', '#d0bcff', '#f2b8b5', '#0f0d13']),
  palette('fluent-light', 'Fluent Light', 'platform', 'light', 'Inspired by Windows 11: Mica neutrals, system blue', ['#f3f3f3', '#fbfbfb', '#e9e9e9', '#1a1a1a', '#5c5c5c', '#dcdcdc', '#0067c0', '#c42b1c', '#0c0c0c']),
  palette('fluent-dark', 'Fluent Dark', 'platform', 'dark', 'Inspired by Windows 11 dark: graphite with a sky accent', ['#202020', '#2b2b2b', '#353535', '#f5f5f5', '#ababab', '#404040', '#60cdff', '#ff99a4', '#0c0c0c']),
  palette('github-light', 'GitHub Light', 'platform', 'light', 'Inspired by GitHub: crisp white, blue links', ['#ffffff', '#f6f8fa', '#eaeef2', '#1f2328', '#59636e', '#d1d9e0', '#0969da', '#cf222e', '#0d1117']),
  palette('github-dark', 'GitHub Dark', 'platform', 'dark', 'Inspired by GitHub dark: ink blue-black', ['#0d1117', '#161b22', '#21262d', '#e6edf3', '#8d96a0', '#30363d', '#2f81f7', '#f85149', '#010409']),
  palette('notion-light', 'Notion Light', 'platform', 'light', 'Inspired by Notion: paper white, warm grays', ['#ffffff', '#f7f6f3', '#ebeae6', '#37352f', '#6b6a66', '#e3e2de', '#2383e2', '#d44c47', '#191919']),
  palette('notion-dark', 'Notion Dark', 'platform', 'dark', 'Inspired by Notion dark: soft charcoal', ['#191919', '#202020', '#2b2b2b', '#e3e3e3', '#9b9b9b', '#373737', '#529cca', '#ff7369', '#111111']),
  palette('discord', 'Discord', 'platform', 'dark', 'Inspired by Discord: slate with a blurple accent', ['#313338', '#2b2d31', '#383a40', '#f2f3f5', '#b5bac1', '#3f4147', '#7983f5', '#f23f42', '#1e1f22']),
  palette('spotify', 'Spotify', 'platform', 'dark', 'Inspired by Spotify: near-black with vivid green', ['#121212', '#181818', '#282828', '#ffffff', '#b3b3b3', '#333333', '#1ed760', '#f3727f', '#000000']),
  palette('linear', 'Linear', 'platform', 'dark', 'Inspired by Linear: quiet, dense, indigo accent', ['#0f1011', '#141516', '#1c1d1f', '#f7f8f8', '#8a8f98', '#26282b', '#7170ff', '#eb5757', '#08090a']),
  palette('vercel', 'Vercel', 'platform', 'dark', 'Inspired by Vercel: monochrome black with electric blue', ['#000000', '#0a0a0a', '#171717', '#ededed', '#a1a1a1', '#2e2e2e', '#3291ff', '#e5484d', '#000000']),
  palette('stripe', 'Stripe', 'platform', 'light', 'Inspired by Stripe: cool white, deep navy text, violet', ['#f6f9fc', '#ffffff', '#e6ebf1', '#0a2540', '#425466', '#d5dde6', '#635bff', '#df1b41', '#0a2540']),
  palette('supabase', 'Supabase', 'platform', 'dark', 'Inspired by Supabase: graphite with emerald', ['#1c1c1c', '#232323', '#2e2e2e', '#ededed', '#a0a0a0', '#363636', '#3ecf8e', '#f87171', '#121212']),

  // Editor classics
  palette('nord', 'Nord', 'editor', 'dark', 'Arctic, muted blue-grey', ['#2e3440', '#3b4252', '#434c5e', '#eceff4', '#b5bfd0', '#4c566a', '#88c0d0', '#d57780', '#272c36']),
  palette('dracula', 'Dracula', 'editor', 'dark', 'High-contrast purple on charcoal', ['#21222c', '#282a36', '#343746', '#f8f8f2', '#a9b0d0', '#44475a', '#bd93f9', '#ff6e6e', '#1a1b23']),
  palette('tokyo-night', 'Tokyo Night', 'editor', 'dark', 'Deep indigo with a soft blue accent', ['#1a1b26', '#1f2335', '#292e42', '#c0caf5', '#8e98c4', '#3b4261', '#7aa2f7', '#f7768e', '#16161e']),
  palette('one-dark', 'One Dark', 'editor', 'dark', 'The classic Atom dark', ['#282c34', '#21252b', '#2c313a', '#abb2bf', '#9aa2b1', '#3e4451', '#61afef', '#e06c75', '#1e2227']),
  palette('one-light', 'One Light', 'editor', 'light', 'The classic Atom light', ['#fafafa', '#ffffff', '#eaeaeb', '#383a42', '#696c77', '#dbdbdc', '#4078f2', '#e45649', '#282c34']),
  palette('monokai', 'Monokai', 'editor', 'dark', 'Warm olive-black with lime and magenta', ['#272822', '#1e1f1c', '#3e3d32', '#f8f8f2', '#b4b09a', '#49483e', '#a6e22e', '#f92672', '#1b1c18']),
  palette('gruvbox-dark', 'Gruvbox Dark', 'editor', 'dark', 'Retro earthy dark with amber', ['#282828', '#32302f', '#3c3836', '#ebdbb2', '#b0a28b', '#504945', '#fabd2f', '#fb4934', '#1d2021']),
  palette('gruvbox-light', 'Gruvbox Light', 'editor', 'light', 'Retro cream with deep teal', ['#fbf1c7', '#f9f5d7', '#ebdbb2', '#3c3836', '#665c54', '#d5c4a1', '#076678', '#9d0006', '#282828']),
  palette('catppuccin-mocha', 'Catppuccin Mocha', 'editor', 'dark', 'Soothing pastel dark with mauve', ['#181825', '#1e1e2e', '#313244', '#cdd6f4', '#a6adc8', '#45475a', '#cba6f7', '#f38ba8', '#11111b']),
  palette('catppuccin-latte', 'Catppuccin Latte', 'editor', 'light', 'Soothing pastel light with violet', ['#e6e9ef', '#eff1f5', '#ccd0da', '#4c4f69', '#5c5f77', '#bcc0cc', '#8839ef', '#d20f39', '#1e1e2e']),
  palette('solarized-dark', 'Solarized Dark', 'editor', 'dark', 'Deep teal with precise contrast', ['#002b36', '#073642', '#0e4351', '#b4c2c2', '#93a1a1', '#1a5260', '#2aa198', '#e8504d', '#00212b']),
  palette('solarized-light', 'Solarized Light', 'editor', 'light', 'Warm parchment, low glare', ['#f5efdc', '#fdf6e3', '#eee8d5', '#34484f', '#586e75', '#d9d2bc', '#268bd2', '#dc322f', '#002b36']),
  palette('rose-pine', 'Rosé Pine', 'editor', 'dark', 'Dusky purple with rose gold', ['#191724', '#1f1d2e', '#26233a', '#e0def4', '#908caa', '#403d52', '#ebbcba', '#eb6f92', '#12101c']),
  palette('rose-pine-dawn', 'Rosé Pine Dawn', 'editor', 'light', 'Soft peach paper with pine green', ['#faf4ed', '#fffaf3', '#f2e9e1', '#575279', '#6e6a86', '#dfdad9', '#286983', '#b4637a', '#232136']),
  palette('everforest', 'Everforest', 'editor', 'dark', 'Calm forest greens, easy on the eyes', ['#2d353b', '#343f44', '#3d484d', '#d3c6aa', '#a2ad9f', '#475258', '#a7c080', '#e67e80', '#232a2e']),
  palette('night-owl', 'Night Owl', 'editor', 'dark', 'Deep navy tuned for night coding', ['#011627', '#0b2942', '#12304d', '#d6deeb', '#8aa5c2', '#1d3b53', '#82aaff', '#ef5350', '#010e1a']),
  palette('ayu-dark', 'Ayu Dark', 'editor', 'dark', 'Ink black with golden amber', ['#0b0e14', '#0f131a', '#1b2029', '#bfbdb6', '#8a919a', '#1f2530', '#e6b450', '#f07178', '#070a0f']),
  palette('synthwave', 'Synthwave', 'editor', 'dark', 'Neon pink on retro-future purple', ['#262335', '#2a2139', '#34294f', '#f4eeee', '#b3a8cf', '#495495', '#ff7edb', '#fe4450', '#1a1626']),
  palette('sepia', 'Sepia', 'editor', 'light', 'Warm, paper-like reading comfort', ['#f4ecd8', '#fbf5e6', '#e9dfc7', '#433422', '#6b5a45', '#d6c8a8', '#9a4a1f', '#b3261e', '#2b2118']),
];

export const getThemePreset = (id: string): ThemePreset | undefined => THEME_PRESETS.find((preset) => preset.id === id);

const FALLBACK_PRESET: Record<CustomThemeBase, ThemePreset> = {
  dark: THEME_PRESETS[0],
  light: THEME_PRESETS[1],
};

/* ── Token derivation ─────────────────────────────────────────────────── */

/** Where each zinc step sits between the text color (0) and the background (1). */
const ZINC_STEPS: ReadonlyArray<readonly [number, number]> = [
  [50, 0],
  [100, 0.02],
  [200, 0.07],
  [300, 0.16],
  [400, 0.33],
  [500, 0.5],
  [600, 0.66],
  [700, 0.8],
  [800, 0.89],
  [900, 0.95],
  [950, 1],
];

const clampRadius = (value: unknown): number => {
  const radius = typeof value === 'number' && Number.isFinite(value) ? value : THEME_RADIUS_DEFAULT;
  return Math.min(THEME_RADIUS_MAX, Math.max(THEME_RADIUS_MIN, Math.round(radius)));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Fill any missing or malformed color from the base's built-in palette. */
function resolveColors(input: unknown, base: CustomThemeBase): CustomThemeColors {
  const fallback = FALLBACK_PRESET[base].colors;
  const source = isRecord(input) ? input : {};
  const colors = {} as CustomThemeColors;
  for (const key of THEME_COLOR_KEYS) colors[key] = normalizeHex(source[key]) ?? fallback[key];
  return colors;
}

export const getThemeColorScheme = (theme: Pick<CustomTheme, 'base'>): CustomThemeBase =>
  theme.base === 'light' ? 'light' : 'dark';

/**
 * Every CSS custom property a theme sets on `<html>` (or on the preview root).
 * Values are always built from validated hex colors, never from raw input.
 */
export function buildThemeTokens(theme: Pick<CustomTheme, 'base' | 'colors' | 'radius'>): Record<string, string> {
  const light = theme.base === 'light';
  const c = resolveColors(theme.colors, theme.base);
  const radius = clampRadius(theme.radius);
  const sidebar = mixColors(c.background, c.surface, 0.6);
  const accentText = ensureContrast(c.accent, c.background, 4.5, c.text);
  const ring = withAlpha(c.accent, 0.5);

  const tokens: Record<string, string> = {
    '--bg-primary': c.background,
    '--bg-main': c.background,
    '--bg-secondary': c.surface,
    '--bg-tertiary': c.elevated,
    '--bg-terminal': c.terminal,
    '--border-primary': c.border,
    '--text-primary': c.text,
    '--text-secondary': c.textMuted,

    '--background': c.background,
    '--foreground': c.text,
    '--card': c.surface,
    '--card-foreground': c.text,
    '--popover': c.elevated,
    '--popover-foreground': c.text,
    '--primary': c.accent,
    '--primary-foreground': readableOn(c.accent),
    '--secondary': c.elevated,
    '--secondary-foreground': c.text,
    '--muted': c.elevated,
    '--muted-foreground': c.textMuted,
    '--destructive': c.danger,
    '--destructive-foreground': readableOn(c.danger),
    '--border': c.border,
    '--input': mixColors(c.border, c.text, 0.18),
    '--ring': ring,
    '--sidebar': sidebar,
    '--sidebar-foreground': mixColors(c.text, c.textMuted, 0.4),
    '--sidebar-primary': c.elevated,
    '--sidebar-primary-foreground': c.text,
    '--sidebar-accent': mixColors(sidebar, c.elevated, 0.55),
    '--sidebar-accent-foreground': c.text,
    '--sidebar-border': c.border,
    '--sidebar-ring': ring,

    '--accent': c.accent,
    '--accent-light': withAlpha(c.accent, light ? 0.12 : 0.18),
    '--accent-border': withAlpha(c.accent, light ? 0.3 : 0.36),
    '--accent-glow': light ? 'transparent' : withAlpha(c.accent, 0.26),
    '--accent-text': accentText,

    '--radius': `${radius / 16}rem`,
    '--radius-control': `${(radius * 0.8) / 16}rem`,
    '--radius-surface': `${(radius * 1.4) / 16}rem`,
    '--radius-dialog': `${(radius * 1.8) / 16}rem`,
    '--shadow-float': light ? '0 8px 24px rgba(20, 20, 20, 0.1)' : '0 18px 50px rgba(0, 0, 0, 0.4)',
    '--shadow-dialog': light ? '0 16px 40px rgba(20, 20, 20, 0.14)' : '0 28px 80px rgba(0, 0, 0, 0.52)',
  };

  for (const [step, amount] of ZINC_STEPS) tokens[`--color-zinc-${step}`] = mixColors(c.text, c.background, amount);
  return tokens;
}

export interface TerminalPalette {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  /** True when the background is light enough that the ANSI palette must be the dark-on-light variant. */
  light: boolean;
}

export function buildTerminalPalette(theme: Pick<CustomTheme, 'base' | 'colors'>): TerminalPalette {
  const c = resolveColors(theme.colors, theme.base);
  const foreground = contrastRatio(c.text, c.terminal) >= 7 ? c.text : readableOn(c.terminal, '#f5f5f5', '#1a1a1a');
  return {
    background: c.terminal,
    foreground,
    cursor: ensureContrast(c.accent, c.terminal, 3, foreground),
    cursorAccent: c.terminal,
    selectionBackground: mixColors(c.terminal, c.accent, 0.35),
    selectionForeground: foreground,
    light: relativeLuminance(c.terminal) > 0.3,
  };
}

/** Swatches for a theme card, ordered the way the app is layered. */
export const themeSwatches = (theme: Pick<CustomTheme, 'base' | 'colors'>): string[] => {
  const c = resolveColors(theme.colors, theme.base);
  return [c.background, c.surface, c.elevated, c.accent, c.text];
};

/* ── Accessibility ────────────────────────────────────────────────────── */

export type ContrastStatus = 'pass' | 'warn' | 'fail';

export interface ContrastCheck {
  id: string;
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  /** WCAG 2.x minimum for this kind of pairing (4.5 for text, 3 for UI marks). */
  minimum: number;
  status: ContrastStatus;
  grade: 'AAA' | 'AA' | null;
}

export const contrastStatus = (ratio: number, minimum: number): ContrastStatus =>
  ratio >= minimum ? 'pass' : ratio >= 3 ? 'warn' : 'fail';

export function getContrastChecks(theme: Pick<CustomTheme, 'base' | 'colors'>): ContrastCheck[] {
  const c = resolveColors(theme.colors, theme.base);
  const terminal = buildTerminalPalette(theme);
  const pairs: Array<[string, string, string, string, number]> = [
    ['text-background', 'Text on background', c.text, c.background, 4.5],
    ['text-surface', 'Text on panels', c.text, c.surface, 4.5],
    ['muted-background', 'Muted text on background', c.textMuted, c.background, 4.5],
    ['muted-surface', 'Muted text on panels', c.textMuted, c.surface, 4.5],
    ['accent-background', 'Accent on background', c.accent, c.background, 3],
    ['danger-background', 'Danger on background', c.danger, c.background, 3],
    ['terminal-text', 'Terminal text', terminal.foreground, c.terminal, 4.5],
  ];
  return pairs.map(([id, label, foreground, background, minimum]) => {
    const ratio = contrastRatio(foreground, background);
    return {
      id,
      label,
      foreground,
      background,
      ratio,
      minimum,
      status: contrastStatus(ratio, minimum),
      grade: minimum >= 4.5 && ratio >= 7 ? 'AAA' : ratio >= minimum ? 'AA' : null,
    };
  });
}

/**
 * Problems severe enough that the theme would make the app unreadable, which
 * would also make the settings screen needed to undo it unreadable. Saving is
 * blocked while any exist.
 */
export function getBlockingProblems(theme: Pick<CustomTheme, 'base' | 'colors'>): string[] {
  const c = resolveColors(theme.colors, theme.base);
  const problems: string[] = [];
  const check = (label: string, background: string): void => {
    if (contrastRatio(c.text, background) < 3) problems.push(`Text is unreadable on ${label} (needs at least 3:1 contrast).`);
  };
  check('the background', c.background);
  check('panels', c.surface);
  check('raised surfaces', c.elevated);
  return problems;
}

/* ── Creating, validating and sharing themes ──────────────────────────── */

const createId = (): string => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `theme-${random}`;
};

const cleanName = (value: unknown, fallback: string): string => {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, THEME_NAME_MAX_LENGTH).trim() : '';
  return name || fallback;
};

export function createCustomTheme(
  source: Pick<ThemePreset, 'base' | 'colors'> & { radius?: number },
  name: string,
  now: number = Date.now(),
): CustomTheme {
  return {
    id: createId(),
    name: cleanName(name, 'My theme'),
    base: source.base,
    colors: resolveColors(source.colors, source.base),
    radius: clampRadius(source.radius),
    createdAt: now,
    updatedAt: now,
  };
}

/** `My theme`, then `My theme 2`, `My theme 3`… so new themes never share a name by accident. */
export function uniqueThemeName(base: string, existing: ReadonlyArray<string>): string {
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/** Defensive copy used for anything that crosses a trust boundary (storage, import). */
export function sanitizeCustomTheme(input: unknown): CustomTheme | null {
  if (!isRecord(input) || !isRecord(input.colors)) return null;
  const rawBackground = normalizeHex(input.colors.background);
  const base: CustomThemeBase =
    input.base === 'light' || input.base === 'dark'
      ? input.base
      : rawBackground && relativeLuminance(rawBackground) > 0.4
        ? 'light'
        : 'dark';
  const now = Date.now();
  return {
    id: typeof input.id === 'string' && /^[\w-]{1,80}$/.test(input.id) ? input.id : createId(),
    name: cleanName(input.name, 'Custom theme'),
    base,
    colors: resolveColors(input.colors, base),
    radius: clampRadius(input.radius),
    createdAt: typeof input.createdAt === 'number' && Number.isFinite(input.createdAt) ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt) ? input.updatedAt : now,
  };
}

export function sanitizeCustomThemes(input: unknown): CustomTheme[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const themes: CustomTheme[] = [];
  for (const item of input) {
    const theme = sanitizeCustomTheme(item);
    if (!theme || seen.has(theme.id)) continue;
    seen.add(theme.id);
    themes.push(theme);
    if (themes.length >= MAX_CUSTOM_THEMES) break;
  }
  return themes;
}

export function themesEqual(a: CustomTheme, b: CustomTheme): boolean {
  return (
    a.name === b.name &&
    a.base === b.base &&
    a.radius === b.radius &&
    THEME_COLOR_KEYS.every((key) => a.colors[key] === b.colors[key])
  );
}

export function serializeCustomTheme(theme: CustomTheme): string {
  const colors = resolveColors(theme.colors, theme.base);
  return JSON.stringify(
    { format: THEME_FILE_FORMAT, version: THEME_FILE_VERSION, name: theme.name, base: theme.base, radius: clampRadius(theme.radius), colors },
    null,
    2,
  );
}

export type ThemeImportResult = { ok: true; theme: CustomTheme } | { ok: false; error: string };

/** Parse a shared theme file. Strict on purpose: bad input is reported, never silently repaired. */
export function parseCustomThemeFile(text: string): ThemeImportResult {
  if (text.length > THEME_FILE_MAX_CHARS) return { ok: false, error: 'This file is too large to be a theme.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not valid JSON.' };
  }
  if (!isRecord(data) || data.format !== THEME_FILE_FORMAT) {
    return { ok: false, error: 'This is not a YzPzCode theme file.' };
  }
  if (typeof data.version !== 'number' || data.version < 1 || data.version > THEME_FILE_VERSION) {
    return { ok: false, error: 'This theme was made by a newer version of YzPzCode. Update the app to import it.' };
  }
  if (!isRecord(data.colors)) return { ok: false, error: 'The theme file has no colors.' };
  for (const key of THEME_COLOR_KEYS) {
    if (key in data.colors && normalizeHex(data.colors[key]) === null) {
      return { ok: false, error: `The "${key}" color is not a valid hex color.` };
    }
  }
  const theme = sanitizeCustomTheme({ ...data, id: undefined, createdAt: undefined, updatedAt: undefined });
  if (!theme) return { ok: false, error: 'The theme file could not be read.' };
  return { ok: true, theme };
}
