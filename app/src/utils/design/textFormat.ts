// Text formatting for the graphic layout editor: the words a drawn `<text>` is set in, and
// the same for the text boxes the editor itself makes (modelled shapes). Dependency-free
// (`npm run test:design`).

import type { SlideElement } from '../presentation/slideModel';

export interface TextStyle {
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
}

export interface TextStylePatch {
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: 'l' | 'c' | 'r';
}

const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag);
  return match ? match[1] : null;
}

function styleProperty(tag: string, name: string): string | null {
  const style = attribute(tag, 'style');
  if (!style) return null;
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return match ? match[1].trim() : null;
}

/** The opening tag of the `index`-th `<text>` of an SVG (document order), with its position. */
function textTag(svg: string, index: number): { start: number; end: number; tag: string } | null {
  const pattern = /<text\b[^>]*>/g;
  let found = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(svg))) {
    if (found === index) return { start: match.index, end: match.index + match[0].length, tag: match[0] };
    found += 1;
  }
  return null;
}

/** How a drawn `<text>` is set (its own attributes or style; empty values when it inherits). */
export function svgTextStyle(svg: string, index: number): TextStyle | null {
  const found = textTag(svg, index);
  if (!found) return null;
  const read = (name: string): string => styleProperty(found.tag, name) ?? attribute(found.tag, name) ?? '';
  const weight = read('font-weight');
  const family = read('font-family').split(',')[0].replace(/['"]/g, '').trim();
  return {
    font: family,
    size: Number.parseFloat(read('font-size')) || 0,
    bold: weight === 'bold' || Number.parseInt(weight, 10) >= 600,
    italic: read('font-style') === 'italic',
    color: read('fill') || '',
  };
}

const PROPERTY: Record<string, string> = { font: 'font-family', size: 'font-size', bold: 'font-weight', italic: 'font-style', color: 'fill' };

function setOnTag(tag: string, name: string, value: string): string {
  let next = tag;
  // The same property inside style="" would win over the attribute: take it out.
  const style = attribute(next, 'style');
  if (style && new RegExp(`(?:^|;)\\s*${name}\\s*:`, 'i').test(style)) {
    const kept = style.split(';').filter((part) => part.trim() && !new RegExp(`^\\s*${name}\\s*:`, 'i').test(part)).join(';');
    next = kept ? next.replace(/\sstyle\s*=\s*"[^"]*"/, ` style="${kept}"`) : next.replace(/\sstyle\s*=\s*"[^"]*"/, '');
  }
  const existing = new RegExp(`\\s${name}\\s*=\\s*"[^"]*"`);
  if (existing.test(next)) return next.replace(existing, ` ${name}="${escapeAttr(value)}"`);
  return next.replace(/\s*(\/?)>$/, ` ${name}="${escapeAttr(value)}"$1>`);
}

/**
 * Sets font, size, weight, slant or colour of the `index`-th `<text>`. Runs inside it that set
 * the same property themselves are cleared, so the change reaches every line.
 */
export function setSvgTextStyle(svg: string, index: number, patch: TextStylePatch): string {
  const found = textTag(svg, index);
  if (!found) return svg;
  let tag = found.tag;
  const cleared: string[] = [];
  const apply = (name: string, value: string): void => {
    tag = setOnTag(tag, name, value);
    cleared.push(name);
  };
  if (patch.font) apply(PROPERTY.font, patch.font);
  if (patch.size && patch.size > 0) apply(PROPERTY.size, String(Math.round(patch.size * 100) / 100));
  if (patch.bold !== undefined) apply(PROPERTY.bold, patch.bold ? '700' : '400');
  if (patch.italic !== undefined) apply(PROPERTY.italic, patch.italic ? 'italic' : 'normal');
  if (patch.color) apply(PROPERTY.color, patch.color);
  if (cleared.length === 0) return svg;

  const closeAt = svg.indexOf('</text>', found.end);
  const bodyEnd = closeAt === -1 ? found.end : closeAt;
  let body = svg.slice(found.end, bodyEnd);
  body = body.replace(/<tspan\b[^>]*>/g, (span) => {
    let next = span;
    for (const name of cleared) {
      next = next.replace(new RegExp(`\\s${name}\\s*=\\s*"[^"]*"`), '');
      const style = attribute(next, 'style');
      if (style && new RegExp(`(?:^|;)\\s*${name}\\s*:`, 'i').test(style)) {
        const kept = style.split(';').filter((part) => part.trim() && !new RegExp(`^\\s*${name}\\s*:`, 'i').test(part)).join(';');
        next = kept ? next.replace(/\sstyle\s*=\s*"[^"]*"/, ` style="${kept}"`) : next.replace(/\sstyle\s*=\s*"[^"]*"/, '');
      }
    }
    return next;
  });
  return svg.slice(0, found.start) + tag + body + svg.slice(bodyEnd);
}

// Modelled text boxes -----------------------------------------------------------------

type Shape = Extract<SlideElement, { k: 'shape' }>;

const textShape = (model: SlideElement | null): Shape | null => {
  if (!model || model.k !== 'shape') return null;
  const shape = model as Shape;
  return shape.tx && Array.isArray(shape.tx.p) ? shape : null;
};

export function modelTextStyle(model: SlideElement | null): TextStyle | null {
  const shape = textShape(model);
  if (!shape || !shape.tx) return null;
  const run = shape.tx.p.flatMap((para) => para.r).find((entry) => entry.t && entry.t !== '\n');
  if (!run) return null;
  return { font: run.f, size: run.sz, bold: Boolean(run.b), italic: Boolean(run.i), color: run.c ?? '' };
}

/** A text box with its font, size, weight, slant, colour or alignment changed on every paragraph. */
export function formatModelText(model: SlideElement, patch: TextStylePatch): SlideElement {
  const shape = textShape(model);
  if (!shape || !shape.tx) return model;
  const paragraphs = shape.tx.p.map((para) => ({
    ...para,
    ...(patch.align ? { al: patch.align } : {}),
    ...(patch.size ? { esz: patch.size } : {}),
    ...(patch.font ? { ef: patch.font } : {}),
    r: para.r.map((run) => ({
      ...run,
      ...(patch.font ? { f: patch.font } : {}),
      ...(patch.size ? { sz: patch.size } : {}),
      ...(patch.color ? { c: patch.color } : {}),
      ...(patch.bold !== undefined ? { b: patch.bold } : {}),
      ...(patch.italic !== undefined ? { i: patch.italic } : {}),
    })),
  }));
  return { ...shape, tx: { ...shape.tx, p: paragraphs } } as SlideElement;
}
