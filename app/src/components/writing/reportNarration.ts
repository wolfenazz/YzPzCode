// Plain-text extraction for report read-aloud (Task 6: Report workspace).
//
// Mirrors the section lookup in `WritingWorkspace.sectionTarget` (heading scan
// + `findSectionRange`) but returns speech-ready plain text instead of AI
// Markdown: `nodeText` already drops footnote/citation atoms, figures
// contribute their caption, and layout-only nodes (page breaks, ToC,
// bibliography hosts) are skipped. Read-only: never dispatches transactions.
import type { Editor } from '@tiptap/react';
import { nodeText } from '../../utils/writing/markdown';
import type { DocNode } from '../../utils/writing/types';
import { findSectionRange } from './editor/extensions';

/** Backend single-shot ceiling (`MAX_TEXT_CHARS` in `tts/bridge.rs`). */
export const REPORT_NARRATION_MAX_CHARS = 6000;

export type NarrationSource = 'selection' | 'section';

/**
 * Speech text for editor JSON blocks. Footnotes/citations yield '' via
 * `nodeText` (atoms), so they are never spoken.
 */
export function blocksToSpeech(blocks: DocNode[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'figure') {
      const caption: string = String(block.attrs?.caption ?? '').trim();
      if (caption) parts.push(caption);
      continue;
    }
    if (block.type === 'pageBreak' || block.type === 'tableOfContents' || block.type === 'bibliography') continue;
    const text: string = nodeText(block).trim();
    if (text) parts.push(text);
  }
  return parts.join('\n\n').trim();
}

/** The JSON of a section's body, walked read-only (same walk as `sectionBodyJson`). */
function sectionBodyBlocks(editor: Editor, sectionId: string): DocNode[] {
  const range = findSectionRange(editor.state.doc, sectionId);
  if (!range) return [];
  const blocks: DocNode[] = [];
  editor.state.doc.nodesBetween(range.bodyFrom, range.to, (node, pos) => {
    if (pos >= range.bodyFrom) blocks.push(node.toJSON() as DocNode);
    return false;
  });
  return blocks;
}

/** Exact selected plain text, or null when the selection is empty/blank. */
export function selectionNarrationText(editor: Editor): string | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const text: string = editor.state.doc.textBetween(from, to, '\n\n', ' ').trim();
  return text ? text : null;
}

/** Plain text of the section body at the cursor, or null outside a section/when empty. */
export function sectionNarrationText(editor: Editor): string | null {
  const { from } = editor.state.selection;
  let id: string | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (offset <= from && node.type.name === 'heading' && node.attrs.sectionId) id = node.attrs.sectionId as string;
  });
  if (!id) return null;
  const text: string = blocksToSpeech(sectionBodyBlocks(editor, id));
  return text ? text : null;
}

/** Speak target: the selection when non-empty, else the section at the cursor. */
export function selectionOrSectionNarrationText(editor: Editor): { text: string; source: NarrationSource } | null {
  const selection: string | null = selectionNarrationText(editor);
  if (selection) return { text: selection, source: 'selection' };
  const section: string | null = sectionNarrationText(editor);
  if (section) return { text: section, source: 'section' };
  return null;
}
