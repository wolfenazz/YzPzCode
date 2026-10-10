// Browser-side helpers for AI-designed decks: what a picture looks like (for
// engines that cannot see it), text measurement for the PowerPoint export,
// and slide SVG made self-contained (pictures inlined) for PNG, PDF and HTML.

import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from '../../types';
import { dominantColors } from '../../utils/presentation/designColors';
import { folderPictures, MAX_DECK_PICTURES, PICTURE_EXTENSIONS } from '../../utils/presentation/designPictures';
import { designCanvas } from '../../utils/presentation/designStyles';
import type { DesignedSlide } from '../../utils/presentation/designTypes';
import { base64ToBytes, isAbsolutePath, toPowerPointImage, writeFileBytes } from '../../utils/presentation/assets';
import { prepareSvgForDisplay, svgAssetRefs } from '../../utils/presentation/svgSafe';
import type { PptxPicture } from '../../utils/presentation/svgPptx';
import type { DeckSize, SlideTransition } from '../../utils/presentation/types';
import { joinPath } from '../../utils/writing/document';

export const IMAGE_EXTENSIONS = PICTURE_EXTENSIONS;

async function decode(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  await image.decode();
  return image;
}

/** Pixel size and dominant colours of a picture (a data URL). */
export async function pictureInfo(dataUrl: string): Promise<{ width: number; height: number; colors: string[] }> {
  const image = await decode(dataUrl);
  const width = image.naturalWidth || 1;
  const height = image.naturalHeight || 1;
  const scale = Math.min(1, 64 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, colors: dominantColors(data, 5) };
}

let measureContext: CanvasRenderingContext2D | null = null;

/** Real text width with the installed font, for placing PowerPoint text frames. */
export function measureText(text: string, font: string, sizePx: number, bold: boolean, italic: boolean): number {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return text.length * sizePx * 0.55;
  measureContext.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${sizePx}px "${font.replace(/"/g, '')}", "Segoe UI", sans-serif`;
  return measureContext.measureText(text).width;
}

const resolvePath = (href: string, deckDir: string): string => (isAbsolutePath(href) ? href : joinPath(deckDir, href));

/** Every picture the slides use, as data URLs keyed by href. */
export async function loadSlidePictures(slides: Array<Pick<DesignedSlide, 'svg'>>, deckDir: string): Promise<Map<string, string>> {
  const hrefs = new Set(slides.flatMap((slide) => svgAssetRefs(slide.svg)));
  const out = new Map<string, string>();
  await Promise.all([...hrefs].map(async (href) => {
    try {
      out.set(href, await invoke<string>('read_file_as_base64', { path: resolvePath(href, deckDir) }));
    } catch (error) {
      console.warn(`Could not load picture ${href}:`, error);
    }
  }));
  return out;
}

/** Pictures in a form PowerPoint reads (PNG / JPEG / GIF), with their pixel size. */
export async function pptxPictures(pictures: Map<string, string>, slides: Array<Pick<DesignedSlide, 'svg'>>): Promise<Map<string, PptxPicture>> {
  const out = new Map<string, PptxPicture>();
  const inline = new Set(slides.flatMap((slide) => [...slide.svg.matchAll(/\s(?:xlink:)?href="(data:image\/[^"]+)"/g)].map((match) => match[1])));
  const sources = new Map<string, string>([...pictures, ...[...inline].map((uri) => [uri, uri] as [string, string])]);
  await Promise.all([...sources].map(async ([href, dataUrl]) => {
    try {
      const usable = await toPowerPointImage(dataUrl);
      const image = await decode(usable);
      const mime = usable.slice(5, usable.indexOf(';'));
      const ext = mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpeg' : mime === 'image/gif' ? 'gif' : 'png';
      out.set(href, { data: base64ToBytes(usable), ext, width: image.naturalWidth, height: image.naturalHeight });
    } catch (error) {
      console.warn(`Could not prepare picture ${href.slice(0, 60)}:`, error);
    }
  }));
  return out;
}

/** Slide SVG with every picture inlined and ids made unique, ready to stand alone. */
export function standaloneSvg(svg: string, pictures: Map<string, string>, prefix: string): string {
  return prepareSvgForDisplay(svg, { prefix, resolveHref: (href) => pictures.get(href) ?? '' });
}

/** One slide painted to PNG bytes at `pixelWidth`. */
export async function slideSvgToPng(svg: string, size: DeckSize, pictures: Map<string, string>, pixelWidth = 1920): Promise<Uint8Array> {
  const canvasSize = designCanvas(size);
  const markup = standaloneSvg(svg, pictures, 'png')
    .replace('width="100%" height="100%"', `width="${canvasSize.width}" height="${canvasSize.height}"`);
  const image = await decode(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  const scale = pixelWidth / canvasSize.width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(canvasSize.width * scale);
  canvas.height = Math.round(canvasSize.height * scale);
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not paint the slide.'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Printable HTML (one page per visible slide) for the PDF printer. */
export function designedPrintHtml(title: string, size: DeckSize, slides: DesignedSlide[], pictures: Map<string, string>): string {
  const canvas = designCanvas(size);
  const widthIn = canvas.width / 96;
  const heightIn = canvas.height / 96;
  const pages = slides.filter((slide) => !slide.hidden && slide.svg)
    .map((slide, index) => `<section class="slide">${standaloneSvg(slide.svg, pictures, `p${index}`)}</section>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${widthIn}in ${heightIn}in; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #ffffff; }
.slide { width: ${widthIn}in; height: ${heightIn}in; overflow: hidden; page-break-after: always; break-after: page; }
.slide:last-child { page-break-after: auto; break-after: auto; }
.slide svg { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

/** A self-contained HTML slideshow: arrow keys, click, F for fullscreen. */
export function designedHtmlDeck(title: string, size: DeckSize, slides: DesignedSlide[], pictures: Map<string, string>, transition: SlideTransition): string {
  const canvas = designCanvas(size);
  const frames = slides.filter((slide) => !slide.hidden && slide.svg)
    .map((slide, index) => `<div class="frame${index === 0 ? ' on' : ''}">${standaloneSvg(slide.svg, pictures, `h${index}`)}</div>`).join('\n');
  const fade = transition === 'none' ? '0s' : '.35s';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
html, body { margin: 0; height: 100%; background: #0b0b0d; overflow: hidden; }
.stage { position: fixed; inset: 0; display: grid; place-items: center; }
.deck { position: relative; width: min(100vw, calc(100vh * ${canvas.width} / ${canvas.height})); aspect-ratio: ${canvas.width} / ${canvas.height}; }
.frame { position: absolute; inset: 0; opacity: 0; transition: opacity ${fade} ease; pointer-events: none; }
.frame.on { opacity: 1; pointer-events: auto; }
.frame svg { display: block; width: 100%; height: 100%; }
.count { position: fixed; right: 14px; bottom: 10px; font: 12px system-ui, sans-serif; color: #888; }
</style>
</head>
<body>
<div class="stage"><div class="deck">
${frames}
</div></div>
<div class="count"></div>
<script>
(() => {
  const frames = [...document.querySelectorAll('.frame')];
  const count = document.querySelector('.count');
  let index = 0;
  const show = (next) => {
    index = Math.max(0, Math.min(frames.length - 1, next));
    frames.forEach((frame, i) => frame.classList.toggle('on', i === index));
    count.textContent = (index + 1) + ' / ' + frames.length;
  };
  document.addEventListener('keydown', (event) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key)) show(index + 1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(event.key)) show(index - 1);
    else if (event.key === 'Home') show(0);
    else if (event.key === 'End') show(frames.length - 1);
    else if (event.key === 'f' || event.key === 'F') document.documentElement.requestFullscreen?.();
  });
  document.addEventListener('click', () => show(index + 1));
  show(0);
})();
</script>
</body>
</html>`;
}

// Showing pictures to the AI ------------------------------------------------------------

/** Folder (inside a deck) that holds the small copies of its pictures the AI is shown. */
export const PREVIEWS_FOLDER = '.previews';
const SHEET_COLUMNS = 4;
const SHEET_ROWS = 3;
const TILE = { width: 300, height: 225, label: 26, gap: 8 };

const toJpeg = async (canvas: HTMLCanvasElement): Promise<Uint8Array> => {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not paint the picture.'))), 'image/jpeg', 0.84));
  return new Uint8Array(await blob.arrayBuffer());
};

/** Draws `image` contained in a box, transparent areas on mid grey so light and dark logos both show. */
function drawContained(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number): void {
  context.fillStyle = '#8C8C8C';
  context.fillRect(x, y, width, height);
  const scale = Math.min(width / (image.naturalWidth || 1), height / (image.naturalHeight || 1));
  const w = (image.naturalWidth || 1) * scale;
  const h = (image.naturalHeight || 1) * scale;
  context.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

/** A JPEG copy of a picture, at most `maxSide` px on its long side. */
export async function previewJpeg(dataUrl: string, maxSide = 1024): Promise<Uint8Array> {
  const image = await decode(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
  drawContained(canvas.getContext('2d')!, image, 0, 0, canvas.width, canvas.height);
  return toJpeg(canvas);
}

/**
 * Contact sheets: the pictures as tiles labelled "number · name" (the
 * numbers of the PICTURES list in the prompt), 12 to a sheet, written to
 * `folder` as sheet-1.jpg, sheet-2.jpg… An engine sees up to six attached
 * pictures, so sheets let it see a whole folder.
 */
export async function writeContactSheets(paths: string[], labels: string[], folder: string, startNumber = 1): Promise<string[]> {
  const perSheet = SHEET_COLUMNS * SHEET_ROWS;
  const sheets: string[] = [];
  for (let start = 0; start < paths.length; start += perSheet) {
    const batch = paths.slice(start, start + perSheet);
    const rows = Math.ceil(batch.length / SHEET_COLUMNS);
    const canvas = document.createElement('canvas');
    canvas.width = SHEET_COLUMNS * TILE.width + (SHEET_COLUMNS + 1) * TILE.gap;
    canvas.height = rows * (TILE.height + TILE.label) + (rows + 1) * TILE.gap;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#1C1C1E';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const [offset, path] of batch.entries()) {
      const x = TILE.gap + (offset % SHEET_COLUMNS) * (TILE.width + TILE.gap);
      const y = TILE.gap + Math.floor(offset / SHEET_COLUMNS) * (TILE.height + TILE.label + TILE.gap);
      try {
        drawContained(context, await decode(await invoke<string>('read_file_as_base64', { path })), x, y, TILE.width, TILE.height);
      } catch {
        context.fillStyle = '#3A3A3C';
        context.fillRect(x, y, TILE.width, TILE.height);
      }
      context.fillStyle = '#FFFFFF';
      context.font = '600 15px "Segoe UI", sans-serif';
      context.textBaseline = 'middle';
      let label = `${startNumber + start + offset} · ${labels[start + offset] ?? ''}`;
      while (label.length > 4 && context.measureText(label).width > TILE.width - 8) label = `${label.slice(0, -2)}…`;
      context.fillText(label, x + 4, y + TILE.height + TILE.label / 2);
    }
    const target = joinPath(folder, `sheet-${sheets.length + 1}.jpg`);
    await writeFileBytes(target, await toJpeg(canvas));
    sheets.push(target);
  }
  return sheets;
}

/** Absolute path of a small JPEG copy of a deck picture (`assets/…`), made once. Null when it cannot be read. */
export async function deckPicturePreview(deckDir: string, asset: string): Promise<string | null> {
  const target = joinPath(deckDir, PREVIEWS_FOLDER, `${asset.split('/').pop()}.jpg`);
  if (await invoke<boolean>('path_exists', { path: target }).catch(() => false)) return target;
  try {
    await writeFileBytes(target, await previewJpeg(await invoke<string>('read_file_as_base64', { path: resolvePath(asset, deckDir) })));
    return target;
  } catch (error) {
    console.warn(`Could not prepare a preview of ${asset}:`, error);
    return null;
  }
}

/**
 * What an engine that sees is shown of a set of pictures: each one (small
 * copies) when they fit in one message, else contact sheets.
 */
export async function picturesToShow(paths: string[], labels: string[], folder: string): Promise<{ images: string[]; view: true | 'sheets' }> {
  if (paths.length <= 6) {
    const images: string[] = [];
    for (const [index, path] of paths.entries()) {
      try {
        const target = joinPath(folder, `picture-${index + 1}.jpg`);
        await writeFileBytes(target, await previewJpeg(await invoke<string>('read_file_as_base64', { path })));
        images.push(target);
      } catch (error) {
        console.warn(`Could not prepare ${path}:`, error);
      }
    }
    if (images.length === paths.length) return { images, view: true };
  }
  return { images: await writeContactSheets(paths, labels, folder), view: 'sheets' };
}

/**
 * The pictures in a folder and its subfolders (3 levels, generated and hidden
 * folders skipped), at most `limit`. `total` counts every usable picture found.
 */
export async function scanFolderPictures(folder: string, limit = MAX_DECK_PICTURES): Promise<{ paths: string[]; total: number }> {
  const found: FileEntry[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    const entries = await invoke<FileEntry[]>('list_directory_entries', { path: dir }).catch(() => [] as FileEntry[]);
    found.push(...entries.filter((entry) => !entry.isDir));
    if (depth >= 3) return;
    for (const entry of entries) if (entry.isDir && !entry.name.startsWith('.')) await walk(entry.path, depth + 1);
  };
  await walk(folder, 1);
  const pictures = folderPictures(found);
  return { paths: pictures.slice(0, limit).map((entry) => entry.path), total: pictures.length };
}

/** A dropped or pasted file (picture or document) written to `folder`, so the AI and the deck can use it. */
export async function saveDroppedFile(file: File, folder: string): Promise<string> {
  const fromName = file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase();
  const extension = fromName ?? (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const base = (file.name || 'pasted').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || 'file';
  const path = joinPath(folder, `${base}-${Date.now().toString(36)}.${extension}`);
  await writeFileBytes(path, new Uint8Array(await file.arrayBuffer()));
  return path;
}
