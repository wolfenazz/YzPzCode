import React, { useCallback } from 'react';
import { Icon } from '@iconify/react';
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
    <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]/50 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium transition-all whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]'
                : 'text-[var(--accent)]/70 hover:bg-[var(--bg-primary)]/60 hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon
              icon="material-symbols:globe-outline-rounded"
              className={`h-3 w-3 shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--accent)]/40'}`}
              aria-hidden="true"
            />
            <span className="truncate max-w-[120px]">{tab.title || tab.url}</span>
            {tabs.length > 1 && (
              <span
                onClick={(e) => handleClose(e, tab.id)}
                className="ml-0.5 flex items-center justify-center w-3.5 h-3.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 hover:text-rose-400 transition-opacity cursor-pointer"
                aria-label={`Close tab ${tab.title || tab.url}`}
              >
                <Icon icon="material-symbols:close-rounded" className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={onAddTab}
        className="flex items-center justify-center w-6 h-6 rounded border border-[var(--border-primary)] bg-transparent text-[var(--accent)]/60 hover:text-[var(--text-primary)] hover:border-zinc-600 transition-colors cursor-pointer shrink-0 ml-0.5"
        aria-label="New tab"
      >
        <Icon icon="material-symbols:add-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
