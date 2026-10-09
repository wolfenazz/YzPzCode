// Reusable themes and deck templates: making one from a deck, starting a deck
// from one, and the JSON files they are shared as. Dependency-free.

import { newOutlineId } from './deck';
import { newSlideId, sanitizeStoredSlide } from './sanitize';
import { sanitizeTheme } from './themes';
import { slideTitle } from './deck';
import type { DeckTemplate, DeckTheme, OutlineSlide, Slide, YzDeck } from './types';

export const THEME_FILE_FORMAT = 'yzpz-deck-theme';
export const TEMPLATE_FILE_FORMAT = 'yzpz-deck-template';

let counter = 0;
const newId = (prefix: string): string => {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
};

export const newThemeId = (): string => newId('theme');

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Slides without their pictures (paths only work inside one deck folder). */
function portableSlides(slides: Slide[]): Slide[] {
  return slides.map((slide) => {
    const copy = clone(slide);
    for (const [name, block] of Object.entries(copy.slots)) {
      if (block.type === 'image') copy.slots[name] = { ...block, src: '', credit: undefined };
    }
    delete copy.fit;
    return copy;
  });
}

export function templateFromDeck(deck: YzDeck, name: string, description = ''): DeckTemplate {
  return {
    id: newId('template'),
    name: name.trim().slice(0, 80) || deck.meta.title,
    description: description.trim().slice(0, 300),
    theme: clone(deck.theme),
    size: deck.size,
    slides: portableSlides(deck.slides),
    createdAt: Date.now(),
  };
}

/** Fresh slides (new ids) to start a deck from a template. */
export function slidesFromTemplate(template: DeckTemplate): Slide[] {
  return clone(template.slides).map((slide) => ({ ...slide, id: newSlideId() }));
}

/** The template's structure as a storyline for the AI to write. */
export function outlineFromTemplate(template: DeckTemplate): OutlineSlide[] {
  return template.slides.map((slide) => ({
    id: newOutlineId(),
    title: slideTitle(slide) || 'Slide',
    purpose: '',
    layout: slide.layout,
    keyPoints: [],
  }));
}

export function sanitizeTemplate(value: unknown): DeckTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DeckTemplate>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const slides = Array.isArray(raw.slides) ? raw.slides.map(sanitizeStoredSlide).filter((slide): slide is Slide => slide !== null) : [];
  if (slides.length === 0) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('template'),
    name: raw.name.trim().slice(0, 80),
    description: String(raw.description ?? '').slice(0, 300),
    theme: sanitizeTheme(raw.theme),
    size: raw.size === '4:3' ? '4:3' : '16:9',
    slides: portableSlides(slides),
    createdAt: Number(raw.createdAt ?? Date.now()),
  };
}

export function serializeTheme(theme: DeckTheme): string {
  return `${JSON.stringify({ format: THEME_FILE_FORMAT, version: 1, theme }, null, 2)}\n`;
}

/** Reads a theme file (or a bare theme object). Throws with a readable message. */
export function parseThemeFile(text: string): DeckTheme {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a theme (it is not JSON).');
  }
  const envelope = raw as { format?: unknown; theme?: unknown; palette?: unknown };
  const theme = envelope?.format === THEME_FILE_FORMAT ? envelope.theme : envelope?.palette ? raw : null;
  if (!theme || typeof theme !== 'object' || !(theme as { palette?: unknown }).palette) throw new Error('This file is not a YzPzCode deck theme.');
  return { ...sanitizeTheme(theme), id: newThemeId() };
}

export function serializeTemplate(template: DeckTemplate): string {
  return `${JSON.stringify({ format: TEMPLATE_FILE_FORMAT, version: 1, template }, null, 1)}\n`;
}

export function parseTemplateFile(text: string): DeckTemplate {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a template (it is not JSON).');
  }
  const envelope = raw as { format?: unknown; template?: unknown };
  const template = sanitizeTemplate(envelope?.format === TEMPLATE_FILE_FORMAT ? envelope.template : raw);
  if (!template) throw new Error('This file is not a YzPzCode deck template.');
  return { ...template, id: newId('template') };
}
