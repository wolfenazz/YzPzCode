// Export glue: gathers images, lays the report out with paged.js and writes
// PDF (native, via the backend), Word (.docx) or a standalone web page.

import { invoke } from '@tauri-apps/api/core';
import { joinPath } from './document';
import type { DocxImage } from './docxExport';
import { buildPrintHtml } from './printHtml';
import type { DocNode, Reference, ReportBrief } from './types';

export interface ExportSource {
  brief: ReportBrief;
  bibliography: Reference[];
  content: DocNode;
  docDir: string;
}

interface LoadedImage {
  dataUrl: string;
  docx: DocxImage | null;
}

function collectSources(node: DocNode, into: Set<string>): void {
  if (node.type === 'figure' && typeof node.attrs?.src === 'string' && node.attrs.src) into.add(node.attrs.src);
  node.content?.forEach((child) => collectSources(child, into));
}

const DOCX_TYPES: Record<string, DocxImage['type']> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', bmp: 'bmp' };

async function rasterise(dataUrl: string): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const image = new Image();
  image.decoding = 'async';
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || 800;
  canvas.height = image.naturalHeight || 600;
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not convert the image'))), 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

async function loadImages(source: ExportSource, forDocx: boolean): Promise<Record<string, LoadedImage>> {
  const sources = new Set<string>();
  collectSources(source.content, sources);
  const result: Record<string, LoadedImage> = {};
  for (const src of sources) {
    try {
      const dataUrl = /^data:/.test(src)
        ? src
        : await invoke<string>('read_file_as_base64', { path: /^([A-Za-z]:[\\/]|\/)/.test(src) ? src : joinPath(source.docDir, src) });
      let docx: DocxImage | null = null;
      if (forDocx) {
        const mime = /^data:image\/([\w+.-]+)/.exec(dataUrl)?.[1]?.toLowerCase() ?? '';
        const direct = DOCX_TYPES[mime];
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        if (direct) {
          const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          docx = { data: bytes, width: image.naturalWidth || 800, height: image.naturalHeight || 600, type: direct };
        } else {
          // SVG and WebP are not Word-native: embed a PNG rendering.
          const raster = await rasterise(dataUrl);
          docx = { data: raster.bytes, width: raster.width, height: raster.height, type: 'png' };
        }
      }
      result[src] = { dataUrl, docx };
    } catch (error) {
      console.warn(`Could not load image ${src}:`, error);
    }
  }
  return result;
}

/** The print document, ready for paged.js (with the paged.js scripts) or as a plain page. */
export async function printDocument(source: ExportSource, withPaged: boolean): Promise<string> {
  const images = await loadImages(source, false);
  const headExtra = withPaged
    ? `<script>window.PagedConfig={auto:true,after:function(flow){parent.postMessage({type:'yzpz-paged-done',total:flow&&flow.total},'*')}};</script>
<script src="/vendor/pagedjs/paged.polyfill.min.js"></script>
<style id="yzpz-preview-chrome">@media screen{html{background:#d9d9df}.pagedjs_page{background:#fff;margin:0 auto 18px;box-shadow:0 8px 30px -10px rgba(0,0,0,.35)}.pagedjs_pages{padding:18px 0}}</style>`
    : '';
  return buildPrintHtml({
    brief: source.brief,
    bibliography: source.bibliography,
    content: source.content,
    images: Object.fromEntries(Object.entries(images).map(([src, image]) => [src, image.dataUrl])),
    headExtra,
  });
}

/**
 * Lays the document out in `iframe` with paged.js and returns the paginated
 * HTML (scripts removed) for the printer, plus the page count.
 */
export function paginate(iframe: HTMLIFrameElement, html: string, timeoutMs = 60_000): Promise<{ html: string; pages: number }> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Laying out the pages took too long.'));
    }, timeoutMs);
    function onMessage(event: MessageEvent): void {
      if (event.source !== iframe.contentWindow || (event.data as { type?: string })?.type !== 'yzpz-paged-done') return;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      const doc = iframe.contentDocument;
      if (!doc) {
        reject(new Error('The page preview is not available.'));
        return;
      }
      const clone = doc.documentElement.cloneNode(true) as HTMLElement;
      // paged.js adds rules with insertRule (target-counter page numbers, page
      // counters); they live only in the CSSOM, so write them back into the markup.
      const liveStyles = Array.from(doc.querySelectorAll('style'));
      const clonedStyles = Array.from(clone.querySelectorAll('style'));
      liveStyles.forEach((style, index) => {
        const sheet = style.sheet;
        if (!sheet || !clonedStyles[index]) return;
        try {
          clonedStyles[index].textContent = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
        } catch {
          // Leave the original text when the sheet cannot be read.
        }
      });
      clone.querySelectorAll('script, #yzpz-preview-chrome').forEach((node) => node.remove());
      resolve({ html: `<!doctype html>\n${clone.outerHTML}`, pages: Number((event.data as { total?: number }).total ?? doc.querySelectorAll('.pagedjs_page').length) });
    }
    window.addEventListener('message', onMessage);
    iframe.srcdoc = html;
  });
}

/** Writes the PDF. Resolves false if only the system print dialog could be shown. */
export async function writePdf(pagedHtml: string, outputPath: string): Promise<boolean> {
  return invoke<boolean>('export_writing_pdf', { html: pagedHtml, outputPath });
}

export async function writeDocx(source: ExportSource, outputPath: string): Promise<void> {
  const [{ docxBase64 }, images] = await Promise.all([import('./docxExport'), loadImages(source, true)]);
  const docxImages: Record<string, DocxImage> = {};
  for (const [src, image] of Object.entries(images)) if (image.docx) docxImages[src] = image.docx;
  const base64Data = await docxBase64({ brief: source.brief, bibliography: source.bibliography, content: source.content, images: docxImages });
  await invoke('write_file_bytes', { path: outputPath, base64Data });
}

export async function writeHtml(source: ExportSource, outputPath: string): Promise<void> {
  const html = await printDocument(source, false);
  await invoke('write_file_content', { path: outputPath, content: html });
}
