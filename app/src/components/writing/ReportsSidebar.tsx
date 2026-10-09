import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { FileArrowUp, Plus, Trash } from '@phosphor-icons/react';
import BranchedMenu, { type BranchedMenuItem } from '../reactbits/BranchedMenu';
import type { ReportListing } from './useWritingDocument';

interface ReportsSidebarProps {
  reports: ReportListing[];
  activePath: string | null;
  editor: Editor | null;
  loading: boolean;
  onOpen: (path: string) => void;
  onNew: () => void;
  onImport: () => void;
  onDelete: (path: string) => void;
}

interface NavEntry {
  pos: number;
  level: number;
  text: string;
}

const EASE = [0.32, 0.72, 0, 1] as const;

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(ms).toLocaleDateString();
}

export const ReportsSidebar: React.FC<ReportsSidebarProps> = ({ reports, activePath, editor, loading, onOpen, onNew, onImport, onDelete }) => {
  const [headings, setHeadings] = useState<NavEntry[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;
    let timer = 0;
    const compute = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next: NavEntry[] = [];
        editor.state.doc.forEach((node, offset) => {
          if (node.type.name === 'heading' && Number(node.attrs.level) <= 2 && node.textContent.trim()) {
            next.push({ pos: offset, level: Number(node.attrs.level), text: node.textContent.trim() });
          }
        });
        setHeadings((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
      }, 300);
    };
    compute();
    editor.on('update', compute);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', compute);
    };
  }, [editor]);

  const items: BranchedMenuItem[] = [];
  for (const entry of headings) {
    if (entry.level === 1 || items.length === 0) {
      items.push({ label: entry.text, value: `h:${entry.pos}`, children: [] });
    } else {
      items[items.length - 1].children!.push({ label: entry.text, value: `h:${entry.pos}` });
    }
  }
  for (const item of items) if (item.children?.length === 0) delete item.children;

  const jump = (value: string): void => {
    const pos = Number(value.slice(2));
    if (!editor || Number.isNaN(pos)) return;
    editor.chain().focus().setTextSelection(Math.min(pos + 1, editor.state.doc.content.size)).scrollIntoView().run();
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <aside className="wr-sidebar" aria-label="Reports">
      <div className="wr-sidebar__head">
        <span className="wr-sidebar__title">Reports</span>
        <span style={{ display: 'flex', gap: 2 }}>
          <button type="button" className="wr-icon-btn" title="Import a Word document" onClick={onImport}><FileArrowUp size={16} weight="light" /></button>
          <button type="button" className="wr-icon-btn" title="Commission a new report" onClick={onNew}><Plus size={16} weight="light" /></button>
        </span>
      </div>
      <div className="wr-sidebar__scroll">
        <div className="wr-sidebar__section">
          {loading && reports.length === 0 && <div className="wr-field__hint" style={{ padding: '4px 6px' }}>Looking for reports…</div>}
          {!loading && reports.length === 0 && <div className="wr-field__hint" style={{ padding: '4px 6px' }}>No reports yet.</div>}
          <AnimatePresence initial={false}>
            {reports.map((report, index) => (
              <motion.div
                key={report.path}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: index * 0.03 }}
                style={{ position: 'relative' }}
                className="group"
              >
                <button type="button" className={`wr-report-row${report.path === activePath ? ' is-active' : ''}`} onClick={() => onOpen(report.path)} title={report.path}>
                  <span className="wr-report-row__glyph" aria-hidden="true">
                    <svg width="14" height="18" viewBox="0 0 14 18"><path d="M3 5h8M3 8h8M3 11h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                  </span>
                  <span className="wr-report-row__text">
                    <span className="wr-report-row__name">{report.title}</span>
                    <span className="wr-report-row__meta">{relativeTime(report.modifiedAt)}</span>
                  </span>
                </button>
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2 }}>
                  {confirmDelete === report.path ? (
                    <>
                      <button type="button" className="wr-pill-btn is-danger" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => { setConfirmDelete(null); onDelete(report.path); }}>Delete</button>
                      <button type="button" className="wr-pill-btn" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => setConfirmDelete(null)}>Keep</button>
                    </>
                  ) : (
                    <button type="button" className="wr-icon-btn opacity-0 group-hover:opacity-100" title="Delete report" onClick={() => setConfirmDelete(report.path)}><Trash size={13} /></button>
                  )}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {items.length > 0 && (
          <div className="wr-sidebar__section">
            <div className="wr-sidebar__label">Contents</div>
            <BranchedMenu
              items={items}
              onSelect={(value) => jump(value)}
              onToggle={(index) => { const value = items[index]?.value; if (value) jump(value); }}
              color="var(--text-secondary)"
              accentColor="var(--wr-gold)"
              lineColor="color-mix(in oklab, var(--text-primary) 14%, transparent)"
              width={236}
              rowHeight={30}
              fontSize={12.5}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
