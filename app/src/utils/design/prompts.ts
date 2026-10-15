// Prompts and reply parsing for the Design studio's two passes: art direction
// (a design system and a list of boards), then one drawing per board.
// Dependency-free so it is tested without Tauri.

import { clampCanvas } from './formats';
import { DEFAULT_TOKENS, normalizeTokens } from './project';
import { describeTweaks, type Tweak } from './tweaks';
import type { DesignKind, DesignTokens } from './types';

export interface AiPrompt {
  system: string;
  prompt: string;
}

export interface FormatInfo {
  id: string;
  label: string;
  width: number;
  height: number;
}

export interface DirectionBoard {
  name: string;
  brief: string;
  /** The preset id this board uses (one of the requested formats). */
  format: string | null;
  /** Search words for a real photo to place on it, when photos are on. */
  photo: string | null;
}

export interface DirectionOption {
  /** One line about the look ("warm, editorial, quiet"). */
  mood: string;
  tokens: DesignTokens;
}

export interface Direction {
  /** A short name for the project (not the system's name). */
  title: string;
  /** The look of `tokens` in a few words. */
  mood: string;
  /** Other looks for the same plan, offered before drawing starts. */
  alternatives: DirectionOption[];
  tokens: DesignTokens;
  boards: DirectionBoard[];
  summary: string;
}

const KIND_NOUN: Record<DesignKind, string> = { app: 'mobile app screens', web: 'website pages', graphic: 'graphics' };

const RTL_RULES = [
  'The text is right to left. Set dir="rtl" on the root element and lang to the language code.',
  'Mirror the layout: leading edges are on the right. Use logical CSS properties (margin-inline-start, padding-inline-end, inset-inline-start, text-align:start) and never left/right.',
  'Write natural Modern Standard Arabic (or the language asked for); keep numerals Western, put Latin brand names in their own runs, and never reverse the letters of a word.',
].join('\n');

const COMMON = [
  'You are a senior product and graphic designer working inside a design tool. You answer with design only, never with explanations around it.',
  'Everything you write is rendered, so every word on a screen is real content in the requested language: no lorem ipsum, no "Your text here", no placeholder names like "John Doe".',
].join('\n');

/** Type-scale limits that suit the canvas: a phone screen and a 2560 px banner need different ranges. */
export function fitTypeScale(type: DesignTokens['type'], kind: DesignKind, width: number, height: number): DesignTokens['type'] {
  const clamp = (value: number, min: number, max: number): number => Math.round(Math.min(max, Math.max(min, value)));
  if (kind === 'graphic') {
    const short = Math.min(width, height);
    return {
      display: clamp(type.display, short * 0.06, short * 0.3),
      h1: clamp(type.h1, short * 0.04, short * 0.14),
      h2: clamp(type.h2, short * 0.025, short * 0.08),
      body: clamp(type.body, short * 0.018, short * 0.05),
      caption: clamp(type.caption, short * 0.012, short * 0.035),
    };
  }
  return {
    display: clamp(type.display, 28, 96),
    h1: clamp(type.h1, 22, 56),
    h2: clamp(type.h2, 16, 36),
    body: clamp(type.body, 13, 20),
    caption: clamp(type.caption, 10, 14),
  };
}

export interface DirectionRequest {
  kind: DesignKind;
  prompt: string;
  formats: FormatInfo[];
  /** Text of attached documents. */
  sources: string;
  /** One line per attached picture (name, size, what it is for). */
  pictures: string[];
  language: string;
  rtl: boolean;
  /** The chosen look, written out, or empty when the AI decides. */
  styleHint: string;
  /** Font names the system may use. */
  fonts: string[];
  photos: boolean;
  /** Boards asked for by name or count; null lets the AI decide. */
  boardCount: number | null;
  /** How many other looks to return besides the main one (0 = none). */
  alternatives?: number;
  /** The boards are the cards of one series (a carousel, a card's two sides): in reading order, carrying on from each other. */
  series?: boolean;
}

export function buildDirectionPrompt(request: DirectionRequest): AiPrompt {
  const { kind, formats } = request;
  const alternatives = Math.max(0, Math.min(3, request.alternatives ?? 0));
  const canvas = formats.map((format) => `${format.label} ${format.width}×${format.height}`).join('; ');
  const boardRule = kind === 'graphic' && request.series
    ? `Return exactly ${formats.length} boards, in reading order, as the cards of one series. Each card has its own message and the same look; carry a visual thread from card to card (a shape, a line or a number that continues). Use the format ids in this order: ${formats.map((format) => `"${format.id}"`).join(', ')}.`
    : kind === 'graphic'
    ? `Return exactly ${formats.length} board${formats.length === 1 ? '' : 's'}, one per size, in this order: ${formats.map((format) => `"${format.id}"`).join(', ')}. They are the same idea adapted to each size, not different ideas.`
    : `Return ${request.boardCount ?? '3 to 6'} boards: the distinct ${kind === 'app' ? 'screens of the app (a coherent flow, home first)' : 'pages of the site (home first)'}. Every board uses the format "${formats[0]?.id}".`;
  const system = [
    COMMON,
    `You are asked for ${KIND_NOUN[kind]}. First you design the system they all share, then you plan the boards.`,
    'Reply with one JSON object and nothing else (no markdown fence, no commentary).',
  ].join('\n');
  const prompt = [
    `Request:\n${request.prompt.trim()}`,
    `Canvas: ${canvas}.`,
    request.language ? `Language of all text on the design: ${request.language}.` : 'Write all text in the language of the request.',
    request.rtl ? RTL_RULES : '',
    request.styleHint ? `Look to follow:\n${request.styleHint}` : 'Invent a distinctive, coherent look that fits the request; avoid generic purple gradients and stock "SaaS" styling.',
    request.sources ? `Material to use (content, names, figures):\n${request.sources}` : '',
    request.pictures.length > 0 ? `Pictures the user supplied:\n${request.pictures.join('\n')}` : '',
    request.photos ? 'Real photographs may be used: give a board a "photo" (2–5 English search words) only when a photo truly helps it.' : 'Do not plan photographs.',
    '',
    'JSON shape:',
    '{',
    '  "title": "a 2 to 5 word name for this project, in the language of the request",',
    '  "summary": "two sentences: the idea and the look",',
    '  "system": {',
    '    "name": "short name of the system", "concept": "one sentence",',
    '    "dark": false,',
    '    "palette": { "background": "#hex", "surface": "#hex", "text": "#hex", "muted": "#hex", "primary": "#hex", "secondary": "#hex", "accent": "#hex" },',
    `    "fonts": { "heading": "one of: ${request.fonts.slice(0, 40).join(', ')}", "body": "same list" },`,
    '    "type": { "display": px, "h1": px, "h2": px, "body": px, "caption": px },',
    '    "radius": px, "spacing": px (base unit), "motif": "a recurring graphic idea", "imagery": "what pictures look like",',
    '    "headingWeight": 400-900, "lineHeight": 1.2-1.8, "shadow": "none" | "soft" | "medium" | "strong"',
    '  },',
    '  "boards": [ { "name": "short title", "brief": "what is on it, top to bottom, with the real copy", "format": "preset id", "photo": "search words or empty" } ]' + (alternatives > 0 ? ',' : ''),
    ...(alternatives > 0 ? [
      `  "mood": "the look of the main system in 3 to 6 words",`,
      `  "alternatives": [ ${Array.from({ length: alternatives }, () => '{ "mood": "3 to 6 words", "system": { same shape as "system" } }').join(', ')} ]`,
      '  (the alternatives are clearly different looks: other palette, other type pairing, other mood; the boards stay the same)',
    ] : []),
    '}',
    '',
    boardRule,
    'Text must be readable: body text contrasts with its background at 4.5:1 or better.',
  ].filter(Boolean).join('\n');
  return { system, prompt };
}

/** The first JSON object in a reply, tolerating fences and prose around it. */
export function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const text = fenced ? fenced[1] : reply;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clean = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Reads the art-direction reply; throws a readable error when there is nothing usable. */
export function parseDirection(reply: string, request: Pick<DirectionRequest, 'kind' | 'formats'>): Direction {
  const raw = extractJson(reply) as Record<string, any> | null;
  if (!raw || typeof raw !== 'object') throw new Error('The AI did not return a design plan.');
  const first = request.formats[0] ?? { width: 390, height: 844 };
  const tokens = normalizeTokens({ ...DEFAULT_TOKENS, ...(raw.system ?? raw.tokens ?? {}) });
  tokens.type = fitTypeScale(tokens.type, request.kind, first.width, first.height);
  const known = new Set(request.formats.map((format) => format.id));
  const list: unknown[] = Array.isArray(raw.boards) ? raw.boards : Array.isArray(raw.screens) ? raw.screens : [];
  let boards: DirectionBoard[] = list
    .filter((entry): entry is Record<string, any> => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => ({
      name: clean(entry.name ?? entry.title, 60) || `Board ${index + 1}`,
      brief: clean(entry.brief ?? entry.description, 1500),
      format: typeof entry.format === 'string' && known.has(entry.format) ? entry.format : null,
      photo: clean(entry.photo, 80) || null,
    }));
  if (request.kind === 'graphic') {
    // One board per requested size, in order, whatever the reply listed. Repeated sizes (a carousel)
    // take the reply's boards by position.
    const distinct = new Set(request.formats.map((format) => format.id)).size;
    const taken = new Set<number>();
    boards = request.formats.map((format, index) => {
      let at = distinct === request.formats.length ? boards.findIndex((board, position) => board.format === format.id && !taken.has(position)) : -1;
      if (at === -1 && index < boards.length && !taken.has(index)) at = index;
      if (at === -1) at = boards.findIndex((_board, position) => !taken.has(position));
      if (at !== -1) taken.add(at);
      const byFormat = boards[at] ?? boards[0];
      const named = byFormat?.name ?? '';
      const label = distinct > 1 && named ? `${named} · ${format.label}` : named || (distinct > 1 ? format.label : `Card ${index + 1}`);
      return { name: label, brief: byFormat?.brief ?? '', format: format.id, photo: byFormat?.photo ?? null };
    });
  } else {
    boards = boards.slice(0, 8).map((board) => ({ ...board, format: request.formats[0]?.id ?? null }));
  }
  if (boards.length === 0) throw new Error('The design plan has no boards.');
  const alternatives: DirectionOption[] = (Array.isArray(raw.alternatives) ? raw.alternatives : [])
    .filter((entry: unknown): entry is Record<string, any> => Boolean(entry) && typeof entry === 'object')
    .slice(0, 3)
    .map((entry: Record<string, any>) => {
      const other = normalizeTokens({ ...DEFAULT_TOKENS, ...(entry.system ?? entry.tokens ?? {}) });
      other.type = fitTypeScale(other.type, request.kind, first.width, first.height);
      return { mood: clean(entry.mood, 60), tokens: other };
    });
  return { title: clean(raw.title, 60), mood: clean(raw.mood, 60), alternatives, tokens, boards, summary: clean(raw.summary, 600) };
}

// Drawing ------------------------------------------------------------------------

const HTML_CONTRACT = (width: number, height: number, kind: DesignKind): string => [
  `Draw ONE ${kind === 'app' ? 'mobile app screen' : 'web page'} as a single HTML document body with its own <style>. The viewport is ${width}px wide${kind === 'app' ? ` and ${height}px tall (the content may be taller and scroll)` : '; the page may be as tall as its content needs'}.`,
  'Rules:',
  '- No <script>, no external files, no @import, no web fonts: fonts come from the design system. Never use position:fixed.',
  '- Take EVERY colour, font, radius and base spacing from the design system through CSS variables: var(--ds-background), var(--ds-surface), var(--ds-text), var(--ds-muted), var(--ds-primary), var(--ds-secondary), var(--ds-accent), var(--ds-font-heading), var(--ds-font-body), var(--ds-size-display|h1|h2|body|caption), var(--ds-radius), var(--ds-radius-sm), var(--ds-radius-lg), var(--ds-space), var(--ds-border) (border width), var(--ds-shadow-1|2|3) (box-shadow scale), var(--ds-weight-heading) (heading font-weight), var(--ds-line-height). Use a literal colour only for a one-off tint (e.g. a status dot).',
  '- Lay out with flexbox and grid. Size in px or %; the root container is exactly the viewport width. Use box-sizing:border-box.',
  '- Icons are small inline <svg> with stroke="currentColor". No emoji as icons.',
  '- Photos: <img src="photo:2-5 english search words" alt="…" style="width:…;height:…;object-fit:cover">. Use only when the brief calls for a photo. Never invent other image URLs.',
  kind === 'app'
    ? '- A phone screen: a status bar area (about 44px), generous touch targets (at least 44px), a bottom tab bar or primary action where it makes sense, content inside the safe margins (16–20px).'
    : '- A web page: a clear header/nav, a contained content column (max about 1200px), sections with strong hierarchy and rhythm, a footer.',
  '- Navigation: a button, link or tab-bar item that leads to another screen of the set carries data-goto="<exact name of that board>" (the other boards are listed with the request). Only link to boards that exist.',
  '- Real content throughout, in the language asked for.',
].join('\n');

const HTML_GRAPHIC_CONTRACT = (width: number, height: number): string => [
  `Draw ONE graphic as HTML with its own <style>, on a FIXED canvas of exactly ${width}×${height}px: a single root element with width:${width}px; height:${height}px; position:relative; overflow:hidden; box-sizing:border-box. Nothing flows outside it, nothing depends on the viewport, nothing scrolls.`,
  'Rules:',
  '- No <script>, no external files, no @import, no web fonts: fonts come from the design system. Never use position:fixed.',
  '- Take colours, fonts, radius and base spacing from the design system through CSS variables: var(--ds-background), var(--ds-surface), var(--ds-text), var(--ds-muted), var(--ds-primary), var(--ds-secondary), var(--ds-accent), var(--ds-font-heading), var(--ds-font-body), var(--ds-radius), var(--ds-radius-lg), var(--ds-space), var(--ds-shadow-1|2|3), var(--ds-weight-heading). Use a literal colour only for a one-off tint. The type scale given is for this canvas: use its px values, not smaller.',
  '- Lay out with flexbox, grid or absolute positioning inside the root. Let the words wrap by themselves; give text boxes a width, never a fixed height that cuts the words.',
  '- Icons and decorative shapes are inline <svg> (stroke="currentColor") or plain CSS shapes. No emoji as icons.',
  '- Photos: <img src="photo:2-5 english search words" alt="…" style="width:…;height:…;object-fit:cover">. Use only when the brief calls for a photo. Never invent other image URLs.',
  `- Margins are proportional: keep content about ${Math.round(Math.min(width, height) * 0.06)}px from the edges. One clear focal point, strong hierarchy, legible when viewed small.`,
  '- Real content throughout, in the language asked for.',
].join('\n');

const TWEAKS_CONTRACT = [
  'Optional tweaks: when the screen has choices worth trying (a layout variant, density, accent strength, a section shown or hidden), end the board block with up to 5 controls as JSON inside <tweaks>…</tweaks> and make the CSS follow them:',
  '[{"id":"hero-layout","label":"Hero layout","type":"select","options":["split","centred"],"default":"split"},',
  ' {"id":"accent","label":"Accent strength","type":"range","min":0,"max":100,"unit":"%","default":60},',
  ' {"id":"testimonials","label":"Show testimonials","type":"toggle","default":true}]',
  'How the CSS reads them: a select or a toggle sets an attribute on an ancestor of your markup, so write selectors as [data-tw-hero-layout="centred"] .hero{…} and [data-tw-testimonials="off"] .quotes{display:none} (a toggle is "on" or "off"; a select is one of its option strings). A range is the variable var(--tw-accent) (the value with its unit) and var(--tw-accent-n) (the bare number, for calc()). The default look is the normal CSS. Ids and option strings are lowercase letters, digits and hyphens. Skip the block when nothing really needs it.',
].join('\n');

const SVG_TWEAKS_CONTRACT = [
  'Optional tweaks: when the graphic has choices worth trying (a layout variant, a badge shown or hidden, how strong a shape is), put up to 5 controls as JSON inside <tweaks>…</tweaks> AFTER the closing </svg>, inside the board block, and wire them with attributes on the elements they affect:',
  '[{"id":"badge","label":"Show badge","type":"toggle","default":true},',
  ' {"id":"layout","label":"Layout","type":"select","options":["left","centre"],"default":"left"},',
  ' {"id":"glow","label":"Glow","type":"range","min":0,"max":100,"default":60}]',
  'data-tw-show="badge" on an element: it is drawn only while that toggle is on. data-tw-when="layout=left" (or "layout=left|centre"): drawn only while one of those options is chosen. data-tw-opacity="glow": its opacity follows the range (the minimum is 0, the maximum 1). Elements without these attributes are always drawn. Draw every variant in the same file; the default choices must look right. Ids and option strings are lowercase letters, digits and hyphens. Skip the block when nothing really needs it.',
].join('\n');

const SVG_CONTRACT = (width: number, height: number): string => [
  `Draw ONE graphic as a single <svg> with viewBox="0 0 ${width} ${height}" and width="${width}" height="${height}".`,
  'Rules:',
  '- Allowed: rect, circle, ellipse, line, polyline, polygon, path, text, tspan, g, defs, linearGradient, radialGradient, stop, clipPath, image (href to assets/… only). No script, foreignObject, filter, mask, pattern, style element or external references.',
  '- Colours come from the design system palette (use the hex values); text uses its font stack. Put text in <text> elements with explicit x, y, font-size and text-anchor; break long copy into lines yourself (separate <tspan> with x and dy).',
  `- Margins are proportional: keep content about ${Math.round(Math.min(width, height) * 0.06)}px from the edges. One clear focal point, strong hierarchy, legible when viewed small.`,
  '- Pictures: <image href="photo:2-5 english search words" x y width height preserveAspectRatio="xMidYMid slice"/>. Use only when the brief calls for a photo. A picture from the list of project pictures uses its exact assets/… path.',
  '- A picture inside a frame, arch, circle or card: define <clipPath id="pic1"> holding a copy of that shape (same geometry), draw the <image> over the shape\'s bounding box with preserveAspectRatio="xMidYMid slice" and clip-path="url(#pic1)", then draw the shape\'s border again on top with fill="none". The picture stays inside the border and never spills out. Leave a frame empty only when no picture was asked for.',
].join('\n');

export interface BoardPromptRequest {
  kind: DesignKind;
  name: string;
  brief: string;
  width: number;
  height: number;
  tokens: DesignTokens;
  project: string;
  /** Names and briefs of the other boards, so this one fits the set. */
  siblings: Array<{ name: string; brief: string }>;
  /** The first drawn board, as the reference for the look. */
  reference: string;
  language: string;
  rtl: boolean;
  photos: boolean;
  /** Lines describing pictures the board may use from assets/. */
  assets: string[];
  fontStacks: { heading: string; body: string };
  /** How the board is drawn; a graphic is SVG unless this says HTML. */
  format?: 'svg' | 'html';
  /** The board's current markup, when this call changes an existing drawing. */
  current?: string;
  /** What to change (a refinement) or how to differ (a variation / another size). */
  instruction?: string;
  /** One element the change is about (its `data-yz` id and markup). */
  picked?: { id: string; html: string } | null;
  /** The tweaks the board already has. */
  tweaks?: Tweak[];
}

const systemText = (tokens: DesignTokens, stacks: { heading: string; body: string }): string => {
  const p = tokens.palette;
  return [
    `Design system "${tokens.name}"${tokens.concept ? `: ${tokens.concept}` : ''}`,
    `Palette: background ${p.background}, surface ${p.surface}, text ${p.text}, muted ${p.muted}, primary ${p.primary}, secondary ${p.secondary}, accent ${p.accent}${tokens.dark ? ' (dark theme)' : ''}.`,
    `Fonts: headings ${stacks.heading}; body ${stacks.body}.`,
    `Type: display ${tokens.type.display}px, h1 ${tokens.type.h1}px, h2 ${tokens.type.h2}px, body ${tokens.type.body}px, caption ${tokens.type.caption}px. Radius ${tokens.radius}px. Base space ${tokens.spacing}px.`,
    tokens.motif ? `Motif: ${tokens.motif}` : '',
    tokens.imagery ? `Imagery: ${tokens.imagery}` : '',
  ].filter(Boolean).join('\n');
};

export function buildBoardPrompt(request: BoardPromptRequest): AiPrompt {
  const html = request.format ? request.format === 'html' : request.kind !== 'graphic';
  const system = [
    COMMON,
    html ? (request.kind === 'graphic' ? HTML_GRAPHIC_CONTRACT(request.width, request.height) : HTML_CONTRACT(request.width, request.height, request.kind)) : SVG_CONTRACT(request.width, request.height),
    html ? TWEAKS_CONTRACT : SVG_TWEAKS_CONTRACT,
    request.rtl ? RTL_RULES : '',
    `Reply with exactly one block and nothing else:\n<board name="${request.name.replace(/"/g, "'")}">\n${html ? '…style and markup…\n(optionally) <tweaks>[…]</tweaks>' : '<svg …>…</svg>\n(optionally) <tweaks>[…]</tweaks>'}\n</board>`,
  ].filter(Boolean).join('\n\n');
  const prompt = [
    `Project: ${request.project.trim()}`,
    systemText(request.tokens, request.fontStacks),
    `Board: "${request.name}" (${request.width}×${request.height}).`,
    `Brief: ${request.brief || 'Design this board to fit the project.'}`,
    request.siblings.length > 0 ? `Other boards in the set (for consistency, do not draw them; their names are what data-goto points at):\n${request.siblings.map((entry) => `- ${entry.name}: ${entry.brief.slice(0, 160)}`).join('\n')}` : '',
    request.current ? `Current drawing of this board (change it as asked and return the WHOLE board again; keep everything not mentioned, including the real copy):
${request.current.slice(0, 24000)}` : '',
    request.tweaks && request.tweaks.length > 0 ? `This board's current tweaks (keep the ids that still make sense; you may change, add or remove):\n${describeTweaks(request.tweaks)}` : '',
    request.instruction ? `Change requested: ${request.instruction.trim()}` : '',
    request.picked ? `The change is about this element${request.picked.id.startsWith('svg:') ? ' of the drawing' : ` (data-yz="${request.picked.id}")`}:
${request.picked.html.slice(0, 3000)}` : '',
    request.reference ? `Reference: this board was already drawn; match its look, spacing and components.\n${request.reference.slice(0, 7000)}` : '',
    request.assets.length > 0 ? `Pictures you may place (use the exact path as src/href):\n${request.assets.join('\n')}` : '',
    request.language ? `Language of the text: ${request.language}.` : '',
    request.photos ? '' : 'Do not use photo: references.',
  ].filter(Boolean).join('\n\n');
  return { system, prompt };
}

export interface BoardBlock {
  name: string;
  /** The markup inside the block (HTML or an SVG). */
  source: string;
  /** False for a block that was cut off by the end of the reply. */
  closed: boolean;
}

/** `<board name="…">…</board>` blocks of a (possibly still streaming) reply. */
export function extractBoardBlocks(reply: string, final = false): BoardBlock[] {
  const blocks: BoardBlock[] = [];
  const pattern = /<board\b([^>]*)>([\s\S]*?)<\/board>/gi;
  let match: RegExpExecArray | null;
  let consumed = 0;
  const nameOf = (attrs: string): string => /name\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]?.trim() ?? '';
  while ((match = pattern.exec(reply))) {
    blocks.push({ name: nameOf(match[1]), source: match[2].trim(), closed: true });
    consumed = pattern.lastIndex;
  }
  const rest = reply.slice(consumed);
  const open = /<board\b([^>]*)>([\s\S]*)$/i.exec(rest);
  if (open && open[2].trim()) {
    blocks.push({ name: nameOf(open[1]), source: open[2].trim(), closed: false });
  } else if (!open && blocks.length === 0 && final) {
    // A bare svg, a fenced document or a bare fragment.
    const svg = /<svg[\s>][\s\S]*?<\/svg>/i.exec(reply);
    const fence = /```(?:html|svg)?\s*([\s\S]*?)```/i.exec(reply);
    const source = (svg?.[0] ?? fence?.[1] ?? '').trim();
    if (source) blocks.push({ name: '', source, closed: true });
  }
  return blocks;
}

/** Rough canvas for board placement when the AI returns nothing sensible. */
export const fallbackSize = (kind: DesignKind): { width: number; height: number } => (kind === 'graphic' ? { width: 1080, height: 1080 } : { width: clampCanvas(390), height: clampCanvas(844) });

// Design system from a picture -----------------------------------------------------

/** Asks for the design system a picture (a screenshot, a brand board, a photo) is drawn with. */
export function buildSystemFromPicturePrompt(options: { fonts: string[]; language: string }): AiPrompt {
  return {
    system: [
      COMMON,
      'You are given a picture. Work out the design system behind it: its palette, type feel and shape language.',
      'Reply with one JSON object and nothing else (no markdown fence, no commentary).',
    ].join('\n'),
    prompt: [
      'Read the colours that are really in the picture (hex), not colours you imagine. Name the roles: background, surface, text, muted, primary, secondary, accent. Body text must contrast with its background at 4.5:1 or better.',
      options.language ? `Write the name and concept in ${options.language}.` : '',
      '',
      'JSON shape:',
      '{ "system": {',
      '  "name": "short name", "concept": "one sentence", "dark": false,',
      '  "palette": { "background": "#hex", "surface": "#hex", "text": "#hex", "muted": "#hex", "primary": "#hex", "secondary": "#hex", "accent": "#hex" },',
      `  "fonts": { "heading": "one of: ${options.fonts.slice(0, 40).join(', ')}", "body": "same list" },`,
      '  "type": { "display": px, "h1": px, "h2": px, "body": px, "caption": px },',
      '  "radius": px, "spacing": px, "motif": "a recurring graphic idea", "imagery": "what pictures look like",',
      '  "headingWeight": 400-900, "lineHeight": 1.2-1.8, "shadow": "none" | "soft" | "medium" | "strong"',
      '} }',
      'Pick the closest fonts from the list for what you see.',
    ].filter(Boolean).join('\n'),
  };
}

export function parseSystem(reply: string): DesignTokens {
  const raw = extractJson(reply) as Record<string, any> | null;
  if (!raw || typeof raw !== 'object') throw new Error('The AI did not return a design system.');
  return normalizeTokens({ ...DEFAULT_TOKENS, ...(raw.system ?? raw.tokens ?? raw) });
}

// Restyle and system from a web page -----------------------------------------------

const SYSTEM_SHAPE = (fonts: string[]): string[] => [
  '{ "system": {',
  '  "name": "short name", "concept": "one sentence", "dark": false,',
  '  "palette": { "background": "#hex", "surface": "#hex", "text": "#hex", "muted": "#hex", "primary": "#hex", "secondary": "#hex", "accent": "#hex" },',
  `  "fonts": { "heading": "one of: ${fonts.slice(0, 40).join(', ')}", "body": "same list" },`,
  '  "type": { "display": px, "h1": px, "h2": px, "body": px, "caption": px },',
  '  "radius": px, "spacing": px, "motif": "a recurring graphic idea", "imagery": "what pictures look like",',
  '  "headingWeight": 400-900, "lineHeight": 1.2-1.8, "shadow": "none" | "soft" | "medium" | "strong"',
  '} }',
];

/** Asks for a changed design system (colours, type, shape) and nothing else; the screens follow it. */
export function buildRestylePrompt(options: { current: DesignTokens; instruction: string; fonts: string[]; language: string }): AiPrompt {
  const p = options.current.palette;
  return {
    system: [
      COMMON,
      'You change an existing design system as asked. You return the whole system, not a list of differences.',
      'Reply with one JSON object and nothing else (no markdown fence, no commentary).',
    ].join('\n'),
    prompt: [
      `Current system "${options.current.name}": background ${p.background}, surface ${p.surface}, text ${p.text}, muted ${p.muted}, primary ${p.primary}, secondary ${p.secondary}, accent ${p.accent}; headings ${options.current.fonts.heading}, body ${options.current.fonts.body}; radius ${options.current.radius}px; spacing ${options.current.spacing}px; type display ${options.current.type.display}, h1 ${options.current.type.h1}, h2 ${options.current.type.h2}, body ${options.current.type.body}, caption ${options.current.type.caption}.`,
      options.current.motif ? `Motif: ${options.current.motif}.` : '',
      `Change requested: ${options.instruction.trim()}`,
      'Keep what the request does not touch. Body text contrasts with its background at 4.5:1 or better. Use fonts from the list only.',
      options.language ? `Write the name and concept in ${options.language}.` : '',
      '',
      'JSON shape:',
      ...SYSTEM_SHAPE(options.fonts),
    ].filter(Boolean).join('\n'),
  };
}

/** Asks an engine with web access to read a site's real look. */
export function buildSystemFromUrlPrompt(options: { url: string; fonts: string[]; language: string }): AiPrompt {
  return {
    system: [
      COMMON,
      'You are given the address of a website. Open it and work out the design system it is drawn with: its real colours, type and shape language.',
      'Reply with one JSON object and nothing else (no markdown fence, no commentary).',
    ].join('\n'),
    prompt: [
      `Website: ${options.url}`,
      'Read the colours the site really uses (hex, from its page and styles), not colours you imagine. Name the roles: background, surface, text, muted, primary, secondary, accent. Body text must contrast with its background at 4.5:1 or better.',
      options.language ? `Write the name and concept in ${options.language}.` : '',
      'Pick the closest fonts from the list for what the site uses.',
      '',
      'JSON shape:',
      ...SYSTEM_SHAPE(options.fonts),
    ].filter(Boolean).join('\n'),
  };
}
