// Colour helpers for designed decks: hex parsing, WCAG contrast, and the
// dominant colours of a picture (so engines that cannot see images still get
// its palette). Dependency-free.

export function normalizeHex(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const short = text.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  const long = text.match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  return long ? `#${long[1]}`.toUpperCase() : null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex) ?? '#000000';
  return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16)) as [number, number, number];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Mixes `hex` toward `toward` by `amount` (0–1). */
export function mix(hex: string, toward: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(toward);
  return rgbToHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
}

/** `color`, pushed toward black or white until it reaches `ratio` against `background`. */
export function ensureContrast(color: string, background: string, ratio: number): string {
  if (contrastRatio(color, background) >= ratio) return color;
  const target = luminance(background) > 0.4 ? '#000000' : '#FFFFFF';
  for (let step = 1; step <= 10; step += 1) {
    const candidate = mix(color, target, step / 10);
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return target;
}

/**
 * The most common colours of an RGBA pixel buffer (a picture scaled down to
 * a few thousand pixels), most common first. Near-identical colours merge;
 * transparent pixels are ignored.
 */
export function dominantColors(rgba: ArrayLike<number>, count = 5): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += rgba[i];
    bucket.g += rgba[i + 1];
    bucket.b += rgba[i + 2];
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((bucket) => ({ n: bucket.n, rgb: [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n] }));
  const picked: Array<{ n: number; rgb: number[] }> = [];
  for (const candidate of ranked) {
    const near = picked.find((entry) => Math.hypot(entry.rgb[0] - candidate.rgb[0], entry.rgb[1] - candidate.rgb[1], entry.rgb[2] - candidate.rgb[2]) < 48);
    if (near) near.n += candidate.n;
    else picked.push(candidate);
    if (picked.length >= count * 3) break;
  }
  return picked.sort((a, b) => b.n - a.n).slice(0, count).map((entry) => rgbToHex(entry.rgb[0], entry.rgb[1], entry.rgb[2]));
}
