// Sanitizer for the HTML an AI draws app screens and web pages with. The output is
// untrusted: it is shown in a script-less sandboxed frame, but this still
// allowlists every tag, attribute and CSS url, and repairs cut-off markup so a
// half-streamed reply can be shown. Dependency-free (no DOM), so it runs in tests.

const VOID = new Set(['br', 'hr', 'img', 'input', 'wbr', 'source', 'col']);

const HTML_TAGS = new Set([
  'div', 'span', 'p', 'a', 'b', 'i', 'u', 's', 'em', 'strong', 'small', 'sub', 'sup', 'mark', 'code', 'pre', 'kbd', 'blockquote', 'q', 'cite',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'br', 'hr', 'wbr',
  'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'figure', 'figcaption', 'address', 'details', 'summary',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'img', 'picture', 'source', 'button', 'input', 'label', 'select', 'option', 'textarea', 'fieldset', 'legend', 'progress', 'meter',
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop',
  'clippath', 'text', 'tspan', 'title', 'desc',
]);

/** Elements whose whole content is dropped, not just the tag. */
const DROP_WITH_CONTENT = new Set(['script', 'iframe', 'object', 'embed', 'noscript', 'template', 'frame', 'frameset', 'applet', 'audio', 'video', 'canvas', 'math']);

const GLOBAL_ATTRS = new Set(['class', 'id', 'style', 'title', 'alt', 'role', 'dir', 'lang', 'hidden', 'tabindex', 'data-goto']);
const TAG_ATTRS: Record<string, string[]> = {
  a: ['href'],
  img: ['src', 'width', 'height', 'loading'],
  source: ['src'],
  input: ['type', 'placeholder', 'value', 'checked', 'disabled', 'name', 'min', 'max', 'step', 'readonly'],
  button: ['type', 'disabled'],
  label: ['for'],
  select: ['disabled', 'multiple'],
  option: ['value', 'selected'],
  textarea: ['placeholder', 'rows', 'cols', 'disabled', 'readonly'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  col: ['span'],
  progress: ['value', 'max'],
  meter: ['value', 'min', 'max'],
  ol: ['start', 'reversed'],
  details: ['open'],
  svg: ['viewbox', 'width', 'height', 'xmlns', 'preserveaspectratio', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity'],
};
const SVG_ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'offset', 'stop-color',
  'stop-opacity', 'gradientunits', 'gradienttransform', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'clip-path',
]);
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'text', 'tspan']);
const CAMEL: Record<string, string> = { viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio', gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform' };
const CAMEL_TAGS: Record<string, string> = { lineargradient: 'linearGradient', radialgradient: 'radialGradient', clippath: 'clipPath' };

const PHOTO = /^photo:\s*(.+)$/i;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)(?:;[\w=.-]+)*;base64,[A-Za-z0-9+/=\s]+$/i;
const MAX_LENGTH = 1_500_000;

export const STAMP = 'data-yz';

const escapeAttr = (value: string): string => value.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeText = (value: string): string => value.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;').replace(/</g, '&lt;');

/** An image or url() reference the document may keep: its own `assets/`, an inline picture, a `#id`, or a `photo:` placeholder. */
export function safeReference(value: string): string | null {
  const v = value.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!v) return null;
  if (/^(?:\.\/)?assets\/[\w@%+.\-\/ ]+$/i.test(v) && !v.includes('..')) return v.replace(/^\.\//, '');
  if (DATA_IMAGE.test(v)) return v.replace(/\s+/g, '');
  if (/^#[\w-]+$/.test(v)) return v;
  const photo = PHOTO.exec(v);
  if (photo) return `photo:${photo[1].replace(/[<>"'`]/g, '').slice(0, 120)}`;
  return null;
}

/** CSS with everything that can fetch, run or restyle outside the board removed. */
export function cleanCss(css: string): string {
  let out = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/@charset[^;]*;?/gi, '')
    .replace(/@font-face\s*\{[^}]*\}/gi, '')
    .replace(/@namespace[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, 'x(')
    .replace(/-moz-binding\s*:[^;}]*/gi, '')
    .replace(/behavior\s*:[^;}]*/gi, '')
    .replace(/javascript\s*:/gi, '');
  out = out.replace(/url\(\s*([^)]*?)\s*\)/gi, (_match, inner: string) => {
    const safe = safeReference(inner);
    return safe ? `url("${safe.replace(/"/g, '')}")` : 'none';
  });
  // A rule cannot break out of its <style>.
  return out.replace(/<\/?style/gi, '').replace(/</g, '\\3c ');
}

interface Attr { name: string; value: string }

function parseAttributes(source: string): Attr[] {
  const attrs: Attr[] = [];
  const pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attrs.push({ name: match[1].toLowerCase(), value: (match[2] ?? match[3] ?? match[4] ?? '').trim() });
  }
  return attrs;
}

function keepAttribute(tag: string, attr: Attr): string | null {
  const { name } = attr;
  let { value } = attr;
  if (name.startsWith('on') || name === STAMP) return null;
  if (name.startsWith('aria-')) return `${name}="${escapeAttr(value.slice(0, 200))}"`;
  const allowed = GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.includes(name) || (SVG_TAGS.has(tag) && SVG_ATTRS.has(name));
  if (!allowed) return null;
  if (name === 'style') {
    value = cleanCss(`x{${value}}`).replace(/^x\{|\}$/g, '');
    return value.trim() ? `style="${escapeAttr(value)}"` : null;
  }
  if (name === 'src') {
    const safe = safeReference(value);
    return safe ? `src="${escapeAttr(safe)}"` : null;
  }
  if (name === 'href') {
    // Links are inert in the preview; only same-document anchors and plain web links keep a target.
    if (/^#[\w-]*$/.test(value) || /^https?:\/\/[^\s"'<>]+$/i.test(value) || /^mailto:[^\s"'<>]+$/i.test(value)) return `href="${escapeAttr(value)}"`;
    return null;
  }
  if (name === 'clip-path' || name === 'fill' || name === 'stroke') {
    // url(#id) only.
    if (/url\(/i.test(value) && !/^url\(\s*['"]?#[\w-]+['"]?\s*\)$/i.test(value)) return null;
  }
  if (name === 'data-goto') {
    // A board name: text only.
    value = value.replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!value) return null;
  }
  if (name === 'class' || name === 'id') value = value.replace(/[^\w\s:\-]/g, '');
  const out = CAMEL[name] ?? name;
  return `${out}="${escapeAttr(value.slice(0, 2000))}"`;
}

export interface SanitizedHtml {
  /** `<style>` blocks (cleaned) followed by the body's markup, every element stamped `data-yz`. */
  html: string;
  /** The words of every `photo:` placeholder, in document order. */
  photos: string[];
}

/** Cleans AI-written HTML (a full document or a fragment) for display. Never throws. */
export function sanitizeHtml(raw: string): SanitizedHtml {
  let source = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw;
  source = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<!doctype[^>]*>/gi, '').replace(/<\?[\s\S]*?\?>/g, '');
  // Drop what has a body of its own before looking at tags.
  for (const tag of DROP_WITH_CONTENT) {
    source = source.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, 'gi'), '');
  }
  // Style blocks are collected (cleaned) and lifted to the front.
  const styles: string[] = [];
  source = source.replace(/<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi, (_match, css: string) => {
    const cleaned = cleanCss(css).trim();
    if (cleaned) styles.push(cleaned);
    return '';
  });
  // Only what is inside <body> is the page.
  const body = /<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i.exec(source);
  source = body ? body[1] : source.replace(/<head\b[\s\S]*?(?:<\/head\s*>|$)/i, '').replace(/<\/?(?:html|body|head)\b[^>]*>/gi, '');
  // A tag cut off at the end of a stream is not shown.
  const lastOpen = source.lastIndexOf('<');
  if (lastOpen > source.lastIndexOf('>')) source = source.slice(0, lastOpen);

  const out: string[] = [];
  const photos: string[] = [];
  const stack: string[] = [];
  let count = 0;
  let index = 0;
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source))) {
    if (match.index > index) out.push(escapeText(source.slice(index, match.index)));
    index = tagPattern.lastIndex;
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase().replace(/^svg:/, '');
    if (!HTML_TAGS.has(tag)) continue;
    const written = CAMEL_TAGS[tag] ?? tag;
    if (closing) {
      const at = stack.lastIndexOf(tag);
      if (at === -1) continue;
      while (stack.length > at) {
        const open = stack.pop() as string;
        out.push(`</${CAMEL_TAGS[open] ?? open}>`);
      }
      continue;
    }
    count += 1;
    const attrs = parseAttributes(match[3].replace(/\/\s*$/, ''));
    const kept: string[] = [`${STAMP}="${count}"`];
    for (const attr of attrs) {
      const rendered = keepAttribute(tag, attr);
      if (!rendered) continue;
      kept.push(rendered);
      const photo = /^src="photo:([^"]*)"$/.exec(rendered);
      if (photo) photos.push(photo[1]);
    }
    for (const rendered of kept) {
      const photo = /url\("photo:([^"]*)"\)/g;
      let found: RegExpExecArray | null;
      while ((found = photo.exec(rendered))) photos.push(found[1]);
    }
    // A button's label and a link's text are plain text; an <img> without a source stays as an empty box.
    out.push(`<${written} ${kept.join(' ')}>`);
    if (!VOID.has(tag) && !/\/\s*$/.test(match[3])) stack.push(tag);
    else if (!VOID.has(tag)) out.push(`</${written}>`);
  }
  if (index < source.length) out.push(escapeText(source.slice(index)));
  // Close what the reply left open.
  while (stack.length > 0) {
    const tag = stack.pop() as string;
    out.push(`</${CAMEL_TAGS[tag] ?? tag}>`);
  }
  const markup = out.join('');
  const styleBlocks = styles.map((css) => `<style>${css}</style>`).join('');
  return { html: `${styleBlocks}${markup}`, photos: Array.from(new Set(photos)) };
}

/** Replaces `photo:words` references with the files found for them (`words → assets/…`); the rest stay placeholders. */
export function applyPhotos(html: string, found: Record<string, string>): string {
  return html.replace(/photo:([^"')]+)/g, (whole, words: string) => found[words.trim()] ?? whole);
}

/** The text of the first heading or the biggest block of text, for naming a screen. */
export function titleFromHtml(html: string): string {
  const heading = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html);
  const text = (heading?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 80);
}

const openTagOf = (html: string, id: string): RegExpExecArray | null =>
  new RegExp(String.raw`<([a-zA-Z][\w-]*)\b[^>]*\sdata-yz="${id}"[^>]*>`).exec(html);

/**
 * Replaces the text of the element stamped `data-yz="id"` when it holds only text
 * (no child elements); returns null otherwise. Used by in-place text editing.
 */
export function setElementText(html: string, id: string, text: string): string | null {
  const open = openTagOf(html, id);
  if (!open) return null;
  const start = open.index + open[0].length;
  const next = html.indexOf('<', start);
  if (next === -1 || html.slice(next, next + 2) !== '</') return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  return `${html.slice(0, start)}${escapeText(clean)}${html.slice(next)}`;
}

/** The text of a leaf element stamped `data-yz="id"`, or null. */
export function elementText(html: string, id: string): string | null {
  const open = openTagOf(html, id);
  if (!open) return null;
  const start = open.index + open[0].length;
  const next = html.indexOf('<', start);
  if (next === -1 || html.slice(next, next + 2) !== '</') return null;
  return html.slice(start, next).replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

/** The markup of the element stamped `data-yz="id"` (to show the AI which element is meant). */
export function outerHtmlOf(html: string, id: string, limit = 3000): string {
  const open = openTagOf(html, id);
  if (!open) return '';
  const tag = open[1].toLowerCase();
  if (VOID.has(tag)) return open[0];
  let depth = 1;
  const pattern = new RegExp(String.raw`<(/?)${tag}\b[^>]*>`, 'gi');
  pattern.lastIndex = open.index + open[0].length;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index, pattern.lastIndex).slice(0, limit);
  }
  return html.slice(open.index, open.index + limit);
}

/** Points the `<img>` stamped `data-yz="id"` at another picture (an `assets/…` path); null when it is not found. */
export function setImageSrc(html: string, id: string, src: string): string | null {
  const safe = safeReference(src);
  if (!safe) return null;
  const open = openTagOf(html, id);
  if (!open || open[1].toLowerCase() !== 'img') return null;
  const tag = open[0];
  const next = /\ssrc="[^"]*"/.test(tag) ? tag.replace(/\ssrc="[^"]*"/, ` src="${safe}"`) : tag.replace(/^<img/i, `<img src="${safe}"`);
  return `${html.slice(0, open.index)}${next}${html.slice(open.index + tag.length)}`;
}
