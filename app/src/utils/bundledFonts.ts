// The fonts packaged with the app (`writing/fontCatalog.ts`, source "bundled").
// A document that uses one gets its files registered with the webview as
// FontFaces, so the editor, the filmstrip and text measuring draw it; the
// exports that cannot reach the app's fonts (PDF in a separate print view, PNG
// through an SVG image, a standalone HTML file) embed the same files as
// base64 `@font-face` rules.

import { BUNDLED_FONT_FILES, type BundledFontFace } from './bundledFontFiles';
import { catalogFont } from './writing/fontCatalog';

/** The catalog name of a bundled family (case-insensitive), or null when it is not one. */
export function bundledFamily(name: string | null | undefined): string | null {
  const entry = catalogFont(name);
  return entry && BUNDLED_FONT_FILES[entry.name] ? entry.name : null;
}

/** Every bundled family a piece of markup or CSS names. */
export function bundledFamiliesIn(text: string): string[] {
  const out: string[] = [];
  for (const family of Object.keys(BUNDLED_FONT_FILES)) {
    if (text.includes(family)) out.push(family);
  }
  return out;
}

const registered = new Map<string, Promise<boolean>>();

async function addFaces(family: string, faces: BundledFontFace[], eager: boolean): Promise<boolean> {
  let any = false;
  await Promise.all(faces.map(async (face) => {
    try {
      const url = await face.load();
      const fontFace = new FontFace(family, `url(${url}) format('woff2')`, { weight: String(face.weight), unicodeRange: face.range, display: 'swap' });
      document.fonts.add(fontFace);
      // Registered faces download when text first needs them; measuring needs them now.
      if (eager) await fontFace.load();
      any = true;
    } catch (error) {
      console.warn(`Could not load ${family} (${face.subset} ${face.weight}):`, error);
    }
  }));
  return any;
}

/**
 * Registers a bundled family with the document. `eager` also downloads its
 * files (text is measured with them); otherwise they download on first use.
 * Resolves false for a family that is not bundled.
 */
export function registerBundledFont(name: string, eager = true): Promise<boolean> {
  const family = bundledFamily(name);
  if (!family) return Promise.resolve(false);
  const key = `${family}|${eager ? 'eager' : 'lazy'}`;
  let task = registered.get(key);
  if (!task) {
    // An eager request after a lazy one registers nothing twice: only the download is awaited.
    const lazyDone = registered.get(`${family}|lazy`);
    task = lazyDone && eager
      ? lazyDone.then(async () => {
        await Promise.all(Array.from(document.fonts).filter((face) => face.family.replace(/["']/g, '') === family).map((face) => face.load().catch(() => face)));
        return true;
      })
      : addFaces(family, BUNDLED_FONT_FILES[family], eager);
    registered.set(key, task);
  }
  return task;
}

/** Registers every bundled family (without downloading), so a font picker can preview each in its own face. */
export function registerAllBundledFonts(): Promise<void> {
  return Promise.all(Object.keys(BUNDLED_FONT_FILES).map((family) => registerBundledFont(family, false))).then(() => undefined);
}

// Embedding -----------------------------------------------------------------------------------

const dataCache = new Map<string, Promise<string>>();

async function dataUrl(face: BundledFontFace): Promise<string> {
  const url = await face.load();
  let task = dataCache.get(url);
  if (!task) {
    task = fetch(url).then((response) => response.arrayBuffer()).then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return `data:font/woff2;base64,${btoa(binary)}`;
    });
    dataCache.set(url, task);
  }
  return task;
}

/**
 * `@font-face` rules that embed the bundled families among `families`
 * (base64, nothing external), for documents drawn outside the app's page.
 * Empty when none of them is bundled.
 */
export async function bundledFontFaceCss(families: Iterable<string>): Promise<string> {
  const wanted = [...new Set([...families].map((name) => bundledFamily(name)).filter((name): name is string => name !== null))];
  const rules = await Promise.all(wanted.flatMap((family) => BUNDLED_FONT_FILES[family].map(async (face) => {
    try {
      return `@font-face{font-family:'${family}';font-style:normal;font-weight:${face.weight};src:url(${await dataUrl(face)}) format('woff2');unicode-range:${face.range};}`;
    } catch {
      return '';
    }
  })));
  return rules.filter(Boolean).join('\n');
}
