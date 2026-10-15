import { emailMarkup, tokenValues } from '../../utils/design/inlineCss';
import { applySvgTweaks } from '../../utils/design/svgTweaks';
import { tweakAttributes, tweakVariables } from '../../utils/design/tweaks';
import { invoke } from '@tauri-apps/api/core';
import { bundledFontFaceCss } from '../../utils/bundledFonts';
import { boardFileNames, designMarkdown, numberedNames, printPagesHtml, standaloneBoardHtml } from '../../utils/design/export';
import { joinPath } from '../../utils/design/project';
import { tokensToCss } from '../../utils/design/tokensCss';
import type { Board, DesignProject, DesignTokens } from '../../utils/design/types';
import { base64ToBytes, writeFileBytes } from '../../utils/presentation/assets';
import { isRtlLanguage, languageTag } from '../../utils/writing/rtl';

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

export type ImageFormat = 'png' | 'jpg';

const toBytes = (text: string): Uint8Array => new TextEncoder().encode(text);

async function dataUrlOf(path: string): Promise<string> {
  const raw = await invoke<string>('read_file_as_base64', { path });
  if (raw.startsWith('data:')) return raw;
  const extension = path.split('.').pop()?.toLowerCase() ?? 'png';
  return `data:${MIME[extension] ?? 'image/png'};base64,${raw}`;
}

/** Every `assets/…` reference in a drawing replaced by the picture itself, so the result stands alone. */
async function inlineAssets(source: string, projectDir: string): Promise<string> {
  const paths = Array.from(new Set(Array.from(source.matchAll(/assets\/[\w@%+.\-/ ]+/g)).map((match) => match[0])));
  const urls = new Map<string, string>();
  await Promise.all(paths.map(async (path) => {
    try {
      urls.set(path, await dataUrlOf(joinPath(projectDir, path)));
    } catch {
      /* the reference stays; the picture is simply missing */
    }
  }));
  return source.replace(/assets\/[\w@%+.\-/ ]+/g, (path) => urls.get(path) ?? path);
}

async function fontCssFor(tokens: DesignTokens): Promise<string> {
  try {
    return await bundledFontFaceCss([tokens.fonts.heading, tokens.fonts.body]);
  } catch {
    return '';
  }
}

const photosToNothing = (source: string): string => source.replace(/(src|href)="photo:[^"]*"/g, '$1=""');

/** One board as an SVG image (the HTML inside a foreignObject) ready to be drawn onto a canvas. */
async function boardAsSvgImage(board: Board, tokens: DesignTokens, projectDir: string): Promise<string> {
  const fontCss = await fontCssFor(tokens);
  const baseSource = board.format === 'svg' ? applySvgTweaks(board.source, board.tweaks, board.tweakValues) : board.source;
  const inlined = photosToNothing(await inlineAssets(baseSource, projectDir));
  if (board.format === 'svg') {
    const doc = new DOMParser().parseFromString(inlined, 'image/svg+xml');
    const root = doc.documentElement;
    if (fontCss) {
      const style = doc.createElementNS(SVG_NS, 'style');
      style.textContent = fontCss;
      root.insertBefore(style, root.firstChild);
    }
    root.setAttribute('width', String(board.width));
    root.setAttribute('height', String(board.height));
    return new XMLSerializer().serializeToString(root);
  }
  const html = new DOMParser().parseFromString(`<!doctype html><html><body>${inlined}</body></html>`, 'text/html');
  const serializer = new XMLSerializer();
  const styles = Array.from(html.querySelectorAll('style')).map((style) => {
    const css = style.textContent ?? '';
    style.remove();
    return css;
  });
  const content = Array.from(html.body.childNodes).map((node) => serializer.serializeToString(node)).join('');
  // A dark board is drawn with the dark palette; its tweaks sit on the root like they do in the frame.
  const effective: DesignTokens = board.theme === 'dark' && tokens.darkPalette ? { ...tokens, palette: tokens.darkPalette, darkPalette: undefined } : tokens;
  const tweakAttrs = Object.entries(tweakAttributes(board.tweaks ?? [], board.tweakValues ?? {})).map(([name, value]) => ` ${name}="${value}"`).join('');
  const tweakVars = Object.entries(tweakVariables(board.tweaks ?? [], board.tweakValues ?? {})).map(([name, value]) => `${name}:${value};`).join('');
  const rules = [
    fontCss,
    tokensToCss(effective).replace(':root', '.yzb'),
    `.yzb,.yzb *{box-sizing:border-box}.yzb{width:${board.width}px;min-height:${board.height}px;background:var(--ds-background);color:var(--ds-text);font-family:var(--ds-font-body);font-size:var(--ds-size-body);line-height:1.5}.yzb img{max-width:100%}`,
    ...styles,
  ].join('\n');
  return `<svg xmlns="${SVG_NS}" width="${board.width}" height="${board.height}" viewBox="0 0 ${board.width} ${board.height}"><foreignObject x="0" y="0" width="${board.width}" height="${board.height}"><div xmlns="${XHTML_NS}" class="yzb"${tweakAttrs} style="overflow:hidden;height:${board.height}px;${tweakVars}"><style>${rules.replace(/<\//g, '<\\/')}</style>${content}</div></foreignObject></svg>`;
}

/** Renders a board to PNG or JPEG bytes at `scale` times its size. */
export async function renderBoard(board: Board, tokens: DesignTokens, projectDir: string, scale: number, format: ImageFormat): Promise<Uint8Array> {
  const svg = await boardAsSvgImage(board, tokens, projectDir);
  const image = new Image();
  image.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`"${board.name}" could not be rendered.`));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(board.width * scale);
  canvas.height = Math.round(board.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A canvas could not be created.');
  if (format === 'jpg') {
    context.fillStyle = tokens.palette.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92));
  if (!blob) throw new Error('The image could not be encoded.');
  return new Uint8Array(await blob.arrayBuffer());
}

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export interface ExportResult {
  folder: string;
  files: string[];
}

export async function exportImages(project: DesignProject, boards: Board[], projectDir: string, scale: number, format: ImageFormat, onProgress?: (done: number) => void): Promise<ExportResult> {
  const folder = joinPath(projectDir, 'exports', `${stamp()}-${format}`);
  const names = numberedNames(boards);
  const files: string[] = [];
  for (let index = 0; index < boards.length; index += 1) {
    const bytes = await renderBoard(boards[index], project.system, projectDir, scale, format);
    const name = `${names[index]}${scale === 1 ? '' : `@${scale}x`}.${format}`;
    await writeFileBytes(joinPath(folder, name), bytes);
    files.push(name);
    onProgress?.(index + 1);
  }
  return { folder, files };
}

export async function exportPdf(project: DesignProject, boards: Board[], projectDir: string, onProgress?: (done: number) => void): Promise<ExportResult> {
  const folder = joinPath(projectDir, 'exports');
  const pages: Array<{ width: number; height: number; src: string; name: string }> = [];
  for (let index = 0; index < boards.length; index += 1) {
    const bytes = await renderBoard(boards[index], project.system, projectDir, 2, 'png');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    pages.push({ width: boards[index].width, height: boards[index].height, src: `data:image/png;base64,${btoa(binary)}`, name: boards[index].name });
    onProgress?.(index + 1);
  }
  const file = `${stamp()}-${boardFileNames([{ name: project.title }])[0]}.pdf`;
  const written = await invoke<boolean>('export_writing_pdf', { html: printPagesHtml(project.title, pages), outputPath: joinPath(folder, file) });
  if (!written) throw new Error('The PDF was not written.');
  return { folder, files: [file] };
}

/** Standalone SVG files, one per graphic board. */
export async function exportSvgs(project: DesignProject, boards: Board[], projectDir: string): Promise<ExportResult> {
  const folder = joinPath(projectDir, 'exports', `${stamp()}-svg`);
  const names = numberedNames(boards);
  const files: string[] = [];
  for (let index = 0; index < boards.length; index += 1) {
    if (boards[index].format !== 'svg') continue;
    const svg = await boardAsSvgImage(boards[index], project.system, projectDir);
    const name = `${names[index]}.svg`;
    await writeFileBytes(joinPath(folder, name), toBytes(svg));
    files.push(name);
  }
  return { folder, files };
}

/** HTML screens with tokens.css, copied assets and a DESIGN.md: what a developer or a coding agent starts from. */
/** Email HTML: one file per email board, styles inlined, variables written out; pictures copied beside it. */
export async function exportEmail(project: DesignProject, boards: Board[], projectDir: string): Promise<ExportResult> {
  const folder = joinPath(projectDir, 'exports', `${stamp()}-email`);
  const names = boardFileNames(boards);
  const rtl = isRtlLanguage(project.language) || /[֐-ࣿ]/.test(project.prompt);
  const lang = languageTag(project.language, rtl ? 'ar' : 'en-US');
  const files: string[] = [];
  const copied = new Set<string>();
  for (let index = 0; index < boards.length; index += 1) {
    const board = boards[index];
    if (board.format !== 'html') continue;
    const markup = emailMarkup(photosToNothing(board.source), project.system);
    const head = /^(<style>[\s\S]*?<\/style>)/.exec(markup)?.[1] ?? '';
    const body = head ? markup.slice(head.length) : markup;
    const title = board.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const html = [
      `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">`,
      `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${head}</head>`,
      `<body style="margin:0;padding:0;background:${project.system.palette.background};color:${project.system.palette.text};font-family:${tokenValues(project.system)['--ds-font-body']}">`,
      `<div style="max-width:${board.width}px;margin:0 auto">${body}</div></body></html>`,
    ].join('\n');
    const name = `${names[index]}.html`;
    await writeFileBytes(joinPath(folder, name), toBytes(html));
    files.push(name);
    for (const match of board.source.matchAll(/assets\/[\w@%+.\-/ ]+/g)) copied.add(match[0]);
  }
  for (const path of copied) {
    try {
      const raw = await invoke<string>('read_file_as_base64', { path: joinPath(projectDir, path) });
      await writeFileBytes(joinPath(folder, path), base64ToBytes(raw.includes(',') ? raw.split(',')[1] : raw));
    } catch {
      /* a missing picture is left out */
    }
  }
  return { folder, files };
}

export async function exportCode(project: DesignProject, boards: Board[], projectDir: string): Promise<ExportResult> {
  const folder = joinPath(projectDir, 'exports', `${stamp()}-code`);
  const names = boardFileNames(boards);
  const rtl = isRtlLanguage(project.language) || /[֐-ࣿ]/.test(project.prompt);
  const lang = languageTag(project.language, rtl ? 'ar' : 'en-US');
  const fontCss = await fontCssFor(project.system);
  const files: string[] = [];
  const copied = new Set<string>();
  for (let index = 0; index < boards.length; index += 1) {
    const board = boards[index];
    if (board.format !== 'html') continue;
    const name = `${names[index]}.html`;
    const html = standaloneBoardHtml({ ...board, source: photosToNothing(board.source) }, project.system, { fontCss, lang, dir: rtl ? 'rtl' : 'ltr', tokensHref: 'tokens.css' });
    await writeFileBytes(joinPath(folder, name), toBytes(html));
    files.push(name);
    for (const match of board.source.matchAll(/assets\/[\w@%+.\-/ ]+/g)) copied.add(match[0]);
  }
  for (const path of copied) {
    try {
      const raw = await invoke<string>('read_file_as_base64', { path: joinPath(projectDir, path) });
      await writeFileBytes(joinPath(folder, path), base64ToBytes(raw.includes(',') ? raw.split(',')[1] : raw));
    } catch {
      /* a missing picture is left out */
    }
  }
  await writeFileBytes(joinPath(folder, 'tokens.css'), toBytes(`${tokensToCss(project.system)}\n`));
  await writeFileBytes(joinPath(folder, 'DESIGN.md'), toBytes(designMarkdown(project, files)));
  return { folder, files: [...files, 'tokens.css', 'DESIGN.md'] };
}
