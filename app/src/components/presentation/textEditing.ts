// In-place text editing: a text body becomes contentEditable HTML laid over
// the slide (one block per paragraph, one span per run, sizes scaled to the
// screen), and the edited DOM becomes a text body again. Paragraph settings
// (bullets, indents, spacing) come from the paragraph each block started
// from; run styles are read from the rendered DOM, so bold, italic,
// underline, colour, size and font applied to a selection carry over.

import { numberLabel, type TxBody, type TxPara, type TxRun } from '../../utils/presentation/slideModel';
import { fontStack } from '../../utils/presentation/slideModel';

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runCss(run: TxRun, scale: number, fs: number): string {
  const parts = [
    `font-family:${fontStack(run.f).replace(/"/g, "'")}`,
    `font-size:${(run.sz * fs * scale).toFixed(2)}px`,
    `color:${run.c ?? 'transparent'}`,
  ];
  if (run.a !== undefined && run.a < 1) parts.push(`opacity:${run.a}`);
  if (run.b) parts.push('font-weight:700');
  if (run.i) parts.push('font-style:italic');
  const deco = [run.u ? 'underline' : '', run.s ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) parts.push(`text-decoration:${deco}`);
  if (run.cap === 'all') parts.push('text-transform:uppercase');
  if (run.sp) parts.push(`letter-spacing:${(run.sp * scale).toFixed(2)}px`);
  return parts.join(';');
}

/** The editor's HTML for a body, at `scale` screen px per slide px. */
export function bodyToHtml(body: TxBody, scale: number): string {
  const fs = body.fs ?? 1;
  const counters = new Map<number, number>();
  return body.p.map((para, index) => {
    const first = para.r.find((run) => run.t && run.t !== '\n');
    const size = (first?.sz ?? para.esz ?? 18) * fs;
    const lineHeight = para.ls !== undefined && para.ls < 0 ? `${(-para.ls * scale).toFixed(2)}px` : String(1.2 * (para.ls ?? 1));
    const css = [
      `text-align:${para.al === 'c' ? 'center' : para.al === 'r' ? 'right' : para.al === 'j' ? 'justify' : 'left'}`,
      `padding-left:${((para.ml ?? 0) * scale).toFixed(2)}px`,
      `text-indent:${((para.ind ?? 0) * scale).toFixed(2)}px`,
      `line-height:${lineHeight}`,
      `margin:${(index > 0 ? (para.sb ?? 0) * scale : 0).toFixed(2)}px 0 ${((para.sa ?? 0) * scale).toFixed(2)}px`,
      `font-size:${(size * scale).toFixed(2)}px`,
    ];
    let bullet = '';
    if (para.bu && first) {
      const level = para.lv ?? 0;
      let label = para.bu.ch ?? '•';
      if (para.bu.num) {
        const value = (counters.get(level) ?? (para.bu.start ?? 1) - 1) + 1;
        counters.set(level, value);
        label = numberLabel(para.bu.num, value);
      }
      bullet = ` data-bullet="${escapeHtml(label)}" style="--bullet-color:${para.bu.c ?? first.c ?? 'currentColor'}"`;
    }
    const runs = para.r.map((run) => (run.t === '\n' ? '<br>' : `<span style="${escapeHtml(runCss(run, scale, fs))}">${escapeHtml(run.t)}</span>`)).join('');
    const empty = !para.r.some((run) => run.t && run.t !== '\n');
    const emptyStyle = empty ? `<span style="${escapeHtml(runCss({ t: '', sz: para.esz ?? 18, f: para.ef ?? first?.f ?? 'Calibri', c: para.ec ?? '#000000' }, scale, fs))}"><br></span>` : '';
    return `<div data-p="${index}" style="${css.join(';')}"${bullet}>${empty ? emptyStyle : runs}</div>`;
  }).join('');
}

/** A text body with an empty paragraph, styled like `like` (for shapes that had no text). */
export function emptyBody(like: { font: string; size: number; color: string; align?: TxPara['al'] }): TxBody {
  return { p: [{ r: [], al: like.align ?? 'c', esz: like.size, ef: like.font, ec: like.color }], ins: [9.6, 4.8, 9.6, 4.8], anc: 'ctr', wrap: true };
}

function rgbToHex(value: string): { c: string; a?: number } | null {
  const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (!match) return null;
  const c = `#${[match[1], match[2], match[3]].map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  const a = match[4] !== undefined ? Number(match[4]) : undefined;
  if (a === 0) return null;
  return a !== undefined && a < 1 ? { c, a } : { c };
}

const firstFamily = (value: string): string => value.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || 'Calibri';

function decorations(node: Element, root: HTMLElement): { u: boolean; s: boolean } {
  let u = false;
  let s = false;
  for (let el: Element | null = node; el && el !== root.parentElement; el = el.parentElement) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'u') u = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') s = true;
    const line = getComputedStyle(el).textDecorationLine;
    if (line.includes('underline')) u = true;
    if (line.includes('line-through')) s = true;
    if (el === root) break;
  }
  return { u, s };
}

function styleRun(text: string, element: Element, root: HTMLElement, scale: number, fs: number): TxRun {
  const style = getComputedStyle(element);
  const run: TxRun = { t: text, sz: Number.parseFloat(style.fontSize) / scale / fs, f: firstFamily(style.fontFamily) };
  const color = rgbToHex(style.color);
  if (color) { run.c = color.c; if (color.a !== undefined) run.a = color.a; }
  const opacity = Number(style.opacity);
  if (opacity < 1 && run.c) run.a = opacity;
  if (Number(style.fontWeight) >= 600 || style.fontWeight === 'bold') run.b = true;
  if (style.fontStyle === 'italic' || style.fontStyle === 'oblique') run.i = true;
  const { u, s } = decorations(element, root);
  if (u) run.u = true;
  if (s) run.s = true;
  if (style.textTransform === 'uppercase') run.cap = 'all';
  const spacing = Number.parseFloat(style.letterSpacing);
  if (spacing) run.sp = spacing / scale;
  // Round sizes to half points (at 96 px per inch, 1 pt = 4/3 px).
  run.sz = Math.round(run.sz * 0.75 * 2) / 2 / 0.75;
  return run;
}

const sameStyle = (a: TxRun, b: TxRun): boolean => a.sz === b.sz && a.f === b.f && a.c === b.c && a.a === b.a && Boolean(a.b) === Boolean(b.b)
  && Boolean(a.i) === Boolean(b.i) && Boolean(a.u) === Boolean(b.u) && Boolean(a.s) === Boolean(b.s) && a.cap === b.cap && a.sp === b.sp && a.bl === b.bl;

/** Reads the edited DOM back into a body, keeping the original's box settings. */
export function htmlToBody(root: HTMLElement, original: TxBody, scale: number): TxBody {
  const fs = original.fs ?? 1;
  const paragraphs: TxPara[] = [];
  const blocks: Array<{ el: HTMLElement | null; nodes: Node[] }> = [];
  let loose: Node[] = [];
  for (const child of Array.from(root.childNodes)) {
    const isBlock = child.nodeType === 1 && /^(div|p|li|h[1-6])$/i.test((child as Element).tagName);
    if (isBlock) {
      if (loose.length) { blocks.push({ el: null, nodes: loose }); loose = []; }
      blocks.push({ el: child as HTMLElement, nodes: Array.from(child.childNodes) });
    } else loose.push(child);
  }
  if (loose.length) blocks.push({ el: null, nodes: loose });

  let previous: TxPara | null = null;
  for (const block of blocks) {
    const index = Number(block.el?.getAttribute('data-p'));
    const template: TxPara = (Number.isInteger(index) ? original.p[index] : undefined) ?? previous ?? original.p[original.p.length - 1] ?? { r: [] };
    const runs: TxRun[] = [];
    let lastStyled: TxRun | null = null;
    const walk = (node: Node): void => {
      if (node.nodeType === 3) {
        const text = (node.textContent ?? '').replace(/ /g, ' ').replace(/​/g, '');
        if (!text) return;
        const run = styleRun(text, node.parentElement ?? root, root, scale, fs);
        lastStyled = run;
        const last = runs[runs.length - 1];
        if (last && last.t !== '\n' && sameStyle(last, run)) last.t += text;
        else runs.push(run);
      } else if (node.nodeType === 1) {
        const element = node as Element;
        if (element.tagName.toLowerCase() === 'br') {
          // A trailing <br> only keeps an empty block open.
          const isLast = !element.nextSibling && (element.parentElement === block.el || element.parentElement?.parentElement === block.el);
          if (!isLast) runs.push({ ...(lastStyled ?? styleRun('', element.parentElement ?? root, root, scale, fs)), t: '\n' });
          return;
        }
        for (const child of Array.from(element.childNodes)) walk(child);
      }
    };
    for (const node of block.nodes) walk(node);
    const align = block.el?.style.textAlign;
    const para: TxPara = { ...template, r: runs };
    if (align) para.al = align === 'center' ? 'c' : align === 'right' ? 'r' : align === 'justify' ? 'j' : 'l';
    if (block.el && block.el.hasAttribute('data-nobullet')) delete para.bu;
    if (runs.length === 0) {
      const holder = block.el?.querySelector('span') ?? block.el ?? root;
      const style = styleRun('', holder, root, scale, fs);
      para.esz = style.sz;
      para.ef = style.f;
      if (style.c) para.ec = style.c;
    } else {
      para.esz = runs[0].sz;
      para.ef = runs[0].f;
    }
    paragraphs.push(para);
    previous = para;
  }
  if (paragraphs.length === 0) paragraphs.push({ ...(original.p[0] ?? {}), r: [] });
  return { ...original, p: paragraphs };
}

/** Applies a font size (px, on screen) to the current selection inside an editor. */
export function applySelectionSize(editor: HTMLElement, sizePx: number): void {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand('fontSize', false, '7');
  for (const font of Array.from(editor.querySelectorAll('font[size="7"]'))) {
    const span = document.createElement('span');
    span.style.fontSize = `${sizePx}px`;
    while (font.firstChild) span.appendChild(font.firstChild);
    font.replaceWith(span);
  }
}

/** Applies a font family to the current selection inside an editor. */
export function applySelectionFont(editor: HTMLElement, family: string): void {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand('fontName', false, '__yzpz_font__');
  for (const font of Array.from(editor.querySelectorAll('font[face="__yzpz_font__"]'))) {
    const span = document.createElement('span');
    span.style.fontFamily = fontStack(family);
    while (font.firstChild) span.appendChild(font.firstChild);
    font.replaceWith(span);
  }
}

/** Whether the selection sits inside `editor`. */
export function selectionInside(editor: HTMLElement | null): boolean {
  const selection = window.getSelection();
  return Boolean(editor && selection && selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).commonAncestorContainer));
}
