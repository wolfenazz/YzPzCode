import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowClockwise } from '@phosphor-icons/react';
import type { GenerationRun } from '../../stores/writingSessionStore';
import { Inspector, InspectorHead } from '../studio/Inspector';

interface OutlineEntry {
  pos: number;
  level: number;
  text: string;
  sectionId: string | null;
}

interface OutlinePanelProps {
  editor: Editor | null;
  run: GenerationRun | null;
  busy: boolean;
  onWriteSection: (sectionId: string) => void;
}

/** The document's headings: jump to one, see what the writer is doing, write a section again. */
export const OutlinePanel: React.FC<OutlinePanelProps> = ({ editor, run, busy, onWriteSection }) => {
  const [entries, setEntries] = useState<OutlineEntry[]>([]);
  const [activePos, setActivePos] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) return;
    let timer = 0;
    const compute = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next: OutlineEntry[] = [];
        editor.state.doc.forEach((node, offset) => {
          if (node.type.name === 'heading' && Number(node.attrs.level) <= 2 && node.textContent.trim()) {
            next.push({ pos: offset, level: Number(node.attrs.level), text: node.textContent.trim(), sectionId: (node.attrs.sectionId as string | null) ?? null });
          }
        });
        setEntries((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
      }, 250);
    };
    const track = (): void => {
      const { from } = editor.state.selection;
      let current: number | null = null;
      editor.state.doc.forEach((node, offset) => {
        if (offset <= from && node.type.name === 'heading' && Number(node.attrs.level) <= 2) current = offset;
      });
      setActivePos(current);
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

  const jump = (pos: number): void => {
    if (!editor) return;
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(Math.min(pos + 1, editor.state.doc.content.size)).run();
    // After the editor's own scroll-to-cursor, so the heading lands at the top.
    requestAnimationFrame(() => {
      const dom = editor.view.nodeDOM(pos);
      if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          return (
            <div key={`${entry.pos}-${entry.text}`} className={`wr-outline-item is-level-${entry.level}${activePos === entry.pos ? ' is-active' : ''}`}>
              <button type="button" className="wr-outline-item__link" onClick={() => jump(entry.pos)} title={entry.text} aria-current={activePos === entry.pos || undefined}>
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
