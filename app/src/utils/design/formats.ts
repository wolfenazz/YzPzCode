// Canvas size presets for the Design studio.

import type { DesignKind } from './types';

export interface FormatPreset {
  id: string;
  kind: DesignKind;
  label: string;
  group: string;
  width: number;
  height: number;
}

const p = (id: string, kind: DesignKind, group: string, label: string, width: number, height: number): FormatPreset => ({ id, kind, group, label, width, height });

export const FORMAT_PRESETS: FormatPreset[] = [
  p('phone', 'app', 'Phone', 'Phone', 390, 844),
  p('phone-large', 'app', 'Phone', 'Large phone', 430, 932),
  p('tablet', 'app', 'Tablet', 'Tablet', 820, 1180),

  p('desktop', 'web', 'Desktop', 'Desktop', 1440, 900),
  p('laptop', 'web', 'Desktop', 'Laptop', 1280, 800),
  p('mobile-web', 'web', 'Mobile', 'Mobile web', 390, 844),
  p('email', 'web', 'Email', 'Email (600 wide)', 600, 900),

  p('ig-post', 'graphic', 'Social', 'Instagram post', 1080, 1080),
  p('ig-portrait', 'graphic', 'Social', 'Instagram portrait', 1080, 1350),
  p('story', 'graphic', 'Social', 'Story / Reel', 1080, 1920),
  p('x-header', 'graphic', 'Social', 'X header', 1500, 500),
  p('linkedin-banner', 'graphic', 'Social', 'LinkedIn banner', 1584, 396),
  p('facebook-cover', 'graphic', 'Social', 'Facebook cover', 1640, 624),
  p('yt-thumb', 'graphic', 'Video', 'YouTube thumbnail', 1280, 720),
  p('yt-banner', 'graphic', 'Video', 'YouTube banner', 2560, 1440),
  p('web-hero', 'graphic', 'Web', 'Web hero', 1920, 1080),
  p('linkedin-post', 'graphic', 'Social', 'LinkedIn post', 1200, 627),
  p('pinterest', 'graphic', 'Social', 'Pinterest pin', 1000, 1500),
  p('og-image', 'graphic', 'Web', 'Link preview', 1200, 630),
  p('leaderboard', 'graphic', 'Ads', 'Leaderboard ad', 728, 90),
  p('rectangle', 'graphic', 'Ads', 'Rectangle ad', 300, 250),
  p('halfpage', 'graphic', 'Ads', 'Half-page ad', 300, 600),
  p('skyscraper', 'graphic', 'Ads', 'Skyscraper ad', 160, 600),
  p('business-card', 'graphic', 'Print', 'Business card', 1050, 600),
  p('certificate', 'graphic', 'Print', 'Certificate (A4 landscape)', 1754, 1240),
  p('poster-a4', 'graphic', 'Print', 'A4 poster', 1240, 1754),
  p('poster-letter', 'graphic', 'Print', 'US Letter poster', 1275, 1650),
  p('logo', 'graphic', 'Other', 'Square logo', 1024, 1024),
];

export const DEFAULT_PRESET: Record<DesignKind, string> = { app: 'phone', web: 'desktop', graphic: 'ig-post' };

export const MIN_CANVAS = 64;
export const MAX_CANVAS = 8000;

export function presetsFor(kind: DesignKind): FormatPreset[] {
  return FORMAT_PRESETS.filter((preset) => preset.kind === kind);
}

export function findPreset(id: string | undefined): FormatPreset | undefined {
  return FORMAT_PRESETS.find((preset) => preset.id === id);
}

export function clampCanvas(value: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MIN_CANVAS;
  return Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, n));
}

/** "1080 × 1350" */
export function sizeLabel(width: number, height: number): string {
  return `${width} × ${height}`;
}

/** Reduced ratio such as "4:5"; "" when it is not a tidy one. */
export function aspectLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(width, height);
  const w = width / d;
  const h = height / d;
  return w <= 32 && h <= 32 ? `${w}:${h}` : '';
}

export interface ResolvedFormat {
  id: string;
  label: string;
  width: number;
  height: number;
}

/** A preset id, or a custom size written `1200x628`, `1200 × 628` or `1200 by 628`. */
export function resolveFormat(id: string): ResolvedFormat | null {
  const preset = findPreset(id);
  if (preset) return { id: preset.id, label: preset.label, width: preset.width, height: preset.height };
  const custom = /^\s*(\d{2,4})\s*(?:x|×|by|\*)\s*(\d{2,4})\s*$/i.exec(id);
  if (!custom) return null;
  const width = clampCanvas(Number(custom[1]));
  const height = clampCanvas(Number(custom[2]));
  return { id: `${width}x${height}`, label: `Custom ${width} × ${height}`, width, height };
}
