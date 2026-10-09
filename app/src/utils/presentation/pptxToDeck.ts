// "Rebuild in a theme": converts an existing .pptx into our slide model. Each
// slide maps to the best-fit layout from its placeholders (title, body,
// picture, chart, table); pictures are extracted for the deck's assets
// folder and a theme is derived from the file's colour and font schemes.

import {
  childElements,
  childPath,
  descendants,
  EMU_PER_INCH,
  firstChild,
  openPptx,
  paragraphTexts,
  readNotes,
  readRels,
  readXml,
  REL_TYPES,
  slideShapes,
  type PptxPackage,
  type ShapeInfo,
} from './pptxPackage';
import { sanitizeSlide, type AiSlide } from './sanitize';
import { themeFromScheme } from './themes';
import type { ChartKind, DeckTheme, LayoutId, Slide } from './types';

export interface ImportedDeck {
  title: string;
  slides: Slide[];
  theme: DeckTheme;
  size: '16:9' | '4:3';
  /** Extracted pictures: file name in the deck's assets folder → bytes. */
  assets: Record<string, Uint8Array>;
}

interface PictureInfo {
  part: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alt: string;
}

async function slidePictures(pkg: PptxPackage, part: string, doc: Document): Promise<PictureInfo[]> {
  const rels = await readRels(pkg.zip, part);
  const byId = new Map(rels.map((rel) => [rel.id, rel]));
  const out: PictureInfo[] = [];
  for (const pic of descendants(doc, 'p:pic')) {
    const blip = descendants(pic, 'a:blip')[0];
    const rel = byId.get(blip?.getAttribute('r:embed') ?? '');
    if (!rel || rel.external || !pkg.zip.file(rel.target)) continue;
    const off = childPath(pic, 'p:spPr', 'a:xfrm', 'a:off');
    const ext = childPath(pic, 'p:spPr', 'a:xfrm', 'a:ext');
    out.push({
      part: rel.target,
      x: Number(off?.getAttribute('x') ?? 0) / EMU_PER_INCH,
      y: Number(off?.getAttribute('y') ?? 0) / EMU_PER_INCH,
      w: Number(ext?.getAttribute('cx') ?? 0) / EMU_PER_INCH,
      h: Number(ext?.getAttribute('cy') ?? 0) / EMU_PER_INCH,
      alt: childPath(pic, 'p:nvPicPr', 'p:cNvPr')?.getAttribute('descr') ?? '',
    });
  }
  // Skip logos and icons: keep pictures covering a meaningful part of the slide.
  return out.filter((picture) => picture.w * picture.h >= 1.5 || picture.w === 0);
}

const CHART_TAGS: Array<[string, ChartKind]> = [
  ['c:barChart', 'column'],
  ['c:bar3DChart', 'column'],
  ['c:lineChart', 'line'],
  ['c:line3DChart', 'line'],
  ['c:areaChart', 'line'],
  ['c:pieChart', 'pie'],
  ['c:pie3DChart', 'pie'],
  ['c:doughnutChart', 'donut'],
];

function cacheValues(node: Element | null): string[] {
  if (!node) return [];
  const points = descendants(node, 'c:pt');
  const out: string[] = [];
  for (const point of points) {
    const index = Number(point.getAttribute('idx') ?? out.length);
    out[index] = firstChild(point, 'c:v')?.textContent ?? '';
  }
  return Array.from({ length: out.length }, (_, index) => out[index] ?? '');
}

/** The data of a chart part, as our chart block fields. */
export function readChart(doc: Document): AiSlide['chart'] | null {
  for (const [tag, base] of CHART_TAGS) {
    const plot = descendants(doc, tag)[0];
    if (!plot) continue;
    const kind: ChartKind = base === 'column' && firstChild(plot, 'c:barDir')?.getAttribute('val') === 'bar' ? 'bar' : base;
    const series = childElements(plot, 'c:ser').map((ser, index) => ({
      name: descendants(firstChild(ser, 'c:tx') ?? ser, 'c:v')[0]?.textContent?.trim() || `Series ${index + 1}`,
      categories: cacheValues(firstChild(ser, 'c:cat')),
      values: cacheValues(firstChild(ser, 'c:val')).map((value) => Number(value) || 0),
    })).filter((entry) => entry.values.length > 0);
    if (series.length === 0) continue;
    return {
      kind,
      categories: series[0].categories.length ? series[0].categories : series[0].values.map((_, index) => String(index + 1)),
      series: series.map(({ name, values }) => ({ name, values })),
    };
  }
  return null;
}

async function slideChart(pkg: PptxPackage, part: string, doc: Document): Promise<AiSlide['chart'] | null> {
  const rels = await readRels(pkg.zip, part);
  for (const frame of descendants(doc, 'p:graphicFrame')) {
    const chartRef = descendants(frame, 'c:chart')[0];
    const rel = rels.find((entry) => entry.id === chartRef?.getAttribute('r:id') && entry.type === REL_TYPES.chart);
    if (!rel) continue;
    const chartDoc = await readXml(pkg.zip, rel.target);
    const chart = chartDoc ? readChart(chartDoc) : null;
    if (chart) return chart;
  }
  return null;
}

function slideTable(doc: Document): AiSlide['table'] | null {
  const table = descendants(doc, 'a:tbl')[0];
  if (!table) return null;
  const rows = childElements(table, 'a:tr').map((row) => childElements(row, 'a:tc').map((cell) => {
    const body = firstChild(cell, 'a:txBody');
    return body ? paragraphTexts(body).join(' ').trim() : '';
  }));
  if (rows.length === 0) return null;
  return { header: rows[0], rows: rows.slice(1) };
}

function bullets(shape: ShapeInfo): Array<{ text: string; level: number }> {
  return shape.paragraphs
    .map((text, index) => ({ text: text.replace(/\n/g, ' ').trim(), level: (shape.levels[index] ?? 0) > 0 ? 1 : 0 }))
    .filter((item) => item.text);
}

const EXTENSIONS: Record<string, string> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', bmp: 'bmp', svg: 'svg', webp: 'webp', emf: 'emf', wmf: 'wmf', tif: 'tif', tiff: 'tif' };
const BROWSER_IMAGES = new Set(['png', 'jpg', 'gif', 'bmp', 'svg', 'webp']);

function themeColor(scheme: Element | null, name: string): string | undefined {
  const node = scheme ? firstChild(scheme, `a:${name}`) : null;
  if (!node) return undefined;
  const srgb = firstChild(node, 'a:srgbClr')?.getAttribute('val');
  if (srgb) return `#${srgb}`;
  const sys = firstChild(node, 'a:sysClr')?.getAttribute('lastClr');
  return sys ? `#${sys}` : undefined;
}

export async function readPptxTheme(pkg: PptxPackage): Promise<DeckTheme> {
  const doc = pkg.themePart ? await readXml(pkg.zip, pkg.themePart) : null;
  const scheme = doc ? descendants(doc, 'a:clrScheme')[0] ?? null : null;
  const fonts = doc ? descendants(doc, 'a:fontScheme')[0] ?? null : null;
  const font = (kind: string): string | undefined => {
    const typeface = fonts ? childPath(fonts, `a:${kind}`, 'a:latin')?.getAttribute('typeface') : undefined;
    return typeface && !typeface.startsWith('+') ? typeface : undefined;
  };
  return themeFromScheme({
    name: scheme?.getAttribute('name') ?? undefined,
    dk1: themeColor(scheme, 'dk1'),
    lt1: themeColor(scheme, 'lt1'),
    dk2: themeColor(scheme, 'dk2'),
    lt2: themeColor(scheme, 'lt2'),
    accents: [1, 2, 3, 4, 5, 6].map((index) => themeColor(scheme, `accent${index}`)).filter((color): color is string => Boolean(color)),
    majorFont: font('majorFont'),
    minorFont: font('minorFont'),
  });
}

/** Picks a layout and fills it from one slide's content. */
export function mapSlide(input: {
  index: number;
  total: number;
  shapes: ShapeInfo[];
  picture: string | null;
  pictureSide: 'left' | 'right';
  chart: AiSlide['chart'] | null;
  table: AiSlide['table'] | null;
  notes: string;
  slideWidth: number;
}): Slide[] {
  const { shapes } = input;
  const titleShape = shapes.find((shape) => shape.role === 'title');
  const subtitleShape = shapes.find((shape) => shape.role === 'subtitle');
  const bodies = shapes.filter((shape) => shape !== titleShape && shape !== subtitleShape && (shape.role === 'body' || shape.role === 'other'));
  const title = titleShape?.paragraphs.join(' ').replace(/\s+/g, ' ').trim()
    ?? bodies.shift()?.paragraphs.find((text) => text.trim())?.trim() ?? '';
  const centered = titleShape?.placeholder === 'ctrTitle';
  const bodyItems = bodies.flatMap(bullets);
  const ai: AiSlide = { title, notes: input.notes };
  let layout: LayoutId;

  if (input.chart) {
    layout = 'chart';
    ai.chart = input.chart;
    ai.takeaway = bodyItems.slice(0, 2).map((item) => item.text).join(' ');
  } else if (input.table) {
    layout = 'table';
    ai.table = input.table;
    ai.caption = bodyItems.map((item) => item.text).join(' ').slice(0, 200);
  } else if (centered || (input.index === 0 && bodyItems.length <= 2)) {
    layout = 'title';
    ai.subtitle = subtitleShape?.paragraphs.join(' ').trim() || bodyItems.map((item) => item.text).join(' · ');
  } else if (input.picture && bodyItems.length > 0) {
    layout = input.pictureSide === 'left' ? 'image-left' : 'image-right';
    ai.bullets = bodyItems;
    ai.image = { description: title };
  } else if (input.picture) {
    layout = 'full-image';
    ai.caption = subtitleShape?.paragraphs.join(' ').trim() ?? '';
    ai.image = { description: title };
  } else if (bodies.length >= 2 && bodies.filter((shape) => shape.role === 'body').length >= 2) {
    const ordered = [...bodies].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    layout = 'two-column';
    ai.left = { bullets: bullets(ordered[0]) };
    ai.right = { bullets: ordered.slice(1).flatMap(bullets) };
  } else if (bodyItems.length === 0) {
    const closing = input.index === input.total - 1 && /thank|question|contact|q\s*&\s*a|next steps/i.test(`${title} ${subtitleShape?.paragraphs.join(' ') ?? ''}`);
    layout = closing ? 'closing' : 'section';
    ai.subtitle = subtitleShape?.paragraphs.join(' ').trim() ?? '';
  } else if (input.index === input.total - 1 && /thank|question|contact/i.test(title) && bodyItems.length <= 2) {
    layout = 'closing';
    ai.subtitle = bodyItems.map((item) => item.text).join(' ');
  } else {
    layout = 'bullets';
    ai.bullets = bodyItems;
  }

  const slides = sanitizeSlide(ai, { forceLayout: layout, clamp: false });
  if (input.picture) {
    for (const slide of slides) {
      const image = slide.slots.image;
      if (image?.type === 'image') slide.slots.image = { ...image, src: input.picture };
    }
  }
  return slides;
}

/** Converts a .pptx into a deck. Pictures land in `assets/` (paths relative to the deck folder). */
export async function pptxToDeck(bytes: Uint8Array | ArrayBuffer, fileTitle: string): Promise<ImportedDeck> {
  const pkg = await openPptx(bytes);
  const theme = await readPptxTheme(pkg);
  const assets: Record<string, Uint8Array> = {};
  const slides: Slide[] = [];
  let firstTitle = '';
  for (const [index, entry] of pkg.slides.entries()) {
    const doc = await readXml(pkg.zip, entry.part);
    if (!doc) continue;
    const shapes = slideShapes(doc);
    const pictures = await slidePictures(pkg, entry.part, doc);
    let picture: string | null = null;
    let pictureSide: 'left' | 'right' = 'right';
    const largest = [...pictures].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (largest) {
      const extension = EXTENSIONS[largest.part.split('.').pop()?.toLowerCase() ?? ''] ?? 'png';
      if (BROWSER_IMAGES.has(extension)) {
        const name = `slide${index + 1}-${largest.part.split('/').pop()!.replace(/\.[^.]+$/, '')}.${extension}`;
        assets[name] = await pkg.zip.file(largest.part)!.async('uint8array');
        picture = `assets/${name}`;
        pictureSide = largest.x + largest.w / 2 < pkg.width / 2 ? 'left' : 'right';
      }
    }
    const mapped = mapSlide({
      index,
      total: pkg.slides.length,
      shapes,
      picture,
      pictureSide,
      chart: await slideChart(pkg, entry.part, doc),
      table: slideTable(doc),
      notes: await readNotes(pkg.zip, entry.notesPart),
      slideWidth: pkg.width,
    });
    if (entry.hidden) mapped.forEach((slide) => { slide.hidden = true; });
    if (!firstTitle) firstTitle = shapes.find((shape) => shape.role === 'title')?.paragraphs.join(' ').trim() ?? '';
    slides.push(...mapped);
  }
  return {
    title: firstTitle || fileTitle,
    slides,
    theme,
    size: Math.abs(pkg.width / pkg.height - 4 / 3) < 0.05 ? '4:3' : '16:9',
    assets,
  };
}
