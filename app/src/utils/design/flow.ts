// Prototype flow: which screens an element leads to (`data-goto="<board name>"`), the arrows
// between boards, responsive copies and screen states. Pure, no DOM (`npm run test:design`).

import { parseMarkup } from './domTree';
import type { Rect } from './snap';
import type { Board } from './types';

export interface GotoLink {
  /** The stamp of the element that carries the link. */
  yz: string;
  /** The board name it asks for, as written. */
  target: string;
}

/** The elements of a board's markup that lead to another board. */
export function gotoLinks(source: string): GotoLink[] {
  if (!source.includes('data-goto')) return [];
  return parseMarkup(source).nodes
    .filter((node) => (node.attrs['data-goto'] ?? '').trim())
    .map((node) => ({ yz: node.id, target: node.attrs['data-goto'].trim() }));
}

const fold = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
/** "Home · Phone" and "Home" are the same screen as far as a link is concerned. */
const base = (value: string): string => fold(value.split(' · ')[0]);

/** The board a link means: exact name, then name without a size suffix, then the only board that starts with it. */
export function resolveGoto(boards: Board[], name: string, from?: string): Board | null {
  const wanted = fold(name);
  if (!wanted) return null;
  const pool = boards.filter((board) => !board.hidden && board.id !== from);
  const exact = pool.find((board) => fold(board.name) === wanted);
  const family = pool.filter((board) => base(board.name) === base(name));
  // A screen on a tablet copy leads to the tablet copy of its target, unless the link names a size.
  const origin = boards.find((board) => board.id === from);
  if (origin && !name.includes(' · ')) {
    const sameSize = family.find((board) => board.width === origin.width);
    if (sameSize) return sameSize;
  }
  if (exact) return exact;
  if (family.length > 0) return family[0];
  const starts = pool.filter((board) => fold(board.name).startsWith(wanted));
  return starts.length === 1 ? starts[0] : null;
}

export interface FlowLink {
  from: string;
  to: string;
  count: number;
}

/** One arrow per pair of boards, with how many elements lead there. */
export function boardLinks(boards: Board[]): FlowLink[] {
  const counts = new Map<string, FlowLink>();
  for (const board of boards) {
    if (board.hidden || board.format !== 'html') continue;
    for (const link of gotoLinks(board.source)) {
      const target = resolveGoto(boards, link.target, board.id);
      if (!target) continue;
      const key = `${board.id}>${target.id}`;
      const found = counts.get(key);
      if (found) found.count += 1;
      else counts.set(key, { from: board.id, to: target.id, count: 1 });
    }
  }
  return Array.from(counts.values());
}

/** Links that name a board which does not exist (for a warning in the inspector). */
export function brokenLinks(boards: Board[], board: Board): GotoLink[] {
  return gotoLinks(board.source).filter((link) => !resolveGoto(boards, link.target, board.id));
}

export interface ScreenState {
  id: string;
  label: string;
  instruction: string;
}

/** The states a screen usually needs besides its normal one. */
export const SCREEN_STATES: ScreenState[] = [
  { id: 'empty', label: 'Empty', instruction: 'Draw the EMPTY state of this screen: nothing has been added yet. Keep the frame, header and navigation; replace the content with a calm illustration or icon, one short line saying why it is empty, and one primary action.' },
  { id: 'loading', label: 'Loading', instruction: 'Draw the LOADING state of this screen: keep the frame, header and navigation and replace the content with skeleton blocks in the real layout (grey rounded bars where text and pictures will be). No spinner alone and no real data.' },
  { id: 'error', label: 'Error', instruction: 'Draw the ERROR state of this screen: keep the frame, header and navigation; say what went wrong in plain words, what the person can do, and give a Try again button. No technical codes.' },
  { id: 'success', label: 'Success', instruction: 'Draw the SUCCESS state of this screen: keep the frame and navigation; confirm what was done with a clear mark, the result in one or two lines, and the next step as a button.' },
];

/** A name for a copy: "Home · Mobile" (an existing suffix is replaced). */
export function versionName(name: string, label: string): string {
  return `${name.split(' · ')[0]} · ${label}`;
}

/**
 * Where a copy goes: directly beneath the original, moved further down while it would sit on
 * another board.
 */
export function belowPosition(original: Rect, others: Rect[], size: { width: number; height: number }, gap = 140): { x: number; y: number } {
  let y = original.y + original.height + gap;
  const x = original.x;
  for (let guard = 0; guard < 50; guard += 1) {
    const hit = others.find((rect) => rect.x < x + size.width && rect.x + rect.width > x && rect.y < y + size.height && rect.y + rect.height > y);
    if (!hit) break;
    y = hit.y + hit.height + gap;
  }
  return { x, y };
}

export interface VersionTarget {
  id: string;
  label: string;
}

/** Sizes worth a copy of a screen, other than the one it already has. */
export function versionTargets(kind: 'app' | 'web' | 'graphic', currentPreset: string | undefined): VersionTarget[] {
  const all: VersionTarget[] = kind === 'web'
    ? [{ id: 'mobile-web', label: 'Mobile' }, { id: 'tablet', label: 'Tablet' }, { id: 'laptop', label: 'Laptop' }, { id: 'desktop', label: 'Desktop' }]
    : kind === 'app'
      ? [{ id: 'tablet', label: 'Tablet' }, { id: 'phone-large', label: 'Large phone' }, { id: 'phone', label: 'Phone' }]
      : [];
  return all.filter((target) => target.id !== currentPreset);
}
