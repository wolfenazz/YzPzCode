// Saved design systems ("kits") and their text formats: DESIGN.md, CSS variables, W3C
// design-tokens JSON, a Tailwind theme. Dependency-free (`npm run test:design`).

import { normalizeTokens } from './project';
import { tokensToCss } from './tokensCss';
import type { DesignTokens } from './types';

export const KIT_FOLDER = '.kits';
export const KIT_EXTENSION = '.yzkit.json';

export interface Kit {
  version: 1;
  id: string;
  name: string;
  tokens: DesignTokens;
  created: number;
}

export function kitFileName(name: string, taken: Set<string> = new Set()): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'kit';
  let candidate = base;
  let counter = 2;
  while (taken.has(`${candidate}${KIT_EXTENSION}`.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return `${candidate}${KIT_EXTENSION}`;
}

export function serializeKit(kit: Kit): string {
  return JSON.stringify(kit, null, 2);
}

export function parseKit(content: string): Kit | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return null;
    const tokens = normalizeTokens(raw.tokens);
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : tokens.name;
    return {
      version: 1,
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : `k-${Date.now().toString(36)}`,
      name,
      tokens,
      created: Number.isFinite(Number(raw.created)) ? Number(raw.created) : Date.now(),
    };
  } catch {
    return null;
  }
}

// DESIGN.md ---------------------------------------------------------------------------

const ROLES = ['background', 'surface', 'text', 'muted', 'primary', 'secondary', 'accent'] as const;
const cap = (value: string): string => value[0].toUpperCase() + value.slice(1);

/** The design system as a markdown document an agent (or a person) can read and a kit can be read back from. */
export function tokensToDesignMd(tokens: DesignTokens): string {
  const lines = [
    `# ${tokens.name}`,
    '',
    tokens.concept ? `${tokens.concept}\n` : '',
    '## Colour',
    '',
    '| Role | Value |',
    '| --- | --- |',
    ...ROLES.map((role) => `| ${cap(role)} | \`${tokens.palette[role]}\` |`),
  ];
  if (tokens.darkPalette) {
    lines.push('', '### Dark', '', '| Role | Value |', '| --- | --- |', ...ROLES.map((role) => `| ${cap(role)} | \`${tokens.darkPalette![role]}\` |`));
  }
  lines.push(
    '',
    '## Type',
    '',
    `- Fonts: headings **${tokens.fonts.heading}**, body **${tokens.fonts.body}**`,
    `- Type scale: display ${tokens.type.display}px, h1 ${tokens.type.h1}px, h2 ${tokens.type.h2}px, body ${tokens.type.body}px, caption ${tokens.type.caption}px`,
    `- Heading weight ${tokens.headingWeight}, line height ${tokens.lineHeight}`,
    '',
    '## Shape',
    '',
    `- Radius ${tokens.radius}px, base spacing ${tokens.spacing}px, border ${tokens.borderWidth}px, shadow ${tokens.shadow}`,
    tokens.motif ? `- Motif: ${tokens.motif}` : '',
    tokens.imagery ? `- Imagery: ${tokens.imagery}` : '',
    '',
    'Colours, fonts, radius and spacing are CSS variables (`--ds-*`).',
    '',
  );
  return lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
}

/**
 * Reads a DESIGN.md. It understands the document written by `tokensToDesignMd` and the looser
 * ones people write: any line naming a role beside a hex colour, "Fonts:" or "Heading font:" lines.
 */
export function parseDesignMd(markdown: string): DesignTokens {
  const draft: Record<string, any> = { palette: {}, fonts: {}, type: {} };
  const dark: Record<string, string> = {};
  const title = /^#\s+(.+)$/m.exec(markdown);
  if (title) draft.name = title[1].trim();
  let inDark = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{2,4}\s+dark/i.test(line)) inDark = true;
    else if (/^#{1,3}\s+/.test(line)) inDark = false;
    const role = ROLES.find((entry) => new RegExp(`\\b${entry}\\b`, 'i').test(line.replace(/`#[0-9a-f]{3,6}`/gi, '')));
    const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(line);
    if (role && hex) (inDark ? dark : draft.palette)[role] = `#${hex[1]}`;
    const heading = /heading[s]?(?:\s+font)?\W+\**([A-Za-z0-9 .'-]+?)\**(?:,|$|\s{2,})/i.exec(line);
    if (heading && !draft.fonts.heading && /font/i.test(line)) draft.fonts.heading = heading[1].trim();
    const body = /body(?:\s+font)?\W+\**([A-Za-z0-9 .'-]+?)\**(?:,|$)/i.exec(line);
    if (body && !draft.fonts.body && /font/i.test(line)) draft.fonts.body = body[1].trim();
    for (const key of ['display', 'h1', 'h2', 'body', 'caption'] as const) {
      const size = new RegExp(`\\b${key}\\s+(\\d{1,3})px`, 'i').exec(line);
      if (size && /scale/i.test(line)) draft.type[key] = Number(size[1]);
    }
    const radius = /radius\s+(\d{1,2})px/i.exec(line);
    if (radius) draft.radius = Number(radius[1]);
    const spacing = /spacing\s+(\d{1,2})px/i.exec(line);
    if (spacing) draft.spacing = Number(spacing[1]);
    const weight = /heading weight\s+(\d{3})/i.exec(line);
    if (weight) draft.headingWeight = Number(weight[1]);
    const motif = /^-\s*motif:\s*(.+)$/i.exec(line);
    if (motif) draft.motif = motif[1].trim();
    const imagery = /^-\s*imagery:\s*(.+)$/i.exec(line);
    if (imagery) draft.imagery = imagery[1].trim();
  }
  if (Object.keys(dark).length === ROLES.length) draft.darkPalette = dark;
  const intro = markdown.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('-') && !line.startsWith('>'));
  if (intro) draft.concept = intro.trim().slice(0, 300);
  return normalizeTokens(draft);
}

// Other handoff formats ---------------------------------------------------------------

/** W3C design-tokens JSON (`$value` / `$type`). */
export function tokensToJson(tokens: DesignTokens): string {
  const color = (value: string): { $value: string; $type: string } => ({ $value: value, $type: 'color' });
  const out = {
    color: Object.fromEntries(ROLES.map((role) => [role, color(tokens.palette[role])])),
    ...(tokens.darkPalette ? { 'color-dark': Object.fromEntries(ROLES.map((role) => [role, color(tokens.darkPalette![role])])) } : {}),
    font: {
      heading: { $value: tokens.fonts.heading, $type: 'fontFamily' },
      body: { $value: tokens.fonts.body, $type: 'fontFamily' },
    },
    size: Object.fromEntries(Object.entries(tokens.type).map(([key, value]) => [key, { $value: `${value}px`, $type: 'dimension' }])),
    radius: { $value: `${tokens.radius}px`, $type: 'dimension' },
    space: { $value: `${tokens.spacing}px`, $type: 'dimension' },
  };
  return JSON.stringify(out, null, 2);
}

/** A Tailwind `theme.extend` that points at the CSS variables, so `tokens.css` stays the source. */
export function tokensToTailwind(): string {
  return [
    '// Use with tokens.css (the --ds-* variables).',
    'module.exports = {',
    '  theme: {',
    '    extend: {',
    '      colors: {',
    ...ROLES.map((role) => `        ${role}: 'var(--ds-${role})',`),
    '      },',
    "      fontFamily: { heading: ['var(--ds-font-heading)'], body: ['var(--ds-font-body)'] },",
    "      borderRadius: { DEFAULT: 'var(--ds-radius)', sm: 'var(--ds-radius-sm)', lg: 'var(--ds-radius-lg)' },",
    "      boxShadow: { 1: 'var(--ds-shadow-1)', 2: 'var(--ds-shadow-2)', 3: 'var(--ds-shadow-3)' },",
    '    },',
    '  },',
    '};',
    '',
  ].join('\n');
}

export const tokensToCssFile = (tokens: DesignTokens): string => `${tokensToCss(tokens)}\n`;

/** The system in words, for an AI prompt that must keep to it. */
export function describeTokens(tokens: DesignTokens): string {
  const p = tokens.palette;
  return [
    `Use this design system exactly (do not invent another): "${tokens.name}".`,
    `Palette: background ${p.background}, surface ${p.surface}, text ${p.text}, muted ${p.muted}, primary ${p.primary}, secondary ${p.secondary}, accent ${p.accent}.`,
    `Fonts: headings ${tokens.fonts.heading}, body ${tokens.fonts.body}. Radius ${tokens.radius}px, base spacing ${tokens.spacing}px.`,
    tokens.motif ? `Motif: ${tokens.motif}.` : '',
    tokens.imagery ? `Imagery: ${tokens.imagery}.` : '',
  ].filter(Boolean).join('\n');
}
