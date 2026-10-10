// Repairs and sanitises the slide SVG an AI writes, and prepares stored SVG
// for display. The model's markup is untrusted: only an allowlist of SVG
// elements, attributes and style properties survives, links may point only
// inside the document, into the deck's `assets/` folder or at inline images,
// and nothing executable is kept. Uses the global DOMParser / XMLSerializer
// (the tests install @xmldom/xmldom).

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path',
  'text', 'tspan', 'image', 'use', 'symbol', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'pattern',
  'marker', 'filter', 'fedropshadow', 'fegaussianblur', 'feoffset', 'feflood', 'fecomposite', 'femerge',
  'femergenode', 'fecolormatrix', 'feblend',
]);

/** Elements whose children are kept when the element itself is not. */
const UNWRAP = new Set(['a', 'switch']);

const ATTRIBUTES = new Set([
  'id', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'width', 'height', 'd', 'points',
  'transform', 'viewbox', 'preserveaspectratio', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'alignment-baseline', 'baseline-shift', 'letter-spacing', 'word-spacing', 'text-decoration', 'dx', 'dy', 'href',
  'xlink:href', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod',
  'clip-path', 'clippathunits', 'filter', 'filterunits', 'primitiveunits', 'in', 'in2', 'result', 'stddeviation',
  'flood-color', 'flood-opacity', 'operator', 'k1', 'k2', 'k3', 'k4', 'mode', 'values', 'type', 'markerwidth',
  'markerheight', 'refx', 'refy', 'orient', 'markerunits', 'marker-start', 'marker-mid', 'marker-end',
  'patternunits', 'patterncontentunits', 'patterntransform', 'xml:space', 'lang', 'xml:lang', 'style', 'vector-effect',
  'shape-rendering', 'text-rendering', 'visibility', 'display', 'paint-order', 'color', 'xmlns', 'xmlns:xlink',
  'version', 'textlength', 'lengthadjust',
]);

const STYLE_PROPERTIES = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'word-spacing', 'text-decoration', 'stop-color',
  'stop-opacity', 'flood-color', 'flood-opacity', 'vector-effect', 'shape-rendering', 'visibility', 'display',
  'paint-order', 'color', 'mix-blend-mode', 'isolation',
]);

/** HTML named entities models put in SVG, which XML rejects. */
const ENTITIES: Record<string, string> = {
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', mdash: '—', ndash: '–', hellip: '…', minus: '−',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔', rArr: '⇒', lArr: '⇐', bull: '•', middot: '·', copy: '©',
  reg: '®', trade: '™', deg: '°', times: '×', divide: '÷', plusmn: '±', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', euro: '€', pound: '£', yen: '¥', cent: '¢',
  sect: '§', para: '¶', le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', check: '✓', prime: '′', Prime: '″',
  micro: 'µ', frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', permil: '‰', dagger: '†',
  Dagger: '‡', loz: '◊', spades: '♠', clubs: '♣', hearts: '♥', diams: '♦', star: '☆', starf: '★', iexcl: '¡',
  iquest: '¿', shy: '­', zwj: '‍', zwnj: '‌', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ',
  pi: 'π', sigma: 'σ', Sigma: 'Σ', mu: 'μ', lambda: 'λ', omega: 'ω', Omega: 'Ω', theta: 'θ',
};

export interface SanitizedSvg {
  svg: string;
  width: number;
  height: number;
}

/** Fixes what models typically get wrong about XML before it is parsed. */
export function repairSvgMarkup(raw: string): string {
  let text = raw.replace(/^﻿/, '');
  const start = text.search(/<svg[\s>]/i);
  const end = text.toLowerCase().lastIndexOf('</svg>');
  if (start >= 0 && end > start) text = text.slice(start, end + 6);
  // Comments may hold `--` sequences or stray markup; nothing in them is needed.
  text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  text = text.replace(/&([A-Za-z][A-Za-z0-9]*);/g, (match, name: string) => {
    if (/^(amp|lt|gt|quot|apos)$/.test(name)) return match;
    return ENTITIES[name] ?? '';
  });
  text = text.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  if (!/\sxmlns=/.test(text.slice(0, text.indexOf('>')))) text = text.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (/xlink:href/.test(text) && !/xmlns:xlink=/.test(text)) text = text.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  return text;
}

/**
 * Whether every element opened is closed in order. Browsers report bad XML
 * as a <parsererror> document, but some parsers recover silently, and an AI
 * run cut off mid-slide must never pass as a finished page.
 */
export function tagsBalanced(markup: string): boolean {
  const stack: string[] = [];
  const body = markup.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  for (const match of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0 && !/<[A-Za-z/][^>]*$/.test(body);
}

const localName = (node: Node): string => {
  const name = (node as Element).localName || node.nodeName;
  return name.replace(/^.*:/, '').toLowerCase();
};

/** `#id`, an inline raster/SVG image, or a plain relative path inside the deck folder. */
export function safeHref(value: string): boolean {
  const href = value.trim();
  if (/^#[\w.:-]+$/.test(href)) return true;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(href)) return true;
  return /^[\w][\w./ -]*$/.test(href) && !href.split('/').includes('..') && !/^[a-z][\w+.-]*:/i.test(href);
}

/** Every `url(…)` in a value must be a local reference. */
const safeUrls = (value: string): boolean => [...value.matchAll(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi)].every((match) => /^#[\w.:-]+$/.test(match[2].trim()));

function cleanStyle(style: string): string {
  const kept: string[] = [];
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!STYLE_PROPERTIES.has(property) || !value) continue;
    if (/[\\@<>]|expression|javascript:/i.test(value) || !safeUrls(value)) continue;
    kept.push(`${property}:${value}`);
  }
  return kept.join(';');
}

function cleanElement(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    const keep = (name.startsWith('data-') && /^data-[\w-]+$/.test(name))
      || (ATTRIBUTES.has(name) && !name.startsWith('on'));
    if (!keep) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === 'href' || name === 'xlink:href') {
      if (!safeHref(value)) element.removeAttribute(attribute.name);
    } else if (name === 'style') {
      const style = cleanStyle(value);
      if (style) element.setAttribute('style', style);
      else element.removeAttribute('style');
    } else if (/url\(/i.test(value) && !safeUrls(value)) {
      element.removeAttribute(attribute.name);
    } else if (/javascript:/i.test(value)) {
      element.removeAttribute(attribute.name);
    }
  }
}

function walk(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) {
      const element = child as Element;
      const name = localName(element);
      if (ELEMENTS.has(name)) {
        cleanElement(element);
        walk(element);
      } else if (UNWRAP.has(name)) {
        walk(element);
        while (element.firstChild) node.insertBefore(element.firstChild, element);
        node.removeChild(element);
      } else {
        node.removeChild(element);
      }
    } else if (child.nodeType !== 3 && child.nodeType !== 4) {
      // Comments, processing instructions, entity references.
      node.removeChild(child);
    }
  }
}

function parseViewBox(value: string | null): { x: number; y: number; width: number; height: number } | null {
  if (!value) return null;
  const numbers = value.trim().split(/[\s,]+/).map(Number);
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n)) || numbers[2] <= 0 || numbers[3] <= 0) return null;
  return { x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] };
}

/**
 * Parses, repairs and sanitises one slide's SVG. The root keeps (or gets)
 * a `viewBox` of the slide canvas and loses its fixed size, so it scales to
 * whatever box shows it. Throws with a readable message when it is not SVG.
 */
export function sanitizeSvg(raw: string, canvas: { width: number; height: number }): SanitizedSvg {
  const markup = repairSvgMarkup(raw);
  if (!/^<svg[\s>]/i.test(markup)) throw new Error('The reply has no <svg> element.');
  if (!tagsBalanced(markup)) throw new Error('The slide SVG is not well-formed XML (it may have been cut off).');
  const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = document.documentElement;
  if (!root || localName(root) !== 'svg' || document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The slide SVG is not well-formed XML.');
  }
  walk(document);
  cleanElement(root);
  const box = parseViewBox(root.getAttribute('viewBox'));
  const width = box?.width ?? (Number(root.getAttribute('width')) || canvas.width);
  const height = box?.height ?? (Number(root.getAttribute('height')) || canvas.height);
  if (!box) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.removeAttribute('width');
  root.removeAttribute('height');
  // The repaired markup always declares the SVG namespace, so the serialiser keeps it.
  const svg = new XMLSerializer().serializeToString(root);
  return { svg, width, height };
}

/** The `viewBox` size of stored SVG (the canvas when it has none). */
export function svgSize(svg: string, fallback: { width: number; height: number }): { width: number; height: number } {
  const match = svg.match(/<svg\b[^>]*\sviewBox="([^"]*)"/i);
  const box = parseViewBox(match?.[1] ?? null);
  return box ? { width: box.width, height: box.height } : fallback;
}

export interface DisplayOptions {
  /** Prefix for every id, unique per rendered copy: several slides share one HTML document. */
  prefix: string;
  /** Turns an `assets/…` href into a URL the webview can load. */
  resolveHref?: (href: string) => string;
  /** Tags `<text>` and `<image>` elements with their index, for click-to-edit. */
  indexTargets?: boolean;
}

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Stored SVG made ready for inline display. String-only, so it is cheap for thumbnails. */
export function prepareSvgForDisplay(svg: string, options: DisplayOptions): string {
  const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const scoped = (id: string): string => (ids.has(id) ? `${options.prefix}-${id}` : id);
  let out = svg.replace(/(\sid=")([^"]+)(")|url\(\s*#([^)\s]+)\s*\)|(\s(?:xlink:)?href=")#([^"]+)(")/g, (_match, a1, id1, a3, urlId, h1, hrefId, h3) => {
    if (id1 !== undefined) return `${a1}${scoped(id1)}${a3}`;
    if (urlId !== undefined) return `url(#${scoped(urlId)})`;
    return `${h1}#${scoped(hrefId)}${h3}`;
  });
  if (options.resolveHref) {
    const resolve = options.resolveHref;
    out = out.replace(/(\s(?:xlink:)?href=")(?!#|data:)([^"]+)(")/g, (_match, a, href: string, b) => `${a}${escapeAttribute(resolve(href.replace(/&amp;/g, '&')))}${b}`);
  }
  if (options.indexTargets) {
    let text = 0;
    let image = 0;
    out = out.replace(/<text\b/g, () => `<text data-ti="${text++}"`).replace(/<image\b/g, () => `<image data-ii="${image++}"`);
  }
  return out.replace(/<svg\b/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
}

/** Every `assets/…` path the slide references. */
export function svgAssetRefs(svg: string): string[] {
  return [...new Set([...svg.matchAll(/\s(?:xlink:)?href="(?!#|data:)([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, '&')))];
}
