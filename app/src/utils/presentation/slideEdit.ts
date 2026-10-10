// Edits a slide's SVG element by element: the editor's move, resize, delete,
// duplicate, reorder, insert, background and theme operations. Modelled
// elements (`<g data-el data-m>`, from imported PowerPoint slides and the
// editor's own text boxes, shapes and pictures) re-render from their model.
// Drawn artwork (AI slides, charts) becomes an "art" element: a group with
// its box (`data-box`), its original box (`data-box0`) and a transform that
// maps one onto the other. Uses the global DOMParser / XMLSerializer.

import {
  escapeXml,
  fitToText,
  renderElement,
  resizeElement as resizeModel,
  reidElement,
  translateElement,
  type Box,
  type Measure,
  type Paint,
  type SlideElement,
  type TxBody,
} from './slideModel';

const SVG_NS = 'http://www.w3.org/2000/svg';

const parse = (svg: string): Document => new DOMParser().parseFromString(svg, 'image/svg+xml');
const serialize = (doc: Document): string => new XMLSerializer().serializeToString(doc.documentElement);
const tagOf = (node: Node): string => ((node as Element).localName || node.nodeName).replace(/^.*:/, '').toLowerCase();
const elementKids = (node: Node): Element[] => Array.from(node.childNodes).filter((child) => child.nodeType === 1) as Element[];
const n2 = (value: number): string => (Math.round(value * 100) / 100).toString();

/** Parses one rendered element (a fragment) into a node owned by `doc`. */
function fragment(doc: Document, markup: string): Element {
  const wrapper = parse(`<svg xmlns="${SVG_NS}">${markup}</svg>`);
  return doc.importNode(elementKids(wrapper.documentElement)[0], true) as Element;
}

export interface ElementInfo {
  id: string;
  kind: string;
  box: Box;
  rot: number;
  model: SlideElement | null;
}

const parseBox = (value: string | null): Box | null => {
  const n = (value ?? '').trim().split(/[\s,]+/).map(Number);
  return n.length === 4 && n.every(Number.isFinite) ? { x: n[0], y: n[1], w: n[2], h: n[3] } : null;
};

export function readModel(el: Element): SlideElement | null {
  const raw = el.getAttribute('data-m');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SlideElement;
  } catch {
    return null;
  }
}

function infoOf(el: Element): ElementInfo | null {
  const id = el.getAttribute('data-el');
  if (!id) return null;
  const model = readModel(el);
  const box = model?.box ?? parseBox(el.getAttribute('data-box'));
  if (!box) return null;
  return { id, kind: el.getAttribute('data-kind') ?? model?.k ?? 'art', box, rot: model?.rot ?? 0, model };
}

/** The slide's own elements (top level, in z-order). */
export function listElements(svg: string): ElementInfo[] {
  if (!svg) return [];
  const root = parse(svg).documentElement;
  return elementKids(root).map(infoOf).filter((info): info is ElementInfo => Boolean(info));
}

const topElement = (doc: Document, id: string): Element | null => elementKids(doc.documentElement).find((el) => el.getAttribute('data-el') === id) ?? null;

export function elementModel(svg: string, id: string): SlideElement | null {
  const el = topElement(parse(svg), id);
  return el ? readModel(el) : null;
}

/** A fresh element id that is not used on the slide. */
export function nextElementId(svg: string): string {
  let max = 0;
  for (const match of svg.matchAll(/data-el="e(\d+)"/g)) max = Math.max(max, Number(match[1]));
  return `e${max + 1}`;
}

function idFactory(svg: string): () => string {
  let max = 0;
  for (const match of svg.matchAll(/data-(?:el|tpl)="e(\d+)"/g)) max = Math.max(max, Number(match[1]));
  return () => `e${++max}`;
}

// Art elements --------------------------------------------------------------------------------------

function setArtBox(el: Element, box: Box): void {
  const box0 = parseBox(el.getAttribute('data-box0')) ?? box;
  const sx = box0.w > 0 ? box.w / box0.w : 1;
  const sy = box0.h > 0 ? box.h / box0.h : 1;
  el.setAttribute('data-box', `${n2(box.x)} ${n2(box.y)} ${n2(box.w)} ${n2(box.h)}`);
  const tx = box.x - box0.x * sx;
  const ty = box.y - box0.y * sy;
  el.setAttribute('transform', Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4 ? `translate(${n2(tx)} ${n2(ty)})` : `matrix(${n2(sx)} 0 0 ${n2(sy)} ${n2(tx)} ${n2(ty)})`);
}

/**
 * Wraps the `index`-th top-level node of drawn (AI) artwork in an art group so
 * it can be moved and resized. `bbox` is its box in slide units, measured where
 * it is drawn. Returns the new id, or the existing one when already an element.
 */
export function adoptNode(svg: string, index: number, bbox: Box): { svg: string; id: string } | null {
  const doc = parse(svg);
  const node = elementKids(doc.documentElement)[index];
  if (!node || tagOf(node) === 'defs' || node.hasAttribute('data-bg') || node.hasAttribute('data-layer')) return null;
  const existing = node.getAttribute('data-el');
  if (existing) return { svg, id: existing };
  const id = idFactory(svg)();
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('data-el', id);
  group.setAttribute('data-kind', 'art');
  group.setAttribute('data-box0', `${n2(bbox.x)} ${n2(bbox.y)} ${n2(bbox.w)} ${n2(bbox.h)}`);
  doc.documentElement.insertBefore(group, node);
  group.appendChild(node);
  setArtBox(group, bbox);
  return { svg: serialize(doc), id };
}

// Operations -----------------------------------------------------------------------------------------

export interface EditOptions {
  measure: Measure;
  /** Re-run shrink-on-overflow on the edited text. */
  refit?: boolean;
}

/** Replaces a modelled element with a new model (re-rendered). */
export function replaceElement(svg: string, id: string, model: SlideElement, options: EditOptions): string {
  const doc = parse(svg);
  const el = topElement(doc, id);
  if (!el) return svg;
  const next = fragment(doc, renderElement(fitToText({ ...model, id }, options.measure), { measure: options.measure, refit: options.refit }));
  el.parentNode!.replaceChild(next, el);
  return serialize(doc);
}

/** Moves elements by dx, dy (slide units). */
export function moveElements(svg: string, ids: string[], dx: number, dy: number, options: EditOptions): string {
  if (!dx && !dy) return svg;
  const doc = parse(svg);
  for (const id of ids) {
    const el = topElement(doc, id);
    if (!el) continue;
    const model = readModel(el);
    if (model) {
      el.parentNode!.replaceChild(fragment(doc, renderElement(translateElement(model, dx, dy), { measure: options.measure })), el);
    } else {
      const box = parseBox(el.getAttribute('data-box'));
      if (box) setArtBox(el, { ...box, x: box.x + dx, y: box.y + dy });
    }
  }
  return serialize(doc);
}

/** Resizes one element into `box`. */
export function resizeElement(svg: string, id: string, box: Box, options: EditOptions): string {
  const doc = parse(svg);
  const el = topElement(doc, id);
  if (!el) return svg;
  const model = readModel(el);
  if (model) {
    el.parentNode!.replaceChild(fragment(doc, renderElement(fitToText(resizeModel(model, box), options.measure), { measure: options.measure, refit: true })), el);
  } else setArtBox(el, box);
  return serialize(doc);
}

export function deleteElements(svg: string, ids: string[]): string {
  const doc = parse(svg);
  for (const id of ids) {
    const el = topElement(doc, id);
    el?.parentNode?.removeChild(el);
  }
  return serialize(doc);
}

/** The markup of elements, for the clipboard. */
export function copyElements(svg: string, ids: string[]): string[] {
  const doc = parse(svg);
  const serializer = new XMLSerializer();
  return ids.map((id) => topElement(doc, id)).filter((el): el is Element => Boolean(el)).map((el) => serializer.serializeToString(el));
}

/** Adds copied elements on top, `offset` px down and right, with fresh ids. Returns the new ids. */
export function pasteElements(svg: string, fragments: string[], offset: number, options: EditOptions): { svg: string; ids: string[] } {
  const doc = parse(svg);
  const nextId = idFactory(svg);
  const created: string[] = [];
  for (const markup of fragments) {
    const el = fragment(doc, markup);
    if (!el || !el.getAttribute('data-el')) continue;
    const model = readModel(el);
    let copy: Element;
    if (model) {
      copy = fragment(doc, renderElement(translateElement(reidElement(model, nextId), offset, offset), { measure: options.measure }));
    } else {
      copy = el;
      const newId = nextId();
      copy.setAttribute('data-el', newId);
      // Ids inside drawn artwork must stay unique on the slide.
      const suffix = `-${newId}`;
      const renamed = new Map<string, string>();
      for (const node of Array.from(copy.getElementsByTagName('*'))) {
        const old = node.getAttribute('id');
        if (old) { renamed.set(old, old + suffix); node.setAttribute('id', old + suffix); }
      }
      if (renamed.size) {
        for (const node of [copy, ...Array.from(copy.getElementsByTagName('*'))]) {
          for (const attribute of Array.from(node.attributes)) {
            const value = attribute.value.replace(/url\(#([^)]+)\)/g, (match, ref: string) => (renamed.has(ref) ? `url(#${renamed.get(ref)})` : match))
              .replace(/^#(.+)$/, (match, ref: string) => (renamed.has(ref) ? `#${renamed.get(ref)}` : match));
            if (value !== attribute.value) node.setAttribute(attribute.name, value);
          }
        }
      }
      const box = parseBox(copy.getAttribute('data-box'));
      if (box) setArtBox(copy, { ...box, x: box.x + offset, y: box.y + offset });
    }
    created.push(copy.getAttribute('data-el') ?? '');
    doc.documentElement.appendChild(copy);
  }
  return { svg: serialize(doc), ids: created };
}

/** Copies elements `offset` px down and right; returns the copies' ids. */
export function duplicateElements(svg: string, ids: string[], offset: number, options: EditOptions): { svg: string; ids: string[] } {
  return pasteElements(svg, copyElements(svg, ids), offset, options);
}

/** Replaces several modelled elements through `change` (elements without a model are left alone). */
export function updateModels(svg: string, ids: string[], change: (model: SlideElement) => SlideElement, options: EditOptions): string {
  const doc = parse(svg);
  for (const id of ids) {
    const el = topElement(doc, id);
    const model = el ? readModel(el) : null;
    if (!el || !model) continue;
    const next = change(model);
    if (next === model) continue;
    el.parentNode!.replaceChild(fragment(doc, renderElement(fitToText({ ...next, id }, options.measure), { measure: options.measure, refit: options.refit })), el);
  }
  return serialize(doc);
}

/** The slide with every element removed: background and master artwork only. */
export function blankSlide(svg: string): string {
  const doc = parse(svg);
  for (const el of elementKids(doc.documentElement)) {
    if (tagOf(el) === 'defs' || el.hasAttribute('data-bg') || el.hasAttribute('data-layer')) continue;
    // Drawn slides keep a full-canvas first rectangle as their background.
    if (el === elementKids(doc.documentElement).find((node) => tagOf(node) !== 'defs') && tagOf(el) === 'rect') continue;
    el.parentNode?.removeChild(el);
  }
  return serialize(doc);
}

export type Arrange = 'front' | 'back' | 'forward' | 'backward';

/** Changes an element's place in the z-order (never behind the background or master artwork). */
export function arrangeElement(svg: string, id: string, how: Arrange): string {
  const doc = parse(svg);
  const root = doc.documentElement;
  const el = topElement(doc, id);
  if (!el) return svg;
  const movable = (node: Element): boolean => node.hasAttribute('data-el');
  const siblings = elementKids(root);
  const index = siblings.indexOf(el);
  if (how === 'front') root.appendChild(el);
  else if (how === 'back') {
    const first = siblings.find(movable);
    if (first && first !== el) root.insertBefore(el, first);
  } else if (how === 'forward') {
    const next = siblings.slice(index + 1).find(movable);
    if (next) root.insertBefore(el, next.nextSibling);
  } else {
    const previous = siblings.slice(0, index).reverse().find(movable);
    if (previous) root.insertBefore(el, previous);
  }
  return serialize(doc);
}

/** Adds a modelled element on top (or above `afterId`). */
export function insertElement(svg: string, model: SlideElement, options: EditOptions): { svg: string; id: string } {
  const doc = parse(svg);
  const id = idFactory(svg)();
  doc.documentElement.appendChild(fragment(doc, renderElement(fitToText({ ...model, id }, options.measure), { measure: options.measure })));
  return { svg: serialize(doc), id };
}

/** The slide's background colour (its first full-canvas rectangle), or null. */
export function backgroundColor(svg: string): string | null {
  const doc = parse(svg);
  const first = elementKids(doc.documentElement).find((el) => tagOf(el) !== 'defs');
  if (!first) return null;
  const rect = first.hasAttribute('data-bg') && tagOf(first) === 'g' ? elementKids(first).find((el) => tagOf(el) === 'rect') ?? null : tagOf(first) === 'rect' ? first : null;
  const fill = rect?.getAttribute('fill') ?? '';
  return /^#[0-9a-f]{6}$/i.test(fill) ? fill.toUpperCase() : null;
}

/** Sets a solid background colour (replacing a picture or gradient background). */
export function setBackground(svg: string, color: string): string {
  const doc = parse(svg);
  const root = doc.documentElement;
  const box = (root.getAttribute('viewBox') ?? '0 0 1280 720').split(/[\s,]+/).map(Number);
  const first = elementKids(root).find((el) => tagOf(el) !== 'defs');
  const rect = doc.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('data-bg', '1');
  rect.setAttribute('x', String(box[0] || 0));
  rect.setAttribute('y', String(box[1] || 0));
  rect.setAttribute('width', String(box[2] || 1280));
  rect.setAttribute('height', String(box[3] || 720));
  rect.setAttribute('fill', color);
  const isBackground = first && (first.hasAttribute('data-bg') || (tagOf(first) === 'rect' && Number(first.getAttribute('width')) >= (box[2] || 1280) - 1 && Number(first.getAttribute('height')) >= (box[3] || 720) - 1));
  if (first && isBackground) root.replaceChild(rect, first);
  else root.insertBefore(rect, first ?? null);
  return serialize(doc);
}

/** The slide without the editor's model data: what the AI reads. */
export function svgForAi(svg: string): string {
  return svg.replace(/\sdata-m="[^"]*"/g, '').replace(/\sdata-(?:box0|box|tpl|layer|model)="[^"]*"/g, '');
}

/** Every model on the slide. */
export function slideModels(svg: string): SlideElement[] {
  return listElements(svg).map((info) => info.model).filter((model): model is SlideElement => Boolean(model));
}

// Theme ------------------------------------------------------------------------------------------------

export interface ThemeMap {
  color: (hex: string) => string;
  font: (family: string) => string;
  /** The new palette's light and dark ink: text that would become hard to read switches to one of them. */
  ink?: { light: string; dark: string };
}

const COLOR_ATTRIBUTES = ['fill', 'stroke', 'stop-color', 'flood-color', 'color'];

function mapModel(value: unknown, map: ThemeMap, key = ''): unknown {
  if (typeof value === 'string') {
    if ((key === 'c' || key === 'ec') && /^#[0-9a-f]{6}$/i.test(value)) return map.color(value);
    if (key === 'f' || key === 'ef') return map.font(value);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => mapModel(entry, map));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(value)) out[name] = mapModel(entry, map, name);
    return out;
  }
  return value;
}

const channel = (value: number): number => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Keeps text readable after a recolour: each run is checked against the fill really
 * underneath it (its own shape, else the last filled shape below its centre, else the
 * slide background) and swaps to the theme's light or dark ink below 3:1. Text over
 * pictures is left alone.
 */
export function fixTextContrast(models: SlideElement[], background: string, ink: { light: string; dark: string }): SlideElement[] {
  const layers: Array<{ box: Box; color: string | null }> = [];
  const centre = (box: Box): [number, number] => [box.x + box.w / 2, box.y + box.h / 2];
  const under = (box: Box): string | null => {
    const [x, y] = centre(box);
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i].box;
      if (x >= layer.x && x <= layer.x + layer.w && y >= layer.y && y <= layer.y + layer.h) return layers[i].color;
    }
    return background;
  };
  const readable = (color: string | undefined, base: string): string | undefined => {
    if (!color || contrast(color, base) >= 3) return color;
    return [ink.dark, ink.light, '#111111', '#FFFFFF'].reduce((best, candidate) => (contrast(candidate, base) > contrast(best, base) ? candidate : best));
  };
  const fixBody = (body: TxBody, base: string | null): TxBody => (base ? {
    ...body,
    p: body.p.map((para) => ({
      ...para,
      ec: readable(para.ec, base),
      bu: para.bu?.c ? { ...para.bu, c: readable(para.bu.c, base) } : para.bu,
      r: para.r.map((run) => (run.c ? { ...run, c: readable(run.c, base) } : run)),
    })),
  } : body);
  const solid = (paint: Paint): string | null => (paint.t === 'solid' && (paint.a ?? 1) > 0.5 ? paint.c : null);
  const visit = (el: SlideElement): SlideElement => {
    switch (el.k) {
      case 'group': return { ...el, ch: el.ch.map(visit) };
      case 'shape': {
        const own = solid(el.fill);
        const next = el.tx ? { ...el, tx: fixBody(el.tx, own ?? under(el.box)) } : el;
        if (own) layers.push({ box: el.box, color: own });
        else if (el.fill.t === 'img' || el.fill.t === 'grad') layers.push({ box: el.box, color: null });
        return next;
      }
      case 'table': {
        const base = under(el.box);
        return { ...el, rows: el.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => (cell.merged ? cell : { ...cell, tx: fixBody(cell.tx, solid(cell.fill) ?? base) })) })) };
      }
      case 'pic':
        layers.push({ box: el.box, color: null });
        return el;
      default: return el;
    }
  };
  return models.map(visit);
}

/** Recolours and re-fonts a slide: models (slide and master artwork) are mapped and re-rendered, drawn artwork is mapped attribute by attribute. */
export function applyThemeMap(svg: string, map: ThemeMap, options: EditOptions): string {
  const doc = parse(svg);
  const mapStack = (stack: string): string => {
    const parts = stack.split(',');
    const first = parts[0].trim().replace(/^['"]|['"]$/g, '');
    const next = map.font(first);
    return next === first ? stack : [`'${next.replace(/['"\\]/g, '')}'`, ...parts.slice(1)].join(',');
  };
  const modelled: Element[] = [];
  const visit = (el: Element): void => {
    if (el.hasAttribute('data-m')) { modelled.push(el); return; }
    for (const name of COLOR_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value && /^#[0-9a-f]{3,6}$/i.test(value.trim())) el.setAttribute(name, map.color(value.trim().length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value.trim()));
    }
    const family = el.getAttribute('font-family');
    if (family) el.setAttribute('font-family', mapStack(family));
    const style = el.getAttribute('style');
    if (style) {
      el.setAttribute('style', style.replace(/(fill|stroke|stop-color|flood-color|color)\s*:\s*(#[0-9a-f]{6})/gi, (_match, prop: string, hex: string) => `${prop}:${map.color(hex)}`)
        .replace(/font-family\s*:\s*([^;]+)/gi, (_match, stack: string) => `font-family:${mapStack(stack)}`));
    }
    for (const child of elementKids(el)) visit(child);
  };
  for (const child of elementKids(doc.documentElement)) visit(child);
  let models = modelled.map((el) => mapModel(readModel(el), map) as SlideElement | null);
  if (map.ink) {
    const present = models.filter((model): model is SlideElement => Boolean(model));
    const fixed = fixTextContrast(present, backgroundColor(serialize(doc)) ?? '#FFFFFF', map.ink);
    let index = 0;
    models = models.map((model) => (model ? fixed[index++] : model));
  }
  modelled.forEach((el, i) => {
    const model = models[i];
    if (!model) return;
    let markup = renderElement(model, { measure: options.measure, refit: true });
    // Master artwork is drawn but not selectable.
    if (el.hasAttribute('data-tpl')) markup = markup.replace(/^<g data-el="/, '<g data-tpl="');
    el.parentNode!.replaceChild(fragment(doc, markup), el);
  });
  return serialize(doc);
}

// Colour mapping between palettes ----------------------------------------------------------------------

const rgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16) / 255) as [number, number, number];
};
const toHex = (r: number, g: number, b: number): string => `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

function hsl([r, g, b]: [number, number, number]): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  if (s === 0) return toHex(l, l, l);
  const f = (p: number, q: number, t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return toHex(f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3));
}

const luma = ([r, g, b]: [number, number, number]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export interface PaletteRoles {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
}

/**
 * Maps colours from one palette to another. Greys and near-neutrals follow the
 * background → text ramp; colourful values take the hue of the nearest accent
 * role, keeping their own lightness offset from it.
 */
export function paletteColorMap(from: PaletteRoles, to: PaletteRoles): (hex: string) => string {
  const cache = new Map<string, string>();
  const fromBg = rgb(from.background);
  const fromText = rgb(from.text);
  const toBg = rgb(to.background);
  const toText = rgb(to.text);
  const roles: Array<keyof PaletteRoles> = ['primary', 'secondary', 'accent', 'surface', 'muted', 'background', 'text'];
  return (hex: string): string => {
    const key = hex.toUpperCase();
    const cached = cache.get(key);
    if (cached) return cached;
    let out = key;
    for (const role of roles) if (from[role].toUpperCase() === key) { out = to[role].toUpperCase(); cache.set(key, out); return out; }
    const value = rgb(key);
    const [h, s, l] = hsl(value);
    // Neutral by chroma: very light and very dark tints have a high HSL saturation but no real hue.
    if (Math.max(...value) - Math.min(...value) < 0.14 || s < 0.12) {
      // Neutral: place it on the background → text ramp.
      const span = luma(fromText) - luma(fromBg);
      const t = Math.abs(span) < 0.05 ? 0 : Math.max(0, Math.min(1, (luma(value) - luma(fromBg)) / span));
      out = toHex(toBg[0] + (toText[0] - toBg[0]) * t, toBg[1] + (toText[1] - toBg[1]) * t, toBg[2] + (toText[2] - toBg[2]) * t);
    } else {
      let best: keyof PaletteRoles = 'primary';
      let distance = Infinity;
      for (const role of ['primary', 'secondary', 'accent'] as Array<keyof PaletteRoles>) {
        const [rh, rs] = hsl(rgb(from[role]));
        const dh = Math.min(Math.abs(rh - h), 1 - Math.abs(rh - h));
        const d = dh * 2 + Math.abs(rs - s) * 0.5;
        if (d < distance) { distance = d; best = role; }
      }
      const [, , rl] = hsl(rgb(from[best]));
      const [th, ts, tl] = hsl(rgb(to[best]));
      out = fromHsl(th, Math.max(0, Math.min(1, ts * (s / Math.max(0.01, hsl(rgb(from[best]))[1])))), Math.max(0, Math.min(1, tl + (l - rl))));
    }
    cache.set(key, out);
    return out;
  };
}

/** The new model for a text box placed at `box`. */
export function textBoxModel(box: Box, text: string, style: { font: string; size: number; color: string; bold?: boolean; align?: 'l' | 'c' | 'r' }): SlideElement {
  return {
    k: 'shape',
    id: 'new',
    box,
    geom: { prst: 'rect' },
    fill: { t: 'none' },
    line: null,
    tx: {
      p: text.split('\n').map((line) => ({ r: [{ t: line, sz: style.size, f: style.font, c: style.color, ...(style.bold ? { b: true } : {}) }], al: style.align ?? 'l', esz: style.size, ef: style.font })),
      ins: [9.6, 4.8, 9.6, 4.8],
      anc: 't',
      wrap: true,
      fit: 'shape',
    },
  };
}

export const escapeForSvg = escapeXml;
