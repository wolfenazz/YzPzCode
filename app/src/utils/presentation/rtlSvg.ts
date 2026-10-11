// Right-to-left text in slide SVG. A model draws Arabic or Hebrew the way it
// draws Latin: no `direction`, `text-anchor` meaning left or right. Without
// `direction="rtl"` a browser and PowerPoint both order a mixed line wrongly
// (a full stop or a bracket jumps to the other end, "2024" and "Q3" swap
// places) and an RTL paragraph is not marked in the exported file. This pass
// gives every right-to-left text its direction and flips its anchor, because
// in SVG `start` and `end` follow the text direction: under rtl, `start` is
// the right edge. It also drops what breaks Arabic: letter-spacing pulls
// joined letters apart and a slanted face is a synthetic oblique.
// Uses the DOM; the global DOMParser is installed by the tests.

import { hasRtl, paragraphDirection } from '../writing/rtl';

const SVG_STYLE = (el: Element, name: string): string | null => {
  const style = el.getAttribute('style') || '';
  const match = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : null;
};

/** A presentation attribute or style declaration of `el` itself. */
const own = (el: Element, name: string): string | null => SVG_STYLE(el, name) ?? (el.hasAttribute(name) ? el.getAttribute(name) : null);

/** The nearest value of `name` on `el` or an ancestor. */
function inheritedValue(el: Element, name: string): string | null {
  for (let node: Node | null = el; node && node.nodeType === 1; node = node.parentNode) {
    const value = own(node as Element, name);
    if (value) return value;
  }
  return null;
}

const tagOf = (node: Node): string => ((node as Element).localName || node.nodeName).replace(/^.*:/, '').toLowerCase();

const flip = (anchor: string): string => (anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : anchor);

/** Removes one presentation attribute and its style declaration from `el`. */
function strip(el: Element, name: string): void {
  el.removeAttribute(name);
  const style = el.getAttribute('style');
  if (!style) return;
  const kept = style.split(';').filter((part) => part.split(':')[0].trim().toLowerCase() !== name).join(';');
  if (kept.trim()) el.setAttribute('style', kept);
  else el.removeAttribute('style');
}

function setOwn(el: Element, name: string, value: string): void {
  strip(el, name);
  el.setAttribute(name, value);
}

/**
 * Normalises one `<text>`. Returns whether it changed. Text the model already
 * gave a `direction` is left as drawn (its anchors already follow it);
 * `data-bidi="auto"` marks a direction this pass added, so editing a text from
 * Arabic to English takes it back out.
 */
export function normalizeRtlTextElement(text: Element): boolean {
  const content = text.textContent ?? '';
  const rtlText = hasRtl(content) && paragraphDirection(content) === 'rtl';
  let changed = false;

  const auto = text.getAttribute('data-bidi') === 'auto';
  if (auto && !rtlText) {
    // Back to left-to-right: undo what was added.
    strip(text, 'direction');
    text.removeAttribute('data-bidi');
    const anchor = own(text, 'text-anchor');
    if (anchor) setOwn(text, 'text-anchor', flip(anchor));
    changed = true;
  } else if (!auto && rtlText && inheritedValue(text, 'direction') === null) {
    const anchor = inheritedValue(text, 'text-anchor') ?? 'start';
    setOwn(text, 'direction', 'rtl');
    text.setAttribute('data-bidi', 'auto');
    if (anchor !== 'middle') setOwn(text, 'text-anchor', flip(anchor));
    changed = true;
  }

  if (hasRtl(content)) {
    // Letter-spacing and slant belong to Latin type.
    const spaced = [text, ...Array.from(text.getElementsByTagName('*'))].some((el) => {
      const value = own(el, 'letter-spacing');
      return value !== null && value !== 'normal' && Number.parseFloat(value) !== 0;
    }) || (() => {
      const value = inheritedValue(text, 'letter-spacing');
      return value !== null && value !== 'normal' && Number.parseFloat(value) !== 0;
    })();
    if (spaced) {
      for (const el of [text, ...Array.from(text.getElementsByTagName('*'))]) strip(el, 'letter-spacing');
      text.setAttribute('letter-spacing', '0');
      changed = true;
    }
    const slanted = [text, ...Array.from(text.getElementsByTagName('*'))].some((el) => /italic|oblique/.test(own(el, 'font-style') ?? ''))
      || /italic|oblique/.test(inheritedValue(text, 'font-style') ?? '');
    if (slanted && rtlShareOf(content) >= 0.5) {
      for (const el of [text, ...Array.from(text.getElementsByTagName('*'))]) strip(el, 'font-style');
      text.setAttribute('font-style', 'normal');
      changed = true;
    }
  }
  return changed;
}

const rtlShareOf = (text: string): number => {
  let rtl = 0;
  let letters = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    letters += 1;
    if (hasRtl(ch)) rtl += 1;
  }
  return letters === 0 ? 0 : rtl / letters;
};

/** Normalises every `<text>` under `root`. Returns how many changed. */
export function normalizeRtlText(root: Node): number {
  let count = 0;
  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      if (tagOf(child) === 'text') {
        if (normalizeRtlTextElement(child as Element)) count += 1;
      } else visit(child);
    }
  };
  visit(root);
  return count;
}
