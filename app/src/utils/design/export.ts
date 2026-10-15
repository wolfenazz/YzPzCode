// Export helpers for the Design studio that need no Tauri: file names, the
// standalone HTML of a board, the print page and the written description of the
// system. Dependency-free (tested by `npm run test:design`).

import { rootAttributes } from './tweaks';
import { tokensToCss } from './tokensCss';
import type { Board, DesignProject, DesignTokens } from './types';

/** A file name safe on every OS, from a board or project name. */
export function safeFileName(name: string, fallback = 'board'): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 60);
  return cleaned || fallback;
}

/** Names for the boards of a project, unique and in order: "Home", "Home 2"... */
export function boardFileNames(boards: Array<Pick<Board, 'name'>>): string[] {
  const used = new Map<string, number>();
  return boards.map((board) => {
    const base = safeFileName(board.name);
    const key = base.toLowerCase();
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

/**
 * File names for a set of boards that are cards of one series (same size, several of them):
 * "01-Cover", "02-Point 1"... so the files sort in reading order. Other sets keep their names.
 */
export function numberedNames(boards: Array<Pick<Board, 'name' | 'width' | 'height'>>): string[] {
  const names = boardFileNames(boards);
  const sameSize = boards.length > 1 && new Set(boards.map((board) => `${board.width}x${board.height}`)).size === 1;
  if (!sameSize) return names;
  const digits = String(boards.length).length < 2 ? 2 : String(boards.length).length;
  return names.map((name, index) => `${String(index + 1).padStart(digits, '0')}-${name}`);
}

const BASE_CSS = (width: number): string =>
  `*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}body{width:${width}px;min-height:100vh;background:var(--ds-background);color:var(--ds-text);font-family:var(--ds-font-body);font-size:var(--ds-size-body);line-height:1.5;-webkit-font-smoothing:antialiased}img{max-width:100%}a{color:inherit}`;

/** A complete, standalone HTML page for one app or web board. `fontCss` holds any @font-face rules. */
export function standaloneBoardHtml(board: Pick<Board, 'name' | 'width' | 'source'> & { theme?: Board['theme']; tweaks?: Board['tweaks']; tweakValues?: Board['tweakValues'] }, tokens: DesignTokens, options: { fontCss?: string; lang?: string; dir?: 'ltr' | 'rtl'; tokensHref?: string } = {}): string {
  const head = options.tokensHref
    ? `<link rel="stylesheet" href="${options.tokensHref}">`
    : `<style>${tokensToCss(tokens)}</style>`;
  const escapedTitle = board.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return [
    `<!doctype html><html lang="${options.lang || 'en'}" dir="${options.dir ?? 'ltr'}"${board.theme === 'dark' && tokens.darkPalette ? ' data-theme="dark"' : ''}${rootAttributes(board.tweaks, board.tweakValues)}><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapedTitle}</title>`,
    head,
    `<style>${options.fontCss ?? ''}\n${BASE_CSS(board.width).replace(`width:${board.width}px;`, 'max-width:100%;')}</style>`,
    `</head><body>${board.source}</body></html>`,
  ].join('\n');
}

/** A print page with every picture on its own page, sized to the picture (named `@page` per size). */
export function printPagesHtml(title: string, pages: Array<{ width: number; height: number; src: string; name: string }>): string {
  const sizes = new Map<string, string>();
  const rules: string[] = [];
  const body = pages.map((page) => {
    const key = `${page.width}x${page.height}`;
    let name = sizes.get(key);
    if (!name) {
      name = `p${sizes.size + 1}`;
      sizes.set(key, name);
      rules.push(`@page ${name}{size:${page.width}px ${page.height}px;margin:0}.${name}{page:${name};width:${page.width}px;height:${page.height}px}`);
    }
    return `<div class="pg ${name}"><img src="${page.src}" alt="${page.name.replace(/"/g, '&quot;')}" width="${page.width}" height="${page.height}"></div>`;
  }).join('');
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escaped}</title><style>*{margin:0;padding:0}html,body{background:#fff}.pg{break-after:page;overflow:hidden}.pg:last-child{break-after:auto}img{display:block}${rules.join('')}</style></head><body>${body}</body></html>`;
}

/** The README that goes with a code export: what the system is and which file is which board. */
export function designMarkdown(project: DesignProject, files: string[]): string {
  const p = project.system.palette;
  const t = project.system.type;
  const lines = [
    `# ${project.title}`,
    '',
    project.prompt ? `> ${project.prompt.replace(/\n+/g, ' ')}` : '',
    '',
    `## Design system: ${project.system.name}`,
    project.system.concept ? `\n${project.system.concept}\n` : '',
    '| Role | Value |',
    '| --- | --- |',
    `| Background | \`${p.background}\` |`,
    `| Surface | \`${p.surface}\` |`,
    `| Text | \`${p.text}\` |`,
    `| Muted | \`${p.muted}\` |`,
    `| Primary | \`${p.primary}\` |`,
    `| Secondary | \`${p.secondary}\` |`,
    `| Accent | \`${p.accent}\` |`,
    '',
    `- Fonts: headings **${project.system.fonts.heading}**, body **${project.system.fonts.body}**`,
    `- Type scale: display ${t.display}px, h1 ${t.h1}px, h2 ${t.h2}px, body ${t.body}px, caption ${t.caption}px`,
    `- Radius ${project.system.radius}px, base spacing ${project.system.spacing}px`,
    project.system.motif ? `- Motif: ${project.system.motif}` : '',
    project.system.imagery ? `- Imagery: ${project.system.imagery}` : '',
    '',
    '## Screens',
    '',
    ...project.boards.filter((board) => !board.hidden).map((board, index) => `- **${board.name}** (${board.width} × ${board.height}) — \`${files[index] ?? ''}\`${board.brief ? `: ${board.brief.replace(/\n+/g, ' ')}` : ''}`),
    '',
    'Colours, fonts, radius and spacing are CSS variables (`--ds-*`) defined in `tokens.css`; change them there.',
    '',
  ];
  return lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
}

/** The prompt handed to a coding agent with an exported design. */
export function handoffPrompt(project: DesignProject, folder: string, files: string[]): string {
  return [
    `Implement the ${project.kind === 'web' ? 'website' : 'app'} design "${project.title}" in this project.`,
    `The design was exported to: ${folder}`,
    `Read DESIGN.md first (design system and screen list), then the screens: ${files.join(', ')}.`,
    'Colours, fonts, radius and spacing are the CSS variables in tokens.css; keep them as design tokens in the codebase.',
    'Follow this project\'s existing stack and conventions, reproduce the layout and copy faithfully, make it responsive, and use real components rather than copying the exported markup verbatim. Tell me what you built and what you assumed.',
  ].join('\n');
}
