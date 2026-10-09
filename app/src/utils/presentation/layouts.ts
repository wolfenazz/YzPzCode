// The curated slide layouts. Slot rectangles are in inches on a 13.333 × 7.5 in
// (16:9) slide; both the in-app renderer and the PPTX exporter read them, so
// the editor matches the exported file. Dependency-free.

import type { BlockType, DeckSize, LayoutId } from './types';

export const SLIDE_HEIGHT = 7.5;
export const SLIDE_WIDTHS: Record<DeckSize, number> = { '16:9': 13.333, '4:3': 10 };
/** CSS pixels per inch: a 16:9 slide renders at 1280 × 720. */
export const PX_PER_IN = 96;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which theme type style a text slot uses. */
export type TextRole =
  | 'display'
  | 'title'
  | 'subtitle'
  | 'heading'
  | 'body'
  | 'caption'
  | 'kicker'
  | 'quote'
  | 'attribution';

export interface SlotDef {
  name: string;
  /** Shown in the editor and given to the AI. */
  label: string;
  rect: Rect;
  accepts: BlockType[];
  role: TextRole;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  /** Bullets are numbered (agenda). */
  numbered?: boolean;
  /** Characters a single-paragraph text slot holds at full size. */
  maxChars?: number;
  /** Bullets, stats or steps the slot holds. */
  maxItems?: number;
  /** Words per bullet. */
  maxWords?: number;
  /** Empty is fine (no placeholder shown in exports). */
  optional?: boolean;
}

export interface LayoutDef {
  id: LayoutId;
  name: string;
  description: string;
  /** Title-like slide: filled with the theme's title fill. */
  filled?: boolean;
  /** Text sits on a full-bleed image. */
  overImage?: boolean;
  /** Draw the theme's title rule under the "title" slot. */
  titleRule?: boolean;
  /** Surface-coloured cards behind content. */
  panels?: Rect[];
  slots: SlotDef[];
}

const W = SLIDE_WIDTHS['16:9'];
const H = SLIDE_HEIGHT;
const M = 0.75;
const CONTENT_W = W - M * 2;
const TITLE: SlotDef = { name: 'title', label: 'Title', rect: { x: M, y: 0.5, w: CONTENT_W, h: 1.05 }, accepts: ['text'], role: 'title', valign: 'bottom', maxChars: 80 };
const BODY_Y = 1.95;
const BODY_H = H - BODY_Y - 0.75;
const GAP = 0.5;
const HALF_W = (CONTENT_W - GAP) / 2;

const text = (name: string, label: string, rect: Rect, role: TextRole, extra: Partial<SlotDef> = {}): SlotDef => ({
  name, label, rect, accepts: ['text'], role, ...extra,
});

export const LAYOUTS: LayoutDef[] = [
  {
    id: 'title',
    name: 'Title',
    description: 'Opening slide: the deck title, a one-line subtitle and an eyebrow (event, date or company).',
    filled: true,
    slots: [
      text('kicker', 'Eyebrow', { x: 0.9, y: 1.75, w: 11.5, h: 0.45 }, 'kicker', { maxChars: 60, optional: true }),
      text('title', 'Title', { x: 0.9, y: 2.25, w: 11.5, h: 2.1 }, 'display', { valign: 'bottom', maxChars: 70 }),
      text('subtitle', 'Subtitle', { x: 0.9, y: 4.6, w: 10, h: 1.1 }, 'subtitle', { maxChars: 140, optional: true }),
    ],
  },
  {
    id: 'agenda',
    name: 'Agenda',
    description: 'Numbered list of what the talk covers.',
    titleRule: true,
    slots: [
      TITLE,
      { name: 'body', label: 'Agenda items', rect: { x: M, y: BODY_Y, w: CONTENT_W, h: BODY_H }, accepts: ['bullets'], role: 'body', numbered: true, maxItems: 7, maxWords: 8 },
    ],
  },
  {
    id: 'section',
    name: 'Section divider',
    description: 'Opens a new part of the talk: a short title and an optional line of context.',
    filled: true,
    slots: [
      text('kicker', 'Part label', { x: 0.9, y: 2.3, w: 11.5, h: 0.45 }, 'kicker', { maxChars: 40, optional: true }),
      text('title', 'Title', { x: 0.9, y: 2.8, w: 11.5, h: 1.6 }, 'display', { valign: 'bottom', maxChars: 60 }),
      text('subtitle', 'Subtitle', { x: 0.9, y: 4.6, w: 10, h: 0.9 }, 'subtitle', { maxChars: 120, optional: true }),
    ],
  },
  {
    id: 'bullets',
    name: 'Title and bullets',
    description: 'A takeaway title over three to six short bullets.',
    titleRule: true,
    slots: [
      TITLE,
      { name: 'body', label: 'Bullets', rect: { x: M, y: BODY_Y, w: CONTENT_W, h: BODY_H }, accepts: ['bullets', 'text'], role: 'body', maxItems: 6, maxWords: 14, maxChars: 420 },
    ],
  },
  {
    id: 'two-column',
    name: 'Two columns',
    description: 'Two related groups of points side by side.',
    titleRule: true,
    slots: [
      TITLE,
      { name: 'left', label: 'Left column', rect: { x: M, y: BODY_Y, w: HALF_W, h: BODY_H }, accepts: ['bullets', 'text'], role: 'body', maxItems: 5, maxWords: 12, maxChars: 260 },
      { name: 'right', label: 'Right column', rect: { x: M + HALF_W + GAP, y: BODY_Y, w: HALF_W, h: BODY_H }, accepts: ['bullets', 'text'], role: 'body', maxItems: 5, maxWords: 12, maxChars: 260 },
    ],
  },
  {
    id: 'comparison',
    name: 'Comparison',
    description: 'Two options, before/after or pros/cons, each with a heading.',
    titleRule: true,
    panels: [
      { x: M, y: BODY_Y, w: HALF_W, h: BODY_H },
      { x: M + HALF_W + GAP, y: BODY_Y, w: HALF_W, h: BODY_H },
    ],
    slots: [
      TITLE,
      text('leftTitle', 'Left heading', { x: M + 0.35, y: BODY_Y + 0.3, w: HALF_W - 0.7, h: 0.6 }, 'heading', { maxChars: 40 }),
      { name: 'left', label: 'Left points', rect: { x: M + 0.35, y: BODY_Y + 1.05, w: HALF_W - 0.7, h: BODY_H - 1.35 }, accepts: ['bullets', 'text'], role: 'body', maxItems: 5, maxWords: 10, maxChars: 220 },
      text('rightTitle', 'Right heading', { x: M + HALF_W + GAP + 0.35, y: BODY_Y + 0.3, w: HALF_W - 0.7, h: 0.6 }, 'heading', { maxChars: 40 }),
      { name: 'right', label: 'Right points', rect: { x: M + HALF_W + GAP + 0.35, y: BODY_Y + 1.05, w: HALF_W - 0.7, h: BODY_H - 1.35 }, accepts: ['bullets', 'text'], role: 'body', maxItems: 5, maxWords: 10, maxChars: 220 },
    ],
  },
  {
    id: 'image-left',
    name: 'Image left',
    description: 'A full-height picture on the left, the point and a few bullets on the right.',
    slots: [
      { name: 'image', label: 'Image', rect: { x: 0, y: 0, w: 6, h: H }, accepts: ['image', 'icon'], role: 'caption' },
      text('title', 'Title', { x: 6.6, y: 0.9, w: 6, h: 1.5 }, 'title', { valign: 'bottom', maxChars: 70 }),
      { name: 'body', label: 'Points', rect: { x: 6.6, y: 2.65, w: 6, h: 4.1 }, accepts: ['bullets', 'text'], role: 'body', maxItems: 4, maxWords: 12, maxChars: 260 },
    ],
  },
  {
    id: 'image-right',
    name: 'Image right',
    description: 'The point and a few bullets on the left, a full-height picture on the right.',
    slots: [
      text('title', 'Title', { x: M, y: 0.9, w: 6, h: 1.5 }, 'title', { valign: 'bottom', maxChars: 70 }),
      { name: 'body', label: 'Points', rect: { x: M, y: 2.65, w: 6, h: 4.1 }, accepts: ['bullets', 'text'], role: 'body', maxItems: 4, maxWords: 12, maxChars: 260 },
      { name: 'image', label: 'Image', rect: { x: W - 6, y: 0, w: 6, h: H }, accepts: ['image', 'icon'], role: 'caption' },
    ],
  },
  {
    id: 'full-image',
    name: 'Full-bleed image',
    description: 'One striking picture filling the slide, with a headline and caption over it.',
    overImage: true,
    slots: [
      { name: 'image', label: 'Image', rect: { x: 0, y: 0, w: W, h: H }, accepts: ['image'], role: 'caption' },
      text('title', 'Headline', { x: M, y: 4.75, w: CONTENT_W, h: 1.25 }, 'title', { valign: 'bottom', maxChars: 70 }),
      text('caption', 'Caption', { x: M, y: 6.1, w: CONTENT_W, h: 0.7 }, 'subtitle', { maxChars: 120, optional: true }),
    ],
  },
  {
    id: 'stats',
    name: 'Big numbers',
    description: 'Three or four headline figures with short labels, and one line saying what they mean.',
    titleRule: true,
    slots: [
      TITLE,
      { name: 'stats', label: 'Figures', rect: { x: M, y: 2.25, w: CONTENT_W, h: 2.9 }, accepts: ['stats'], role: 'body', maxItems: 4, maxWords: 8 },
      text('caption', 'Takeaway', { x: M, y: 5.6, w: CONTENT_W, h: 1.1 }, 'subtitle', { maxChars: 140, optional: true }),
    ],
  },
  {
    id: 'quote',
    name: 'Quote',
    description: 'A short, memorable quotation with its source.',
    slots: [
      { name: 'quote', label: 'Quote', rect: { x: 1.6, y: 1.5, w: W - 3.2, h: 3.8 }, accepts: ['quote', 'text'], role: 'quote', valign: 'middle', maxChars: 220 },
      text('attribution', 'Attribution', { x: 1.6, y: 5.5, w: W - 3.2, h: 0.6 }, 'attribution', { maxChars: 80, optional: true }),
    ],
  },
  {
    id: 'timeline',
    name: 'Timeline / process',
    description: 'Three to five steps or milestones in order, each with a short title and one line.',
    titleRule: true,
    slots: [
      TITLE,
      { name: 'steps', label: 'Steps', rect: { x: M, y: 2.15, w: CONTENT_W, h: 4.5 }, accepts: ['steps'], role: 'body', maxItems: 5, maxWords: 14 },
    ],
  },
  {
    id: 'chart',
    name: 'Chart and takeaway',
    description: 'A native chart of real figures beside the one conclusion it supports.',
    titleRule: true,
    panels: [{ x: 8.85, y: BODY_Y, w: W - 8.85 - M, h: BODY_H }],
    slots: [
      TITLE,
      { name: 'chart', label: 'Chart', rect: { x: M, y: BODY_Y, w: 7.7, h: BODY_H }, accepts: ['chart', 'table'], role: 'caption' },
      { name: 'takeaway', label: 'Takeaway', rect: { x: 9.2, y: BODY_Y + 0.35, w: W - 9.2 - M - 0.35, h: BODY_H - 0.7 }, accepts: ['text', 'bullets'], role: 'body', valign: 'middle', maxItems: 3, maxWords: 12, maxChars: 200 },
    ],
  },
  {
    id: 'table',
    name: 'Table',
    description: 'A compact table (at most 6 rows by 5 columns) and an optional source line.',
    titleRule: true,
    slots: [
      TITLE,
      { name: 'table', label: 'Table', rect: { x: M, y: BODY_Y, w: CONTENT_W, h: 4.45 }, accepts: ['table'], role: 'body', maxItems: 7 },
      text('caption', 'Source or note', { x: M, y: 6.5, w: CONTENT_W, h: 0.45 }, 'caption', { maxChars: 140, optional: true }),
    ],
  },
  {
    id: 'closing',
    name: 'Closing',
    description: 'The ask or the next step, with contact details.',
    filled: true,
    slots: [
      text('title', 'Closing line', { x: 0.9, y: 1.9, w: 11.5, h: 2.1 }, 'display', { valign: 'bottom', maxChars: 70 }),
      text('subtitle', 'Call to action', { x: 0.9, y: 4.25, w: 10, h: 1.0 }, 'subtitle', { maxChars: 140, optional: true }),
      text('contact', 'Contact', { x: 0.9, y: 5.6, w: 10, h: 0.8 }, 'caption', { maxChars: 120, optional: true }),
    ],
  },
];

const BY_ID = new Map(LAYOUTS.map((layout) => [layout.id, layout]));

export const LAYOUT_IDS = LAYOUTS.map((layout) => layout.id);

export function isLayoutId(value: unknown): value is LayoutId {
  return typeof value === 'string' && BY_ID.has(value as LayoutId);
}

export function getLayout(id: LayoutId | string): LayoutDef {
  return BY_ID.get(id as LayoutId) ?? BY_ID.get('bullets')!;
}

export function slideWidth(size: DeckSize): number {
  return SLIDE_WIDTHS[size] ?? SLIDE_WIDTHS['16:9'];
}

/** Scales a 16:9 rectangle horizontally for the deck's aspect ratio. */
export function scaleRect(rect: Rect, size: DeckSize): Rect {
  if (size === '16:9') return rect;
  const factor = slideWidth(size) / W;
  return { x: rect.x * factor, y: rect.y, w: rect.w * factor, h: rect.h };
}

/** The layout's slots with rectangles for the deck size. */
export function layoutSlots(id: LayoutId | string, size: DeckSize): SlotDef[] {
  return getLayout(id).slots.map((slot) => ({ ...slot, rect: scaleRect(slot.rect, size) }));
}

/** Synonyms the AI (or an import) might use for a layout. */
const LAYOUT_ALIASES: Array<[RegExp, LayoutId]> = [
  [/^(title|cover|opening|intro(duction)?[-_ ]?slide|hero)/, 'title'],
  [/(agenda|contents|overview[-_ ]list|toc)/, 'agenda'],
  [/(section|divider|chapter|part|header)/, 'section'],
  [/(compar|versus|vs\b|pros|before[-_ ]after)/, 'comparison'],
  [/(two|2)[-_ ]?col|columns|split/, 'two-column'],
  [/(image|photo|picture|visual)[-_ ]?(left)/, 'image-left'],
  [/(left)[-_ ]?(image|photo|picture)/, 'image-left'],
  [/(full|bleed|background)[-_ ]?(image|photo)|^(image|photo|picture)$/, 'full-image'],
  [/(image|photo|picture|visual)/, 'image-right'],
  [/(stat|number|metric|kpi|figure)/, 'stats'],
  [/(quote|testimonial|citation)/, 'quote'],
  [/(timeline|process|steps|roadmap|journey|milestone|phases)/, 'timeline'],
  [/(chart|graph|plot|data)/, 'chart'],
  [/(table|grid|matrix)/, 'table'],
  [/(closing|conclusion|thank|cta|call[-_ ]to[-_ ]action|\bend\b|contact|next[-_ ]steps)/, 'closing'],
  [/(bullet|list|content|text|points|default)/, 'bullets'],
];

/** Maps any layout name to the nearest supported layout. */
export function nearestLayout(value: unknown, fallback: LayoutId = 'bullets'): LayoutId {
  if (isLayoutId(value)) return value;
  const name = String(value ?? '').trim().toLowerCase();
  if (!name) return fallback;
  for (const [pattern, id] of LAYOUT_ALIASES) if (pattern.test(name)) return id;
  return fallback;
}
