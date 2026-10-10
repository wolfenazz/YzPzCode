// Makes the fonts a deck uses available to the webview, so slides draw and
// wrap their text as PowerPoint does. Installed fonts need nothing; Office's
// cloud fonts (Aptos, Merriweather, Open Sans… downloaded by Office into
// %LOCALAPPDATA%\Microsoft\FontCache\4\CloudFonts\<family>\*.ttf) are not
// installed system-wide, so they are registered here as FontFaces.

import { invoke } from '@tauri-apps/api/core';
import type JSZip from 'jszip';
import { localDataDir } from '@tauri-apps/api/path';
import type { FileEntry } from '../../types';
import { readFileBytes } from '../../utils/presentation/assets';
import { fontStack } from '../../utils/presentation/slideModel';
import { joinPath } from '../../utils/writing/document';

const settled = new Map<string, Promise<boolean>>();
let measureContext: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

/** Text width with the font stack the slides use, so wrapping matches what is drawn. */
export function measureSlideText(text: string, font: string, sizePx: number, bold: boolean, italic: boolean): number {
  const key = `${italic ? 'i' : ''}${bold ? 'b' : ''}${sizePx}|${font}|${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return text.length * sizePx * 0.55;
  measureContext.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${sizePx}px ${fontStack(font)}`;
  const width = measureContext.measureText(text).width;
  if (widthCache.size > 20000) widthCache.clear();
  widthCache.set(key, width);
  return width;
}

/** Forget measured widths (after fonts finish loading). */
export const clearMeasureCache = (): void => widthCache.clear();
let probe: CanvasRenderingContext2D | null = null;

/** Whether a family resolves to a real font (its metrics differ from every fallback). */
export function fontAvailable(family: string): boolean {
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe) return true;
  const sample = 'mmmmmmmmmmlli1WQ@#';
  const name = family.replace(/["\\]/g, '');
  return ['monospace', 'serif', 'sans-serif'].some((fallback) => {
    probe!.font = `72px ${fallback}`;
    const base = probe!.measureText(sample).width;
    probe!.font = `72px "${name}", ${fallback}`;
    return probe!.measureText(sample).width !== base;
  });
}

/** Weight and italic flag of a TrueType/OpenType file, from its OS/2 table. */
function faceStyle(bytes: Uint8Array): { weight: number; italic: boolean } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = view.getUint16(4);
  for (let i = 0; i < tables; i += 1) {
    const at = 12 + i * 16;
    if (at + 16 > bytes.length) break;
    const tag = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
    if (tag !== 'OS/2') continue;
    const offset = view.getUint32(at + 8);
    if (offset + 64 > bytes.length) break;
    return { weight: view.getUint16(offset + 4) || 400, italic: (view.getUint16(offset + 62) & 1) === 1 };
  }
  return { weight: 400, italic: false };
}

let cloudRoot: Promise<string | null> | null = null;
const cloudFontsDir = (): Promise<string | null> => {
  cloudRoot ??= localDataDir()
    .then((dir) => joinPath(dir, 'Microsoft', 'FontCache', '4', 'CloudFonts'))
    .catch(() => null);
  return cloudRoot;
};

async function loadCloudFamily(family: string): Promise<boolean> {
  const root = await cloudFontsDir();
  if (!root) return false;
  const folder = joinPath(root, family);
  if (!(await invoke<boolean>('path_exists', { path: folder }).catch(() => false))) return false;
  const files = await invoke<FileEntry[]>('list_directory_entries', { path: folder }).catch(() => [] as FileEntry[]);
  let loaded = 0;
  for (const file of files.filter((entry) => !entry.isDir && /\.(ttf|otf)$/i.test(entry.name))) {
    try {
      const bytes = await readFileBytes(file.path);
      const { weight, italic } = faceStyle(bytes);
      const face = new FontFace(family, bytes, { weight: String(weight), style: italic ? 'italic' : 'normal' });
      document.fonts.add(await face.load());
      loaded += 1;
    } catch (error) {
      console.warn(`Could not load the font ${family} from ${file.path}:`, error);
    }
  }
  if (loaded > 0) clearMeasureCache();
  return loaded > 0;
}

/** Makes each family usable when it is not installed. Resolves once every family has been tried. */
export async function ensureFonts(families: Iterable<string>): Promise<void> {
  const tasks: Array<Promise<boolean>> = [];
  for (const raw of families) {
    const family = raw.trim();
    if (!family || family.startsWith('+') || /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(family)) continue;
    let task = settled.get(family.toLowerCase());
    if (!task) {
      task = fontAvailable(family) ? Promise.resolve(true) : loadCloudFamily(family).catch(() => false);
      settled.set(family.toLowerCase(), task);
    }
    tasks.push(task);
  }
  await Promise.all(tasks);
}

/** The font families a .pptx names (theme fonts and every run). */
export async function pptxFontFamilies(zip: JSZip): Promise<Set<string>> {
  const families = new Set<string>();
  for (const file of zip.file(/^ppt\/(slides|slideLayouts|slideMasters|theme)\/[^/]+\.xml$/)) {
    const text = await file.async('string');
    for (const match of text.matchAll(/typeface="([^"]+)"/g)) families.add(match[1]);
  }
  return families;
}

/** The first family of every font-family stack in slide SVG. */
export function svgFontFamilies(svgs: string[]): Set<string> {
  const families = new Set<string>();
  for (const svg of svgs) {
    for (const match of svg.matchAll(/font-family="([^"]+)"/g)) {
      const first = match[1].split(',')[0]?.trim().replace(/^(&apos;|&quot;|['"])|(&apos;|&quot;|['"])$/g, '');
      if (first) families.add(first);
    }
  }
  return families;
}
