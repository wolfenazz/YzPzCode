import { Extension, mergeAttributes, Node } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import { lintText, type LintIssue } from '../../../utils/writing/humanizer';
import { spaceToPageEnd } from '../../../utils/writing/pageFlow';
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
    /** Search words for a web photo the writer asked for; cleared once a picture is in. */
    query: { default: null },
    /** Credit line of a web photo ("Photo: Ann Lee / Unsplash"). */
    credit: { default: '' },
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
        credit: figure.getAttribute('data-credit') ?? '',
      };
    },
  }],
  renderHTML: ({ node }) => [
    'figure',
    { class: 'wr-figure', 'data-credit': node.attrs.credit || null },
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

function lintDecorations(doc: PmNode, phrases: string[], from = 0, to = doc.content.size): Decoration[] {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
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
  return decorations;
}

/** The top-level blocks a transaction touched, in the new document; null when no text moved. */
function changedBlocks(tr: Transaction): { from: number; to: number } | null {
  let from = Infinity;
  let to = -Infinity;
  tr.mapping.maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      from = Math.min(from, rest.map(newStart, -1));
      to = Math.max(to, rest.map(newEnd, 1));
    });
  });
  if (from > to) return null;
  const { doc } = tr;
  const $from = doc.resolve(Math.max(0, Math.min(from, doc.content.size)));
  const $to = doc.resolve(Math.max(0, Math.min(to, doc.content.size)));
  return {
    from: $from.depth > 0 ? $from.before(1) : $from.pos,
    to: $to.depth > 0 ? $to.after(1) : $to.pos,
  };
}

/** Maps the lint marks through `tr` and checks again only the blocks it changed (keeps streaming cheap). */
function updateLint(previous: DecorationSet, tr: Transaction, phrases: string[]): DecorationSet {
  const range = changedBlocks(tr);
  const mapped = previous.map(tr.mapping, tr.doc);
  if (!range) return mapped;
  // `find` also returns marks that only touch the range (a neighbour's block mark): keep those.
  const stale = mapped.find(range.from, range.to).filter((decoration) => decoration.from < range.to && decoration.to > range.from);
  return mapped
    .remove(stale)
    .add(tr.doc, lintDecorations(tr.doc, phrases, range.from, range.to));
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
            if (meta) return { enabled, phrases, decorations: DecorationSet.create(state.doc, lintDecorations(state.doc, phrases)) };
            if (tr.docChanged) return { enabled, phrases, decorations: updateLint(value.decorations, tr, phrases) };
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
 *
 * The padding is a node decoration, so ProseMirror owns it. (Writing it straight
 * onto the DOM made ProseMirror treat it as a foreign edit and redraw the node
 * without it: the document lost pages, the padding came back, and the pages and
 * scrollbar flickered for ever.)
 */
interface PagePad {
  pos: number;
  top: number;
  bottom: number;
}

const pageFlowKey = new PluginKey<DecorationSet>('wrPageFlow');

function padDecorations(doc: PmNode, pads: PagePad[]): DecorationSet {
  const decorations: Decoration[] = [];
  for (const { pos, top, bottom } of pads) {
    const node = doc.nodeAt(pos);
    const style = [top > 0 ? `padding-top: ${top}px` : '', bottom > 0 ? `padding-bottom: ${bottom}px` : ''].filter(Boolean).join('; ');
    if (node && style) decorations.push(Decoration.node(pos, pos + node.nodeSize, { style }));
  }
  return DecorationSet.create(doc, decorations);
}

export const PageFlow = Extension.create<{ sectionBreaks: boolean }>({
  name: 'pageFlow',
  addOptions: () => ({ sectionBreaks: true }),
  addStorage: () => ({ sectionBreaks: true }),
  addProseMirrorPlugins() {
    const storage = this.storage as { sectionBreaks: boolean };
    storage.sectionBreaks = this.options.sectionBreaks;
    return [
      new Plugin<DecorationSet>({
        key: pageFlowKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const pads = tr.getMeta(pageFlowKey) as PagePad[] | undefined;
            if (pads) return padDecorations(tr.doc, pads);
            return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
          },
        },
        props: {
          decorations: (state) => pageFlowKey.getState(state),
        },
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

  const targets: Array<{ element: HTMLElement; pos: number }> = [];
  view.state.doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom instanceof HTMLElement && dom.parentElement === root && dom.matches('[data-break-before], [data-break-after], h1[data-section-id]')) {
      targets.push({ element: dom, pos: offset });
    }
  });
  // The breakers are floats at the top of the editor: padding the text never moves them.
  const breakers = breakerRects(root);
  const pads: PagePad[] = [];
  let changed = false;
  let firstSection = true;
  // Each padding moves everything after it, so it is written as it is measured; ProseMirror
  // must not see these writes (it would redraw the nodes). The decorations dispatched
  // below carry the same values, so later redraws keep them.
  const observer = (view as unknown as { domObserver?: { stop: () => void; start: () => void } }).domObserver;
  observer?.stop();
  try {
    for (const { element, pos } of targets) {
      const isSectionHeading = element.tagName === 'H1';
      const breakBefore = element.hasAttribute('data-break-before') || (isSectionHeading && sectionBreaks && !firstSection);
      if (isSectionHeading) firstSection = false;
      let top = 0;
      if (breakBefore) {
        const current = parseFloat(element.style.paddingTop) || 0;
        const space = spaceToPageEnd(element.getBoundingClientRect().top, breakers, pageTop);
        // Past the last page: keep the padding until the pagination has added pages.
        top = space === null ? current : Math.round(space / scale);
        if (Math.abs(top - current) > 1) {
          element.style.paddingTop = top > 0 ? `${top}px` : '';
          changed = true;
        } else {
          top = current;
        }
      } else if (element.style.paddingTop) {
        element.style.paddingTop = '';
        changed = true;
      }
      let bottom = 0;
      if (element.hasAttribute('data-break-after')) {
        const current = parseFloat(element.style.paddingBottom) || 0;
        const contentBottom = element.getBoundingClientRect().bottom - current * scale;
        const space = spaceToPageEnd(contentBottom, breakers, pageTop);
        bottom = space === null ? current : Math.round(space / scale);
        if (Math.abs(bottom - current) > 1) {
          element.style.paddingBottom = bottom > 0 ? `${bottom}px` : '';
          changed = true;
        } else {
          bottom = current;
        }
      }
      if (top > 0 || bottom > 0) pads.push({ pos, top, bottom });
    }
  } finally {
    observer?.start();
  }
  // Store the padding and let the pagination extension recount pages after the layout moved.
  if (changed && layoutDepth < 4) {
    layoutDepth += 1;
    view.dispatch(view.state.tr.setMeta(pageFlowKey, pads).setMeta('addToHistory', false).setMeta('wrPageFlow', true));
    layoutDepth -= 1;
  }
}
