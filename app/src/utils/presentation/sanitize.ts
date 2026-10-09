// Coerces slide JSON (from the AI or from a file) into valid slides: known
// layouts only, blocks the slot accepts, text clamped to the slot's budget.
// Bullet overflow continues on a new slide. Dependency-free.

import { getLayout, isLayoutId, nearestLayout, type SlotDef } from './layouts';
import { bulletsBlock, clampRunsToChars, clampRunsToWords, mergeRuns, para, runsText, textBlock } from './richText';
import { normalizeHex } from './themes';
import type { Block, ChartKind, ChartSeries, LayoutId, RichPara, Slide, StatItem, StepItem, TextRun } from './types';

let slideCounter = 0;
export function newSlideId(): string {
  slideCounter += 1;
  return `s-${Date.now().toString(36)}-${slideCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

const str = (value: unknown, max = 2000): string => (typeof value === 'string' ? value : value == null ? '' : String(value)).trim().slice(0, max);

const MAX_NOTES = 4000;
/** Budgets are soft: the design check shrinks the type before text is cut. */
const WORD_SLACK = 4;
const CHAR_SLACK = 1.3;

// Stored blocks ------------------------------------------------------------

function sanitizeRuns(value: unknown): TextRun[] {
  if (typeof value === 'string') return [{ text: value }];
  if (!Array.isArray(value)) return [];
  return mergeRuns(value.map((entry) => {
    const raw = (entry && typeof entry === 'object' ? entry : { text: entry }) as Record<string, unknown>;
    const run: TextRun = { text: str(raw.text, 4000) };
    if (raw.bold) run.bold = true;
    if (raw.italic) run.italic = true;
    const color = normalizeHex(raw.color);
    if (color) run.color = color;
    return run;
  }));
}

function sanitizeParas(value: unknown): RichPara[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === 'string') return para(entry);
    const raw = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const runs = raw.runs !== undefined ? sanitizeRuns(raw.runs) : sanitizeRuns(str(raw.text));
    const level = Number(raw.level) >= 1 ? 1 : 0;
    return level ? { runs, level } : { runs };
  }).filter((item) => runsText(item.runs).trim().length > 0);
}

const CHART_KINDS: ChartKind[] = ['bar', 'column', 'line', 'pie', 'donut'];

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[^0-9.\-eE]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function chartKind(value: unknown): ChartKind {
  const name = str(value).toLowerCase();
  if (CHART_KINDS.includes(name as ChartKind)) return name as ChartKind;
  if (/doughnut|donut|ring/.test(name)) return 'donut';
  if (/pie/.test(name)) return 'pie';
  if (/line|trend|area/.test(name)) return 'line';
  if (/horizontal|barh/.test(name)) return 'bar';
  return 'column';
}

function sanitizeChart(raw: Record<string, unknown>): Block | null {
  const kind = chartKind(raw.kind ?? raw.type);
  let categories = Array.isArray(raw.categories ?? raw.labels) ? (raw.categories ?? raw.labels) as unknown[] : [];
  const seriesRaw = Array.isArray(raw.series) ? raw.series as unknown[]
    : Array.isArray(raw.values) ? [{ name: str(raw.name) || 'Series 1', values: raw.values }] : [];
  let series: ChartSeries[] = seriesRaw.slice(0, kind === 'pie' || kind === 'donut' ? 1 : 4).map((entry, index) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const values = Array.isArray(item.values ?? item.data) ? ((item.values ?? item.data) as unknown[]).map(toNumber) : [];
    return { name: str(item.name ?? item.label, 60) || `Series ${index + 1}`, values };
  }).filter((entry) => entry.values.length > 0);
  if (series.length === 0) return null;
  const length = Math.min(12, Math.max(categories.length, ...series.map((entry) => entry.values.length)));
  categories = Array.from({ length }, (_, index) => str(categories[index], 40) || `${index + 1}`);
  series = series.map((entry) => ({ ...entry, values: Array.from({ length }, (_, index) => entry.values[index] ?? 0) }));
  const block: Block = { type: 'chart', kind, categories: categories as string[], series };
  const unit = str(raw.unit, 20);
  if (unit) block.unit = unit;
  return block;
}

function sanitizeTable(raw: Record<string, unknown>): Block | null {
  const header = Array.isArray(raw.header) ? (raw.header as unknown[]).map((cell) => str(cell, 60)) : null;
  const body = Array.isArray(raw.rows) ? (raw.rows as unknown[]).filter(Array.isArray).map((row) => (row as unknown[]).map((cell) => str(cell, 80))) : [];
  const rows = (header ? [header, ...body] : body).slice(0, 8);
  if (rows.length === 0) return null;
  const columns = Math.min(6, Math.max(...rows.map((row) => row.length)));
  return {
    type: 'table',
    rows: rows.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? '')),
    header: header ? true : raw.header === false ? false : true,
  };
}

function sanitizeStats(value: unknown): StatItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((entry) => {
    const raw = (entry && typeof entry === 'object' ? entry : { value: entry }) as Record<string, unknown>;
    const item: StatItem = { value: str(raw.value ?? raw.number ?? raw.figure, 16), label: str(raw.label ?? raw.text ?? raw.description, 120) };
    const icon = str(raw.icon, 60);
    if (/^[a-z0-9-]+:[a-z0-9-]+$/i.test(icon)) item.icon = icon;
    return item;
  }).filter((item) => item.value || item.label);
}

function sanitizeSteps(value: unknown): StepItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((entry) => {
    const raw = (entry && typeof entry === 'object' ? entry : { title: entry }) as Record<string, unknown>;
    const item: StepItem = { title: str(raw.title ?? raw.label ?? raw.name ?? raw.date, 60), text: str(raw.text ?? raw.description ?? raw.detail, 200) };
    const icon = str(raw.icon, 60);
    if (/^[a-z0-9-]+:[a-z0-9-]+$/i.test(icon)) item.icon = icon;
    return item;
  }).filter((item) => item.title || item.text);
}

/** Repairs a stored block; null when it is not one. */
export function sanitizeBlock(value: unknown): Block | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  switch (raw.type) {
    case 'text':
    case 'bullets': {
      const items = sanitizeParas(raw.items);
      return { type: raw.type, items };
    }
    case 'image': {
      const image: Block = { type: 'image', src: str(raw.src, 2000), fit: raw.fit === 'contain' ? 'contain' : 'cover', alt: str(raw.alt, 300) };
      const credit = str(raw.credit, 200);
      const prompt = str(raw.prompt, 2000);
      if (credit) image.credit = credit;
      if (prompt) image.prompt = prompt;
      return image;
    }
    case 'chart':
      return sanitizeChart(raw);
    case 'table':
      return sanitizeTable({ rows: raw.rows, header: raw.header === false ? false : undefined });
    case 'stats':
      return { type: 'stats', items: sanitizeStats(raw.items) };
    case 'steps':
      return { type: 'steps', items: sanitizeSteps(raw.items) };
    case 'icon': {
      const name = str(raw.name, 60);
      return name ? { type: 'icon', name } : null;
    }
    case 'quote':
      return { type: 'quote', text: str(raw.text, 600), attribution: str(raw.attribution, 120) };
    default:
      return null;
  }
}

/** Repairs a slide read from a `.yzdeck` file. */
export function sanitizeStoredSlide(value: unknown): Slide | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const layout = nearestLayout(raw.layout);
  const def = getLayout(layout);
  const slots: Record<string, Block> = {};
  const rawSlots = (raw.slots && typeof raw.slots === 'object' ? raw.slots : {}) as Record<string, unknown>;
  for (const slot of def.slots) {
    const block = sanitizeBlock(rawSlots[slot.name]);
    if (block && slot.accepts.includes(block.type)) slots[slot.name] = block;
  }
  const slide: Slide = { id: str(raw.id, 80) || newSlideId(), layout, slots, notes: str(raw.notes, MAX_NOTES) };
  const background = normalizeHex(raw.background);
  if (background) slide.background = background;
  if (raw.hidden) slide.hidden = true;
  if (raw.fit && typeof raw.fit === 'object') {
    const fit: Record<string, number> = {};
    for (const [key, scale] of Object.entries(raw.fit as Record<string, unknown>)) {
      const number = Number(scale);
      if (Number.isFinite(number) && number > 0.3 && number < 1) fit[key] = Math.round(number * 100) / 100;
    }
    if (Object.keys(fit).length > 0) slide.fit = fit;
  }
  return slide;
}

// AI slides -----------------------------------------------------------------

/** The flat slide shape the AI writes (see `prompts.ts`). */
export interface AiSlide {
  layout?: string;
  title?: string;
  subtitle?: string;
  kicker?: string;
  bullets?: Array<string | { text: string; level?: number }>;
  text?: string;
  left?: { heading?: string; bullets?: AiSlide['bullets']; text?: string };
  right?: { heading?: string; bullets?: AiSlide['bullets']; text?: string };
  image?: { description?: string; prompt?: string } | string;
  caption?: string;
  stats?: Array<{ value: string; label: string; icon?: string }>;
  quote?: { text?: string; attribution?: string } | string;
  attribution?: string;
  steps?: Array<{ title: string; text: string; icon?: string }>;
  chart?: { kind?: string; categories?: string[]; series?: Array<{ name: string; values: number[] }>; unit?: string };
  table?: { header?: string[]; rows?: string[][] };
  takeaway?: string;
  contact?: string;
  notes?: string;
}

/** A leading list marker the model may add: "- ", "• ", "* " or "1. " (not "**bold**" or "3.5%"). */
const BULLET_MARKER = /^\s*(?:[-•–]\s+|\*\s+|\d+[.)]\s+)/;

function bulletItems(value: unknown): Array<{ text: string; level: number }> {
  if (typeof value === 'string') {
    return value.split(/\n+/).map((line) => ({ text: line.replace(BULLET_MARKER, '').trim(), level: /^\s{2,}/.test(line) ? 1 : 0 })).filter((item) => item.text);
  }
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === 'string') return { text: entry.replace(BULLET_MARKER, '').trim(), level: 0 };
    const raw = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return { text: str(raw.text ?? raw.title), level: Number(raw.level) >= 1 ? 1 : 0 };
  }).filter((item) => item.text);
}

function clampItems(block: Block, slot: SlotDef): Block {
  if (block.type !== 'bullets' && block.type !== 'text') return block;
  const maxWords = slot.maxWords ? slot.maxWords + WORD_SLACK : null;
  const maxChars = slot.maxChars ? Math.round(slot.maxChars * CHAR_SLACK) : null;
  return {
    ...block,
    items: block.items.map((item) => {
      let runs = item.runs;
      if (block.type === 'bullets' && maxWords) runs = clampRunsToWords(runs, maxWords);
      if (block.type === 'text' && maxChars) runs = clampRunsToChars(runs, maxChars);
      return { ...item, runs };
    }),
  };
}

function clampText(value: string, slot: SlotDef | undefined): Block | null {
  const text = value.trim();
  if (!text) return null;
  const block = textBlock(text);
  return slot ? clampItems(block, slot) : block;
}

function sideBlock(side: AiSlide['left']): { heading: string; block: Block | null } {
  if (!side || typeof side !== 'object') return { heading: '', block: null };
  const items = bulletItems(side.bullets);
  const block = items.length > 0 ? bulletsBlock(items) : side.text ? textBlock(str(side.text)) : null;
  return { heading: str(side.heading), block };
}

/** The layout the content suggests when the AI names none (or an unusable one). */
function inferLayout(raw: AiSlide, index: number): LayoutId {
  if (Array.isArray(raw.stats) && raw.stats.length > 0) return 'stats';
  if (raw.chart && typeof raw.chart === 'object') return 'chart';
  if (raw.table && typeof raw.table === 'object') return 'table';
  if (Array.isArray(raw.steps) && raw.steps.length > 0) return 'timeline';
  if (raw.quote) return 'quote';
  if (raw.left && raw.right) return raw.left.heading || raw.right.heading ? 'comparison' : 'two-column';
  if (index === 0 && !raw.bullets) return 'title';
  return 'bullets';
}

export interface SanitizeOptions {
  /** Used when the AI names no layout. */
  fallbackLayout?: LayoutId;
  /** Forces a layout (Change layout). */
  forceLayout?: LayoutId;
  /** Position in the deck, for inference. */
  index?: number;
  /** Keep this id on the first slide. */
  id?: string;
  /** Cut text to the slot budgets (default). Imports keep every word. */
  clamp?: boolean;
}

/**
 * Coerces one AI slide into one or more valid slides. Unknown layouts map to
 * the nearest one, missing content downgrades the layout, text is clamped to
 * the slot budgets and too many bullets continue on a new slide.
 */
export function sanitizeSlide(value: unknown, options: SanitizeOptions = {}): Slide[] {
  const raw = (value && typeof value === 'object' ? value : { title: str(value) }) as AiSlide;
  const index = options.index ?? 1;
  const clampOn = options.clamp !== false;
  const toWords = (text: string, max: number): string => (clampOn ? runsText(clampRunsToWords([{ text }], max)) : text);
  const toChars = (text: string, max: number): string => (clampOn ? runsText(clampRunsToChars([{ text }], max)) : text);
  let layout: LayoutId = options.forceLayout
    ?? (raw.layout ? nearestLayout(raw.layout, options.fallbackLayout ?? inferLayout(raw, index)) : options.fallbackLayout ?? inferLayout(raw, index));

  const title = str(raw.title, 300);
  const bullets = bulletItems(raw.bullets);
  const text = str(raw.text, 2000);
  const chart = raw.chart && typeof raw.chart === 'object' ? sanitizeChart(raw.chart as Record<string, unknown>) : null;
  const table = raw.table && typeof raw.table === 'object' ? sanitizeTable(raw.table as Record<string, unknown>) : null;
  const stats = sanitizeStats(raw.stats);
  const steps = sanitizeSteps(raw.steps);
  const quoteText = typeof raw.quote === 'string' ? raw.quote : str(raw.quote?.text, 600);
  const attribution = str((typeof raw.quote === 'object' ? raw.quote?.attribution : '') || raw.attribution, 120);
  const imageAlt = typeof raw.image === 'string' ? str(raw.image, 300) : str(raw.image?.description, 300);

  // Downgrade layouts whose key content is missing.
  if (layout === 'stats' && stats.length < 2) layout = bullets.length ? 'bullets' : 'section';
  if (layout === 'chart' && !chart) layout = table ? 'table' : 'bullets';
  if (layout === 'table' && !table) layout = chart ? 'chart' : 'bullets';
  if (layout === 'timeline' && steps.length < 2) layout = 'bullets';
  if (layout === 'quote' && !quoteText) layout = 'bullets';
  if ((layout === 'two-column' || layout === 'comparison') && !raw.left && !raw.right && bullets.length > 0) layout = 'bullets';

  const def = getLayout(layout);
  const slotOf = (name: string): SlotDef | undefined => def.slots.find((slot) => slot.name === name);
  const slots: Record<string, Block> = {};
  const put = (name: string, block: Block | null): void => {
    const slot = slotOf(name);
    if (!slot || !block || !slot.accepts.includes(block.type)) return;
    if ((block.type === 'text' || block.type === 'bullets') && block.items.length === 0) return;
    slots[name] = clampOn ? clampItems(block, slot) : block;
  };
  const putText = (name: string, value: string): void => put(name, clampText(value, clampOn ? slotOf(name) : undefined));
  const bodyBlock = (): Block | null => (bullets.length > 0 ? bulletsBlock(bullets) : text ? textBlock(text) : null);

  let overflow: Array<{ text: string; level: number }> = [];

  switch (layout) {
    case 'title':
    case 'section':
      putText('kicker', str(raw.kicker));
      putText('title', title);
      putText('subtitle', str(raw.subtitle) || text);
      break;
    case 'closing':
      putText('title', title);
      putText('subtitle', str(raw.subtitle) || text || str(raw.takeaway));
      putText('contact', str(raw.contact));
      break;
    case 'agenda':
    case 'bullets': {
      putText('title', title);
      const max = slotOf('body')?.maxItems ?? 6;
      if (bullets.length > max) {
        // Split evenly so the continuation is not a lone bullet.
        const first = Math.ceil(bullets.length / Math.ceil(bullets.length / max));
        put('body', bulletsBlock(bullets.slice(0, first)));
        overflow = bullets.slice(first);
      } else {
        put('body', layout === 'agenda' && !bullets.length && text ? bulletsBlock(bulletItems(text)) : bodyBlock());
      }
      break;
    }
    case 'two-column':
    case 'comparison': {
      putText('title', title);
      const left = sideBlock(raw.left);
      const right = sideBlock(raw.right);
      if (!left.block && !right.block && bullets.length > 0) {
        const half = Math.ceil(bullets.length / 2);
        left.block = bulletsBlock(bullets.slice(0, half));
        right.block = bulletsBlock(bullets.slice(half));
      }
      put('left', left.block && left.block.type === 'bullets' ? { ...left.block, items: left.block.items.slice(0, clampOn ? slotOf('left')?.maxItems ?? 5 : undefined) } : left.block);
      put('right', right.block && right.block.type === 'bullets' ? { ...right.block, items: right.block.items.slice(0, clampOn ? slotOf('right')?.maxItems ?? 5 : undefined) } : right.block);
      if (layout === 'comparison') {
        putText('leftTitle', left.heading || 'Option A');
        putText('rightTitle', right.heading || 'Option B');
      }
      break;
    }
    case 'image-left':
    case 'image-right': {
      putText('title', title);
      const body = bodyBlock();
      put('body', body && body.type === 'bullets' ? { ...body, items: body.items.slice(0, clampOn ? slotOf('body')?.maxItems ?? 4 : undefined) } : body);
      put('image', { type: 'image', src: '', fit: 'cover', alt: imageAlt || title });
      break;
    }
    case 'full-image':
      put('image', { type: 'image', src: '', fit: 'cover', alt: imageAlt || title });
      putText('title', title);
      putText('caption', str(raw.caption) || str(raw.subtitle) || text);
      break;
    case 'stats':
      putText('title', title);
      put('stats', { type: 'stats', items: stats.map((item) => ({ ...item, label: toWords(item.label, 10) })) });
      putText('caption', str(raw.caption) || str(raw.takeaway) || str(raw.subtitle));
      break;
    case 'quote':
      put('quote', { type: 'quote', text: toChars(quoteText.replace(/^["“”]+|["“”]+$/g, ''), 280), attribution });
      putText('attribution', attribution);
      if (slots.quote?.type === 'quote') slots.quote = { ...slots.quote, attribution: '' };
      break;
    case 'timeline':
      putText('title', title);
      put('steps', { type: 'steps', items: steps.slice(0, 5).map((item) => ({ ...item, text: toWords(item.text, 18) })) });
      break;
    case 'chart': {
      putText('title', title);
      put('chart', chart);
      const takeaway = str(raw.takeaway) || text;
      put('takeaway', takeaway ? clampText(takeaway, clampOn ? slotOf('takeaway') : undefined) : bullets.length ? bulletsBlock(bullets.slice(0, 3)) : null);
      break;
    }
    case 'table':
      putText('title', title);
      put('table', table && table.type === 'table' ? { ...table, rows: table.rows.slice(0, 7), } : null);
      putText('caption', str(raw.caption) || str(raw.takeaway));
      break;
    default:
      break;
  }

  const slide: Slide = { id: options.id ?? newSlideId(), layout, slots, notes: str(raw.notes, MAX_NOTES) };
  const result = [slide];
  if (overflow.length > 0) {
    const continued = sanitizeSlide(
      { layout, title: title ? `${title.replace(/\s*\(continued\)$/i, '')} (continued)` : '', bullets: overflow, notes: '' },
      { forceLayout: layout, clamp: options.clamp },
    );
    result.push(...continued);
  }
  return result;
}

/** The AI-facing form of a slide, for edit prompts and layout changes. */
export function slideToAi(slide: Slide): AiSlide {
  const out: AiSlide = { layout: slide.layout };
  const textOf = (name: string): string => {
    const block = slide.slots[name];
    if (!block || (block.type !== 'text' && block.type !== 'bullets')) return '';
    return block.items.map((item) => runsText(item.runs)).join('\n');
  };
  const bulletsOf = (name: string): AiSlide['bullets'] => {
    const block = slide.slots[name];
    if (!block || (block.type !== 'text' && block.type !== 'bullets')) return undefined;
    return block.items.map((item) => (item.level ? { text: runsText(item.runs), level: item.level } : runsText(item.runs)));
  };
  if (textOf('title')) out.title = textOf('title');
  if (textOf('subtitle')) out.subtitle = textOf('subtitle');
  if (textOf('kicker')) out.kicker = textOf('kicker');
  if (textOf('contact')) out.contact = textOf('contact');
  if (textOf('caption')) out.caption = textOf('caption');
  const body = slide.slots.body;
  if (body?.type === 'bullets') out.bullets = bulletsOf('body');
  else if (body?.type === 'text') out.text = textOf('body');
  for (const side of ['left', 'right'] as const) {
    const block = slide.slots[side];
    const heading = textOf(`${side}Title`);
    if (block || heading) {
      out[side] = {
        ...(heading ? { heading } : {}),
        ...(block?.type === 'bullets' ? { bullets: bulletsOf(side) } : block?.type === 'text' ? { text: textOf(side) } : {}),
      };
    }
  }
  const takeaway = slide.slots.takeaway;
  if (takeaway?.type === 'text') out.takeaway = textOf('takeaway');
  else if (takeaway?.type === 'bullets') out.takeaway = textOf('takeaway').split('\n').join('; ');
  const image = slide.slots.image;
  if (image?.type === 'image') out.image = { description: image.alt, ...(image.prompt ? { prompt: image.prompt } : {}) };
  const stats = slide.slots.stats;
  if (stats?.type === 'stats') out.stats = stats.items.map((item) => ({ value: item.value, label: item.label, ...(item.icon ? { icon: item.icon } : {}) }));
  const steps = slide.slots.steps;
  if (steps?.type === 'steps') out.steps = steps.items.map((item) => ({ title: item.title, text: item.text, ...(item.icon ? { icon: item.icon } : {}) }));
  const quote = slide.slots.quote;
  if (quote?.type === 'quote') out.quote = { text: quote.text, attribution: textOf('attribution') || quote.attribution };
  else if (quote?.type === 'text') out.quote = { text: textOf('quote'), attribution: textOf('attribution') };
  const chart = slide.slots.chart;
  if (chart?.type === 'chart') out.chart = { kind: chart.kind, categories: chart.categories, series: chart.series, ...(chart.unit ? { unit: chart.unit } : {}) };
  const table = slide.slots.table ?? (chart?.type === 'table' ? chart : undefined);
  if (table?.type === 'table') out.table = table.header ? { header: table.rows[0], rows: table.rows.slice(1) } : { rows: table.rows };
  if (slide.notes) out.notes = slide.notes;
  return out;
}

/**
 * Keeps the picture of `before` on `after`: the AI-facing form carries only a
 * description, so rewrites and layout changes would otherwise drop it.
 */
export function carryImages(before: Slide, after: Slide): Slide {
  const source = Object.values(before.slots).find((block): block is Extract<Block, { type: 'image' }> => block.type === 'image' && Boolean(block.src));
  if (!source) return after;
  const name = getLayout(after.layout).slots.find((slot) => slot.accepts.includes('image'))?.name;
  if (!name) return after;
  const current = after.slots[name];
  if (current?.type === 'image' && current.src) return after;
  const prompt = current?.type === 'image' && current.prompt ? current.prompt : source.prompt;
  return { ...after, slots: { ...after.slots, [name]: { ...source, ...(prompt ? { prompt } : {}) } } };
}

/** Moves a slide's content into another layout. */
export function changeLayout(slide: Slide, layout: LayoutId): Slide {
  const ai = slideToAi(slide);
  // Carry content across layouts that name it differently.
  if (!ai.bullets && ai.left?.bullets) ai.bullets = [...(ai.left.bullets ?? []), ...(ai.right?.bullets ?? [])];
  if (!ai.bullets && ai.steps) ai.bullets = ai.steps.map((step) => `**${step.title}** ${step.text}`);
  if (!ai.bullets && ai.stats) ai.bullets = ai.stats.map((stat) => `**${stat.value}** ${stat.label}`);
  if (!ai.steps && ai.bullets && layout === 'timeline') {
    ai.steps = ai.bullets.map((item) => {
      const value = typeof item === 'string' ? item : item.text;
      const [head, ...rest] = value.replace(/\*\*/g, '').split(/[:—–-]\s+/);
      return { title: rest.length ? head : `Step`, text: rest.length ? rest.join(' ') : value };
    });
  }
  if (!ai.left && ai.bullets && (layout === 'two-column' || layout === 'comparison')) {
    const half = Math.ceil(ai.bullets.length / 2);
    ai.left = { bullets: ai.bullets.slice(0, half) };
    ai.right = { bullets: ai.bullets.slice(half) };
  }
  if (!ai.quote && layout === 'quote') ai.quote = { text: ai.text ?? ai.title ?? '', attribution: '' };
  if (!ai.subtitle && (layout === 'title' || layout === 'section' || layout === 'closing')) ai.subtitle = ai.text ?? ai.caption;
  const [next] = sanitizeSlide(ai, { forceLayout: layout, id: slide.id });
  return { ...carryImages(slide, next), notes: slide.notes, ...(slide.background ? { background: slide.background } : {}), ...(slide.hidden ? { hidden: true } : {}) };
}

/** A fresh slide with sample text, for "Add slide". */
export function emptySlide(layout: LayoutId): Slide {
  const samples: Record<LayoutId, AiSlide> = {
    title: { title: 'Presentation title', subtitle: 'A one-line promise of what the audience gets', kicker: 'Company · Date' },
    agenda: { title: 'Agenda', bullets: ['Where we are', 'What we learned', 'What we propose', 'Next steps'] },
    section: { kicker: 'Part 2', title: 'Section title' },
    bullets: { title: 'Make the title the takeaway', bullets: ['One idea per bullet', 'Keep each one short', 'Put detail in the speaker notes'] },
    'two-column': { title: 'Two sides of the story', left: { bullets: ['First point', 'Second point'] }, right: { bullets: ['First point', 'Second point'] } },
    comparison: { title: 'Option A beats Option B on cost', left: { heading: 'Option A', bullets: ['Lower cost', 'Faster to ship'] }, right: { heading: 'Option B', bullets: ['More features', 'Longer rollout'] } },
    'image-left': { title: 'A picture makes the point', bullets: ['What the image shows', 'Why it matters'], image: { description: 'Replace with your image' } },
    'image-right': { title: 'A picture makes the point', bullets: ['What the image shows', 'Why it matters'], image: { description: 'Replace with your image' } },
    'full-image': { title: 'One image, one message', caption: 'A caption that adds context', image: { description: 'Replace with a full-bleed photo' } },
    stats: { title: 'The numbers tell the story', stats: [{ value: '42%', label: 'Growth year on year' }, { value: '3.1M', label: 'Active users' }, { value: '98%', label: 'Customer retention' }], caption: 'What these numbers mean for us' },
    quote: { quote: { text: 'A short, memorable line that makes the point for you.', attribution: 'Name, Role' } },
    timeline: { title: 'How we get there', steps: [{ title: 'Q1', text: 'Discover and plan' }, { title: 'Q2', text: 'Build and pilot' }, { title: 'Q3', text: 'Launch and scale' }] },
    chart: { title: 'Revenue doubled in two years', chart: { kind: 'column', categories: ['2023', '2024', '2025'], series: [{ name: 'Revenue', values: [12, 18, 25] }], unit: '$M' }, takeaway: 'Say what the chart proves in one sentence.' },
    table: { title: 'How the options compare', table: { header: ['', 'Option A', 'Option B'], rows: [['Cost', 'Low', 'High'], ['Time to value', '4 weeks', '12 weeks'], ['Risk', 'Low', 'Medium']] } },
    closing: { title: 'Thank you', subtitle: 'The one thing to remember, or the ask', contact: 'name@company.com' },
  };
  const [slide] = sanitizeSlide(samples[layout] ?? samples.bullets, { forceLayout: isLayoutId(layout) ? layout : 'bullets' });
  return slide;
}
