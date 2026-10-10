// The `.yzdeck` file: creation, paths, serialisation and validation.
// Dependency-free (tested by `npm run test:presentation`).

import { joinPath, slugify } from '../writing/document';
import { clampSlideCount, sanitizeAttachment, sanitizeDesignedSlide, sanitizeDesignSystem } from './designPrompts';
import { designCanvas } from './designStyles';
import type { DeckOrigin, DesignAttachment, DesignedDeck, DesignedSlide } from './designTypes';
import type { EngineChoice } from '../writing/types';
import { getLayout, nearestLayout } from './layouts';
import { blockText, runsText, textBlock } from './richText';
import { newSlideId, sanitizeStoredSlide } from './sanitize';
import { DEFAULT_THEME_ID, getTheme, sanitizeTheme } from './themes';
import type { DeckBrief, DeckSize, DeckTheme, DeckTone, OutlineSlide, PreserveSlide, PreserveSource, Slide, YzDeck } from './types';

export { newSlideId };

export const YZDECK_EXTENSION = '.yzdeck';
export const PRESENTATIONS_FOLDER = 'Presentations';
export const ASSETS_FOLDER = 'assets';

export const DEFAULT_DECK_ENGINE: EngineChoice = { engine: 'claude', model: '', allowWebResearch: false };
export const DECK_TONES: Array<{ id: DeckTone; label: string; hint: string }> = [
  { id: 'professional', label: 'Professional', hint: 'Clear, confident, businesslike' },
  { id: 'persuasive', label: 'Persuasive', hint: 'Builds to an ask' },
  { id: 'educational', label: 'Educational', hint: 'Explains step by step' },
  { id: 'inspiring', label: 'Inspiring', hint: 'Big ideas, vivid language' },
  { id: 'casual', label: 'Casual', hint: 'Friendly and plain-spoken' },
];

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 30;

export function createBrief(engine: EngineChoice = DEFAULT_DECK_ENGINE, slideCount = 10, tone: DeckTone = 'professional'): DeckBrief {
  return {
    topic: '',
    audience: '',
    goal: '',
    slideCount: clampCount(slideCount),
    tone,
    language: 'English',
    sourceNotes: '',
    sourceFiles: [],
    engine: { ...engine },
  };
}

const clampCount = (value: unknown): number => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, number)) : 10;
};

let deckCounter = 0;
export function newDeckId(): string {
  deckCounter += 1;
  return `deck-${Date.now().toString(36)}-${deckCounter.toString(36)}`;
}

let outlineCounter = 0;
export function newOutlineId(): string {
  outlineCounter += 1;
  return `o-${Date.now().toString(36)}-${outlineCounter.toString(36)}`;
}

export function createDeck(options: {
  title: string;
  brief: DeckBrief;
  theme?: DeckTheme;
  size?: DeckSize;
  outline?: OutlineSlide[];
  slides?: Slide[];
  source?: PreserveSource;
  design?: DesignedDeck;
}): YzDeck {
  const now = Date.now();
  return {
    format: 'yzdeck',
    version: 1,
    meta: { id: newDeckId(), title: options.title.trim() || 'Untitled presentation', createdAt: now, updatedAt: now },
    brief: options.brief,
    theme: options.theme ?? getTheme(DEFAULT_THEME_ID),
    size: options.size ?? '16:9',
    showNumbers: true,
    transition: 'fade',
    outline: options.outline ?? [],
    slides: options.slides ?? [],
    ...(options.source ? { source: options.source } : {}),
    ...(options.design ? { design: options.design } : {}),
  };
}

/** `<workspace>/Presentations/<slug>/<slug>.yzdeck`, with a numeric suffix if `taken` has it. */
export function deckPath(workspacePath: string, title: string, taken: Set<string> = new Set()): string {
  const base = slugify(title) === 'report' && !/report/i.test(title) ? 'presentation' : slugify(title);
  let slug = base;
  let counter = 2;
  const candidate = (): string => joinPath(workspacePath, PRESENTATIONS_FOLDER, slug, `${slug}${YZDECK_EXTENSION}`);
  while (taken.has(candidate().toLowerCase())) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return candidate();
}

export function serializeDeck(deck: YzDeck): string {
  return `${JSON.stringify({ ...deck, meta: { ...deck.meta, updatedAt: Date.now() } }, null, 1)}\n`;
}

function sanitizeOutline(value: unknown): OutlineSlide[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const raw = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newOutlineId(),
      title: String(raw.title ?? '').slice(0, 200),
      purpose: String(raw.purpose ?? '').slice(0, 600),
      layout: nearestLayout(raw.layout),
      keyPoints: Array.isArray(raw.keyPoints) ? raw.keyPoints.map((point) => String(point).slice(0, 300)).slice(0, 8) : [],
    };
  }).filter((entry) => entry.title.trim());
}

function sanitizePreserve(value: unknown): PreserveSource | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<PreserveSource>;
  if (raw.mode !== 'preserve' || typeof raw.pptxFile !== 'string') return undefined;
  const slides: PreserveSlide[] = Array.isArray(raw.slides) ? raw.slides.filter((slide) => slide && typeof slide.key === 'string' && typeof slide.source === 'string').map((slide) => ({
    key: slide.key,
    source: slide.source,
    hidden: Boolean(slide.hidden),
    text: slide.text && typeof slide.text === 'object'
      ? Object.fromEntries(Object.entries(slide.text).filter(([, paragraphs]) => Array.isArray(paragraphs)).map(([id, paragraphs]) => [id, (paragraphs as unknown[]).map(String)]))
      : {},
    ...(typeof slide.notes === 'string' ? { notes: slide.notes } : {}),
  })) : [];
  return { mode: 'preserve', pptxFile: raw.pptxFile, originalPath: String(raw.originalPath ?? ''), slides };
}

function sanitizeDesign(value: unknown, size: DeckSize): DesignedDeck | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<Record<keyof DesignedDeck, unknown>>;
  const canvas = designCanvas(size);
  const slides = Array.isArray(raw.slides)
    ? raw.slides.map((slide) => sanitizeDesignedSlide(slide, canvas)).filter((slide): slide is DesignedSlide => slide !== null)
    : [];
  const seen = new Set<string>();
  for (const slide of slides) {
    if (seen.has(slide.id)) slide.id = `${slide.id}-${seen.size}`;
    seen.add(slide.id);
  }
  return {
    prompt: String(raw.prompt ?? '').slice(0, 20_000),
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map(sanitizeAttachment).filter((entry): entry is DesignAttachment => entry !== null) : [],
    slideCount: clampSlideCount(raw.slideCount),
    language: String(raw.language ?? '').slice(0, 40),
    system: sanitizeDesignSystem(raw.system, { stored: true }),
    slides,
    ...(sanitizeOrigin(raw.origin) ? { origin: sanitizeOrigin(raw.origin)! } : {}),
  };
}

function sanitizeOrigin(value: unknown): DeckOrigin | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'pptx' || typeof raw.file !== 'string') return null;
  return { kind: 'pptx', file: raw.file.slice(0, 1000), importedAt: Number(raw.importedAt) || 0, system: sanitizeDesignSystem(raw.system, { stored: true }) };
}

/** Parses and repairs a `.yzdeck` file. Throws with a readable message when it is not one. */
export function parseDeck(text: string): YzDeck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a valid presentation (it is not JSON).');
  }
  const value = raw as Partial<YzDeck>;
  if (!value || typeof value !== 'object' || value.format !== 'yzdeck') throw new Error('This file is not a YzPzCode presentation.');
  if (value.version !== 1) throw new Error(`Presentation format version ${String(value.version)} is not supported.`);
  const fallback = createBrief();
  const brief = (value.brief && typeof value.brief === 'object' ? value.brief : {}) as Partial<DeckBrief>;
  const slides = Array.isArray(value.slides)
    ? value.slides.map(sanitizeStoredSlide).filter((slide): slide is Slide => slide !== null)
    : [];
  // Ids must be unique: selection, undo and AI review all key on them.
  const seen = new Set<string>();
  for (const slide of slides) {
    if (seen.has(slide.id)) slide.id = newSlideId();
    seen.add(slide.id);
  }
  const source = sanitizePreserve(value.source);
  const size: DeckSize = value.size === '4:3' ? '4:3' : '16:9';
  const design = source ? undefined : sanitizeDesign(value.design, size);
  return {
    format: 'yzdeck',
    version: 1,
    meta: {
      id: String(value.meta?.id ?? newDeckId()),
      title: String(value.meta?.title ?? 'Untitled presentation'),
      createdAt: Number(value.meta?.createdAt ?? Date.now()),
      updatedAt: Number(value.meta?.updatedAt ?? Date.now()),
    },
    brief: {
      ...fallback,
      ...brief,
      slideCount: clampCount(brief.slideCount ?? fallback.slideCount),
      tone: DECK_TONES.some((tone) => tone.id === brief.tone) ? brief.tone as DeckTone : fallback.tone,
      sourceFiles: Array.isArray(brief.sourceFiles) ? brief.sourceFiles.map(String) : [],
      engine: { ...DEFAULT_DECK_ENGINE, ...(brief.engine ?? {}) },
    },
    theme: sanitizeTheme(value.theme),
    size,
    showNumbers: value.showNumbers !== false,
    transition: value.transition === 'none' || value.transition === 'slide' ? value.transition : 'fade',
    outline: sanitizeOutline(value.outline),
    slides,
    ...(source ? { source } : {}),
    ...(design ? { design } : {}),
  };
}

/** The slide's title text, for the filmstrip and the AI. */
export function slideTitle(slide: Slide): string {
  for (const name of ['title', 'quote', 'leftTitle', 'caption']) {
    const block = slide.slots[name];
    if (block?.type === 'text' || block?.type === 'bullets') {
      const text = block.items.map((item) => runsText(item.runs)).join(' ').trim();
      if (text) return text;
    }
    if (block?.type === 'quote' && block.text) return block.text;
  }
  return '';
}

/** Plain text of the whole slide, for search and the AI. */
export function slideText(slide: Slide): string {
  return Object.values(slide.slots).map(blockText).filter(Boolean).join('\n');
}

/** The slide shown while the AI writes an outline item: its layout and title only. */
export function placeholderSlide(item: OutlineSlide): Slide {
  const slots: Slide['slots'] = {};
  if (getLayout(item.layout).slots.some((slot) => slot.name === 'title')) slots.title = textBlock(item.title);
  return { id: newSlideId(), layout: item.layout, slots, notes: '' };
}

/** A copy of a slide with a new id. */
export function duplicateSlide(slide: Slide): Slide {
  return { ...structuredCloneSafe(slide), id: newSlideId() };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
