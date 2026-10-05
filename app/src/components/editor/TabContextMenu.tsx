import React, { useEffect, useRef } from 'react';
import '../common/context-menu.css';

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
      className="ctx-menu ctx-menu--plain animate-popover-in fixed z-[200]"
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
          return <div key={`sep-${i}`} role="separator" className="ctx-sep" />;
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
            className="ctx-item"
            disabled={mi.disabled}
          >
            <span className="ctx-item__label">{mi.label}</span>
            {mi.shortcut && <span className="ctx-item__kbd">{mi.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
};
