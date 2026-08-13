import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MentionItem } from '../../hooks/useAgentMention';
import { FileIcon } from '../explorer/FileIcon';

interface AgentMentionMenuProps {
  anchorRef: React.RefObject<HTMLTextAreaElement | null>;
  items: MentionItem[];
  selectedIndex: number;
  filter: string;
  basePath: string;
  loading: boolean;
  onSelect: (item: MentionItem) => void;
  onHover: (index: number) => void;
  onClose: () => void;
}

const GAP = 6;
/** Minimum space above the textarea before we allow flipping below it. */
const MIN_ABOVE = 220;
const MIN_WIDTH = 280;
const MAX_WIDTH = 420;

const Spinner: React.FC = () => (
  <svg className="w-3 h-3 animate-spin text-[var(--accent)] shrink-0" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const FolderIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path
      d="M1.5 3.5C1.5 2.67 2.17 2 3 2h3.59a1 1 0 01.7.3l1.42 1.4a1 1 0 00.7.3H13a1.5 1.5 0 011.5 1.5V12.5a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 12.5v-9z"
      fill="#eab308"
      fillOpacity={0.15}
      stroke="#eab308"
      strokeWidth={0.8}
    />
    <path d="M1.5 5.5h13" stroke="#eab308" strokeWidth={0.5} strokeOpacity={0.4} />
  </svg>
);

/** Bold + accent matched characters (given as positions in `text`). */
function HighlightText({ text, indices, offset }: { text: string; indices: Set<number>; offset: number }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    if (indices.has(offset + i)) {
      if (last < i) parts.push(<span key={`t-${i}`}>{text.slice(last, i)}</span>);
      parts.push(
        <span key={`m-${i}`} className="font-semibold text-[var(--accent)]">
          {text[i]}
        </span>
      );
      last = i + 1;
    }
  }
  if (last < text.length) parts.push(<span key="end">{text.slice(last)}</span>);
  return <>{parts}</>;
}

/**
 * `@` file-mention dropdown. Rendered through a portal (fixed position) so the
 * pane's overflow-hidden never clips it. Anchors above the textarea and flips
 * below when there is not enough room above.
 */
export const AgentMentionMenu: React.FC<AgentMentionMenuProps> = ({
  anchorRef,
  items,
  selectedIndex,
  filter,
  basePath,
  loading,
  onSelect,
  onHover,
  onClose,
}) => {
  const [coords, setCoords] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Position above the textarea (it sits at the pane bottom). Recompute when
  // the popup content changes so a drill-in keeps it glued to the anchor.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(MIN_WIDTH, Math.min(rect.width, MAX_WIDTH));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    if (rect.top < MIN_ABOVE) {
      setCoords({ left, width, top: rect.bottom + GAP });
    } else {
      setCoords({ left, width, bottom: window.innerHeight - rect.top + GAP });
    }
  }, [anchorRef, items.length, loading]);

  // Close on outside mousedown, Escape, scroll (capture) and resize.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScrollOrResize = () => onClose();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [onClose, anchorRef]);

  // Keep the active row visible while navigating.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, items]);

  if (!coords) return null;

  const pathLabel = basePath ? `~ ${basePath}` : filter ? `~ search ${filter}` : '~';

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      aria-label="File mentions"
      style={{
        position: 'fixed',
        zIndex: 10000,
        left: coords.left,
        width: coords.width,
        top: coords.top,
        bottom: coords.bottom,
      }}
      className="font-mono rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden animate-scale-in"
    >
      {/* Header: path context + loading indicator */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--border-primary)]/60">
        <span className="truncate text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/70">
          {pathLabel}
        </span>
        {loading && <Spinner />}
      </div>

      {/* Entries */}
      <div ref={listRef} className="max-h-[260px] overflow-y-auto custom-scrollbar py-1">
        {!loading && items.length === 0 && (
          <div className="px-3 py-2 text-[10px] text-[var(--text-secondary)]/60">No matching files</div>
        )}
        {items.map((item, i) => {
          const selected = i === selectedIndex;
          const isDir = item.isDir;
          // Fuzzy indices are positions in `relPath`; the name is the last
          // path segment, so its highlight offset is the start of that segment.
          const nameStart = item.relPath.lastIndexOf('/') + 1;
          return (
            <div
              key={item.path}
              role="option"
              aria-selected={selected}
              data-selected={selected || undefined}
              onMouseEnter={() => onHover(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item)}
              className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-[11px] leading-tight select-none border-l-2 ${
                selected
                  ? 'bg-[var(--accent)]/10 border-[var(--accent-border)]'
                  : 'border-transparent hover:bg-[var(--bg-main)]/60'
              }`}
            >
              {isDir ? (
                <FolderIcon className="w-4 h-4 shrink-0" />
              ) : (
                <FileIcon extension={item.extension} isDir={false} className="w-4 h-4 shrink-0" name={item.name} />
              )}
              <span className="truncate text-[var(--text-primary)]">
                <HighlightText text={item.name} indices={item.indices} offset={nameStart} />
                {isDir && <span className="text-[var(--text-secondary)]/60">/</span>}
              </span>
              {!isDir && item.dir && (
                <span className="ml-auto pl-2 truncate text-[9px] text-[var(--text-secondary)]/50">
                  <HighlightText text={item.dir} indices={item.indices} offset={0} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hints */}
      <div className="px-2.5 py-1 border-t border-[var(--border-primary)]/60 text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/40">
        ↑↓ navigate · Enter select · Esc dismiss
      </div>
    </div>,
    document.body
  );
};
