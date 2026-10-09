// Reads the parts of a .pptx package with JSZip: slide order and size from
// presentation.xml, relationships, notes, the theme and content types.
// XML goes through the global DOMParser (the tests install @xmldom/xmldom).

import JSZip from 'jszip';

export const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
};

export const REL_TYPES = {
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  notesSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
};

export const CONTENT_TYPES = {
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
};

export const EMU_PER_INCH = 914400;
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

// XML ------------------------------------------------------------------------

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(`Invalid XML: ${error.textContent?.slice(0, 160) ?? ''}`);
  return doc;
}

export function serializeXml(doc: Document): string {
  const text = new XMLSerializer().serializeToString(doc);
  return text.startsWith('<?xml') ? text : `${XML_DECLARATION}\n${text}`;
}

/** Element children of `node`, optionally with a qualified name. */
export function childElements(node: Node, name?: string): Element[] {
  const out: Element[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1 && (!name || child.nodeName === name)) out.push(child as Element);
  }
  return out;
}

export const firstChild = (node: Node, name: string): Element | null => childElements(node, name)[0] ?? null;

/** Descendants by qualified name, in document order. */
export const descendants = (node: Document | Element, name: string): Element[] => Array.from(node.getElementsByTagName(name));

/** First element along a path of qualified child names. */
export function childPath(node: Node, ...names: string[]): Element | null {
  let current: Node | null = node;
  for (const name of names) {
    if (!current) return null;
    current = firstChild(current, name);
  }
  return current as Element | null;
}

// Paths and relationships ------------------------------------------------------

export const dirOf = (part: string): string => part.slice(0, part.lastIndexOf('/') + 1);

export const relsPathFor = (part: string): string => `${dirOf(part)}_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels`;

/** Resolves a relationship target against the part that owns it. */
export function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `${dirOf(fromPart)}${target}`.split('/');
  const out: string[] = [];
  for (const piece of parts) {
    if (piece === '..') out.pop();
    else if (piece !== '.' && piece !== '') out.push(piece);
  }
  return out.join('/');
}

/** `target` of `toPart` relative to `fromPart` (for writing relationships). */
export function relativeTarget(fromPart: string, toPart: string): string {
  const from = dirOf(fromPart).split('/').filter(Boolean);
  const to = toPart.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/');
}

export interface Rel {
  id: string;
  type: string;
  /** Resolved part path, or the raw target for external links. */
  target: string;
  external: boolean;
}

export async function readText(zip: JSZip, part: string): Promise<string | null> {
  const file = zip.file(part);
  return file ? file.async('string') : null;
}

export async function readXml(zip: JSZip, part: string): Promise<Document | null> {
  const text = await readText(zip, part);
  return text === null ? null : parseXml(text);
}

export async function readRels(zip: JSZip, part: string): Promise<Rel[]> {
  const doc = await readXml(zip, relsPathFor(part));
  if (!doc) return [];
  return descendants(doc, 'Relationship').map((rel) => {
    const external = rel.getAttribute('TargetMode') === 'External';
    const target = rel.getAttribute('Target') ?? '';
    return { id: rel.getAttribute('Id') ?? '', type: rel.getAttribute('Type') ?? '', target: external ? target : resolveTarget(part, target), external };
  });
}

// The package -------------------------------------------------------------------

export interface SlideEntry {
  /** Part name, e.g. `ppt/slides/slide3.xml`. */
  part: string;
  rId: string;
  sldId: string;
  hidden: boolean;
  notesPart: string | null;
}

export interface PptxPackage {
  zip: JSZip;
  slides: SlideEntry[];
  /** Slide size in inches. */
  width: number;
  height: number;
  notesMaster: string | null;
  themePart: string | null;
}

export async function openPptx(bytes: Uint8Array | ArrayBuffer): Promise<PptxPackage> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('This file is not a PowerPoint presentation (it is not a valid .pptx package).');
  }
  const presentation = await readXml(zip, 'ppt/presentation.xml');
  if (!presentation) throw new Error('This file is not a PowerPoint presentation (ppt/presentation.xml is missing). Old .ppt files must be saved as .pptx first.');
  const rels = await readRels(zip, 'ppt/presentation.xml');
  const byId = new Map(rels.map((rel) => [rel.id, rel]));
  const size = descendants(presentation, 'p:sldSz')[0];
  const width = Number(size?.getAttribute('cx') ?? 12192000) / EMU_PER_INCH;
  const height = Number(size?.getAttribute('cy') ?? 6858000) / EMU_PER_INCH;
  const slides: SlideEntry[] = [];
  for (const sldId of descendants(presentation, 'p:sldId')) {
    const rId = sldId.getAttribute('r:id') ?? '';
    const rel = byId.get(rId);
    if (!rel || !zip.file(rel.target)) continue;
    const slideXml = await readXml(zip, rel.target);
    const slideRels = await readRels(zip, rel.target);
    const notes = slideRels.find((entry) => entry.type === REL_TYPES.notesSlide);
    slides.push({
      part: rel.target,
      rId,
      sldId: sldId.getAttribute('id') ?? '',
      hidden: slideXml?.documentElement.getAttribute('show') === '0',
      notesPart: notes && zip.file(notes.target) ? notes.target : null,
    });
  }
  const notesMaster = rels.find((rel) => rel.type === REL_TYPES.notesMaster)?.target ?? null;
  let themePart: string | null = null;
  const master = rels.find((rel) => rel.type === REL_TYPES.slideMaster);
  if (master) themePart = (await readRels(zip, master.target)).find((rel) => rel.type === REL_TYPES.theme)?.target ?? null;
  if (!themePart && zip.file('ppt/theme/theme1.xml')) themePart = 'ppt/theme/theme1.xml';
  return { zip, slides, width, height, notesMaster, themePart };
}

/** Paragraph texts of a `p:txBody` (or any element holding `a:p`). Line breaks become "\n". */
export function paragraphTexts(body: Element): string[] {
  return childElements(body, 'a:p').map((paragraph) => {
    let text = '';
    for (const child of childElements(paragraph)) {
      if (child.nodeName === 'a:r' || child.nodeName === 'a:fld') text += descendants(child, 'a:t').map((node) => node.textContent ?? '').join('');
      else if (child.nodeName === 'a:br') text += '\n';
    }
    return text;
  });
}

/** Paragraph indent levels of a text body. */
export function paragraphLevels(body: Element): number[] {
  return childElements(body, 'a:p').map((paragraph) => Number(firstChild(paragraph, 'a:pPr')?.getAttribute('lvl') ?? 0) || 0);
}

export type ShapeRole = 'title' | 'subtitle' | 'body' | 'other';

export interface ShapeInfo {
  id: string;
  name: string;
  role: ShapeRole;
  /** Placeholder type, when a placeholder. */
  placeholder: string | null;
  paragraphs: string[];
  levels: number[];
  /** Position in inches, when the shape sets it. */
  x: number | null;
  y: number | null;
}

const FOOTER_PLACEHOLDERS = new Set(['dt', 'ftr', 'sldNum', 'hdr', 'sldImg']);

/** Text shapes of a slide (footers left out), in document order. */
export function slideShapes(doc: Document): ShapeInfo[] {
  const shapes: ShapeInfo[] = [];
  for (const shape of descendants(doc, 'p:sp')) {
    const body = firstChild(shape, 'p:txBody');
    if (!body) continue;
    const cNvPr = childPath(shape, 'p:nvSpPr', 'p:cNvPr');
    const ph = childPath(shape, 'p:nvSpPr', 'p:nvPr', 'p:ph');
    const type = ph ? ph.getAttribute('type') ?? 'body' : null;
    if (type && FOOTER_PLACEHOLDERS.has(type)) continue;
    const paragraphs = paragraphTexts(body);
    if (!paragraphs.some((text) => text.trim())) continue;
    const off = childPath(shape, 'p:spPr', 'a:xfrm', 'a:off');
    const role: ShapeRole = type === 'title' || type === 'ctrTitle' ? 'title'
      : type === 'subTitle' ? 'subtitle'
        : type === 'body' || type === 'obj' ? 'body'
          : 'other';
    shapes.push({
      id: cNvPr?.getAttribute('id') ?? String(shapes.length + 1),
      name: cNvPr?.getAttribute('name') ?? '',
      role,
      placeholder: type,
      paragraphs,
      levels: paragraphLevels(body),
      x: off ? Number(off.getAttribute('x')) / EMU_PER_INCH : null,
      y: off ? Number(off.getAttribute('y')) / EMU_PER_INCH : null,
    });
  }
  return shapes;
}

/** The notes text of a notes slide (its body placeholder). */
export function notesText(doc: Document): string {
  for (const shape of descendants(doc, 'p:sp')) {
    const ph = childPath(shape, 'p:nvSpPr', 'p:nvPr', 'p:ph');
    if (ph?.getAttribute('type') !== 'body') continue;
    const body = firstChild(shape, 'p:txBody');
    if (body) return paragraphTexts(body).join('\n').trim();
  }
  return '';
}

export async function readNotes(zip: JSZip, notesPart: string | null): Promise<string> {
  if (!notesPart) return '';
  const doc = await readXml(zip, notesPart);
  return doc ? notesText(doc) : '';
}
