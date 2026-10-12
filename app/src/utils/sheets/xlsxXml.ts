// XML and package helpers for reading and writing .xlsx files. Uses the global
// DOMParser and XMLSerializer (the webview has them; the tests install xmldom).

import JSZip from 'jszip';

export const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';

export const REL_TYPES = {
  worksheet: `${NS_REL}/worksheet`,
  styles: `${NS_REL}/styles`,
  sharedStrings: `${NS_REL}/sharedStrings`,
  theme: `${NS_REL}/theme`,
  drawing: `${NS_REL}/drawing`,
  chart: `${NS_REL}/chart`,
  table: `${NS_REL}/table`,
  comments: `${NS_REL}/comments`,
  vml: `${NS_REL}/vmlDrawing`,
  hyperlink: `${NS_REL}/hyperlink`,
  officeDocument: `${NS_REL}/officeDocument`,
} as const;

export const CONTENT_TYPES = {
  worksheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
  workbook: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  styles: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
  sharedStrings: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml',
  table: 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml',
  comments: 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml',
  drawing: 'application/vnd.openxmlformats-officedocument.drawing+xml',
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
  vml: 'application/vnd.openxmlformats-officedocument.vmlDrawing',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
} as const;

export const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escapes text and removes characters XML 1.0 cannot carry. */
export const xmlText = (text: string): string => escapeXml(text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ''));

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  return doc;
}

export const serializeXml = (node: Node): string => new XMLSerializer().serializeToString(node);

/** Child elements of a node. */
export function elements(parent: Node | null | undefined): Element[] {
  const out: Element[] = [];
  if (!parent) return out;
  for (let node = parent.firstChild; node; node = node.nextSibling) if (node.nodeType === 1) out.push(node as Element);
  return out;
}

export const localName = (el: Element): string => el.localName || el.nodeName.replace(/^.*:/, '');

export function child(parent: Element | null | undefined, name: string): Element | null {
  if (!parent) return null;
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && localName(node as Element) === name) return node as Element;
  }
  return null;
}

export function children(parent: Element | null | undefined, name: string): Element[] {
  return elements(parent).filter((el) => localName(el) === name);
}

/** A descendant by walking local names, e.g. `path(chart, 'plotArea', 'barChart')`. */
export function path(start: Element | null, ...names: string[]): Element | null {
  let current = start;
  for (const name of names) {
    current = child(current, name);
    if (!current) return null;
  }
  return current;
}

export function attr(el: Element | null | undefined, name: string): string | undefined {
  if (!el) return undefined;
  return el.hasAttribute(name) ? el.getAttribute(name) ?? undefined : undefined;
}

export function numAttr(el: Element | null | undefined, name: string): number | undefined {
  const value = attr(el, name);
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function boolAttr(el: Element | null | undefined, name: string, fallback = false): boolean {
  const value = attr(el, name);
  if (value === undefined) return fallback;
  return value === '1' || value === 'true';
}

/** The relationship id (`r:id`) of an element, whatever prefix the file used. */
export function relId(el: Element | null | undefined, name = 'id'): string | undefined {
  if (!el) return undefined;
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i += 1) {
    const a = attrs[i];
    const local = a.localName || a.nodeName.replace(/^.*:/, '');
    if (local === name && (a.namespaceURI === NS_REL || /^r:/.test(a.nodeName))) return a.value;
  }
  return undefined;
}

export const textOf = (el: Element | null | undefined): string => el?.textContent ?? '';

// ---- package paths and relationships ----

export const dirOf = (partPath: string): string => partPath.slice(0, partPath.lastIndexOf('/') + 1);

/** Resolves a relationship target against the part that owns it. */
export function resolveTarget(owner: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `${dirOf(owner)}${target}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

export const relsPathOf = (partPath: string): string => `${dirOf(partPath)}_rels/${partPath.slice(partPath.lastIndexOf('/') + 1)}.rels`;

export interface Relationship {
  id: string;
  type: string;
  target: string;
  external?: boolean;
}

export function parseRels(xml: string | undefined): Relationship[] {
  if (!xml) return [];
  return elements(parseXml(xml).documentElement).filter((el) => localName(el) === 'Relationship').map((el) => ({
    id: el.getAttribute('Id') ?? '',
    type: el.getAttribute('Type') ?? '',
    target: el.getAttribute('Target') ?? '',
    external: el.getAttribute('TargetMode') === 'External',
  }));
}

export function relsXml(rels: Relationship[]): string {
  const body = rels.map((rel) => `<Relationship Id="${escapeXml(rel.id)}" Type="${escapeXml(rel.type)}" Target="${escapeXml(rel.target)}"${rel.external ? ' TargetMode="External"' : ''}/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS_PKG_REL}">${body}</Relationships>`;
}

export const nextRelId = (rels: Relationship[]): string => {
  let max = 0;
  for (const rel of rels) {
    const n = /^rId(\d+)$/.exec(rel.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `rId${max + 1}`;
};

/** An open package: parts by path, with typed accessors for what the importer needs. */
export class Package {
  constructor(readonly zip: JSZip) {}

  static async open(data: ArrayBuffer | Uint8Array): Promise<Package> {
    return new Package(await JSZip.loadAsync(data));
  }

  has(path: string): boolean {
    return this.zip.file(path) !== null;
  }

  async text(path: string): Promise<string | undefined> {
    const file = this.zip.file(path);
    return file ? file.async('string') : undefined;
  }

  async bytes(path: string): Promise<Uint8Array | undefined> {
    const file = this.zip.file(path);
    return file ? file.async('uint8array') : undefined;
  }

  set(path: string, content: string | Uint8Array): void {
    this.zip.file(path, content);
  }

  remove(path: string): void {
    this.zip.remove(path);
  }

  list(prefix = ''): string[] {
    return Object.keys(this.zip.files).filter((name) => !this.zip.files[name].dir && name.startsWith(prefix));
  }

  async rels(ownerPath: string): Promise<Relationship[]> {
    return parseRels(await this.text(relsPathOf(ownerPath)));
  }
}

export interface ContentTypes {
  defaults: Map<string, string>;
  overrides: Map<string, string>;
}

export async function readContentTypes(pkg: Package): Promise<ContentTypes> {
  const types: ContentTypes = { defaults: new Map(), overrides: new Map() };
  const xml = await pkg.text('[Content_Types].xml');
  if (!xml) return types;
  for (const el of elements(parseXml(xml).documentElement)) {
    const name = localName(el);
    if (name === 'Default') types.defaults.set((el.getAttribute('Extension') ?? '').toLowerCase(), el.getAttribute('ContentType') ?? '');
    else if (name === 'Override') types.overrides.set(el.getAttribute('PartName') ?? '', el.getAttribute('ContentType') ?? '');
  }
  return types;
}

export function contentTypesXml(types: ContentTypes): string {
  const defaults = [...types.defaults].map(([ext, type]) => `<Default Extension="${escapeXml(ext)}" ContentType="${escapeXml(type)}"/>`).join('');
  const overrides = [...types.overrides].map(([part, type]) => `<Override PartName="${escapeXml(part)}" ContentType="${escapeXml(type)}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="${NS_CT}">${defaults}${overrides}</Types>`;
}
