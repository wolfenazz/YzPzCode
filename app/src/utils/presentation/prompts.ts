// Prompts for every AI step of the Presentation studio. The AI returns
// structured JSON constrained to our layouts; it never draws slides, the app
// owns the design. Dependency-free (tested by `npm run test:presentation`).

import { extractJson, MAX_SOURCE_CHARS } from '../writing/prompts';
import { LAYOUTS, nearestLayout } from './layouts';
import { newOutlineId } from './deck';
import type { AiSlide } from './sanitize';
import type { DeckBrief, LayoutId, OutlineSlide } from './types';

export { extractJson };

export interface AiPrompt {
  system: string;
  prompt: string;
}

export const DECK_SYSTEM_PROMPT = [
  'You are a senior presentation designer and speechwriter. You build decks for executives, founders, academics and educators that are clear, persuasive and easy to present.',
  'Your craft rules:',
  '- One idea per slide.',
  '- Every slide title is a takeaway: a full, specific statement of what the slide proves ("Churn fell 30% after the onboarding redesign"), never a topic label ("Churn").',
  '- At most 6 bullets per slide and at most 12 words per bullet. Bullets are parallel in grammar and never full paragraphs.',
  '- The speaker notes carry the detail, the evidence and the transitions: 2–5 sentences the presenter can say aloud.',
  '- Vary the layouts so the deck has rhythm: use big numbers, charts, comparisons, timelines and quotes where the content genuinely fits.',
  'Facts: never invent statistics, quotations or sources. When a specific figure is needed but not supplied, use a clearly marked placeholder such as [X%] or [insert figure].',
  'You do not use tools, browse files or ask questions. You work only from the brief and sources in the message. You never add commentary before or after the JSON you are asked for.',
].join('\n');

const TONE_RULES: Record<DeckBrief['tone'], string> = {
  professional: 'Tone: professional — confident, precise, businesslike.',
  persuasive: 'Tone: persuasive — build tension, then resolve it with a clear ask on the closing slide.',
  educational: 'Tone: educational — explain step by step, define terms, use concrete examples.',
  inspiring: 'Tone: inspiring — vivid, energetic language and big ideas, still concrete.',
  casual: 'Tone: casual — friendly, plain-spoken, short sentences.',
};

function sourcesBlock(sources: string): string {
  if (!sources.trim()) return '';
  const trimmed = sources.length > MAX_SOURCE_CHARS ? `${sources.slice(0, MAX_SOURCE_CHARS)}\n[…source material truncated…]` : sources;
  return `\n<sources>\n${trimmed}\n</sources>\nUse the sources above as the primary basis for facts and figures.`;
}

export function describeBrief(brief: DeckBrief, title?: string): string {
  const lines: string[] = [];
  if (title) lines.push(`Deck title: ${title}`);
  if (brief.topic) lines.push(`Topic: ${brief.topic}`);
  if (brief.audience) lines.push(`Audience: ${brief.audience}`);
  if (brief.goal) lines.push(`Goal (what the audience should think or do afterwards): ${brief.goal}`);
  lines.push(TONE_RULES[brief.tone] ?? TONE_RULES.professional);
  if (brief.language && !/^en/i.test(brief.language)) lines.push(`Write every word of the deck (titles, bullets and notes) in: ${brief.language}`);
  return lines.join('\n');
}

/** What each layout is for, in the words the AI sees. */
export function layoutGuide(): string {
  return LAYOUTS.map((layout) => `- "${layout.id}": ${layout.description}`).join('\n');
}

export function buildOutlinePrompt(brief: DeckBrief, sources: string): AiPrompt {
  const prompt = [
    `Design the storyline for a ${brief.slideCount}-slide presentation.`,
    '',
    describeBrief(brief),
    '',
    'Available layouts:',
    layoutGuide(),
    '',
    'Structure: open with a "title" slide, then (for decks of 8 or more slides) an "agenda", use "section" dividers only between genuinely separate parts, and end with a "closing" slide carrying the ask or the next step.',
    sourcesBlock(sources),
    '',
    'Return ONLY a JSON object, with no Markdown fence and no commentary, in exactly this shape:',
    '{"title":"Deck title","slides":[{"title":"Takeaway title of the slide","purpose":"What this slide must make the audience understand (1 sentence)","layout":"bullets","keyPoints":["point","point"]}]}',
    `Rules: exactly ${brief.slideCount} slides. Titles are takeaways, not topics. "layout" is one of the ids above. keyPoints are 2–5 short phrases of content for the slide (figures, names, claims), not instructions.`,
  ].filter((line) => line !== '').join('\n');
  return { system: DECK_SYSTEM_PROMPT, prompt };
}

const clip = (value: unknown, max: number): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Parses the outline the model returned. */
export function parseOutline(text: string): { title: string; slides: OutlineSlide[] } | null {
  const json = extractJson(text) as { title?: unknown; slides?: unknown } | unknown[] | null;
  const list = Array.isArray(json) ? json : Array.isArray(json?.slides) ? json.slides as unknown[] : null;
  if (list && list.length > 0) {
    const slides = list.map((entry, index): OutlineSlide | null => {
      if (typeof entry === 'string') return { id: newOutlineId(), title: clip(entry, 160), purpose: '', layout: index === 0 ? 'title' : 'bullets', keyPoints: [] };
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Record<string, unknown>;
      const title = clip(raw.title ?? raw.heading, 160);
      if (!title) return null;
      return {
        id: newOutlineId(),
        title,
        purpose: clip(raw.purpose ?? raw.notes ?? raw.description, 400),
        layout: nearestLayout(raw.layout, index === 0 ? 'title' : 'bullets'),
        keyPoints: Array.isArray(raw.keyPoints ?? raw.points) ? ((raw.keyPoints ?? raw.points) as unknown[]).map((point) => clip(point, 200)).filter(Boolean).slice(0, 6) : [],
      };
    }).filter((entry): entry is OutlineSlide => entry !== null);
    if (slides.length > 0) return { title: Array.isArray(json) ? '' : clip((json as { title?: unknown })?.title, 160), slides };
  }
  // A numbered or bulleted list of titles.
  const lines = text.split(/\r?\n/).map((line) => line.match(/^\s*(?:\d+[.)]|[-*•]|#{1,3})\s+(.+)$/)?.[1]?.replace(/\*\*/g, '').trim()).filter((line): line is string => Boolean(line));
  if (lines.length < 2) return null;
  return {
    title: '',
    slides: lines.map((line, index) => ({ id: newOutlineId(), title: clip(line, 160), purpose: '', layout: index === 0 ? 'title' : index === lines.length - 1 ? 'closing' : 'bullets', keyPoints: [] })),
  };
}

/** The JSON fields the AI fills for each layout. */
const LAYOUT_FIELDS: Record<LayoutId, string> = {
  title: '"kicker" (event, company or date; optional), "title", "subtitle"',
  agenda: '"title", "bullets" (3–7 agenda items, 2–6 words each)',
  section: '"kicker" (e.g. "Part 2"; optional), "title", "subtitle" (optional)',
  bullets: '"title", "bullets" (3–6 items, ≤12 words each; an item may be {"text":"…","level":1} for a sub-point)',
  'two-column': '"title", "left" and "right", each {"bullets":[…]} (≤5 items each)',
  comparison: '"title", "left" and "right", each {"heading":"…","bullets":[…]} (≤5 items each)',
  'image-left': '"title", "bullets" (≤4), "image" {"description":"what the photo should show"}',
  'image-right': '"title", "bullets" (≤4), "image" {"description":"what the photo should show"}',
  'full-image': '"title" (short headline), "caption", "image" {"description":"what the photo should show"}',
  stats: '"title", "stats" (3–4 items {"value":"42%","label":"≤8 words"}), "caption" (what the numbers mean)',
  quote: '"quote" {"text":"≤40 words","attribution":"Name, Role"}',
  timeline: '"title", "steps" (3–5 items {"title":"Q1 2026 or a step name","text":"≤14 words"})',
  chart: '"title", "chart" {"kind":"column|bar|line|pie|donut","categories":["…"],"series":[{"name":"…","values":[numbers]}],"unit":"%"}, "takeaway" (one sentence)',
  table: '"title", "table" {"header":["…"],"rows":[["…"]]} (≤6 rows, ≤5 columns, short cells), "caption" (source; optional)',
  closing: '"title", "subtitle" (the ask or next step), "contact" (optional)',
};

export function slideSchema(): string {
  return (Object.keys(LAYOUT_FIELDS) as LayoutId[]).map((id) => `- ${id}: ${LAYOUT_FIELDS[id]}`).join('\n');
}

const SLIDE_EXAMPLE = JSON.stringify({
  slides: [
    {
      layout: 'stats',
      title: 'Self-serve onboarding cut time-to-value by two thirds',
      stats: [{ value: '14 → 5', label: 'days to first report' }, { value: '+31%', label: 'week-one activation' }, { value: '−18%', label: 'support tickets per account' }],
      caption: 'The redesign paid for itself in one quarter.',
      notes: 'We rebuilt onboarding around the first report rather than the settings page. New accounts now reach their first report in five days instead of fourteen, activation in week one is up by almost a third, and the support team sees fewer setup tickets.',
    },
    {
      layout: 'bullets',
      title: 'Three changes drove the improvement',
      bullets: ['Templates replace the blank first dashboard', 'Guided import connects data in one step', { text: 'CSV, Sheets and Postgres supported at launch', level: 1 }, 'In-app checklist replaces the welcome email'],
      notes: 'Walk through the three changes in order of impact.',
    },
  ],
}, null, 0);

export interface SlidesPromptInput {
  brief: DeckBrief;
  title: string;
  outline: OutlineSlide[];
  /** Indexes into the outline to write now. */
  batch: number[];
  sources: string;
}

export function buildSlidesPrompt({ brief, title, outline, batch, sources }: SlidesPromptInput): AiPrompt {
  const full = outline.map((slide, index) => `${index + 1}. [${slide.layout}] ${slide.title}`).join('\n');
  const wanted = batch.map((index) => {
    const slide = outline[index];
    return [
      `Slide ${index + 1} — layout "${slide.layout}": ${slide.title}`,
      slide.purpose ? `  Purpose: ${slide.purpose}` : '',
      slide.keyPoints.length ? `  Key points: ${slide.keyPoints.join('; ')}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n');
  const prompt = [
    describeBrief(brief, title),
    '',
    'The full storyline of the deck, for continuity:',
    full,
    '',
    `Now write these ${batch.length} slide${batch.length === 1 ? '' : 's'} in full:`,
    wanted,
    '',
    'Fields per layout (use only the fields of the slide\'s layout, plus "notes" on every slide):',
    slideSchema(),
    '',
    'Text may use **bold** for one key phrase per slide. No other Markdown. Charts need real numbers from the brief or sources; if there are none, choose a different layout rather than inventing data.',
    sourcesBlock(sources),
    '',
    `Return ONLY a JSON object, with no Markdown fence and no commentary: {"slides":[…]} with exactly ${batch.length} slide object${batch.length === 1 ? '' : 's'}, in the order listed. Example of the format:`,
    SLIDE_EXAMPLE,
  ].filter((line) => line !== '').join('\n');
  return { system: DECK_SYSTEM_PROMPT, prompt };
}

/**
 * Complete slide objects from a (possibly still streaming) reply: every
 * top-level `{…}` inside the `"slides"` array that parses on its own.
 */
export function extractSlideObjects(text: string): unknown[] {
  const start = text.search(/"slides"\s*:\s*\[/);
  let index = start >= 0 ? text.indexOf('[', start) + 1 : text.indexOf('[') + 1;
  if (index <= 0) return [];
  const out: unknown[] = [];
  while (index < text.length) {
    const open = text.indexOf('{', index);
    if (open < 0 || /\]/.test(text.slice(index, open))) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      } else if (ch === ']' && depth === 0) break;
    }
    if (end < 0) break;
    try {
      out.push(JSON.parse(text.slice(open, end + 1)));
    } catch {
      break;
    }
    index = end + 1;
    const rest = text.slice(index).trimStart();
    if (rest.startsWith(']')) break;
  }
  return out;
}

/** Slide objects from a finished reply: the JSON envelope, else whatever objects parse. */
export function parseSlides(text: string): unknown[] {
  const json = extractJson(text) as { slides?: unknown } | unknown[] | null;
  if (Array.isArray(json)) return json;
  if (json && Array.isArray((json as { slides?: unknown }).slides)) return (json as { slides: unknown[] }).slides;
  if (json && typeof json === 'object' && ('layout' in json || 'title' in json)) return [json];
  return extractSlideObjects(text);
}

// Slide actions --------------------------------------------------------------

export type SlideAction = 'rewrite' | 'shorten' | 'expand' | 'layout' | 'visualize' | 'notes' | 'translate' | 'consistency' | 'coach' | 'imagePrompts' | 'custom';

/** Actions that run over the whole deck from the AI panel's deck passes. */
export type DeckPass = 'consistency' | 'coach' | 'imagePrompts';

export const SLIDE_ACTIONS: Array<{ id: Exclude<SlideAction, 'custom' | DeckPass>; label: string; hint: string }> = [
  { id: 'rewrite', label: 'Rewrite', hint: 'Sharper titles and bullets' },
  { id: 'shorten', label: 'Shorten', hint: 'Fewer, shorter bullets' },
  { id: 'expand', label: 'Expand', hint: 'Add substance and evidence' },
  { id: 'layout', label: 'Change layout', hint: 'Pick a better layout' },
  { id: 'visualize', label: 'Chart or table', hint: 'Turn figures into a visual' },
  { id: 'notes', label: 'Speaker notes', hint: 'Write what to say' },
  { id: 'translate', label: 'Translate', hint: 'Into another language' },
];

export const DECK_PASSES: Array<{ id: DeckPass; label: string; hint: string }> = [
  { id: 'consistency', label: 'Make consistent', hint: 'Takeaway titles, parallel bullets, one voice' },
  { id: 'coach', label: 'Coach the notes', hint: 'Speakable notes timed to your talk' },
  { id: 'imagePrompts', label: 'Image prompts', hint: 'Prompts for your own image generator' },
];

const ACTION_TASKS: Record<SlideAction, string> = {
  rewrite: 'Rewrite each slide so it is sharper: a takeaway title, tighter parallel bullets, stronger wording. Keep the facts, figures and layout.',
  shorten: 'Shorten each slide: at most 4 bullets of at most 8 words, a shorter title, nothing essential lost. Move any removed detail into the speaker notes.',
  expand: 'Make each slide more substantial within the layout limits: add concrete evidence, examples or figures from the brief and sources (placeholders when unknown), and richer speaker notes.',
  layout: 'Choose the layout that best fits each slide\'s content and rewrite the slide for it. Prefer stats, chart, comparison, timeline or quote when the content fits.',
  visualize: 'Turn each slide\'s figures into a "chart" (when there is a numeric series) or a "table" (when there is a comparison), with a one-sentence takeaway. Use only numbers present in the slide, the brief or the sources.',
  notes: 'Write speaker notes for each slide: 3–6 sentences the presenter can say aloud, with the transition to the next slide. Keep everything else on the slide exactly as it is.',
  translate: 'Translate every word of each slide (titles, bullets, labels and notes) into the requested language. Keep the layout, numbers and structure.',
  consistency: 'Make the deck consistent as a whole: every title a takeaway written the same way (sentence case, a full statement, similar length); bullets parallel in grammar within and across slides; one set of terms for the same things; numbers, units, dates and currencies formatted the same way everywhere; one voice. Keep each slide’s layout, facts, figures and order. Change wording only where it improves consistency.',
  coach: 'Coach the speaker notes: rewrite each slide’s "notes" so they are easy to say aloud — short sentences, a clear point first, signposting ("First…", "The key number here is…"), the evidence behind the slide, and one sentence that leads into the next slide. Keep everything else on each slide exactly as it is.',
  imagePrompts: 'For each slide, write "imagePrompt": a detailed prompt for an AI image generator that would produce the picture this slide needs — subject, setting, composition, camera or illustration style, lighting and mood, matching the deck’s theme and colours, landscape orientation, and "no text, no logos, no watermarks". Keep everything else on each slide exactly as it is.',
  custom: '',
};

export interface SlideEditInput {
  brief: DeckBrief;
  title: string;
  action: SlideAction;
  slides: AiSlide[];
  /** Numbers of the slides in the deck, for context. */
  positions: number[];
  total: number;
  instruction?: string;
  /** For "layout": the layout the user picked, if any. */
  targetLayout?: LayoutId;
  sources?: string;
}

/** Actions that make sense on a slide whose design is kept (text and notes only). */
export const PRESERVE_ACTIONS: SlideAction[] = ['rewrite', 'shorten', 'expand', 'notes', 'translate'];

export interface PreserveAiSlide {
  shapes: Array<{ id: string; role: string; paragraphs: string[] }>;
  notes: string;
}

export interface PreserveEditInput {
  brief: DeckBrief;
  title: string;
  action: SlideAction;
  slides: PreserveAiSlide[];
  positions: number[];
  total: number;
  instruction?: string;
}

/** Edits to slides of an existing PowerPoint file: text and notes only, the design stays. */
export function buildPreserveEditPrompt(input: PreserveEditInput): AiPrompt {
  const base = input.action === 'custom'
    ? (input.instruction?.trim() || ACTION_TASKS.rewrite)
    : input.action === 'translate'
      ? `${ACTION_TASKS.translate} Language: ${input.instruction?.trim() || 'English'}.`
      : ACTION_TASKS[input.action];
  const extra = input.action !== 'custom' && input.action !== 'translate' && input.instruction?.trim() ? `Additional instruction: ${input.instruction.trim()}` : '';
  const prompt = [
    describeBrief(input.brief, input.title),
    '',
    `These are slide${input.slides.length === 1 ? '' : 's'} ${input.positions.join(', ')} of ${input.total} of an existing PowerPoint file whose design must stay exactly as it is. You can change only the text of its shapes and the speaker notes.`,
    '',
    `Task: ${base}`,
    extra,
    '',
    'Rules: keep every shape id; do not add or remove shapes; keep about the same number of paragraphs per shape and about the same length (the design was made for that text) unless the task is to shorten or expand; "title" shapes stay one short line. Text is plain (no Markdown). "\\n" inside a paragraph is a line break.',
    '',
    `Return ONLY a JSON object, with no Markdown fence and no commentary: {"slides":[{"shapes":[{"id":"…","paragraphs":["…"]}],"notes":"…"}]} with exactly ${input.slides.length} slide object${input.slides.length === 1 ? '' : 's'}, in the same order.`,
    '',
    '<slides>',
    JSON.stringify({ slides: input.slides }),
    '</slides>',
  ].filter((line) => line !== '').join('\n');
  return { system: DECK_SYSTEM_PROMPT, prompt };
}

/** Parses preserve edits; shapes the model invented are dropped. */
export function parsePreserveEdits(text: string, original: PreserveAiSlide[]): PreserveAiSlide[] | null {
  const slides = parseSlides(text);
  if (slides.length === 0) return null;
  return original.map((source, index) => {
    const raw = (slides[index] && typeof slides[index] === 'object' ? slides[index] : {}) as { shapes?: unknown; notes?: unknown };
    const shapes = Array.isArray(raw.shapes) ? raw.shapes as Array<{ id?: unknown; paragraphs?: unknown }> : [];
    return {
      shapes: source.shapes.map((shape) => {
        const edited = shapes.find((entry) => String(entry?.id) === shape.id);
        const paragraphs = Array.isArray(edited?.paragraphs) ? (edited!.paragraphs as unknown[]).map((value) => String(value ?? '').replace(/\*\*/g, '')) : null;
        return paragraphs && paragraphs.some((value) => value.trim()) ? { ...shape, paragraphs } : shape;
      }),
      notes: typeof raw.notes === 'string' ? raw.notes.trim() : source.notes,
    };
  });
}

export function buildSlideEditPrompt(input: SlideEditInput): AiPrompt {
  const task = input.action === 'custom'
    ? (input.instruction?.trim() || ACTION_TASKS.rewrite)
    : input.action === 'translate'
      ? `${ACTION_TASKS.translate} Language: ${input.instruction?.trim() || 'English'}.`
      : input.action === 'layout' && input.targetLayout
        ? `Rewrite each slide for the "${input.targetLayout}" layout, keeping its message.`
        : ACTION_TASKS[input.action];
  const extra = input.action !== 'custom' && input.action !== 'translate' && input.instruction?.trim() ? `Additional instruction: ${input.instruction.trim()}` : '';
  const prompt = [
    describeBrief(input.brief, input.title),
    '',
    `These are slide${input.slides.length === 1 ? '' : 's'} ${input.positions.join(', ')} of ${input.total}.`,
    '',
    `Task: ${task}`,
    extra,
    '',
    'Fields per layout:',
    slideSchema(),
    sourcesBlock(input.sources ?? ''),
    '',
    `Return ONLY a JSON object, with no Markdown fence and no commentary: {"slides":[…]} with exactly ${input.slides.length} slide object${input.slides.length === 1 ? '' : 's'} replacing the ones below, in the same order, each with a "layout" and "notes".`,
    '',
    '<slides>',
    JSON.stringify({ slides: input.slides }),
    '</slides>',
  ].filter((line) => line !== '').join('\n');
  return { system: DECK_SYSTEM_PROMPT, prompt };
}
