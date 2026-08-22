import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { RegisteredTerminal } from '../../utils/terminalRegistry';
import { getTerminalForTarget } from '../../utils/terminalRegistry';

interface ContextMenuProps {
  onDocsClick: () => void;
  onNewWorkspace: () => void;
}

interface Position {
  x: number;
  y: number;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  onDocsClick,
  onNewWorkspace,
}) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const terminalRef = useRef<RegisteredTerminal | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setVisible(false);
    terminalRef.current = null;
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // A more specific context menu (file tree, editor tabs, terminal, etc.)
      // already handled this right-click — don't stack the global menu on top.
      if (e.defaultPrevented) return;
      e.preventDefault();

      terminalRef.current = getTerminalForTarget(e.target) ?? null;

      let x = e.clientX;
      let y = e.clientY;

      const menuWidth = 180;
      const menuHeight = 250;
      if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
      if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

      setPosition({ x, y });
      setVisible(true);
    };

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [close]);

  const handleAction = (action: () => void) => {
    action();
    close();
  };

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      className="fixed z-[10000] bg-theme-card border border-theme rounded-md shadow-lg py-1 min-w-[180px] font-mono animate-scale-in"
      style={{ left: position.x, top: position.y }}
    >
      <button
        role="menuitem"
        onClick={() => handleAction(onNewWorkspace)}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-theme-main hover:bg-theme-hover transition-colors duration-100 text-left cursor-pointer"
      >
        <svg className="w-3 h-3 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
        New Workspace
      </button>

      <button
        role="menuitem"
        onClick={() => handleAction(onDocsClick)}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-theme-main hover:bg-theme-hover transition-colors duration-100 text-left cursor-pointer"
      >
        <svg className="w-3 h-3 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Documentation
      </button>

      <button
        role="menuitem"
        onClick={() => {
          const terminal = terminalRef.current;
          if (terminal) {
            const selection = terminal.xterm.getSelection();
            if (selection) {
              navigator.clipboard.writeText(selection).catch(console.error);
              close();
              return;
            }
          }
          const domSelection = window.getSelection()?.toString() ?? '';
          if (domSelection) {
            navigator.clipboard.writeText(domSelection).catch(console.error);
          }
          close();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-theme-main hover:bg-theme-hover transition-colors duration-100 text-left cursor-pointer"
      >
        <svg className="w-3 h-3 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Copy
        <span className="ml-auto text-[9px] text-[var(--text-secondary)]">Ctrl+C</span>
      </button>

      <button
        role="menuitem"
        onClick={async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              const terminal = terminalRef.current;
              if (terminal) {
                terminal.focus();
                void terminal.paste(text);
                close();
                return;
              }
            }
            const target = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
              const start = target.selectionStart ?? 0;
              const end = target.selectionEnd ?? 0;
              const value = target.value;
              target.value = value.slice(0, start) + text + value.slice(end);
              target.selectionStart = target.selectionEnd = start + text.length;
              target.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } catch {}
          close();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-theme-main hover:bg-theme-hover transition-colors duration-100 text-left cursor-pointer"
      >
        <svg className="w-3 h-3 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3" />
        </svg>
        Paste
        <span className="ml-auto text-[9px] text-[var(--text-secondary)]">Ctrl+V</span>
      </button>

      <div role="separator" className="my-1 mx-2 border-t border-theme" />

      <div className="px-3 py-1.5 text-[9px] text-[var(--text-secondary)] uppercase tracking-[0.15em] cursor-default">
        YzPzCode
      </div>
    </div>
  );
};
