// Direct edits of a board's HTML by element stamp (`data-yz`): inline style, duplicate,
// remove and reorder. Every value goes through the sanitizer's CSS cleaner, so nothing the
// inspector writes can fetch or run anything. Dependency-free (`npm run test:design`).

import { encodeAttr, parseMarkup, type MarkupNode } from './domTree';
import { cleanCss } from './htmlSafe';

const PROPERTY = /^(?:--[a-z0-9-]+|-?[a-z][a-z-]*)$/;

/** The inline style of an element as property → value. */
export function getInlineStyle(html: string, id: string): Record<string, string> {
  const node = parseMarkup(html).byId.get(id);
  if (!node) return {};
  const out: Record<string, string> = {};
  for (const part of (node.attrs.style ?? '').split(';')) {
    const at = part.indexOf(':');
    if (at < 1) continue;
    const name = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim();
    if (name && value) out[name] = value;
  }
  return out;
}

/** A value that cannot end its declaration or the attribute, run after cleaning. */
export function safeCssValue(property: string, value: string): string | null {
  if (!PROPERTY.test(property)) return null;
  const text = value.trim();
  if (!text || text.length > 300 || /[;{}<>\\]/.test(text)) return null;
  const cleaned = cleanCss(`x{${property}:${text}}`).replace(/^x\{|\}$/g, '');
  const at = cleaned.indexOf(':');
  const result = at === -1 ? '' : cleaned.slice(at + 1).trim();
  return result && result !== 'none' || text === 'none' ? result || text : null;
}

function replaceOpenTag(html: string, node: MarkupNode, attrs: Record<string, string>): string {
  const original = html.slice(node.openStart, node.openEnd);
  const selfClosed = /\/\s*>$/.test(original);
  const name = /^<([^\s>\/]+)/.exec(original)?.[1] ?? node.tag;
  const written = Object.entries(attrs).map(([name, value]) => (value === '' && !['alt', 'style'].includes(name) ? name : `${name}="${encodeAttr(value)}"`));
  // Keep the stamp first, as the sanitizer writes it.
  written.sort((a, b) => (a.startsWith('data-yz=') ? -1 : b.startsWith('data-yz=') ? 1 : 0));
  return `${html.slice(0, node.openStart)}<${name} ${written.join(' ')}${selfClosed ? ' /' : ''}>${html.slice(node.openEnd)}`;
}

/** Merges `patch` into the element's inline style; `null` or an empty string removes a property. Returns null when nothing can be written. */
export function setElementStyle(html: string, id: string, patch: Record<string, string | null>): string | null {
  const node = parseMarkup(html).byId.get(id);
  if (!node) return null;
  const style = getInlineStyle(html, id);
  for (const [property, raw] of Object.entries(patch)) {
    const name = property.toLowerCase();
    if (raw === null || raw.trim() === '') {
      delete style[name];
      continue;
    }
    const safe = safeCssValue(name, raw);
    if (safe === null) continue;
    style[name] = safe;
  }
  const attrs = { ...node.attrs };
  const text = Object.entries(style).map(([name, value]) => `${name}: ${value}`).join('; ');
  if (text) attrs.style = text;
  else delete attrs.style;
  return replaceOpenTag(html, node, attrs);
}

/** Sets a plain attribute from a short allowlist (alt text, title). */
export function setElementAttr(html: string, id: string, name: 'alt' | 'title' | 'data-goto', value: string): string | null {
  const node = parseMarkup(html).byId.get(id);
  if (!node) return null;
  const attrs = { ...node.attrs };
  const clean = value.replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, name === 'data-goto' ? 80 : 300);
  if (clean || name === 'alt') attrs[name] = clean;
  else delete attrs[name];
  return replaceOpenTag(html, node, attrs);
}

const maxId = (html: string): number => {
  let max = 0;
  for (const match of html.matchAll(/data-yz="(\d+)"/g)) max = Math.max(max, Number(match[1]));
  return max;
};

/** Copies an element right after itself with fresh stamps; returns the new markup and the copy's id. */
export function duplicateElement(html: string, id: string): { html: string; id: string } | null {
  const node = parseMarkup(html).byId.get(id);
  if (!node) return null;
  let next = maxId(html);
  const copy = html.slice(node.openStart, node.closeEnd).replace(/data-yz="\d+"/g, () => {
    next += 1;
    return `data-yz="${next}"`;
  });
  const firstId = /data-yz="(\d+)"/.exec(copy)?.[1];
  if (!firstId) return null;
  return { html: `${html.slice(0, node.closeEnd)}${copy}${html.slice(node.closeEnd)}`, id: firstId };
}

/** Removes an element with everything inside it. */
export function removeElement(html: string, id: string): string | null {
  const markup = parseMarkup(html);
  const node = markup.byId.get(id);
  if (!node) return null;
  if (!node.parent && markup.roots.length === 1) return null;
  return `${html.slice(0, node.openStart)}${html.slice(node.closeEnd)}`;
}

/** Swaps an element with its previous (-1) or next (1) sibling; null when it is already at that end. */
export function moveElement(html: string, id: string, direction: -1 | 1): string | null {
  const markup = parseMarkup(html);
  const node = markup.byId.get(id);
  if (!node) return null;
  const siblings = node.parent ? (markup.byId.get(node.parent) as MarkupNode).children : markup.roots;
  const at = siblings.indexOf(id);
  const other = markup.byId.get(siblings[at + direction] ?? '');
  if (!other) return null;
  const [first, second] = direction === -1 ? [other, node] : [node, other];
  return html.slice(0, first.openStart)
    + html.slice(second.openStart, second.closeEnd)
    + html.slice(first.closeEnd, second.openStart)
    + html.slice(first.openStart, first.closeEnd)
    + html.slice(second.closeEnd);
}

/** The tag, text-bearing state and attributes the inspector needs to choose its sections. */
export function elementFacts(html: string, id: string): { tag: string; attrs: Record<string, string>; leafText: boolean; hasChildren: boolean } | null {
  const node = parseMarkup(html).byId.get(id);
  if (!node) return null;
  const inner = html.slice(node.openEnd, node.closeStart);
  return { tag: node.tag, attrs: node.attrs, leafText: node.children.length === 0 && !['img', 'input', 'svg', 'hr', 'br'].includes(node.tag) && inner.trim().length > 0, hasChildren: node.children.length > 0 };
}
