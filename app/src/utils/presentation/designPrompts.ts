// Prompts and reply parsers for AI-designed decks. Two passes, after
// ppt-master (github.com/hugohe3/ppt-master, MIT, © Hugo He):
//   1. Art direction: the AI invents the deck's design system and storyline
//      from the user's description (ppt-master's Strategist, Quick profile).
//   2. Slides: the AI hand-writes each page as SVG under a PowerPoint-safe
//      contract (ppt-master's Executor), a few pages per call.
// Dependency-free (tested by `npm run test:presentation`).

import { extractJson } from '../writing/prompts';
import { contrastRatio, ensureContrast, luminance, mix, normalizeHex } from './designColors';
import { DEFAULT_BODY_FONT, DEFAULT_HEADING_FONT, DESIGN_FONTS, DESIGN_MODES, fontStack, knownFont, stylesIn, VISUAL_STYLES } from './designStyles';
import { sanitizeSvg } from './svgSafe';
import type {
  DesignAttachment, DesignDensity, DesignedSlide, DesignMode, DesignSlideRole, DesignSystem, DirectionResult, StoryPage,
} from './designTypes';

export interface AiPrompt {
  system: string;
  prompt: string;
}

export const ROLES: DesignSlideRole[] = ['cover', 'agenda', 'section', 'content', 'data', 'quote', 'closing'];
const DENSITIES: DesignDensity[] = ['anchor', 'dense', 'breathing'];
const MAX_SOURCE_CHARS = 60_000;
export const MIN_DESIGN_SLIDES = 3;
export const MAX_DESIGN_SLIDES = 30;

// Design system ------------------------------------------------------------------

export const FALLBACK_SYSTEM: DesignSystem = {
  name: 'Studio default',
  concept: 'A calm, confident layout with generous whitespace and one strong accent.',
  style: 'swiss-minimal',
  mode: 'pyramid',
  dark: false,
  palette: { background: '#F7F5F0', surface: '#ECE8DF', text: '#1B1B1F', muted: '#5C5C66', primary: '#1F4E79', secondary: '#7FA7C9', accent: '#E0662F' },
  chartColors: ['#1F4E79', '#7FA7C9', '#E0662F', '#5C5C66', '#B9C9D6'],
  fonts: { heading: DEFAULT_HEADING_FONT, body: DEFAULT_BODY_FONT },
  type: { display: 88, title: 44, body: 24, caption: 16 },
  shapeLanguage: 'Square corners, single-weight rules, a few large planes.',
  motif: 'A thick accent bar that changes length with the page.',
  imagery: 'Full-bleed crops with a directional scrim behind text.',
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

const text = (value: unknown, max: number, fallback = ''): string => {
  const out = typeof value === 'string' ? value.trim() : '';
  return (out || fallback).slice(0, max);
};

/** Repairs a design system from the AI or a file: valid colours, readable text, known fonts, sane sizes. */
export function sanitizeDesignSystem(value: unknown): DesignSystem {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawPalette = (raw.palette && typeof raw.palette === 'object' ? raw.palette : {}) as Record<string, unknown>;
  const base = FALLBACK_SYSTEM.palette;
  const background = normalizeHex(rawPalette.background) ?? base.background;
  const dark = luminance(background) < 0.4;
  const pick = (key: keyof typeof base): string => normalizeHex(rawPalette[key]) ?? (dark ? mix(base[key], '#FFFFFF', 0.5) : base[key]);
  const surface = normalizeHex(rawPalette.surface) ?? mix(background, dark ? '#FFFFFF' : '#000000', 0.06);
  const palette = {
    background,
    surface,
    text: ensureContrast(pick('text'), background, 7),
    muted: ensureContrast(pick('muted'), background, 4.5),
    primary: pick('primary'),
    secondary: pick('secondary'),
    accent: pick('accent'),
  };
  const chartColors = (Array.isArray(raw.chartColors) ? raw.chartColors : [])
    .map(normalizeHex)
    .filter((color): color is string => Boolean(color))
    .slice(0, 8);
  const fonts = (raw.fonts && typeof raw.fonts === 'object' ? raw.fonts : {}) as Record<string, unknown>;
  const type = (raw.type && typeof raw.type === 'object' ? raw.type : {}) as Record<string, unknown>;
  const mode = DESIGN_MODES.some((entry) => entry.id === raw.mode) ? raw.mode as DesignMode : FALLBACK_SYSTEM.mode;
  return {
    name: text(raw.name, 80, 'Custom design'),
    concept: text(raw.concept, 900, FALLBACK_SYSTEM.concept),
    style: text(raw.style, 160, 'custom'),
    mode,
    dark,
    palette,
    chartColors: chartColors.length >= 3 ? chartColors : [palette.primary, palette.accent, palette.secondary, palette.muted, mix(palette.primary, palette.background, 0.5)],
    fonts: { heading: knownFont(fonts.heading) ?? DEFAULT_HEADING_FONT, body: knownFont(fonts.body) ?? DEFAULT_BODY_FONT },
    type: {
      display: clampNumber(type.display, 48, 220, 88),
      title: clampNumber(type.title, 28, 72, 44),
      body: clampNumber(type.body, 18, 34, 24),
      caption: clampNumber(type.caption, 12, 20, 16),
    },
    shapeLanguage: text(raw.shapeLanguage, 400, FALLBACK_SYSTEM.shapeLanguage),
    motif: text(raw.motif, 400, FALLBACK_SYSTEM.motif),
    imagery: text(raw.imagery, 400, FALLBACK_SYSTEM.imagery),
  };
}

export function sanitizeStoryPage(value: unknown): StoryPage | null {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const title = text(raw.title, 200);
  if (!title) return null;
  const role = ROLES.includes(raw.role as DesignSlideRole) ? raw.role as DesignSlideRole : 'content';
  return {
    role,
    title,
    brief: text(raw.brief ?? raw.content ?? raw.purpose, 3000),
    density: DENSITIES.includes(raw.density as DesignDensity) ? raw.density as DesignDensity : role === 'content' || role === 'data' ? 'dense' : 'anchor',
  };
}

/** Parses the art-direction reply. Null when it holds no usable storyline. */
export function parseDirection(reply: string): DirectionResult | null {
  const raw = extractJson(reply) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') return null;
  const list = Array.isArray(raw.pages) ? raw.pages : Array.isArray(raw.slides) ? raw.slides : [];
  const pages = list.map(sanitizeStoryPage).filter((page): page is StoryPage => page !== null).slice(0, MAX_DESIGN_SLIDES);
  if (pages.length === 0) return null;
  return {
    title: text(raw.title, 200, pages[0].title),
    language: text(raw.language, 40, 'English'),
    system: sanitizeDesignSystem(raw.design ?? raw.system),
    pages,
  };
}

// Shared prompt text -----------------------------------------------------------------

function styleCatalog(): string {
  return VISUAL_STYLES.map((style) => `- ${style.id} (${style.group}): ${style.character} Shapes: ${style.shape} Colour: ${style.color}`).join('\n');
}

function fontCatalog(): string {
  return DESIGN_FONTS.map((font) => `${font.name} (${font.character})`).join('; ');
}

export function describeAttachments(attachments: DesignAttachment[], seesImages: boolean): string {
  const pictures = attachments.filter((entry) => entry.kind === 'image');
  if (pictures.length === 0) return '';
  const use = (entry: DesignAttachment): string => (entry.use === 'slides' ? 'must appear on a slide' : entry.use === 'style' ? 'look reference only, do not place it' : 'place it where it helps, or use it as a look reference');
  return [
    `PICTURES THE USER GAVE${seesImages ? ' (attached to this message, in this order)' : ''}:`,
    ...pictures.map((entry, index) => `${index + 1}. ${entry.path} — ${entry.width && entry.height ? `${entry.width}×${entry.height}px, ` : ''}${entry.colors?.length ? `dominant colours ${entry.colors.join(' ')}, ` : ''}${use(entry)}`),
  ].join('\n');
}

const canvasLine = (canvas: { width: number; height: number }): string => `${canvas.width}×${canvas.height} px (${canvas.width > canvas.height * 1.5 ? '16:9' : '4:3'})`;

/** The SVG rules every slide must follow so it renders, edits and exports to native PowerPoint shapes. */
export function svgContract(canvas: { width: number; height: number }): string {
  const { width: w, height: h } = canvas;
  return `SVG CONTRACT — every page is exported to native, editable PowerPoint shapes, so follow it exactly:
- Root: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="(body font stack)">. Everything visible is drawn inside this one SVG.
- First child: a full-canvas background <rect x="0" y="0" width="${w}" height="${h}" fill="…"/> (solid or gradient).
- Allowed: g, defs, rect, circle, ellipse, line, polyline, polygon, path, text, tspan, image, linearGradient, radialGradient, stop, clipPath (on <image> only), filter (only the two recipes below), marker (arrowheads), symbol + use.
- Forbidden: <style>, class, CSS selectors, <foreignObject>, <script>, on* attributes, <mask>, <pattern>, textPath, animation, @font-face, external URLs, emoji, HTML entities such as &nbsp; or &mdash; (write the Unicode character itself). Escape & < > in text as &amp; &lt; &gt;.
- Colours are uppercase #RRGGBB. Transparency only through fill-opacity / stroke-opacity / opacity (never rgba()).
- Numbers are plain viewBox px (x="120"): no %, em or units.
- TEXT: every visible word is real <text> (never paths or pictures of words). One <text> per paragraph. There is no automatic wrapping: break lines yourself. Multi-line: first line as direct text, each next line as <tspan x="(same x)" dy="(line step)">…</tspan>. Inline emphasis is an unpositioned <tspan font-weight="bold" fill="#…">word</tspan>. y is the baseline; use text-anchor="start|middle|end"; do not use dominant-baseline. Estimate widths before placing: a Latin character is about 0.55 × font-size wide (0.6 bold, 0.65 for caps), CJK 1.0 × font-size. Keep every line inside its zone and at least 48 px from the canvas edge. Text never overlaps other text.
- font-family: the body stack on the root <svg>; the heading stack on titles and display text. Use only the deck's two stacks. font-weight is normal, bold or a multiple of 100.
- Gradients: 2–3 stops, on shapes and backgrounds; on display text only rarely.
- Shadow recipe: <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.12"/></filter>. Glow recipe: feGaussianBlur in="SourceAlpha" → feFlood → feComposite operator="in" → feMerge with SourceGraphic. Nothing else in filters.
- Pictures: <image href="assets/NAME" x y width height preserveAspectRatio="xMidYMid slice"/> using only the paths listed under PICTURES. A round crop uses clip-path="url(#id)" whose <clipPath> holds one <circle>, <ellipse> or <rect rx> covering the image frame.
- Arrows: <line> or <path> with marker-end="url(#arrow)"; the <marker orient="auto"> holds one small filled triangle <path>.
- Charts and diagrams are drawn from the real numbers with rect, line, path, circle and text: correct proportions, direct labels, a short source line when the data has one.
- Icons: draw them from 2–6 simple primitives at 32–56 px, in one consistent line or fill style, or leave them out.
- Group each logical unit (title block, card, step, chart, footer) in <g id="descriptive-id">. Never one group around the whole page.`;
}

/** Visual craft from ppt-master's Executor, condensed. */
export const DESIGN_CRAFT = `DESIGN CRAFT
- Give every page one job and pick its composition from the content relationship before drawing:
  one focal claim → a centred column or a full-bleed field with floating text, 40–60% left empty;
  equal comparison → a symmetric split or a 2×2 matrix;
  dominant evidence + takeaway → an asymmetric 3:7 split, the heavy side 60–75% wide;
  parallel sequence → 3–5 columns, a process line, a chevron strip or a Z path;
  core + surrounding forces → hub and spokes (hub 200–300 px, 4–6 satellites);
  wide visual + explanation → the visual takes at least 55% of the field.
- The failure mode to avoid is the same symmetric card grid on every page. Vary the construction by page job; prefer one large page field (a surface, outline, aperture or off-canvas contour) over one card per item.
- Rhythm: a dense page is followed by a breathing one; the cover and closing are anchors with real visual impact; section pages visibly reset. Hero numbers and display words may be huge (100–220 px) as the page's anchor.
- Colour: 60-30-10 (dominant field, support, accent). The accent goes on the key number or word, not everywhere. Body text keeps at least 4.5:1 contrast with what is behind it.
- Depth through restraint: at most 2–3 genuinely floating objects per page get the shadow; peer cards in a grid stay flat. On dark fields use hairlines or a soft glow, never a black shadow. One weight tool per container (shadow, border, gradient or tint, not several).
- Text on a photo sits on a directional scrim (gradient 0.85 → 0.3 → 0 opacity), never a flat dark plate over the whole picture.
- Hairline dividers at 0.2–0.3 opacity; dashed 8,4 connectors; arrowheads with marker-end.
- Typography: use the deck's type scale (display / title / body / caption). Line step 1.2–1.3× size for titles, 1.45–1.6× for body. Titles stay within two lines. Bold runs lift numbers and load-bearing nouns only.
- Layout grid: side margins ≥ 64 px; the title zone near the top, the content field below it, a quiet footer line at most. The title is part of the composition: its position and scale may change with the page job.
- Repeat the deck motif across pages, varying its scale, crop and position with the page job.
- Real content only: the specific facts, numbers and names from the brief. No placeholders, lorem ipsum or "Your text here".`;

function systemBlock(system: DesignSystem): string {
  const styles = stylesIn(system.style);
  return [
    `DESIGN SYSTEM (binding) — "${system.name}"`,
    `Concept: ${system.concept}`,
    `Visual style: ${system.style}`,
    ...styles.map((style) => `  ${style.id}: ${style.character} Composition moves: ${style.composition} Typography: ${style.typography} Colour use: ${style.color} Texture: ${style.texture}`),
    `Communication mode: ${system.mode} — ${DESIGN_MODES.find((mode) => mode.id === system.mode)?.skeleton ?? ''}`,
    `Palette: background ${system.palette.background}, surface ${system.palette.surface}, text ${system.palette.text}, muted ${system.palette.muted}, primary ${system.palette.primary}, secondary ${system.palette.secondary}, accent ${system.palette.accent}. Chart series: ${system.chartColors.join(', ')}. Derive tints, shades and gradients from these; add no unrelated hues.`,
    `Heading font-family="${fontStack(system.fonts.heading)}"; body font-family="${fontStack(system.fonts.body)}".`,
    `Type scale (px): display ${system.type.display}, title ${system.type.title}, body ${system.type.body}, caption ${system.type.caption}.`,
    `Shape language: ${system.shapeLanguage}`,
    `Motif: ${system.motif}`,
    `Imagery: ${system.imagery}`,
  ].join('\n');
}

function storylineBlock(pages: Array<Pick<DesignedSlide, 'role' | 'title' | 'brief' | 'density'>>, drawNow: Set<number>): string {
  return pages.map((page, index) => `${drawNow.has(index) ? '▶' : ' '} ${index + 1}. [${page.role}, ${page.density}] ${page.title}${drawNow.has(index) && page.brief ? `\n     Brief: ${page.brief.replace(/\n+/g, ' ')}` : ''}`).join('\n');
}

const SLIDE_FORMAT = (numbers: number[]): string => `Reply with exactly ${numbers.length === 1 ? 'one block' : `${numbers.length} blocks, in order`} and nothing else (no Markdown fences, no commentary):
<slide n="${numbers[0]}" role="(cover|agenda|section|content|data|quote|closing)" title="(the page title, plain text)">
<svg …>…</svg>
<notes>Speaker notes: 2–5 natural sentences the presenter says, adding the detail and the transition to the next page. Not a copy of the slide text.</notes>
</slide>${numbers.length > 1 ? `\n…then the same for page${numbers.length > 2 ? 's' : ''} ${numbers.slice(1).join(', ')}.` : ''}`;

const EXECUTOR_ROLE = 'You are the slide designer of a presentation studio. You hand-write each page as one complete SVG that a visual designer would be proud of: deliberate composition, strong hierarchy, generous whitespace, one memorable visual idea per page. (Method: ppt-master by Hugo He.)';

function executorSystem(canvas: { width: number; height: number }): string {
  return `${EXECUTOR_ROLE}\n\n${svgContract(canvas)}\n\n${DESIGN_CRAFT}`;
}

// Pass 1: art direction ------------------------------------------------------------

export interface DirectionInput {
  prompt: string;
  attachments: DesignAttachment[];
  sources: string;
  slideCount: number | null;
  language: string;
  canvas: { width: number; height: number };
  seesImages: boolean;
  /** Restyle: keep this storyline and design a new look per `prompt`. */
  keepPages?: StoryPage[];
  /** Restyle: the look being replaced, so the new one is clearly different. */
  previous?: DesignSystem;
}

const DIRECTION_SYSTEM = `You are the art director and content strategist of a presentation studio. For every deck you invent a UNIQUE visual identity from the brief — never a stock template, never generic corporate blue with white cards — and you plan a storyline a designer can draw page by page. (Method: ppt-master by Hugo He.)

How to decide:
1. Communication mode — one of: ${DESIGN_MODES.map((mode) => `${mode.id} (${mode.skeleton})`).join(' | ')}.
2. Visual style — start from the catalog style that best fits the audience, purpose and delivery (blend two if that serves better and say so in "style"); a topic keyword alone never selects a style.
3. Palette — derive it from the subject itself (its materials, places, products, era, mood) and from the user's pictures or brand colours when given. Seven roles as #RRGGBB: background, surface, text, muted, primary, secondary, accent. Text on background at least 7:1, muted at least 4.5:1, accent rare. Plus 4–6 chartColors from the same family.
4. Fonts — a heading/body pairing that expresses the style, chosen only from this list (they exist on Windows and in PowerPoint): ${fontCatalog()}.
5. Type scale in px for the canvas: display 64–160 (cover and hero moments), title 36–56, body 20–28 (never below 18), caption 14–18.
6. Shape language, one motif with a continuity job (it recurs, varied by page), and how pictures are treated.
7. Storyline — page 1 is a cover with a concrete hook (the strongest claim, number, metaphor or conflict), never a generic title card. The last page is a real conclusion, takeaway or call to action, never just "Thank you" or "Questions?". Each page: role, title (a takeaway sentence for pyramid and narrative, a topic label for briefing), brief, density (anchor = cover/section/closing, dense = information-heavy, breathing = a low-density pause). The brief holds everything the page must say — the actual facts, numbers, names and list items, complete enough to draw it without the sources — and one sentence of composition idea. Follow a dense page with a breathing one where the content allows.

VISUAL STYLE CATALOG:
${styleCatalog()}`;

const DIRECTION_FORMAT = `Reply with one JSON object only (no Markdown fences, no commentary):
{
  "title": "deck title",
  "language": "language of the slides",
  "design": {
    "name": "short evocative name for this design",
    "concept": "one paragraph of art direction: the idea behind the look and how it serves the message",
    "style": "catalog id or blend",
    "mode": "pyramid|narrative|instructional|showcase|briefing",
    "palette": { "background": "#RRGGBB", "surface": "#RRGGBB", "text": "#RRGGBB", "muted": "#RRGGBB", "primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB" },
    "chartColors": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"],
    "fonts": { "heading": "font from the list", "body": "font from the list" },
    "type": { "display": 96, "title": 44, "body": 24, "caption": 16 },
    "shapeLanguage": "corners, contours, line weights",
    "motif": "the recurring element and how it varies",
    "imagery": "how pictures are cropped, framed and treated"
  },
  "pages": [
    { "role": "cover|agenda|section|content|data|quote|closing", "title": "…", "brief": "…", "density": "anchor|dense|breathing" }
  ]
}`;

export function buildDirectionPrompt(input: DirectionInput): AiPrompt {
  const parts: string[] = [];
  if (input.keepPages) {
    parts.push(`RESTYLE an existing deck. Keep its ${input.keepPages.length} pages exactly (same order, titles and briefs; copy them into "pages") and design a new visual identity.`);
    parts.push(`What the user wants from the new look:\n${input.prompt.trim() || 'Something clearly different and more striking.'}`);
    if (input.previous) parts.push(`The current look, which the new one must clearly differ from: "${input.previous.name}" — ${input.previous.style}, background ${input.previous.palette.background}, primary ${input.previous.palette.primary}, ${input.previous.fonts.heading} / ${input.previous.fonts.body}.`);
    parts.push(`PAGES:\n${input.keepPages.map((page, index) => `${index + 1}. [${page.role}, ${page.density}] ${page.title}\n   ${page.brief.replace(/\n+/g, ' ')}`).join('\n')}`);
  } else {
    parts.push(`WHAT THE USER WANTS:\n${input.prompt.trim()}`);
    parts.push(input.slideCount
      ? `Pages: exactly ${input.slideCount}.`
      : 'Pages: choose the number the content needs, usually 6–14.');
    parts.push(`Language of the slides: ${input.language.trim() && input.language !== 'auto' ? input.language : 'the language the user wrote in'}.`);
  }
  parts.push(`Canvas: ${canvasLine(input.canvas)}.`);
  const pictures = describeAttachments(input.attachments, input.seesImages);
  if (pictures) parts.push(`${pictures}\nWhen pictures are given, let their colours and mood inform the palette, and plan where the ones meant for slides appear (name the file in that page's brief).`);
  if (input.sources.trim() && !input.keepPages) {
    const sources = input.sources.length > MAX_SOURCE_CHARS ? `${input.sources.slice(0, MAX_SOURCE_CHARS)}\n[…truncated…]` : input.sources;
    parts.push(`SOURCE MATERIAL (use its facts; do not invent numbers it does not support):\n${sources}`);
  }
  parts.push(DIRECTION_FORMAT);
  return { system: DIRECTION_SYSTEM, prompt: parts.join('\n\n') };
}

// Pass 2: slides ---------------------------------------------------------------------

export interface SlidesPromptInput {
  title: string;
  language: string;
  system: DesignSystem;
  canvas: { width: number; height: number };
  pages: Array<Pick<DesignedSlide, 'role' | 'title' | 'brief' | 'density'>>;
  /** Zero-based indexes of the pages to draw now. */
  draw: number[];
  attachments: DesignAttachment[];
  seesImages: boolean;
  /** A finished page whose look the new ones must match (usually the cover). */
  reference?: { number: number; svg: string } | null;
}

const MAX_REFERENCE_CHARS = 14_000;

function referenceBlock(reference: { number: number; svg: string } | null | undefined): string {
  if (!reference?.svg || reference.svg.length > MAX_REFERENCE_CHARS) return '';
  return `IDENTITY REFERENCE — page ${reference.number}, already drawn. Match its palette use, type, motif and finish (do not copy its layout):\n${reference.svg}`;
}

export function buildSlidesPrompt(input: SlidesPromptInput): AiPrompt {
  const numbers = input.draw.map((index) => index + 1);
  const parts = [
    `DECK: "${input.title}" · slides in ${input.language || 'the language of the titles'} · canvas ${canvasLine(input.canvas)}`,
    systemBlock(input.system),
    `STORYLINE (draw only the pages marked ▶; the others are context for continuity):\n${storylineBlock(input.pages, new Set(input.draw))}`,
  ];
  const pictures = describeAttachments(input.attachments.filter((entry) => entry.use !== 'style'), input.seesImages);
  if (pictures) parts.push(pictures);
  const reference = referenceBlock(input.reference);
  if (reference) parts.push(reference);
  parts.push(`Draw page${numbers.length === 1 ? '' : 's'} ${numbers.join(', ')} now.`);
  parts.push(SLIDE_FORMAT(numbers));
  return { system: executorSystem(input.canvas), prompt: parts.join('\n\n') };
}

// Refining one page ------------------------------------------------------------------

export type RefineAction = 'polish' | 'visual' | 'simplify' | 'layout' | 'expand' | 'chart' | 'notes' | 'custom';

export const REFINE_ACTIONS: Array<{ id: Exclude<RefineAction, 'custom'>; label: string; instruction: string }> = [
  { id: 'polish', label: 'Polish', instruction: 'Polish this page: fix spacing, alignment, overlaps and any text that runs out of its zone, strengthen the hierarchy, keep the content.' },
  { id: 'visual', label: 'More visual', instruction: 'Make this page more visual: turn the content into a diagram, a hero number, a picture-led composition or a strong graphic device, with less running text.' },
  { id: 'simplify', label: 'Less text', instruction: 'Cut the text on this page to the essential claim and the few points that carry it; give the rest room to breathe. Move detail into the speaker notes.' },
  { id: 'layout', label: 'New layout', instruction: 'Keep the content but compose this page in a completely different way: a different composition move, carrier and focal point.' },
  { id: 'expand', label: 'Add detail', instruction: 'Add depth to this page: the supporting facts, an example or the numbers behind the claim, while keeping it readable.' },
  { id: 'chart', label: 'Chart it', instruction: 'Show the information on this page as a chart, table or diagram drawn from its real numbers or structure.' },
  { id: 'notes', label: 'Rewrite notes', instruction: 'Keep the page exactly as it is (copy the SVG unchanged) and rewrite only the speaker notes: natural, specific, with the transition to the next page.' },
];

export interface RefineInput {
  title: string;
  language: string;
  system: DesignSystem;
  canvas: { width: number; height: number };
  pages: Array<Pick<DesignedSlide, 'role' | 'title' | 'brief' | 'density'>>;
  index: number;
  svg: string;
  notes: string;
  instruction: string;
  attachments: DesignAttachment[];
  seesImages: boolean;
}

export function buildRefinePrompt(input: RefineInput): AiPrompt {
  const number = input.index + 1;
  const parts = [
    `DECK: "${input.title}" · slides in ${input.language || 'the language of the titles'} · canvas ${canvasLine(input.canvas)}`,
    systemBlock(input.system),
    `STORYLINE:\n${storylineBlock(input.pages, new Set([input.index]))}`,
  ];
  const pictures = describeAttachments(input.attachments.filter((entry) => entry.use !== 'style'), input.seesImages);
  if (pictures) parts.push(pictures);
  parts.push(`CURRENT PAGE ${number}:\n${input.svg}\n<notes>${input.notes}</notes>`);
  parts.push(`REDRAW PAGE ${number}. Instruction from the user: ${input.instruction.trim()}\nKeep the design system and every fact unless the instruction changes them. Keep pictures that are on the page unless told otherwise.`);
  parts.push(SLIDE_FORMAT([number]));
  return { system: executorSystem(input.canvas), prompt: parts.join('\n\n') };
}

export interface NewSlideInput extends Omit<RefineInput, 'index' | 'svg' | 'notes' | 'instruction'> {
  /** Zero-based position the new page will take. */
  at: number;
  description: string;
  reference?: { number: number; svg: string } | null;
}

export function buildNewSlidePrompt(input: NewSlideInput): AiPrompt {
  const number = input.at + 1;
  const pages = [...input.pages];
  pages.splice(input.at, 0, { role: 'content', title: '(new page)', brief: input.description, density: 'dense' });
  const parts = [
    `DECK: "${input.title}" · slides in ${input.language || 'the language of the titles'} · canvas ${canvasLine(input.canvas)}`,
    systemBlock(input.system),
    `STORYLINE:\n${storylineBlock(pages, new Set([input.at]))}`,
  ];
  const pictures = describeAttachments(input.attachments.filter((entry) => entry.use !== 'style'), input.seesImages);
  if (pictures) parts.push(pictures);
  const reference = referenceBlock(input.reference);
  if (reference) parts.push(reference);
  parts.push(`ADD a new page ${number} to the deck: ${input.description.trim()}\nWrite its real content (choose a fitting role and title) and draw it in the deck's design.`);
  parts.push(SLIDE_FORMAT([number]));
  return { system: executorSystem(input.canvas), prompt: parts.join('\n\n') };
}

// Reading slide replies --------------------------------------------------------------

export interface SlideBlock {
  n: number | null;
  role: DesignSlideRole | null;
  title: string;
  svg: string;
  notes: string;
}

const attributesOf = (tag: string): Record<string, string> => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((match) => [match[1].toLowerCase(), match[2]]));

function decodeEntities(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function blockFrom(open: string, body: string): SlideBlock | null {
  const svgStart = body.search(/<svg[\s>]/i);
  const svgEnd = body.toLowerCase().lastIndexOf('</svg>');
  if (svgStart < 0 || svgEnd < svgStart) return null;
  const attributes = attributesOf(open);
  const notes = body.slice(svgEnd + 6).match(/<notes>([\s\S]*?)(?:<\/notes>|$)/i)?.[1] ?? '';
  const n = Number.parseInt(attributes.n ?? '', 10);
  return {
    n: Number.isFinite(n) ? n : null,
    role: ROLES.includes(attributes.role as DesignSlideRole) ? attributes.role as DesignSlideRole : null,
    title: decodeEntities(attributes.title ?? '').trim().slice(0, 200),
    svg: body.slice(svgStart, svgEnd + 6),
    notes: decodeEntities(notes).replace(/^\s*speaker notes:\s*/i, '').trim().slice(0, 6000),
  };
}

/**
 * The slide blocks in a reply. While streaming (`final` false) only closed
 * `<slide>` blocks count; the final pass also accepts a last block whose
 * `</slide>` is missing, and bare `<svg>` documents when the model ignored
 * the wrapper.
 */
export function extractSlideBlocks(reply: string, final = false): SlideBlock[] {
  const blocks: SlideBlock[] = [];
  const pattern = /<slide\b([^>]*)>([\s\S]*?)<\/slide>/gi;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = pattern.exec(reply))) {
    const block = blockFrom(match[1], match[2]);
    if (block) blocks.push(block);
    consumed = pattern.lastIndex;
  }
  if (!final) return blocks;
  const rest = reply.slice(consumed);
  const open = rest.match(/<slide\b([^>]*)>([\s\S]*)$/i);
  if (open) {
    const block = blockFrom(open[1], open[2]);
    if (block) blocks.push(block);
  } else if (blocks.length === 0) {
    for (const svg of reply.match(/<svg[\s>][\s\S]*?<\/svg>/gi) ?? []) blocks.push({ n: null, role: null, title: '', svg, notes: '' });
  }
  return blocks;
}

/** A title for a slide the AI returned without one: its biggest text. */
export function titleFromSvg(svg: string): string {
  let best = { size: 0, text: '' };
  for (const match of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const size = Number.parseFloat(match[1].match(/font-size="([\d.]+)"/)?.[1] ?? '0');
    const words = decodeEntities(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (words && size > best.size) best = { size, text: words };
  }
  return best.text.slice(0, 200);
}

/** Whether the palette text roles read against the background (used by tests and the design card). */
export function paletteReadable(system: DesignSystem): boolean {
  return contrastRatio(system.palette.text, system.palette.background) >= 4.5 && contrastRatio(system.palette.muted, system.palette.background) >= 3;
}

// Stored decks -----------------------------------------------------------------------

let slideCounter = 0;
export function newDesignedSlideId(): string {
  slideCounter += 1;
  return `ds-${Date.now().toString(36)}-${slideCounter.toString(36)}`;
}

export function sanitizeAttachment(value: unknown): DesignAttachment | null {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const path = typeof raw.path === 'string' ? raw.path.trim() : '';
  if (!path) return null;
  const kind = raw.kind === 'image' ? 'image' : 'document';
  const colors = Array.isArray(raw.colors) ? raw.colors.map(normalizeHex).filter((color): color is string => Boolean(color)).slice(0, 6) : undefined;
  return {
    path,
    name: text(raw.name, 200, path.split(/[\\/]/).pop() ?? path),
    kind,
    use: raw.use === 'slides' || raw.use === 'style' ? raw.use : 'auto',
    ...(Number(raw.width) > 0 ? { width: Math.round(Number(raw.width)) } : {}),
    ...(Number(raw.height) > 0 ? { height: Math.round(Number(raw.height)) } : {}),
    ...(colors?.length ? { colors } : {}),
  };
}

/** Stored SVG, sanitised again: a deck file may come from anywhere. */
function storedSvg(value: unknown, canvas: { width: number; height: number }): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    return sanitizeSvg(value, canvas).svg;
  } catch {
    return '';
  }
}

export function sanitizeDesignedSlide(value: unknown, canvas: { width: number; height: number }): DesignedSlide | null {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const page = sanitizeStoryPage({ ...raw, title: raw.title || '(untitled)' });
  if (!page) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newDesignedSlideId(),
    ...page,
    svg: storedSvg(raw.svg, canvas),
    notes: text(raw.notes, 6000),
    ...(raw.hidden ? { hidden: true } : {}),
  };
}

export function clampSlideCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === 'auto') return null;
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(MAX_DESIGN_SLIDES, Math.max(MIN_DESIGN_SLIDES, number)) : null;
}
