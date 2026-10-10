// Browser-side helpers for AI-designed decks: what a picture looks like (for
// engines that cannot see it), text measurement for the PowerPoint export,
// and slide SVG made self-contained (pictures inlined) for PNG, PDF and HTML.

import { invoke } from '@tauri-apps/api/core';
import { dominantColors } from '../../utils/presentation/designColors';
import { designCanvas } from '../../utils/presentation/designStyles';
import type { DesignedSlide } from '../../utils/presentation/designTypes';
import { base64ToBytes, isAbsolutePath, toPowerPointImage, writeFileBytes } from '../../utils/presentation/assets';
import { prepareSvgForDisplay, svgAssetRefs } from '../../utils/presentation/svgSafe';
import type { PptxPicture } from '../../utils/presentation/svgPptx';
import type { DeckSize, SlideTransition } from '../../utils/presentation/types';
import { joinPath } from '../../utils/writing/document';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

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

/** A dropped or pasted file (picture or document) written to `folder`, so the AI and the deck can use it. */
export async function saveDroppedFile(file: File, folder: string): Promise<string> {
  const fromName = file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase();
  const extension = fromName ?? (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const base = (file.name || 'pasted').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || 'file';
  const path = joinPath(folder, `${base}-${Date.now().toString(36)}.${extension}`);
  await writeFileBytes(path, new Uint8Array(await file.arrayBuffer()));
  return path;
}
