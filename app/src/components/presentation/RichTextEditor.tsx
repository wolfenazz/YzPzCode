import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { bulletIndent, markerText, paraCss, runCss, textBoxCss, type El, type RenderPara } from '../../utils/presentation/render';
import { mergeRuns } from '../../utils/presentation/richText';
import { normalizeHex } from '../../utils/presentation/themes';
import type { RichPara, TextRun } from '../../utils/presentation/types';

type TextEl = Extract<El, { kind: 'text' }>;

const styleText = (css: Record<string, string | number>): string =>
  Object.entries(css).map(([key, value]) => `${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}:${value}`).join(';').replace(/"/g, '&quot;');

const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runHtml(run: TextRun): string {
  const style = styleText(runCss(run));
  const body = escape(run.text).replace(/\n/g, '<br>');
  return style ? `<span style="${style}">${body}</span>` : body;
}

function paraHtml(el: TextEl, para: RenderPara, last: boolean): string {
  const level = para.level ?? 0;
  const body = para.runs.map(runHtml).join('') || '<br>';
  return `<p data-level="${level}" style="${styleText(paraCss(el, para, last))}">${body}</p>`;
}

function rgbToHex(value: string): string | null {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value.trim());
  if (!match) return normalizeHex(value);
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

/** Reads runs out of edited DOM: b/strong, i/em, colour spans and <font color>. */
function collectRuns(node: Node, style: Omit<TextRun, 'text'>, base: string, out: TextRun[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/ /g, ' ').replace(/​/g, '');
    if (text) out.push({ text, ...style });
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.tagName === 'BR') {
    if (node.nextSibling) out.push({ text: '\n', ...style });
    return;
  }
  const next = { ...style };
  const tag = node.tagName;
  if (tag === 'B' || tag === 'STRONG') next.bold = true;
  if (tag === 'I' || tag === 'EM') next.italic = true;
  const weight = node.style.fontWeight;
  if (weight === 'bold' || Number(weight) >= 600) next.bold = true;
  else if (weight === 'normal' || (weight && Number(weight) < 600)) delete next.bold;
  if (node.style.fontStyle === 'italic') next.italic = true;
  else if (node.style.fontStyle === 'normal') delete next.italic;
  const color = node.getAttribute('color') ?? node.style.color;
  if (color) {
    const hex = rgbToHex(color);
    if (hex && hex !== base) next.color = hex;
    else delete next.color;
  }
  node.childNodes.forEach((child) => collectRuns(child, next, base, out));
}

export function domToParas(root: HTMLElement, baseColor: string): RichPara[] {
  const base = rgbToHex(baseColor) ?? '';
  const blocks = Array.from(root.children).filter((child) => child.tagName === 'P' || child.tagName === 'DIV') as HTMLElement[];
  const sources: HTMLElement[] = blocks.length > 0 ? blocks : [root];
  return sources.map((block) => {
    const runs: TextRun[] = [];
    collectRuns(block, {}, base, runs);
    const level = Number(block.dataset.level ?? 0) > 0 ? 1 : 0;
    return { runs: mergeRuns(runs.map((run) => ({ ...run, text: run.text }))), ...(level ? { level } : {}) };
  }).filter((item, index, all) => item.runs.some((run) => run.text.trim()) || (index > 0 && index < all.length - 1));
}

interface RichTextEditorProps {
  el: TextEl;
  onCommit: (items: RichPara[]) => void;
  onDone: () => void;
}

/** In-place editing of a text slot: bold, italic and colour only. */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({ el, onCommit, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);
  const committed = useRef(false);
  const dirty = useRef(false);
  const latest = useRef({ el, onCommit, onDone });
  latest.current = { el, onCommit, onDone };

  const renumber = (): void => {
    const root = ref.current?.firstElementChild as HTMLElement | null;
    if (!root || !latest.current.el.list) return;
    let counter = -1;
    Array.from(root.children).forEach((child) => {
      const block = child as HTMLElement;
      const level = Number(block.dataset.level ?? 0) > 0 ? 1 : 0;
      if (!level) counter += 1;
      const { el: current } = latest.current;
      block.dataset.marker = markerText(current, counter, { runs: [], level });
      block.style.paddingLeft = `${bulletIndent(current.style, level)}pt`;
      block.style.setProperty('--pr-marker-left', `${bulletIndent(current.style, level) - current.style.size * 1.1}pt`);
    });
  };

  useLayoutEffect(() => {
    const root = ref.current?.firstElementChild as HTMLElement | null;
    if (!root) return;
    const paras = el.paras.length > 0 ? el.paras : [{ runs: [] }];
    root.innerHTML = paras.map((para, index) => paraHtml(el, para, index === paras.length - 1)).join('');
    renumber();
    root.focus();
    // Caret at the end.
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Only on mount: the editor owns the DOM while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (): void => {
    if (committed.current) return;
    committed.current = true;
    const root = ref.current?.firstElementChild as HTMLElement | null;
    if (root && dirty.current) latest.current.onCommit(domToParas(root, latest.current.el.style.color));
  };

  // Unmounting mid-edit (switching slides) keeps what was typed.
  useEffect(() => () => { if (dirty.current) commit(); }, []);

  const setLevel = (delta: number): void => {
    const selection = window.getSelection();
    const root = ref.current?.firstElementChild as HTMLElement | null;
    if (!selection || !root || !latest.current.el.list) return;
    let node: Node | null = selection.anchorNode;
    while (node && node.parentNode !== root) node = node.parentNode;
    if (!(node instanceof HTMLElement)) return;
    const level = Math.max(0, Math.min(1, Number(node.dataset.level ?? 0) + delta));
    node.dataset.level = String(level);
    node.style.fontSize = level ? `${Math.round(latest.current.el.style.size * 0.88 * 2) / 2}pt` : '';
    dirty.current = true;
    renumber();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    event.stopPropagation();
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape') {
      event.preventDefault();
      commit();
      onDone();
    } else if (event.key === 'Tab' && el.list) {
      event.preventDefault();
      setLevel(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Enter' && !el.list && el.paras.length <= 1 && !event.shiftKey && (el.style.size >= 24)) {
      // Titles stay one paragraph: Enter finishes editing.
      event.preventDefault();
      commit();
      onDone();
    } else if (mod && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      dirty.current = true;
      document.execCommand('bold');
    } else if (mod && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      dirty.current = true;
      document.execCommand('italic');
    } else if (mod && event.key.toLowerCase() === 'u') {
      event.preventDefault();
    }
  };

  const onPaste = (event: React.ClipboardEvent): void => {
    // Plain text only: formatting comes from the theme.
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  return (
    <div ref={ref} className="pr-editing" style={textBoxCss(el) as React.CSSProperties} data-list={el.list ?? undefined}>
      <div
        contentEditable
        suppressContentEditableWarning
        spellCheck
        className="pr-editing__root"
        onKeyDown={onKeyDown}
        onInput={() => { dirty.current = true; renumber(); }}
        onPaste={onPaste}
        onBlur={() => { commit(); onDone(); }}
        onMouseDown={(event) => event.stopPropagation()}
      />
    </div>
  );
};

/** Applies bold, italic or a colour to the current selection inside an editor. */
export function formatSelection(command: 'bold' | 'italic' | 'color', value?: string): void {
  if (command === 'color') document.execCommand('foreColor', false, value ?? '#000000');
  else document.execCommand(command);
}
