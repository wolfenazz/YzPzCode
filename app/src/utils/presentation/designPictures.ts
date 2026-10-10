// Pictures for AI-designed decks: finding the folders and files a description
// mentions, picking the usable pictures in a folder, and naming them inside
// the deck's `assets/` folder. Dependency-free (tested by `npm run test:presentation`).

export const PICTURE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
/** Pictures one deck takes from the description, folders and picked files together. */
export const MAX_DECK_PICTURES = 40;

const extensionOf = (name: string): string => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
export const isPictureName = (name: string): boolean => PICTURE_EXTENSIONS.includes(extensionOf(name));

/** A path written in a description, with the shorter readings to try when the longest does not exist. */
export interface MentionedPath {
  /** The text as written (without a leading `@`). */
  raw: string;
  /** Longest first: the path may run into the words after it. */
  candidates: string[];
}

const TRAILING = /[\s.,;:!?)\]}'"`»]+$/;

/** Every reading of `text` that ends at a word boundary, longest first. */
function readings(text: string): string[] {
  const out: string[] = [];
  let rest = text.replace(TRAILING, '');
  while (rest) {
    if (!out.includes(rest)) out.push(rest);
    const cut = rest.search(/\s+\S*$/);
    if (cut <= 0) break;
    rest = rest.slice(0, cut).replace(TRAILING, '');
  }
  return out;
}

/**
 * Folder and file paths in a description: absolute Windows (`C:\…`) and POSIX
 * (`/home/…`) paths, with or without a leading `@`, and `@relative/paths`
 * resolved against `base`. A path ends at a line break or quote; spaces are
 * allowed, so each mention carries shorter readings too.
 */
export function findMentionedPaths(text: string, base = ''): MentionedPath[] {
  const found = new Map<string, MentionedPath>();
  const add = (raw: string, resolve: (value: string) => string): void => {
    const candidates = readings(raw).map(resolve).filter((value) => value.length > 3);
    if (candidates.length > 0 && !found.has(candidates[0].toLowerCase())) found.set(candidates[0].toLowerCase(), { raw: readings(raw)[0], candidates });
  };
  for (const match of text.matchAll(/(?:^|[\s(["'`])@?([A-Za-z]:[\\/][^\n\r"'`<>|*?]*)/g)) add(match[1], (value) => value);
  for (const match of text.matchAll(/(?:^|[\s(["'`])@?(\/(?:[\w.-]+\/)+[^\n\r"'`<>|*?]*|\/[\w.-]+\/?)(?=$|[\s)\]"'`])/g)) {
    if (match[1].split('/').filter(Boolean).length >= 2) add(match[1], (value) => value);
  }
  if (base) {
    const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
    for (const match of text.matchAll(/(?:^|[\s(["'`])@((?:\.{1,2}[\\/])?[\w-][\w .-]*(?:[\\/][\w .-]+)*)/g)) {
      // `@C:\…` is an absolute path, read above.
      if (text[(match.index ?? 0) + match[0].length] === ':') continue;
      add(match[1], (value) => `${base.replace(/[\\/]+$/, '')}${sep}${value.replace(/^\.[\\/]/, '').replace(/[\\/]/g, sep)}`);
    }
  }
  return [...found.values()];
}

/** Numbered files in one folder beyond this count are a frame sequence (video stills, sprites). */
const SEQUENCE_MIN = 8;

/**
 * The pictures to take from a folder listing: picture files only, one per
 * name when the same picture comes in several formats (PNG and JPEG are
 * preferred over WebP and GIF, which PowerPoint reads less well), a frame
 * sequence (frame-001 … frame-240) reduced to its first frame, sorted by
 * path so the order is stable.
 */
export function folderPictures<T extends { name: string; path: string }>(entries: T[]): T[] {
  const rank = (name: string): number => ['png', 'jpg', 'jpeg', 'webp', 'gif'].indexOf(extensionOf(name));
  const folderOf = (entry: T): string => entry.path.slice(0, entry.path.length - entry.name.length).toLowerCase();
  const byStem = new Map<string, T>();
  for (const entry of entries) {
    if (!isPictureName(entry.name)) continue;
    const stem = `${folderOf(entry)}${entry.name.replace(/\.[^.]+$/, '').toLowerCase()}`;
    const current = byStem.get(stem);
    if (!current || rank(entry.name) < rank(current.name)) byStem.set(stem, entry);
  }
  const sorted = [...byStem.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  const sequenceOf = (entry: T): string | null => {
    const match = entry.name.match(/^(.*?)\d{2,}\.[^.]+$/);
    return match ? `${folderOf(entry)}${match[1].toLowerCase()}` : null;
  };
  const sizes = new Map<string, number>();
  for (const entry of sorted) {
    const key = sequenceOf(entry);
    if (key !== null) sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  const kept = new Set<string>();
  return sorted.filter((entry) => {
    const key = sequenceOf(entry);
    if (key === null || (sizes.get(key) ?? 0) < SEQUENCE_MIN) return true;
    if (kept.has(key)) return false;
    kept.add(key);
    return true;
  });
}

/** A file name for a picture inside `assets/`, unique within `used` (lower-case names, updated). */
export function assetName(path: string, used: Set<string>): string {
  const original = path.split(/[\\/]/).pop() ?? '';
  const base = original.replace(/\.+(?=\.[^.]+$)/, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+/, '') || 'picture.png';
  let name = base;
  for (let counter = 2; used.has(name.toLowerCase()); counter += 1) name = base.replace(/(\.[^.]+)?$/, `-${counter}$1`);
  used.add(name.toLowerCase());
  return name;
}

/**
 * The deck picture a reply names: an exact `assets/…` path, or the same file
 * name in any case or with a different folder. Null when it names none.
 */
export function matchPicture(value: unknown, known: string[]): string | null {
  if (typeof value !== 'string') return null;
  const wanted = value.trim().replace(/^\.\//, '').toLowerCase();
  if (!wanted) return null;
  const exact = known.find((path) => path.toLowerCase() === wanted);
  if (exact) return exact;
  const name = wanted.split(/[\\/]/).pop()!;
  return known.find((path) => path.toLowerCase().split('/').pop() === name) ?? null;
}

/** Distinct deck pictures from a list the AI returned, at most `max`. */
export function matchPictures(value: unknown, known: string[], max = 3): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const path = matchPicture(entry, known);
    if (path && !out.includes(path)) out.push(path);
    if (out.length >= max) break;
  }
  return out;
}
