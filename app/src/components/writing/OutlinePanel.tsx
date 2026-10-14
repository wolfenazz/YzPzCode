import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowClockwise } from '@phosphor-icons/react';
import type { GenerationRun } from '../../stores/writingSessionStore';
import { Inspector, InspectorHead } from '../studio/Inspector';

interface OutlineEntry {
  level: number;
  text: string;
  sectionId: string | null;
  /** Order among identical plain headings, so a click resolves to the right one. */
  ordinal: number;
}

interface OutlinePanelProps {
  editor: Editor | null;
  run: GenerationRun | null;
  busy: boolean;
  onWriteSection: (sectionId: string) => void;
}

/** Stable identity for rendering and for matching the heading under the cursor. */
const entryKey = (entry: Pick<OutlineEntry, 'level' | 'text' | 'sectionId' | 'ordinal'>): string =>
  entry.sectionId ?? `h${entry.level}|${entry.text}|${entry.ordinal}`;

/** The document's headings: jump to one, see what the writer is doing, write a section again. */
export const OutlinePanel: React.FC<OutlinePanelProps> = ({ editor, run, busy, onWriteSection }) => {
  const [entries, setEntries] = useState<OutlineEntry[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;
    let timer = 0;
    const compute = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next: OutlineEntry[] = [];
        const seen = new Map<string, number>();
        editor.state.doc.forEach((node) => {
          if (node.type.name !== 'heading' || Number(node.attrs.level) > 3 || !node.textContent.trim()) return;
          const text = node.textContent.trim();
          const sectionId = (node.attrs.sectionId as string | null) ?? null;
          const mapKey = `${Number(node.attrs.level)}|${text}|${sectionId ?? ''}`;
          const ordinal = seen.get(mapKey) ?? 0;
          seen.set(mapKey, ordinal + 1);
          next.push({ level: Number(node.attrs.level), text, sectionId, ordinal });
        });
        setEntries((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
      }, 250);
    };
    const track = (): void => {
      const { from } = editor.state.selection;
      const seen = new Map<string, number>();
      let current: string | null = null;
      editor.state.doc.forEach((node, offset) => {
        if (offset > from || node.type.name !== 'heading' || Number(node.attrs.level) > 3 || !node.textContent.trim()) return;
        const text = node.textContent.trim();
        const sectionId = (node.attrs.sectionId as string | null) ?? null;
        const mapKey = `${Number(node.attrs.level)}|${text}|${sectionId ?? ''}`;
        const ordinal = seen.get(mapKey) ?? 0;
        seen.set(mapKey, ordinal + 1);
        current = entryKey({ level: Number(node.attrs.level), text, sectionId, ordinal });
      });
      setActiveKey(current);
    };
    compute();
    track();
    editor.on('update', compute);
    editor.on('selectionUpdate', track);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', compute);
      editor.off('selectionUpdate', track);
    };
  }, [editor]);

  /** Where an entry is now (positions from render time go stale as the text changes). */
  const resolvePos = (entry: OutlineEntry): number | null => {
    if (!editor || editor.isDestroyed) return null;
    if (entry.sectionId) {
      let found: number | null = null;
      editor.state.doc.forEach((node, offset) => {
        if (node.type.name === 'heading' && (node.attrs.sectionId as string | null) === entry.sectionId) found = offset;
      });
      return found;
    }
    const seen = new Map<string, number>();
    let found: number | null = null;
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name !== 'heading' || Number(node.attrs.level) > 3 || (node.attrs.sectionId as string | null)) return;
      const text = node.textContent.trim();
      const mapKey = `${Number(node.attrs.level)}|${text}`;
      const ordinal = seen.get(mapKey) ?? 0;
      seen.set(mapKey, ordinal + 1);
      if (Number(node.attrs.level) === entry.level && text === entry.text && ordinal === entry.ordinal) found = offset;
    });
    return found;
  };

  const jump = (entry: OutlineEntry): void => {
    if (!editor) return;
    const pos = resolvePos(entry);
    if (pos === null) return;
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(Math.min(pos + 1, editor.state.doc.content.size)).run();
    // After the editor's own scroll-to-cursor, so the heading lands at the top.
    requestAnimationFrame(() => {
      try {
        const dom = editor.view.nodeDOM(pos);
        if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        // The document moved under the click.
      }
    });
  };

  const sections = entries.filter((entry) => entry.sectionId).length;

  return (
    <Inspector label="Outline" side="left" width={248}>
      <InspectorHead title="Outline" count={sections > 0 ? sections : undefined} />
      <div className="wr-outline-panel__list">
        {entries.length === 0 && <p className="sx-hint wr-outline-panel__empty">Headings appear here as the document takes shape.</p>}
        {entries.map((entry) => {
          const status = entry.sectionId ? run?.sectionStatus[entry.sectionId] : undefined;
          const key = entryKey(entry);
          return (
            <div key={key} className={`wr-outline-item is-level-${entry.level}${activeKey === key ? ' is-active' : ''}`}>
              <button type="button" className="wr-outline-item__link" onClick={() => jump(entry)} title={entry.text} aria-current={activeKey === key || undefined}>
                {status && status !== 'done' && <span className={`wr-dot is-${status}`} aria-label={status} />}
                <span className="wr-outline-item__text">{entry.text}</span>
              </button>
              {entry.sectionId && (
                <button type="button" className="sx-icon wr-outline-item__action" title="Write this section again" aria-label={`Write ${entry.text} again`} disabled={busy} onClick={() => onWriteSection(entry.sectionId!)}>
                  <ArrowClockwise size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Inspector>
  );
};
