import React, { useEffect, useRef } from 'react';

interface MenuItem {
  label: string;
  action: () => void;
  separator?: false;
  disabled?: boolean;
  shortcut?: string;
}

interface MenuSeparator {
  separator: true;
}

type MenuItemOrSeparator = MenuItem | MenuSeparator;

interface TabContextMenuProps {
  x: number;
  y: number;
  items: MenuItemOrSeparator[];
  onClose: () => void;
}

export const TabContextMenu: React.FC<TabContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;
    menuRef.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const rect = menuRef.current.getBoundingClientRect();
    const win = window.innerHeight;
    const wid = window.innerWidth;
    let top = y;
    let left = x;
    if (rect.bottom > win) top = win - rect.height - 4;
    if (rect.right > wid) left = wid - rect.width - 4;
    if (top < 0) top = 4;
    if (left < 0) left = 4;
    menuRef.current.style.top = `${top}px`;
    menuRef.current.style.left = `${left}px`;
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Tab context menu"
      className="fixed z-[200] min-w-[220px] bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md shadow-xl py-1 animate-popover-in select-none"
      style={{ top: y, left: x }}
      onKeyDown={(event) => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={`sep-${i}`} role="separator" className="my-1 border-t border-theme" />;
        }
        const mi = item as MenuItem;
        return (
          <button
            type="button"
            key={i}
            role="menuitem"
            onClick={() => {
              if (!mi.disabled) {
                mi.action();
                onClose();
              }
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-[11px] transition-colors focus-visible:bg-[var(--bg-tertiary)] focus-visible:outline-none cursor-pointer ${
              mi.disabled
                ? 'text-[var(--text-secondary)]/40 cursor-default'
                : 'text-theme-secondary hover:bg-theme-hover hover:text-theme-main'
            }`}
            disabled={mi.disabled}
          >
            <span>{mi.label}</span>
            {mi.shortcut && (
              <span className="ml-4 text-[10px] text-[var(--text-secondary)]">{mi.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
