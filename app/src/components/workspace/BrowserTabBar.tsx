import React, { useCallback } from 'react';
import { GlobeSimple, Plus, X } from '@phosphor-icons/react';
import type { BrowserTab } from '../../types';

interface BrowserTabBarProps {
  tabs: BrowserTab[];
  activeTabId: string | null;
  onAddTab: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export const BrowserTabBar: React.FC<BrowserTabBarProps> = ({
  tabs,
  activeTabId,
  onAddTab,
  onSelectTab,
  onCloseTab,
}) => {
  const handleClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onCloseTab(tabId);
  }, [onCloseTab]);

  return (
    <nav className="browser-tabs flex items-center gap-0.5 overflow-x-auto border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1" aria-label="Browser tabs">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`browser-tab group flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              isActive
                ? 'is-active bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <GlobeSimple
              size={12}
              className={`shrink-0 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]/60'}`}
              aria-hidden="true"
            />
            <span className="truncate max-w-[120px]">{tab.title || tab.url}</span>
            {tabs.length > 1 && (
              <span
                onClick={(e) => handleClose(e, tab.id)}
                className="browser-tab__close ml-0.5 flex h-4 w-4 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer"
                aria-label={`Close tab ${tab.title || tab.url}`}
              >
                <X size={12} aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={onAddTab}
        className="browser-tab__add app-icon-button ml-0.5 h-6 w-6 shrink-0 rounded border border-[var(--border-primary)]"
        aria-label="New tab"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </nav>
  );
};
