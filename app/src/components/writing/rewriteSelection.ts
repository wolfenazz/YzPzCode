import type { Editor } from '@tiptap/react';
import { Node as PmNode, type Fragment } from '@tiptap/pm/model';
import { blocksToMarkdown, parseBlocks, parseInline } from '../../utils/writing/markdown';
import type { DocNode } from '../../utils/writing/types';
import type { RewriteAction } from '../../utils/writing/prompts';

/** What a rewrite will replace: an inline span inside one paragraph, or whole top-level blocks. */
export interface RewriteTarget {
  kind: 'inline' | 'blocks';
  from: number;
  to: number;
  /** Markdown sent to the AI. */
  passage: string;
  /** Plain text shown as "before" in the review. */
  before: string;
  sectionTitle: string | undefined;
}

function sectionTitleAt(editor: Editor, pos: number): string | undefined {
  let title: string | undefined;
  editor.state.doc.forEach((node, offset) => {
    if (offset <= pos && node.type.name === 'heading' && node.attrs.sectionId) title = node.textContent;
  });
  return title;
}

export function captureSelection(editor: Editor, action: RewriteAction): RewriteTarget | null {
  const { state } = editor;
  const { from, to, $from, $to, empty } = state.selection;
  if (empty) return null;
  const sectionTitle = sectionTitleAt(editor, from);
  const sameTextblock = $from.parent === $to.parent && $from.parent.isTextblock;
  const wholeBlock = sameTextblock && $from.parentOffset === 0 && $to.parentOffset === $from.parent.content.size;
  if (sameTextblock && !wholeBlock && action !== 'continue') {
    const text = state.doc.textBetween(from, to, ' ', ' ');
    return { kind: 'inline', from, to, passage: text, before: text, sectionTitle };
  }
  // Expand to top-level blocks.
  const start = $from.before(1);
  const end = $to.after(1);
  const blocks: DocNode[] = [];
  state.doc.nodesBetween(start, end, (node, pos) => {
    if (pos >= start && pos < end) blocks.push(node.toJSON() as DocNode);
    return false;
  });
  const passage = blocksToMarkdown(blocks);
  return { kind: 'blocks', from: start, to: end, passage, before: state.doc.textBetween(start, end, '\n\n', ' '), sectionTitle };
}

function toNodes(editor: Editor, blocks: DocNode[]): PmNode[] {
  const nodes: PmNode[] = [];
  for (const block of blocks) {
    try {
      const node = PmNode.fromJSON(editor.schema, block);
      node.check();
      nodes.push(node);
    } catch {
      // Skip blocks the schema rejects.
    }
  }
  return nodes;
}

/** Applies an accepted rewrite as a single undoable step. Returns false if the document moved on. */
export function applyRewrite(editor: Editor, target: RewriteTarget, markdown: string, action: RewriteAction): boolean {
  const { doc } = editor.state;
  if (target.to > doc.content.size) return false;
  if (action === 'continue') {
    const nodes = toNodes(editor, parseBlocks(markdown, { minHeadingLevel: 2 }));
    if (nodes.length === 0) return false;
    editor.view.dispatch(editor.state.tr.insert(target.to, nodes as unknown as Fragment).scrollIntoView());
    return true;
  }
  if (target.kind === 'inline') {
    const single = markdown.replace(/\s*\n\s*/g, ' ').trim();
    const inline = parseInline(single);
    const nodes = toNodes(editor, inline);
    if (nodes.length === 0) return false;
    editor.view.dispatch(editor.state.tr.replaceWith(target.from, target.to, nodes as unknown as Fragment).scrollIntoView());
    return true;
  }
  const blocks = parseBlocks(markdown, { minHeadingLevel: 2 });
  // Keep a section heading at the start of the range intact if the model dropped it.
  const first = doc.nodeAt(target.from);
  if (first?.type.name === 'heading' && first.attrs.sectionId && blocks[0]?.type !== 'heading') {
    blocks.unshift(first.toJSON() as DocNode);
  } else if (first?.type.name === 'heading' && first.attrs.sectionId && blocks[0]?.type === 'heading') {
    blocks[0] = { ...blocks[0], attrs: { ...(blocks[0].attrs ?? {}), level: 1, sectionId: first.attrs.sectionId, unnumbered: first.attrs.unnumbered } };
  }
  const nodes = toNodes(editor, blocks);
  if (nodes.length === 0) return false;
  editor.view.dispatch(editor.state.tr.replaceWith(target.from, target.to, nodes as unknown as Fragment).scrollIntoView());
  return true;
}
