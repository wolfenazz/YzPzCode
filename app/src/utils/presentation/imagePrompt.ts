// A ready-to-paste prompt for the user's own image generator, written
// without the AI from the slide and the deck's theme. Dependency-free.

import { luminance } from './themes';
import type { DeckTheme } from './types';

const COLOUR_NAMES: Array<[string, [number, number, number]]> = [
  ['navy', [20, 33, 61]], ['blue', [31, 78, 158]], ['bright blue', [37, 99, 235]], ['sky blue', [125, 180, 240]], ['teal', [14, 116, 144]],
  ['green', [58, 107, 53]], ['emerald', [16, 185, 129]], ['gold', [217, 154, 43]], ['orange', [249, 115, 22]],
  ['coral', [244, 132, 95]], ['red', [220, 38, 38]], ['crimson', [140, 28, 19]], ['pink', [219, 39, 119]],
  ['violet', [109, 40, 217]], ['charcoal', [38, 38, 38]], ['white', [250, 250, 250]], ['sand', [233, 229, 214]],
];

/** The nearest everyday name for a #rrggbb colour. */
export function colourName(hex: string): string {
  const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  let best = COLOUR_NAMES[0];
  let distance = Infinity;
  for (const entry of COLOUR_NAMES) {
    const d = entry[1].reduce((sum, value, index) => sum + (value - rgb[index]) ** 2, 0);
    if (d < distance) {
      distance = d;
      best = entry;
    }
  }
  return best[0];
}

export function localImagePrompt(subject: string, slideTitle: string, theme: DeckTheme, orientation: 'landscape' | 'portrait' = 'landscape'): string {
  const what = subject.trim() || slideTitle.trim() || 'an abstract image that supports the slide';
  const palette = [theme.palette.accent1, theme.palette.accent2].map(colourName);
  const mood = luminance(theme.palette.background) < 0.2 ? 'dark, moody, low-key lighting' : 'bright, airy, soft natural light';
  return [
    `Professional editorial photograph of ${what}.`,
    slideTitle && subject ? `It illustrates the idea: "${slideTitle.trim()}".` : '',
    `Composition with clear negative space, shallow depth of field, ${mood}.`,
    `Colour palette leaning towards ${palette[0]} and ${palette[1]}.`,
    `${orientation === 'landscape' ? 'Landscape 16:9' : 'Portrait 3:4'}, high resolution. No text, no logos, no watermarks.`,
  ].filter(Boolean).join(' ');
}
