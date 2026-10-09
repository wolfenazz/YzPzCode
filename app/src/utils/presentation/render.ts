// The render plan: every element of a slide, positioned in inches and styled
// in points. The HTML renderer (canvas, thumbnails, PDF) and the PPTX
// exporter both draw from it, so what you edit is what exports.
// Dependency-free.

import { getLayout, layoutSlots, scaleRect, SLIDE_HEIGHT, slideWidth, type Rect, type SlotDef, type TextRole } from './layouts';
import { parseInline } from './richText';
import { fontStack, mixHex } from './themes';
import type { Block, DeckSize, DeckTheme, RichPara, Slide, TextRun } from './types';

export type Fill =
  | { color: string; opacity?: number }
  | { gradient: [string, string]; angle: number };

export interface TextStyle {
  font: string;
  /** Points. */
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  /** Points after each paragraph. */
  spaceAfter: number;
  letterSpacing?: number;
  uppercase?: boolean;
}

export interface RenderPara extends RichPara {
  /** Overrides for this paragraph. */
  size?: number;
  color?: string;
  bold?: boolean;
  font?: string;
}

export type El =
  | { kind: 'shape'; rect: Rect; fill: Fill; shape?: 'rect' | 'ellipse' | 'corner'; radius?: number }
  | {
    kind: 'text';
    rect: Rect;
    slot?: string;
    paras: RenderPara[];
    style: TextStyle;
    valign: 'top' | 'middle' | 'bottom';
    list?: 'bullet' | 'number';
    /** Inline-editable (text, bullets or quote slot). */
    editable?: boolean;
    /** Shown only while editing when the slot is empty. */
    placeholder?: string;
  }
  | { kind: 'image'; rect: Rect; slot: string; src: string; fit: 'cover' | 'contain'; alt: string }
  | { kind: 'placeholder'; rect: Rect; slot: string; label: string; background: string; color: string }
  | { kind: 'chart'; rect: Rect; slot: string; block: Extract<Block, { type: 'chart' }>; colors: string[]; text: string; muted: string; grid: string; font: string; size: number; background: string }
  | { kind: 'table'; rect: Rect; slot: string; block: Extract<Block, { type: 'table' }>; font: string; size: number; text: string; headerFill: string; headerText: string; stripe: string; border: string }
  | { kind: 'icon'; rect: Rect; slot?: string; name: string; color: string };

export interface SlidePlan {
  width: number;
  height: number;
  background: Fill;
  elements: El[];
}

export interface PlanContext {
  theme: DeckTheme;
  size: DeckSize;
  showNumbers: boolean;
}

const roundPt = (value: number): number => Math.round(value * 2) / 2;

/** Colours of text on this slide, by where it sits. */
function surfaceColors(theme: DeckTheme, filled: boolean, overImage: boolean): { text: string; muted: string; accent: string } {
  if (overImage) return { text: '#ffffff', muted: 'rgba(255,255,255,0.86)', accent: '#ffffff' };
  if (filled && theme.titleFill !== 'background') {
    const on = theme.palette.onAccent;
    return { text: on, muted: mixHex(on, theme.titleFill === 'accent' ? theme.palette.accent1 : theme.palette.accent2, 0.22), accent: on };
  }
  return { text: theme.palette.text, muted: theme.palette.muted, accent: theme.palette.accent1 };
}

export function roleStyle(theme: DeckTheme, role: TextRole, colors: { text: string; muted: string; accent: string }, slot?: SlotDef): TextStyle {
  const heading = theme.headingFont;
  const body = theme.bodyFont;
  const align = slot?.align ?? 'left';
  switch (role) {
    case 'display':
      return { font: heading, size: roundPt(theme.titleSize * 1.45), color: colors.text, bold: true, italic: false, lineHeight: 1.08, align, spaceAfter: 0 };
    case 'title':
      return { font: heading, size: theme.titleSize, color: colors.text, bold: true, italic: false, lineHeight: 1.12, align, spaceAfter: 0 };
    case 'heading':
      return { font: heading, size: roundPt(theme.bodySize * 1.15), color: colors.accent, bold: true, italic: false, lineHeight: 1.15, align, spaceAfter: 0 };
    case 'subtitle':
      return { font: body, size: roundPt(theme.bodySize * 1.1), color: colors.muted, bold: false, italic: false, lineHeight: 1.3, align, spaceAfter: 4 };
    case 'caption':
      return { font: body, size: roundPt(Math.max(11, theme.bodySize * 0.7)), color: colors.muted, bold: false, italic: false, lineHeight: 1.3, align, spaceAfter: 2 };
    case 'kicker':
      return { font: body, size: 13, color: colors.accent, bold: true, italic: false, lineHeight: 1.2, align, spaceAfter: 0, letterSpacing: 2, uppercase: true };
    case 'quote':
      return { font: heading, size: roundPt(theme.titleSize * 1.05), color: colors.text, bold: false, italic: true, lineHeight: 1.28, align, spaceAfter: 6 };
    case 'attribution':
      return { font: body, size: roundPt(theme.bodySize * 0.85), color: colors.muted, bold: true, italic: false, lineHeight: 1.3, align, spaceAfter: 0 };
    case 'body':
    default:
      return { font: body, size: theme.bodySize, color: colors.text, bold: false, italic: false, lineHeight: 1.3, align, spaceAfter: roundPt(theme.bodySize * 0.5) };
  }
}

const scaled = (style: TextStyle, scale: number | undefined): TextStyle =>
  (scale && scale !== 1 ? { ...style, size: roundPt(style.size * scale), spaceAfter: roundPt(style.spaceAfter * scale) } : style);

function textParas(block: Block | undefined): RenderPara[] {
  if (!block) return [];
  if (block.type === 'text' || block.type === 'bullets') return block.items;
  if (block.type === 'quote') return block.text ? [{ runs: parseInline(block.text) }] : [];
  return [];
}

function slideBackground(theme: DeckTheme, slide: Slide, filled: boolean): Fill {
  if (slide.background) return { color: slide.background };
  if (filled && theme.titleFill === 'accent') return { color: theme.palette.accent1 };
  if (filled && theme.titleFill === 'gradient') return { gradient: [theme.palette.accent1, theme.palette.accent2], angle: 135 };
  return { color: theme.palette.background };
}

/** Lays out the slide. `index` is 0-based. */
export function planSlide(context: PlanContext, slide: Slide, index = 0): SlidePlan {
  const { theme, size } = context;
  const layout = getLayout(slide.layout);
  const width = slideWidth(size);
  const height = SLIDE_HEIGHT;
  const filled = Boolean(layout.filled);
  const colors = surfaceColors(theme, filled, Boolean(layout.overImage));
  const elements: El[] = [];
  const slots = layoutSlots(layout.id, size);
  const r = (rect: Rect): Rect => scaleRect(rect, size);

  // Decoration, drawn first so content always sits on top.
  if (filled) {
    if (theme.titleFill === 'background') {
      elements.push({ kind: 'shape', rect: r({ x: 0.55, y: 1.75, w: 0.09, h: 3.9 }), fill: { color: theme.palette.accent1 } });
    } else {
      elements.push({ kind: 'shape', shape: 'ellipse', rect: r({ x: 8.6, y: -1.6, w: 6.4, h: 6.4 }), fill: { color: theme.titleFill === 'accent' ? theme.palette.accent2 : '#ffffff', opacity: theme.titleFill === 'accent' ? 0.28 : 0.12 } });
      elements.push({ kind: 'shape', shape: 'ellipse', rect: r({ x: 10.9, y: 4.6, w: 3.6, h: 3.6 }), fill: { color: theme.titleFill === 'accent' ? theme.palette.accent3 : '#ffffff', opacity: theme.titleFill === 'accent' ? 0.22 : 0.08 } });
    }
  } else if (!layout.overImage) {
    if (theme.decoration === 'corner') {
      elements.push({ kind: 'shape', shape: 'corner', rect: { x: width - 1.25, y: 0, w: 1.25, h: 1.25 }, fill: { color: theme.palette.accent1 } });
    } else if (theme.decoration === 'band') {
      elements.push({ kind: 'shape', rect: { x: 0, y: height - 0.14, w: width, h: 0.14 }, fill: { gradient: [theme.palette.accent1, theme.palette.accent2], angle: 90 } });
    }
  }
  for (const panel of layout.panels ?? []) {
    elements.push({ kind: 'shape', rect: r(panel), fill: { color: theme.palette.surface }, radius: 0.12 });
  }
  const titleSlot = slots.find((slot) => slot.name === 'title');
  if (theme.decoration === 'rule' && layout.titleRule && titleSlot) {
    elements.push({ kind: 'shape', rect: { x: titleSlot.rect.x, y: titleSlot.rect.y + titleSlot.rect.h + 0.14, w: 0.85, h: 0.07 }, fill: { color: theme.palette.accent1 } });
  }

  for (const slot of slots) {
    const block = slide.slots[slot.name];
    const scale = slide.fit?.[slot.name];
    if (slot.accepts.includes('image') && (!block || block.type === 'image')) {
      if (block?.type === 'image' && block.src) {
        elements.push({ kind: 'image', rect: slot.rect, slot: slot.name, src: block.src, fit: block.fit, alt: block.alt });
        if (block.credit) {
          // Attribution sits on the picture, bottom right, as a small label.
          const width = Math.min(slot.rect.w - 0.2, block.credit.length * 0.062 + 0.24);
          const credit: Rect = { x: slot.rect.x + slot.rect.w - width - 0.1, y: slot.rect.y + slot.rect.h - 0.36, w: width, h: 0.26 };
          elements.push({ kind: 'shape', rect: credit, fill: { color: '#000000', opacity: 0.5 }, radius: 0.04 });
          elements.push({
            kind: 'text', rect: { x: credit.x + 0.08, y: credit.y, w: credit.w - 0.16, h: credit.h },
            paras: [{ runs: [{ text: block.credit }] }],
            style: { font: theme.bodyFont, size: 8, color: '#ffffff', bold: false, italic: false, lineHeight: 1.2, align: 'right', spaceAfter: 0 },
            valign: 'middle',
          });
        }
      } else {
        elements.push({
          kind: 'placeholder',
          rect: slot.rect,
          slot: slot.name,
          label: block?.type === 'image' && block.alt ? block.alt : 'Image',
          background: mixHex(theme.palette.surface, theme.palette.accent1, 0.08),
          color: theme.palette.muted,
        });
      }
      if (layout.overImage) {
        elements.push({ kind: 'shape', rect: { x: 0, y: height * 0.42, w: width, h: height * 0.58 }, fill: { gradient: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)'], angle: 180 } });
      }
      continue;
    }
    if (block?.type === 'icon') {
      const side = Math.min(slot.rect.w, slot.rect.h) * 0.4;
      elements.push({ kind: 'shape', rect: slot.rect, fill: { color: theme.palette.surface } });
      elements.push({ kind: 'icon', slot: slot.name, rect: { x: slot.rect.x + (slot.rect.w - side) / 2, y: slot.rect.y + (slot.rect.h - side) / 2, w: side, h: side }, name: block.name, color: theme.palette.accent1 });
      continue;
    }
    if (block?.type === 'chart') {
      elements.push({
        kind: 'chart', rect: slot.rect, slot: slot.name, block,
        colors: theme.chartColors, text: colors.text, muted: colors.muted,
        grid: mixHex(theme.palette.background, theme.palette.text, 0.12), font: theme.bodyFont, size: roundPt(Math.max(11, theme.bodySize * 0.65)),
        background: slide.background ?? theme.palette.background,
      });
      continue;
    }
    if (block?.type === 'table') {
      elements.push({
        kind: 'table', rect: slot.rect, slot: slot.name, block,
        font: theme.bodyFont, size: roundPt(Math.max(11, theme.bodySize * 0.72) * (scale ?? 1)), text: colors.text,
        headerFill: theme.palette.accent1, headerText: theme.palette.onAccent,
        stripe: theme.palette.surface, border: mixHex(theme.palette.background, theme.palette.text, 0.14),
      });
      continue;
    }
    if (block?.type === 'stats') {
      planStats(elements, slot, block.items, theme, colors);
      continue;
    }
    if (block?.type === 'steps') {
      planSteps(elements, slot, block.items, theme, colors);
      continue;
    }
    if (!slot.accepts.includes('text') && !slot.accepts.includes('bullets') && !slot.accepts.includes('quote')) {
      // An empty chart, table, stats or steps slot.
      if (!block) {
        elements.push({ kind: 'placeholder', rect: slot.rect, slot: slot.name, label: slot.label, background: mixHex(theme.palette.surface, theme.palette.accent1, 0.06), color: theme.palette.muted });
      }
      continue;
    }

    const style = scaled(roleStyle(theme, slot.role, colors, slot), scale);
    const paras = textParas(block);
    const isList = block?.type === 'bullets';
    if (slot.role === 'quote' && paras.length > 0) {
      elements.push({
        kind: 'text', rect: { x: slot.rect.x - 0.95, y: slot.rect.y - 0.35, w: 1.2, h: 1.6 },
        paras: [{ runs: [{ text: '“' }] }],
        style: { ...style, size: roundPt(theme.titleSize * 3.4), color: theme.palette.accent1, italic: false, bold: true, lineHeight: 1 },
        valign: 'top',
      });
    }
    elements.push({
      kind: 'text',
      rect: slot.rect,
      slot: slot.name,
      paras: isList
        ? paras.map((item) => (item.level ? { ...item, size: roundPt(style.size * 0.88) } : item))
        : paras,
      style,
      valign: slot.valign ?? 'top',
      list: isList ? (slot.numbered ? 'number' : 'bullet') : undefined,
      editable: true,
      placeholder: slot.label,
    });
  }

  if (context.showNumbers && !filled) {
    elements.push({
      kind: 'text',
      rect: { x: width - 1.55, y: height - 0.62, w: 1.0, h: 0.32 },
      paras: [{ runs: [{ text: String(index + 1) }] }],
      style: { font: theme.bodyFont, size: 11, color: layout.overImage ? 'rgba(255,255,255,0.8)' : theme.palette.muted, bold: false, italic: false, lineHeight: 1.2, align: 'right', spaceAfter: 0 },
      valign: 'bottom',
    });
  }

  return { width, height, background: slideBackground(theme, slide, filled), elements };
}

function planStats(elements: El[], slot: SlotDef, items: Extract<Block, { type: 'stats' }>['items'], theme: DeckTheme, colors: { text: string; muted: string; accent: string }): void {
  const count = Math.max(1, items.length);
  const gap = 0.35;
  const width = (slot.rect.w - gap * (count - 1)) / count;
  const valueSize = roundPt(Math.min(60, theme.titleSize * (count >= 4 ? 1.45 : 1.75)));
  items.forEach((item, index) => {
    const x = slot.rect.x + index * (width + gap);
    let y = slot.rect.y;
    elements.push({ kind: 'shape', rect: { x, y, w: width, h: 0.06 }, fill: { color: theme.chartColors[index % theme.chartColors.length] } });
    y += 0.3;
    if (item.icon) {
      elements.push({ kind: 'icon', slot: slot.name, rect: { x, y, w: 0.5, h: 0.5 }, name: item.icon, color: theme.chartColors[index % theme.chartColors.length] });
      y += 0.62;
    }
    elements.push({
      kind: 'text', slot: slot.name, rect: { x, y, w: width, h: 1.15 },
      paras: [{ runs: [{ text: item.value }] }],
      style: { font: theme.headingFont, size: valueSize, color: theme.chartColors[index % theme.chartColors.length], bold: true, italic: false, lineHeight: 1, align: 'left', spaceAfter: 0 },
      valign: 'bottom',
    });
    elements.push({
      kind: 'text', slot: slot.name, rect: { x, y: y + 1.25, w: width, h: Math.max(0.6, slot.rect.y + slot.rect.h - (y + 1.25)) },
      paras: [{ runs: parseInline(item.label) }],
      style: { font: theme.bodyFont, size: roundPt(theme.bodySize * 0.82), color: colors.muted, bold: false, italic: false, lineHeight: 1.3, align: 'left', spaceAfter: 0 },
      valign: 'top',
    });
  });
}

function planSteps(elements: El[], slot: SlotDef, items: Extract<Block, { type: 'steps' }>['items'], theme: DeckTheme, colors: { text: string; muted: string; accent: string }): void {
  const count = Math.max(1, items.length);
  const gap = 0.3;
  const width = (slot.rect.w - gap * (count - 1)) / count;
  const node = 0.42;
  const lineY = slot.rect.y + node / 2 - 0.02;
  if (count > 1) {
    elements.push({ kind: 'shape', rect: { x: slot.rect.x + node / 2, y: lineY, w: (count - 1) * (width + gap), h: 0.04 }, fill: { color: mixHex(theme.palette.background, theme.palette.text, 0.18) } });
  }
  items.forEach((item, index) => {
    const x = slot.rect.x + index * (width + gap);
    const color = theme.chartColors[index % theme.chartColors.length];
    elements.push({ kind: 'shape', shape: 'ellipse', rect: { x, y: slot.rect.y, w: node, h: node }, fill: { color } });
    elements.push({
      kind: 'text', slot: slot.name, rect: { x, y: slot.rect.y, w: node, h: node },
      paras: [{ runs: [{ text: String(index + 1) }] }],
      style: { font: theme.bodyFont, size: 13, color: '#ffffff', bold: true, italic: false, lineHeight: 1, align: 'center', spaceAfter: 0 },
      valign: 'middle',
    });
    const top = slot.rect.y + node + 0.3;
    elements.push({
      kind: 'text', slot: slot.name, rect: { x, y: top, w: width, h: 0.75 },
      paras: [{ runs: parseInline(item.title) }],
      style: { font: theme.headingFont, size: roundPt(theme.bodySize * 1.02), color: colors.text, bold: true, italic: false, lineHeight: 1.15, align: 'left', spaceAfter: 0 },
      valign: 'top',
    });
    elements.push({
      kind: 'text', slot: slot.name, rect: { x, y: top + 0.8, w: width, h: slot.rect.y + slot.rect.h - (top + 0.8) },
      paras: [{ runs: parseInline(item.text) }],
      style: { font: theme.bodyFont, size: roundPt(theme.bodySize * 0.8), color: colors.muted, bold: false, italic: false, lineHeight: 1.32, align: 'left', spaceAfter: 0 },
      valign: 'top',
    });
  });
}

// CSS for the HTML renderers -------------------------------------------------

export type Css = Record<string, string | number>;

export function fillCss(fill: Fill): Css {
  if ('gradient' in fill) return { background: `linear-gradient(${fill.angle}deg, ${fill.gradient[0]}, ${fill.gradient[1]})` };
  return fill.opacity !== undefined && fill.opacity < 1
    ? { background: fill.color, opacity: fill.opacity }
    : { background: fill.color };
}

export const boxCss = (rect: Rect): Css => ({
  position: 'absolute',
  left: `${rect.x}in`,
  top: `${rect.y}in`,
  width: `${rect.w}in`,
  height: `${rect.h}in`,
});

export function shapeCss(el: Extract<El, { kind: 'shape' }>): Css {
  return {
    ...boxCss(el.rect),
    ...fillCss(el.fill),
    ...(el.shape === 'ellipse' ? { borderRadius: '50%' } : {}),
    ...(el.shape === 'corner' ? { clipPath: 'polygon(0 0, 100% 0, 100% 100%)' } : {}),
    ...(el.radius ? { borderRadius: `${el.radius}in` } : {}),
  };
}

const JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

export function textBoxCss(el: Extract<El, { kind: 'text' }>): Css {
  const { style } = el;
  return {
    ...boxCss(el.rect),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: JUSTIFY[el.valign],
    overflow: 'hidden',
    fontFamily: fontStack(style.font),
    fontSize: `${style.size}pt`,
    color: style.color,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    lineHeight: style.lineHeight,
    textAlign: style.align,
    overflowWrap: 'break-word',
    ...(style.letterSpacing ? { letterSpacing: `${style.letterSpacing}pt` } : {}),
    ...(style.uppercase ? { textTransform: 'uppercase' } : {}),
  };
}

/** Indent of a bullet's text, in points. */
export const bulletIndent = (style: TextStyle, level: number): number => roundPt(style.size * 1.1 + level * style.size * 1.2);

export function paraCss(el: Extract<El, { kind: 'text' }>, para: RenderPara, last: boolean): Css {
  const css: Css = { margin: 0, marginBottom: last ? 0 : `${el.style.spaceAfter}pt`, position: 'relative' };
  if (el.list) css.paddingLeft = `${bulletIndent(el.style, para.level ?? 0)}pt`;
  if (para.size) css.fontSize = `${para.size}pt`;
  if (para.color) css.color = para.color;
  if (para.bold !== undefined) css.fontWeight = para.bold ? 700 : 400;
  if (para.font) css.fontFamily = fontStack(para.font);
  return css;
}

export function markerCss(el: Extract<El, { kind: 'text' }>, para: RenderPara): Css {
  return {
    position: 'absolute',
    left: `${bulletIndent(el.style, para.level ?? 0) - el.style.size * 1.1}pt`,
    top: 0,
    fontStyle: 'normal',
    fontWeight: el.list === 'number' ? 700 : 400,
  };
}

export const markerText = (el: Extract<El, { kind: 'text' }>, index: number, para: RenderPara): string =>
  (el.list === 'number' && !para.level ? `${index + 1}.` : para.level ? '–' : '•');

export function runCss(run: TextRun): Css {
  return {
    ...(run.bold ? { fontWeight: 700 } : {}),
    ...(run.italic ? { fontStyle: 'italic' } : {}),
    ...(run.color ? { color: run.color } : {}),
  };
}

/** camelCase CSS object → inline style string, safe inside a double-quoted attribute. */
export function cssText(css: Css): string {
  return Object.entries(css)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}:${typeof value === 'number' && !['opacity', 'lineHeight', 'fontWeight', 'zIndex', 'flex'].includes(key) ? `${value}px` : value}`)
    .join(';')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/** Index numbers count only top-level bullets. */
export function listNumbers(paras: RenderPara[]): number[] {
  let counter = -1;
  return paras.map((item) => (item.level ? counter : (counter += 1)));
}
