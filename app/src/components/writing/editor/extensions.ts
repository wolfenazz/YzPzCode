import { Extension, mergeAttributes, Node } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import { lintText, type LintIssue } from '../../../utils/writing/humanizer';
import { breakerRects } from './pageGeometry';
import {
  BibliographyView,
  CitationView,
  CoverPageView,
  FigureView,
  FootnoteView,
  TableOfContentsView,
} from './nodeViews';

declare module '@tiptap/core' {
  interface Storage {
    writingContext: { workspaceId: string; docDir: string };
  }
  interface Commands<ReturnType> {
    writingBlocks: {
      insertPageBreak: () => ReturnType;
      insertFootnote: (text: string) => ReturnType;
      insertCitation: (keys: string[], locator?: string) => ReturnType;
      insertFigure: (attrs: { src: string | null; caption: string; alt?: string }) => ReturnType;
      insertCaption: (kind: 'table' | 'figure', text: string) => ReturnType;
      insertTableOfContents: () => ReturnType;
      insertBibliography: () => ReturnType;
    };
  }
}

/** Gives node views the workspace and folder of the report they render. */
export const WritingContext = Extension.create<{ workspaceId: string; docDir: string }>({
  name: 'writingContext',
  addOptions: () => ({ workspaceId: '', docDir: '' }),
  addStorage() {
    return { workspaceId: this.options.workspaceId, docDir: this.options.docDir };
  },
});

/** Headings that remember which outline section they start. */
export const SectionHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      sectionId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-section-id'),
        renderHTML: (attributes) => (attributes.sectionId ? { 'data-section-id': attributes.sectionId } : {}),
      },
      unnumbered: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-unnumbered') === 'true',
        renderHTML: (attributes) => (attributes.unnumbered ? { 'data-unnumbered': 'true' } : {}),
      },
    };
  },
}).configure({ levels: [1, 2, 3, 4] });

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', 'data-break-after': '', class: 'wr-page-break' })],
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertPageBreak() };
  },
});

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    text: { default: '' },
    ref: { default: null },
  }),
  parseHTML: () => [{ tag: 'sup[data-footnote]', getAttrs: (element) => ({ text: (element as HTMLElement).getAttribute('data-footnote') ?? '' }) }],
  renderHTML: ({ node }) => ['sup', { 'data-footnote': node.attrs.text, class: 'wr-footnote' }],
  addNodeView: () => ReactNodeViewRenderer(FootnoteView, { as: 'span', className: 'wr-footnote-host' }),
});

export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    keys: {
      default: [],
      parseHTML: (element) => (element.getAttribute('data-keys') ?? '').split(',').filter(Boolean),
      renderHTML: (attributes) => ({ 'data-keys': (attributes.keys as string[]).join(',') }),
    },
    locator: { default: '' },
  }),
  parseHTML: () => [{ tag: 'span[data-citation]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-citation': '', class: 'wr-citation' })],
  addNodeView: () => ReactNodeViewRenderer(CitationView, { as: 'span', className: 'wr-citation-host' }),
});

export const Caption = Node.create({
  name: 'caption',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes: () => ({
    kind: {
      default: 'table',
      parseHTML: (element) => element.getAttribute('data-caption') ?? 'table',
      renderHTML: (attributes) => ({ 'data-caption': attributes.kind }),
    },
  }),
  parseHTML: () => [{ tag: 'p[data-caption]' }],
  renderHTML: ({ HTMLAttributes }) => ['p', mergeAttributes(HTMLAttributes, { class: 'wr-caption' }), 0],
});

export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    src: { default: null },
    alt: { default: '' },
    caption: { default: '' },
    width: { default: 80 },
  }),
  parseHTML: () => [{
    tag: 'figure',
    getAttrs: (element) => {
      const figure = element as HTMLElement;
      const img = figure.querySelector('img');
      return {
        src: img?.getAttribute('src') ?? null,
        alt: img?.getAttribute('alt') ?? '',
        caption: figure.querySelector('figcaption')?.textContent ?? '',
      };
    },
  }],
  renderHTML: ({ node }) => [
    'figure',
    { class: 'wr-figure' },
    ['img', { src: node.attrs.src ?? '', alt: node.attrs.alt }],
    ['figcaption', {}, node.attrs.caption],
  ],
  addNodeView: () => ReactNodeViewRenderer(FigureView, { className: 'wr-figure-host' }),
});

export const TableOfContentsBlock = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'nav[data-toc]' }],
  renderHTML: () => ['nav', { 'data-toc': '', class: 'wr-toc' }],
  addNodeView: () => ReactNodeViewRenderer(TableOfContentsView, { className: 'wr-toc-host', attrs: { 'data-break-after': '', 'data-break-before': '' } }),
});

export const CoverPage = Node.create({
  name: 'coverPage',
  group: 'block',
  atom: true,
  selectable: false,
  parseHTML: () => [{ tag: 'section[data-cover]' }],
  renderHTML: () => ['section', { 'data-cover': '', class: 'wr-cover' }],
  addNodeView: () => ReactNodeViewRenderer(CoverPageView, { className: 'wr-cover-host', attrs: { 'data-break-after': '' } }),
});

export const Bibliography = Node.create({
  name: 'bibliography',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-bibliography]' }],
  renderHTML: () => ['div', { 'data-bibliography': '', class: 'wr-bibliography' }],
  addNodeView: () => ReactNodeViewRenderer(BibliographyView, { className: 'wr-bibliography-host' }),
});

export const WritingCommands = Extension.create({
  name: 'writingBlocks',
  addCommands() {
    return {
      insertPageBreak: () => ({ commands }) => commands.insertContent({ type: 'pageBreak' }),
      insertFootnote: (text) => ({ commands }) => commands.insertContent({ type: 'footnote', attrs: { text } }),
      insertCitation: (keys, locator = '') => ({ commands }) => commands.insertContent({ type: 'citation', attrs: { keys, locator } }),
      insertFigure: (attrs) => ({ commands }) => commands.insertContent({ type: 'figure', attrs: { alt: attrs.caption, ...attrs } }),
      insertCaption: (kind, text) => ({ commands }) => commands.insertContent({ type: 'caption', attrs: { kind }, content: text ? [{ type: 'text', text }] : [] }),
      insertTableOfContents: () => ({ commands }) => commands.insertContent({ type: 'tableOfContents' }),
      insertBibliography: () => ({ commands }) => commands.insertContent({ type: 'bibliography' }),
    };
  },
});

// Streaming lock ------------------------------------------------------------

export const aiStreamKey = new PluginKey<AiStreamState>('wrAiStream');

interface AiStreamState {
  sectionId: string | null;
}

/** Top-level position range of a section: from its heading to the next section heading. */
export function findSectionRange(doc: PmNode, sectionId: string): { from: number; to: number; bodyFrom: number } | null {
  let from = -1;
  let bodyFrom = -1;
  let to = doc.content.size;
  let pos = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const child = doc.child(index);
    if (from < 0) {
      if (child.type.name === 'heading' && child.attrs.sectionId === sectionId) {
        from = pos;
        bodyFrom = pos + child.nodeSize;
      }
    } else if ((child.type.name === 'heading' && child.attrs.sectionId) || child.type.name === 'tableOfContents') {
      to = pos;
      break;
    }
    pos += child.nodeSize;
  }
  return from < 0 ? null : { from, to, bodyFrom };
}

/**
 * While a section streams in, user edits inside it are refused and its
 * blocks get the "being written" treatment; edits elsewhere are untouched.
 */
export const AiStream = Extension.create({
  name: 'aiStream',
  addProseMirrorPlugins() {
    return [
      new Plugin<AiStreamState>({
        key: aiStreamKey,
        state: {
          init: () => ({ sectionId: null }),
          apply: (tr, value) => {
            const meta = tr.getMeta(aiStreamKey) as AiStreamState | undefined;
            return meta ?? value;
          },
        },
        filterTransaction: (tr: Transaction, state: EditorState) => {
          const { sectionId } = aiStreamKey.getState(state) ?? { sectionId: null };
          if (!sectionId || !tr.docChanged || tr.getMeta(aiStreamKey) || tr.getMeta('aiStreamWrite')) return true;
          const range = findSectionRange(state.doc, sectionId);
          if (!range) return true;
          let touches = false;
          tr.steps.forEach((step) => {
            step.getMap().forEach((oldStart, oldEnd) => {
              if (oldStart < range.to && oldEnd > range.bodyFrom - 1) touches = true;
            });
          });
          return !touches;
        },
        props: {
          decorations: (state) => {
            const { sectionId } = aiStreamKey.getState(state) ?? { sectionId: null };
            if (!sectionId) return null;
            const range = findSectionRange(state.doc, sectionId);
            if (!range) return null;
            const decorations: Decoration[] = [];
            let lastFrom = -1;
            let lastTo = -1;
            state.doc.nodesBetween(range.bodyFrom, range.to, (node, pos) => {
              if (pos < range.bodyFrom || !node.isBlock) return false;
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'wr-streaming' }));
              lastFrom = pos;
              lastTo = pos + node.nodeSize;
              return false;
            });
            if (lastFrom >= 0) decorations.push(Decoration.node(lastFrom, lastTo, { class: 'wr-streaming-tail' }));
            decorations.push(Decoration.node(range.from, range.bodyFrom, { class: 'wr-streaming-heading' }));
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

// Humanizer lint --------------------------------------------------------------

export const lintKey = new PluginKey<{ enabled: boolean; phrases: string[]; decorations: DecorationSet }>('wrLint');

function lintDecorations(doc: PmNode, phrases: string[]): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock || node.type.name === 'codeBlock' || node.type.name === 'heading') return node.isBlock;
    const offsets: number[] = [];
    let text = '';
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < (child.text ?? '').length; i += 1) offsets.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        offsets.push(pos + 1 + offset);
        text += ' ';
      }
    });
    if (text.trim().length === 0) return false;
    const { issues } = lintText(text, phrases);
    for (const issue of issues as LintIssue[]) {
      const from = offsets[issue.start];
      const to = (offsets[issue.end - 1] ?? offsets[offsets.length - 1]) + 1;
      if (from === undefined || to <= from) continue;
      if (issue.kind === 'rhythm') {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'wr-lint-rhythm', title: issue.message }));
      } else {
        decorations.push(Decoration.inline(from, to, { class: `wr-lint wr-lint-${issue.kind}`, title: issue.message }));
      }
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Highlights AI-sounding phrases and flat rhythm when the humanizer review is on. */
export const HumanizerLint = Extension.create({
  name: 'humanizerLint',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: lintKey,
        state: {
          init: () => ({ enabled: false, phrases: [] as string[], decorations: DecorationSet.empty }),
          apply: (tr, value, _old, state) => {
            const meta = tr.getMeta(lintKey) as { enabled: boolean; phrases: string[] } | undefined;
            const enabled = meta?.enabled ?? value.enabled;
            const phrases = meta?.phrases ?? value.phrases;
            if (!enabled) return { enabled, phrases, decorations: DecorationSet.empty };
            if (meta || tr.docChanged) return { enabled, phrases, decorations: lintDecorations(state.doc, phrases) };
            return value;
          },
        },
        props: {
          decorations: (state) => lintKey.getState(state)?.decorations ?? null,
        },
      }),
    ];
  },
});

// Page flow -----------------------------------------------------------------

/**
 * Forces breaks around elements marked `data-break-before` / `data-break-after`
 * (cover, table of contents, page breaks, chapter headings). The pagination
 * extension lays pages out with floated "breaker" blocks that push line boxes
 * down; padding an element so its content would start inside a breaker moves
 * that content to the top of the next page.
 */
export const PageFlow = Extension.create<{ sectionBreaks: boolean }>({
  name: 'pageFlow',
  addOptions: () => ({ sectionBreaks: true }),
  addStorage: () => ({ sectionBreaks: true }),
  addProseMirrorPlugins() {
    const storage = this.storage as { sectionBreaks: boolean };
    storage.sectionBreaks = this.options.sectionBreaks;
    return [
      new Plugin({
        key: new PluginKey('wrPageFlow'),
        view: (view: EditorView) => {
          let frame = 0;
          let observer: ResizeObserver | null = null;
          const schedule = (): void => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => layoutBreaks(view, storage.sectionBreaks));
          };
          if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(schedule);
            observer.observe(view.dom);
          }
          schedule();
          return {
            update: schedule,
            destroy: () => {
              cancelAnimationFrame(frame);
              observer?.disconnect();
            },
          };
        },
      }),
    ];
  },
});

/** Space from `y` to the end of its page's content area, or 0 when `y` already starts a page. */
function spaceToPageEnd(y: number, breakers: Array<{ top: number; bottom: number }>, pageTop: number): number {
  const previousEnd = [pageTop, ...breakers.map((breaker) => breaker.bottom)].filter((edge) => edge <= y + 0.5).pop() ?? pageTop;
  if (y - previousEnd < 2) return 0;
  const next = breakers.find((breaker) => breaker.top > y);
  return next ? Math.max(0, next.top - y + 1) : 0;
}

let layoutDepth = 0;

function layoutBreaks(view: EditorView, sectionBreaks: boolean): void {
  const root = view.dom as HTMLElement;
  if (!root.isConnected || root.offsetParent === null) return;
  const pagination = root.querySelector<HTMLElement>('[data-rm-pagination]');
  if (!pagination) return;
  const firstHeader = root.querySelector<HTMLElement>('.rm-first-page-header');
  const pageTop = (firstHeader ? firstHeader.getBoundingClientRect().bottom : root.getBoundingClientRect().top);
  // Rects are in screen pixels; padding is in CSS pixels (they differ when the page is zoomed).
  const scale = root.offsetWidth > 0 ? root.getBoundingClientRect().width / root.offsetWidth : 1;

  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-break-before], [data-break-after], h1[data-section-id]'))
    .filter((element) => element.parentElement === root);
  let changed = false;
  let firstSection = true;
  for (const element of targets) {
    const isSectionHeading = element.tagName === 'H1';
    const breakBefore = element.hasAttribute('data-break-before') || (isSectionHeading && sectionBreaks && !firstSection);
    if (isSectionHeading) firstSection = false;
    const breakers = breakerRects(root);
    if (breakBefore) {
      const current = parseFloat(element.style.paddingTop) || 0;
      const top = element.getBoundingClientRect().top;
      const needed = Math.round(spaceToPageEnd(top, breakers, pageTop) / scale);
      if (Math.abs(needed - current) > 1) {
        element.style.paddingTop = needed > 0 ? `${needed}px` : '';
        changed = true;
      }
    } else if (element.style.paddingTop) {
      element.style.paddingTop = '';
      changed = true;
    }
    if (element.hasAttribute('data-break-after')) {
      const current = parseFloat(element.style.paddingBottom) || 0;
      const contentBottom = element.getBoundingClientRect().bottom - current * scale;
      const needed = Math.round(spaceToPageEnd(contentBottom, breakerRects(root), pageTop) / scale);
      if (Math.abs(needed - current) > 1) {
        element.style.paddingBottom = needed > 0 ? `${needed}px` : '';
        changed = true;
      }
    }
  }
  // Let the pagination extension recount pages after the layout moved.
  if (changed && layoutDepth < 4) {
    layoutDepth += 1;
    view.dispatch(view.state.tr.setMeta('addToHistory', false).setMeta('wrPageFlow', true));
    layoutDepth -= 1;
  }
}
