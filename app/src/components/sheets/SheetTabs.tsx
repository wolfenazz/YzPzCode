import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from '@phosphor-icons/react';
import type { Workbook } from '../../utils/sheets/types';

export interface MenuEntry {
  label?: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

/** A right-click menu at a point, closed by any outside click or Escape. */
export const ContextMenu: React.FC<{ x: number; y: number; items: MenuEntry[]; onClose: () => void }> = ({ x, y, items, onClose }) => {
  const root = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ left: x, top: y });
  useEffect(() => {
    const el = root.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setOffset({ left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 8)), top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 8)) });
    }
    const down = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, x, y]);
  return createPortal(
    <div ref={root} className="sh-menu sh-menu--context" role="menu" style={{ left: offset.left, top: offset.top }}>
      {items.map((item, index) => (item.separator
        ? <div key={`s${index}`} className="sh-menu__sep" role="separator" />
        : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            className={`sh-menu__item${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => { onClose(); item.onSelect?.(); }}
          >
            <span className="sh-menu__label">{item.label}</span>
            {item.hint && <span className="sh-menu__hint">{item.hint}</span>}
          </button>
        )))}
    </div>,
    document.body,
  );
};

interface SheetTabsProps {
  wb: Workbook;
  activeIndex: number;
  readOnly: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRename: (index: number, name: string) => void;
  onMenu: (index: number, position: { x: number; y: number }) => void;
}

export const SheetTabs: React.FC<SheetTabsProps> = ({ wb, activeIndex, readOnly, onSelect, onAdd, onRename, onMenu }) => {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeIndex]);

  const finish = (commit: boolean): void => {
    if (renaming !== null && commit && draft.trim() && draft.trim() !== wb.sheets[renaming].name) onRename(renaming, draft.trim());
    setRenaming(null);
  };

  return (
    <div className="sh-tabs" data-keep-edit>
      <div className="sh-tabs__list" role="tablist" aria-label="Sheets" ref={list}>
        {wb.sheets.map((sheet, index) => {
          if (sheet.state && sheet.state !== 'visible' && index !== activeIndex) return null;
          const active = index === activeIndex;
          return (
            <div
              key={sheet.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`sh-tab${active ? ' is-active' : ''}`}
              style={sheet.tabColor ? ({ '--sh-tab-color': sheet.tabColor } as React.CSSProperties) : undefined}
              onClick={() => onSelect(index)}
              onDoubleClick={() => { if (!readOnly) { setRenaming(index); setDraft(sheet.name); } }}
              onContextMenu={(event) => { event.preventDefault(); onSelect(index); onMenu(index, { x: event.clientX, y: event.clientY }); }}
            >
              {renaming === index ? (
                <input
                  className="sh-tab__input"
                  autoFocus
                  value={draft}
                  dir="auto"
                  maxLength={31}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => finish(true)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') finish(true);
                    if (event.key === 'Escape') finish(false);
                  }}
                />
              ) : (
                <span dir="auto">{sheet.name}</span>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="sh-tabs__add" title="Add sheet" aria-label="Add sheet" disabled={readOnly} onClick={onAdd}><Plus size={13} weight="bold" /></button>
    </div>
  );
};
