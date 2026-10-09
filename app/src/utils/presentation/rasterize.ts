// Paints a slide to PNG in the browser: the static slide HTML goes into an
// SVG <foreignObject>, which the webview draws onto a canvas. Every image and
// icon is already inlined, so the canvas is never tainted.

import { PX_PER_IN, SLIDE_HEIGHT, slideWidth } from './layouts';
import { slideHtml, type StaticAssets } from './printHtml';
import type { PlanContext } from './render';
import type { Slide } from './types';

/** XHTML-safe markup: void elements closed, bare ampersands escaped. */
function toXhtml(html: string): string {
  return html
    .replace(/<(img|br|hr|input)([^>]*?)\s*\/?>/g, '<$1$2/>')
    .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/&nbsp;/g, '&#160;');
}

/** One slide as PNG bytes at `pixelWidth` (height follows the aspect ratio). */
export async function slideToPng(context: PlanContext, slide: Slide, index: number, assets: StaticAssets, pixelWidth = 1920): Promise<Uint8Array> {
  const width = Math.round(slideWidth(context.size) * PX_PER_IN);
  const height = Math.round(SLIDE_HEIGHT * PX_PER_IN);
  const scale = pixelWidth / width;
  const body = toXhtml(slideHtml(context, slide, index, assets));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;margin:0"><style>p{margin:0}</style>${body}</div>`
    + '</foreignObject></svg>';
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context2d = canvas.getContext('2d')!;
  context2d.scale(scale, scale);
  context2d.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not paint the slide.'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
