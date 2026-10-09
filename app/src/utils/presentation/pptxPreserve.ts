// "Keep original design": edits an existing .pptx in place by patching its
// XML. Text goes into the existing runs (each paragraph keeps its pPr and the
// first run's rPr, so fonts and colours survive); slides are reordered,
// duplicated, hidden and deleted through sldIdLst, the relationships and the
// content types. Masters, layouts and themes are never touched.

import JSZip from 'jszip';
import {
  childElements,
  CONTENT_TYPES,
  descendants,
  firstChild,
  childPath,
  openPptx,
  paragraphTexts,
  parseXml,
  readNotes,
  readText,
  readXml,
  relativeTarget,
  relsPathFor,
  REL_TYPES,
  resolveTarget,
  serializeXml,
  slideShapes,
  type PptxPackage,
  type ShapeInfo,
} from './pptxPackage';
import type { PreserveSlide } from './types';

export interface PreserveSlideInfo {
  part: string;
  shapes: ShapeInfo[];
  notes: string;
  /** Notes can be edited (a notes slide exists, or a notes master to make one from). */
  notesEditable: boolean;
  hidden: boolean;
  title: string;
}

/** Shapes, notes and titles of every slide, by part name. */
export async function readPreserveInfo(pkg: PptxPackage): Promise<Record<string, PreserveSlideInfo>> {
  const out: Record<string, PreserveSlideInfo> = {};
  for (const slide of pkg.slides) {
    const doc = await readXml(pkg.zip, slide.part);
    const shapes = doc ? slideShapes(doc) : [];
    const title = shapes.find((shape) => shape.role === 'title')?.paragraphs.join(' ').trim()
      ?? shapes[0]?.paragraphs.find((text) => text.trim())?.trim() ?? '';
    out[slide.part] = {
      part: slide.part,
      shapes,
      notes: await readNotes(pkg.zip, slide.notesPart),
      notesEditable: Boolean(slide.notesPart || pkg.notesMaster),
      hidden: slide.hidden,
      title,
    };
  }
  return out;
}

export function initialPreserveSlides(pkg: PptxPackage): PreserveSlide[] {
  return pkg.slides.map((slide) => ({ key: slide.part, source: slide.part, hidden: slide.hidden, text: {} }));
}

// Text patching ----------------------------------------------------------------

function cloneElement(node: Element): Element {
  return node.cloneNode(true) as Element;
}

/** Rewrites the paragraphs of a text body, keeping each paragraph's formatting. */
export function setBodyParagraphs(body: Element, texts: string[]): void {
  const doc = body.ownerDocument;
  const old = childElements(body, 'a:p');
  const templates = old.length > 0 ? old : [doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:p')];
  const anchor = old[0] ?? null;
  const fresh = texts.map((text, index) => {
    const template = templates[Math.min(index, templates.length - 1)];
    const paragraph = doc.createElementNS(template.namespaceURI, 'a:p');
    const pPr = firstChild(template, 'a:pPr');
    if (pPr) paragraph.appendChild(cloneElement(pPr));
    const firstRun = childElements(template).find((child) => child.nodeName === 'a:r' || child.nodeName === 'a:fld');
    const endPr = firstChild(template, 'a:endParaRPr');
    let rPr = firstRun ? firstChild(firstRun, 'a:rPr') : null;
    if (!rPr && endPr) {
      // An empty paragraph's end properties carry its formatting.
      rPr = doc.createElementNS(endPr.namespaceURI, 'a:rPr');
      for (const attribute of Array.from(endPr.attributes)) rPr.setAttribute(attribute.name, attribute.value);
      for (const child of childElements(endPr)) rPr.appendChild(cloneElement(child));
    }
    text.split('\n').forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        const br = doc.createElementNS(template.namespaceURI, 'a:br');
        if (rPr) br.appendChild(cloneElement(rPr));
        paragraph.appendChild(br);
      }
      if (!line) return;
      const run = doc.createElementNS(template.namespaceURI, 'a:r');
      if (rPr) run.appendChild(cloneElement(rPr));
      const t = doc.createElementNS(template.namespaceURI, 'a:t');
      t.appendChild(doc.createTextNode(line));
      if (/^\s|\s$/.test(line)) t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      run.appendChild(t);
      paragraph.appendChild(run);
    });
    if (endPr) paragraph.appendChild(cloneElement(endPr));
    return paragraph;
  });
  for (const paragraph of fresh) body.insertBefore(paragraph, anchor);
  for (const paragraph of old) body.removeChild(paragraph);
}

/** Sets the text of shape `shapeId`. Returns false when there is no such text shape. */
export function setShapeText(doc: Document, shapeId: string, texts: string[]): boolean {
  for (const shape of descendants(doc, 'p:sp')) {
    if (childPath(shape, 'p:nvSpPr', 'p:cNvPr')?.getAttribute('id') !== shapeId) continue;
    const body = firstChild(shape, 'p:txBody');
    if (!body) return false;
    setBodyParagraphs(body, texts.length > 0 ? texts : ['']);
    return true;
  }
  return false;
}

export function setNotesBody(doc: Document, text: string): boolean {
  for (const shape of descendants(doc, 'p:sp')) {
    if (childPath(shape, 'p:nvSpPr', 'p:nvPr', 'p:ph')?.getAttribute('type') !== 'body') continue;
    const body = firstChild(shape, 'p:txBody');
    if (!body) continue;
    setBodyParagraphs(body, text.split('\n'));
    return true;
  }
  return false;
}

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function blankNotesXml(text: string): string {
  const paragraphs = text.split('\n').map((line) => (line
    ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
    : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>')).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
    + '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
    + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
    + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>';
}

const relsXml = (rels: Array<{ id: string; type: string; target: string }>): string =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((rel) => `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeXml(rel.target)}"/>`).join('')}</Relationships>`;

// Package operations -----------------------------------------------------------

function contentTypeOf(types: Document, part: string): string | null {
  return descendants(types, 'Override').find((override) => override.getAttribute('PartName') === `/${part}`)?.getAttribute('ContentType') ?? null;
}

/** An unused part name next to `part`: chart3.xml → chart4.xml (or chart3-2.xml). */
function uniquePartName(zip: JSZip, part: string): string {
  const match = /^(.*?)(\d*)(\.[^./]+)$/.exec(part);
  const [stem, digits, extension] = match ? [match[1], match[2], match[3]] : [part, '', ''];
  let number = digits ? Number(digits) + 1 : 2;
  while (zip.file(`${stem}${digits ? '' : '-'}${number}${extension}`)) number += 1;
  return `${stem}${digits ? '' : '-'}${number}${extension}`;
}

/** Copies a part (and, to `depth` levels, the parts it relates to) under new names. */
async function clonePart(zip: JSZip, types: Document, part: string, depth: number): Promise<string | null> {
  const file = zip.file(part);
  if (!file) return null;
  const name = uniquePartName(zip, part);
  zip.file(name, await file.async('uint8array'));
  const contentType = contentTypeOf(types, part);
  if (contentType) addOverride(types, name, contentType);
  const relsText = await readText(zip, relsPathFor(part));
  if (relsText !== null) {
    const relsDoc = parseXml(relsText);
    if (depth > 0) {
      for (const rel of descendants(relsDoc, 'Relationship')) {
        if (rel.getAttribute('TargetMode') === 'External') continue;
        const copy = await clonePart(zip, types, resolveTarget(part, rel.getAttribute('Target') ?? ''), depth - 1);
        if (copy) rel.setAttribute('Target', relativeTarget(name, copy));
      }
    }
    zip.file(relsPathFor(name), serializeXml(relsDoc));
  }
  return name;
}

function nextNumber(zip: JSZip, prefix: string): () => number {
  let max = 0;
  zip.forEach((path) => {
    const match = new RegExp(`^${prefix}(\\d+)\\.xml$`).exec(path);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return () => {
    max += 1;
    return max;
  };
}

function nextRelId(doc: Document): () => string {
  let max = 0;
  for (const rel of descendants(doc, 'Relationship')) {
    const match = /^rId(\d+)$/.exec(rel.getAttribute('Id') ?? '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return () => {
    max += 1;
    return `rId${max}`;
  };
}

function addOverride(types: Document, part: string, contentType: string): void {
  const root = types.documentElement;
  const override = types.createElementNS(root.namespaceURI, 'Override');
  override.setAttribute('PartName', `/${part}`);
  override.setAttribute('ContentType', contentType);
  root.appendChild(override);
}

function removeOverride(types: Document, part: string): void {
  for (const override of descendants(types, 'Override')) {
    if (override.getAttribute('PartName') === `/${part}`) override.parentNode?.removeChild(override);
  }
}

/** Copies a relationships file, repointing relative targets for the new owner (same folder). */
async function copyRels(zip: JSZip, fromPart: string, toPart: string, rewrite?: (rel: Element) => void): Promise<void> {
  const text = await readText(zip, relsPathFor(fromPart));
  if (text === null) return;
  const doc = parseXml(text);
  if (rewrite) descendants(doc, 'Relationship').forEach(rewrite);
  zip.file(relsPathFor(toPart), serializeXml(doc));
}

/**
 * Applies the edited slide list to the original package and returns the new
 * file. `slides` is the full deck in order: originals keep their part,
 * copies (`key !== source`) get new parts, and originals missing from the
 * list are deleted.
 */
export async function applyPreserve(original: Uint8Array | ArrayBuffer, slides: PreserveSlide[]): Promise<Uint8Array> {
  const pkg = await openPptx(original);
  const { zip } = pkg;
  const presentation = (await readXml(zip, 'ppt/presentation.xml'))!;
  const presRelsPath = relsPathFor('ppt/presentation.xml');
  const presRels = parseXml((await readText(zip, presRelsPath))!);
  const types = parseXml((await readText(zip, '[Content_Types].xml'))!);
  const entries = new Map(pkg.slides.map((slide) => [slide.part, slide]));
  const keptOriginals = new Set(slides.filter((slide) => slide.key === slide.source && entries.has(slide.source)).map((slide) => slide.source));
  const newRelId = nextRelId(presRels);
  const newSlideNumber = nextNumber(zip, 'ppt/slides/slide');
  const newNotesNumber = nextNumber(zip, 'ppt/notesSlides/notesSlide');
  let maxSldId = Math.max(255, ...pkg.slides.map((slide) => Number(slide.sldId) || 0));

  // Every slide in the output: its part and presentation relationship id.
  const output: Array<{ slide: PreserveSlide; part: string; rId: string; sldId: string; notesPart: string | null }> = [];

  for (const slide of slides) {
    const source = entries.get(slide.source);
    if (!source) continue;
    if (slide.key === slide.source && keptOriginals.has(slide.source) && !output.some((entry) => entry.part === source.part)) {
      output.push({ slide, part: source.part, rId: source.rId, sldId: source.sldId, notesPart: source.notesPart });
      continue;
    }
    // A copy: new slide part (and notes part), relationships and ids.
    const number = newSlideNumber();
    const part = `ppt/slides/slide${number}.xml`;
    zip.file(part, (await readText(zip, source.part))!);
    let notesPart: string | null = null;
    if (source.notesPart) {
      notesPart = `ppt/notesSlides/notesSlide${newNotesNumber()}.xml`;
      zip.file(notesPart, (await readText(zip, source.notesPart))!);
      const copiedNotes = notesPart;
      await copyRels(zip, source.notesPart, copiedNotes, (rel) => {
        if (rel.getAttribute('Type') === REL_TYPES.slide) rel.setAttribute('Target', relativeTarget(copiedNotes, part));
      });
      addOverride(types, notesPart, CONTENT_TYPES.notesSlide);
    }
    const slideRelsText = await readText(zip, relsPathFor(source.part));
    if (slideRelsText !== null) {
      const relsDoc = parseXml(slideRelsText);
      for (const rel of descendants(relsDoc, 'Relationship')) {
        const type = rel.getAttribute('Type');
        if (type === REL_TYPES.notesSlide) {
          if (notesPart) rel.setAttribute('Target', relativeTarget(part, notesPart));
          else rel.parentNode?.removeChild(rel);
        } else if (type === REL_TYPES.chart && rel.getAttribute('TargetMode') !== 'External') {
          // Charts are owned by one slide: a copied slide gets its own chart parts.
          const chart = await clonePart(zip, types, resolveTarget(source.part, rel.getAttribute('Target') ?? ''), 2);
          if (chart) rel.setAttribute('Target', relativeTarget(part, chart));
        }
      }
      zip.file(relsPathFor(part), serializeXml(relsDoc));
    }
    addOverride(types, part, CONTENT_TYPES.slide);
    const rId = newRelId();
    const rel = presRels.createElementNS(presRels.documentElement.namespaceURI, 'Relationship');
    rel.setAttribute('Id', rId);
    rel.setAttribute('Type', REL_TYPES.slide);
    rel.setAttribute('Target', relativeTarget('ppt/presentation.xml', part));
    presRels.documentElement.appendChild(rel);
    maxSldId += 1;
    output.push({ slide, part, rId, sldId: String(maxSldId), notesPart });
  }

  // Delete originals that are no longer in the deck.
  for (const original of pkg.slides) {
    if (keptOriginals.has(original.part)) continue;
    zip.remove(original.part);
    zip.remove(relsPathFor(original.part));
    removeOverride(types, original.part);
    if (original.notesPart && !output.some((entry) => entry.notesPart === original.notesPart)) {
      zip.remove(original.notesPart);
      zip.remove(relsPathFor(original.notesPart));
      removeOverride(types, original.notesPart);
    }
    for (const rel of descendants(presRels, 'Relationship')) {
      if (rel.getAttribute('Id') === original.rId) rel.parentNode?.removeChild(rel);
    }
  }

  // Text, notes and visibility.
  for (const entry of output) {
    const doc = (await readXml(zip, entry.part))!;
    for (const [shapeId, texts] of Object.entries(entry.slide.text)) setShapeText(doc, shapeId, texts);
    if (entry.slide.hidden) doc.documentElement.setAttribute('show', '0');
    else doc.documentElement.removeAttribute('show');
    zip.file(entry.part, serializeXml(doc));

    if (entry.slide.notes !== undefined) {
      if (entry.notesPart) {
        const notes = (await readXml(zip, entry.notesPart))!;
        if (setNotesBody(notes, entry.slide.notes)) zip.file(entry.notesPart, serializeXml(notes));
      } else if (pkg.notesMaster && entry.slide.notes.trim()) {
        const notesPart = `ppt/notesSlides/notesSlide${newNotesNumber()}.xml`;
        zip.file(notesPart, blankNotesXml(entry.slide.notes));
        zip.file(relsPathFor(notesPart), relsXml([
          { id: 'rId1', type: REL_TYPES.notesMaster, target: relativeTarget(notesPart, pkg.notesMaster) },
          { id: 'rId2', type: REL_TYPES.slide, target: relativeTarget(notesPart, entry.part) },
        ]));
        addOverride(types, notesPart, CONTENT_TYPES.notesSlide);
        const slideRelsText = await readText(zip, relsPathFor(entry.part));
        const slideRels = slideRelsText ? parseXml(slideRelsText) : parseXml(relsXml([]));
        const id = nextRelId(slideRels)();
        const rel = slideRels.createElementNS(slideRels.documentElement.namespaceURI, 'Relationship');
        rel.setAttribute('Id', id);
        rel.setAttribute('Type', REL_TYPES.notesSlide);
        rel.setAttribute('Target', relativeTarget(entry.part, notesPart));
        slideRels.documentElement.appendChild(rel);
        zip.file(relsPathFor(entry.part), serializeXml(slideRels));
        entry.notesPart = notesPart;
      }
    }
  }

  // Slide order.
  const list = descendants(presentation, 'p:sldIdLst')[0];
  if (list) {
    for (const child of childElements(list)) list.removeChild(child);
    for (const entry of output) {
      const sldId = presentation.createElementNS(list.namespaceURI, 'p:sldId');
      sldId.setAttribute('id', entry.sldId);
      sldId.setAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'r:id', entry.rId);
      list.appendChild(sldId);
    }
  }

  zip.file('ppt/presentation.xml', serializeXml(presentation));
  zip.file(presRelsPath, serializeXml(presRels));
  zip.file('[Content_Types].xml', serializeXml(types));

  // Keep the slide count in the document properties honest.
  const appXml = await readText(zip, 'docProps/app.xml');
  if (appXml) zip.file('docProps/app.xml', appXml.replace(/<Slides>\d+<\/Slides>/, `<Slides>${output.length}</Slides>`));

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** The AI-facing form of a preserved slide: its text shapes and notes. */
export function preserveSlideForAi(info: PreserveSlideInfo, slide: PreserveSlide): { shapes: Array<{ id: string; role: string; paragraphs: string[] }>; notes: string } {
  return {
    shapes: info.shapes.map((shape) => ({ id: shape.id, role: shape.role, paragraphs: slide.text[shape.id] ?? shape.paragraphs })),
    notes: slide.notes ?? info.notes,
  };
}

/** Current paragraphs of a shape (edited or original). */
export const currentParagraphs = (info: PreserveSlideInfo | undefined, slide: PreserveSlide, shapeId: string): string[] =>
  slide.text[shapeId] ?? info?.shapes.find((shape) => shape.id === shapeId)?.paragraphs ?? [];

export { paragraphTexts };
