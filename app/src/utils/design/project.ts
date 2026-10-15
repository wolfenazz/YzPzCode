// Reading, writing and laying out Design studio projects.

import { normalizeValues, parseTweaks } from './tweaks';
import { clampCanvas, DEFAULT_PRESET, findPreset } from './formats';
import type { Board, DesignKind, DesignProject, DesignTokens } from './types';

export const DESIGN_FOLDER = 'Designs';
export const YZDESIGN_EXTENSION = '.yzdesign';
export const BOARD_GAP = 120;
/** The design-system board takes this much room at the left of the first row. */
/** The system sheet grows with its content; `height` is the usual size, used to fit the view. */
export const SYSTEM_BOARD = { width: 640, height: 600 };

const KINDS: DesignKind[] = ['app', 'web', 'graphic'];

export const DEFAULT_TOKENS: DesignTokens = {
  name: 'Untitled system',
  concept: '',
  dark: false,
  palette: { background: '#ffffff', surface: '#f4f4f5', text: '#18181b', muted: '#71717a', primary: '#18181b', secondary: '#52525b', accent: '#2563eb' },
  fonts: { heading: 'Inter', body: 'Inter' },
  type: { display: 48, h1: 32, h2: 22, body: 16, caption: 12 },
  radius: 12,
  spacing: 8,
  motif: '',
  imagery: '',
  headingWeight: 700,
  lineHeight: 1.5,
  borderWidth: 1,
  shadow: 'soft',
};

export function newDesignId(prefix = 'd'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ـً-ٟ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'design';
}

const sepOf = (base: string): string => (base.includes('\\') && !base.includes('/') ? '\\' : '/');

export function joinPath(base: string, ...parts: string[]): string {
  return [base.replace(/[\\/]+$/, ''), ...parts.map((part) => part.replace(/^[\\/]+|[\\/]+$/g, ''))].join(sepOf(base));
}

export function parentPath(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index > 0 ? path.slice(0, index) : path;
}

/** `<root>/Designs/<slug>/<slug>.yzdesign`, with a numeric suffix when `taken` has it. */
export function designPath(root: string, title: string, taken: Set<string> = new Set()): string {
  const base = slugify(title);
  let slug = base;
  let counter = 2;
  const candidate = (): string => joinPath(root, DESIGN_FOLDER, slug, `${slug}${YZDESIGN_EXTENSION}`);
  while (taken.has(candidate().toLowerCase())) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return candidate();
}

const hex = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : fallback;
const SHADOW_LEVELS = ['none', 'soft', 'medium', 'strong'] as const;
const text = (value: unknown, fallback = '', max = 4000): string => (typeof value === 'string' ? value.slice(0, max) : fallback);
const num = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function normalizeTokens(value: unknown): DesignTokens {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, any>;
  const d = DEFAULT_TOKENS;
  const palette = (raw.palette ?? {}) as Record<string, unknown>;
  const fonts = (raw.fonts ?? {}) as Record<string, unknown>;
  const type = (raw.type ?? {}) as Record<string, unknown>;
  const dark = raw.darkPalette && typeof raw.darkPalette === 'object' ? raw.darkPalette as Record<string, unknown> : null;
  return {
    name: text(raw.name, d.name, 80),
    concept: text(raw.concept, '', 600),
    dark: Boolean(raw.dark),
    palette: {
      background: hex(palette.background, d.palette.background),
      surface: hex(palette.surface, d.palette.surface),
      text: hex(palette.text, d.palette.text),
      muted: hex(palette.muted, d.palette.muted),
      primary: hex(palette.primary, d.palette.primary),
      secondary: hex(palette.secondary, d.palette.secondary),
      accent: hex(palette.accent, d.palette.accent),
    },
    fonts: { heading: text(fonts.heading, d.fonts.heading, 60) || d.fonts.heading, body: text(fonts.body, d.fonts.body, 60) || d.fonts.body },
    type: {
      display: num(type.display, d.type.display, 8, 600),
      h1: num(type.h1, d.type.h1, 8, 400),
      h2: num(type.h2, d.type.h2, 8, 300),
      body: num(type.body, d.type.body, 6, 120),
      caption: num(type.caption, d.type.caption, 6, 80),
    },
    radius: num(raw.radius, d.radius, 0, 64),
    spacing: num(raw.spacing, d.spacing, 2, 32),
    motif: text(raw.motif, '', 300),
    imagery: text(raw.imagery, '', 300),
    ...(dark ? {
      darkPalette: {
        background: hex(dark.background, '#0b0b0d'),
        surface: hex(dark.surface, '#16161a'),
        text: hex(dark.text, '#f4f4f5'),
        muted: hex(dark.muted, '#a1a1aa'),
        primary: hex(dark.primary, d.palette.primary),
        secondary: hex(dark.secondary, d.palette.secondary),
        accent: hex(dark.accent, d.palette.accent),
      },
    } : {}),
    headingWeight: Math.round(num(raw.headingWeight, d.headingWeight, 300, 900) / 100) * 100,
    lineHeight: Math.round(num(raw.lineHeight, d.lineHeight, 1, 2.2) * 100) / 100,
    borderWidth: num(raw.borderWidth, d.borderWidth, 0, 6),
    shadow: (SHADOW_LEVELS as readonly string[]).includes(raw.shadow) ? raw.shadow : d.shadow,
  };
}

function normalizeBoard(value: unknown, kind: DesignKind, index: number): Board {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, any>;
  const tweaks = parseTweaks(raw.tweaks);
  const preset = findPreset(typeof raw.preset === 'string' ? raw.preset : undefined);
  const fallback = preset ?? findPreset(DEFAULT_PRESET[kind])!;
  const status = raw.status === 'pending' || raw.status === 'drawing' || raw.status === 'failed' || raw.status === 'done' || raw.status === 'blank' ? raw.status : undefined;
  const source = text(raw.source, '', 4_000_000);
  const brief = text(raw.brief, '', 2000);
  return {
    id: text(raw.id, '', 64) || newDesignId('b'),
    name: text(raw.name, `Board ${index + 1}`, 80),
    brief,
    format: raw.format === 'svg' || (raw.format !== 'html' && kind === 'graphic') ? 'svg' : 'html',
    width: clampCanvas(Number.isFinite(Number(raw.width)) && raw.width !== null ? raw.width : fallback.width),
    height: clampCanvas(Number.isFinite(Number(raw.height)) && raw.height !== null ? raw.height : fallback.height),
    preset: preset?.id,
    x: num(raw.x, 0, -1e6, 1e6),
    y: num(raw.y, 0, -1e6, 1e6),
    source,
    // A board left drawing when the app closed has nothing more coming. An empty
    // board queued with a brief was meant to be drawn and failed; an empty one
    // with no brief is an empty canvas on purpose and stays blank.
    status: status === 'drawing' ? (source ? 'done' : 'failed')
      : status === 'pending' ? (source ? 'done' : brief ? 'failed' : 'blank')
      : status === 'blank' && source ? 'done' : status,
    hidden: raw.hidden ? true : undefined,
    theme: raw.theme === 'dark' ? 'dark' : undefined,
    frame: raw.frame === 'phone' || raw.frame === 'browser' ? raw.frame : undefined,
    group: typeof raw.group === 'string' && raw.group.trim() ? raw.group.trim().slice(0, 64) : undefined,
    tweaks: tweaks.length > 0 ? tweaks : undefined,
    tweakValues: tweaks.length > 0 ? normalizeValues(tweaks, raw.tweakValues) : undefined,
  };
}

/** Reads a `.yzdesign` file, repairing whatever is missing or malformed. */
export function parseProject(content: string): DesignProject {
  let raw: Record<string, any>;
  try {
    const parsed = JSON.parse(content);
    raw = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    raw = {};
  }
  const kind: DesignKind = KINDS.includes(raw.kind) ? raw.kind : 'app';
  const now = Date.now();
  const boards = Array.isArray(raw.boards) ? raw.boards.map((board: unknown, index: number) => normalizeBoard(board, kind, index)) : [];
  const engine = raw.engine && typeof raw.engine === 'object' && typeof raw.engine.engine === 'string'
    ? { engine: raw.engine.engine, model: text(raw.engine.model, '', 120), effort: raw.engine.effort ? text(raw.engine.effort, '', 40) : undefined, allowWebResearch: Boolean(raw.engine.allowWebResearch) }
    : undefined;
  return {
    version: 1,
    id: text(raw.id, '', 64) || newDesignId(),
    title: text(raw.title, 'Untitled design', 120) || 'Untitled design',
    kind,
    prompt: text(raw.prompt, '', 8000),
    language: text(raw.language, '', 40),
    created: num(raw.created, now, 0, 1e15),
    updated: num(raw.updated, now, 0, 1e15),
    system: normalizeTokens(raw.system),
    boards,
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments.filter((a: any) => a && typeof a.path === 'string').map((a: any) => ({
        path: String(a.path),
        name: text(a.name, String(a.path), 200),
        kind: a.kind === 'document' ? 'document' as const : 'image' as const,
        use: a.use === 'slides' || a.use === 'style' ? a.use as 'slides' | 'style' : 'auto' as const,
        caption: a.caption ? text(a.caption, '', 400) : undefined,
        credit: a.credit ? text(a.credit, '', 300) : undefined,
      }))
      : [],
    chat: Array.isArray(raw.chat)
      ? raw.chat.filter((c: any) => c && typeof c.text === 'string').slice(-200).map((c: any) => ({
        id: text(c.id, '', 64) || newDesignId('c'),
        role: c.role === 'assistant' || c.role === 'log' ? c.role as 'assistant' | 'log' : 'user' as const,
        text: text(c.text, '', 8000),
        at: num(c.at, now, 0, 1e15),
      }))
      : [],
    engine,
  };
}

export function serializeProject(project: DesignProject): string {
  return `${JSON.stringify({ ...project, updated: Date.now() }, null, 1)}\n`;
}

export function createProject(input: { title: string; kind: DesignKind; prompt: string; language?: string; boards?: Board[]; engine?: DesignProject['engine'] }): DesignProject {
  const now = Date.now();
  return {
    version: 1,
    id: newDesignId(),
    title: input.title.trim() || 'Untitled design',
    kind: input.kind,
    prompt: input.prompt,
    language: input.language ?? '',
    created: now,
    updated: now,
    system: { ...DEFAULT_TOKENS },
    boards: input.boards ?? [],
    attachments: [],
    chat: input.prompt ? [{ id: newDesignId('c'), role: 'user', text: input.prompt, at: now }] : [],
    engine: input.engine,
  };
}

/** Places boards in one row to the right of the design-system board, `BOARD_GAP` apart, tops aligned. */
export function layoutBoards(boards: Board[]): Board[] {
  let x = SYSTEM_BOARD.width + BOARD_GAP;
  return boards.map((board) => {
    const placed = { ...board, x, y: 0 };
    x += board.width + BOARD_GAP;
    return placed;
  });
}

/** The box that holds the system board and every visible board, for "fit to content". */
export function contentBounds(boards: Board[], withSystem = true): { x: number; y: number; width: number; height: number } {
  let minX = withSystem ? 0 : Infinity;
  let minY = withSystem ? 0 : Infinity;
  let maxX = withSystem ? SYSTEM_BOARD.width : -Infinity;
  let maxY = withSystem ? SYSTEM_BOARD.height : -Infinity;
  for (const board of boards) {
    if (board.hidden) continue;
    minX = Math.min(minX, board.x);
    minY = Math.min(minY, board.y);
    maxX = Math.max(maxX, board.x + board.width);
    maxY = Math.max(maxY, board.y + board.height);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: SYSTEM_BOARD.width, height: SYSTEM_BOARD.height };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
