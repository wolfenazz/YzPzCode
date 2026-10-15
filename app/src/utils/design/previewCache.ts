// Keys and sizes for the small pictures drawn in place of boards that are far from the view
// (or while zoomed far out), so a project with many screens stays light. Pure
// (`npm run test:design`); the rendering itself is in `useBoardPreviews`.

import type { Board, DesignTokens } from './types';

/** A short, stable hash of a string (FNV-1a, 32 bit) as hex. */
export function hashString(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** The scale a preview is drawn at: about 480 px wide, never taller than 2400 px. */
export function previewScale(width: number, height: number, maxWidth = 480, maxHeight = 2400): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(1, maxWidth / width, maxHeight / height);
}

/** What the system looks like to a board: anything that changes the picture changes this. */
export function systemSignature(tokens: DesignTokens): string {
  return hashString(JSON.stringify([tokens.palette, tokens.darkPalette ?? null, tokens.fonts, tokens.type, tokens.radius, tokens.spacing, tokens.headingWeight, tokens.lineHeight, tokens.borderWidth, tokens.shadow]));
}

/** A board's preview is current while this stays the same. */
export function previewKey(board: Pick<Board, 'source' | 'width' | 'height' | 'theme' | 'tweakValues'>, systemKey: string): string {
  return [hashString(board.source), board.source.length, board.width, board.height, board.theme ?? 'light', hashString(JSON.stringify(board.tweakValues ?? {})), systemKey].join('|');
}
