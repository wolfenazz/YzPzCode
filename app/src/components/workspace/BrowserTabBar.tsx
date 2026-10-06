import React, { useEffect, useRef, useState } from 'react';
import { CircleNotch, GlobeSimple, House, Plus, X } from '@phosphor-icons/react';
import type { BrowserTab } from '../../types';
import { getUrlTabLabel, isNewTabUrl } from '../../utils/browserUrl';

interface BrowserTabBarProps {
  tabs: BrowserTab[];
  activeTabId: string | null;
  isLoading: boolean;
  onAddTab: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  /** Extra controls rendered at the end of the strip. */
  children?: React.ReactNode;
}

/** Page favicon with a globe fallback for pages that have none (or 404). */
export const BrowserFavicon: React.FC<{ url: string; favicon?: string | null; loading?: boolean }> = ({
  url,
  favicon,
  loading = false,
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [favicon]);

  if (loading) {
    return (
      <span className="bx-favicon" aria-hidden="true">
        <CircleNotch size={14} className="bx-spinner" />
      </span>
    );
  }
  if (isNewTabUrl(url)) {
    return (
      <span className="bx-favicon" aria-hidden="true">
        <House size={14} />
      </span>
    );
  }
  return (
    <span className="bx-favicon" aria-hidden="true">
      {favicon && !failed ? (
        <img src={favicon} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <GlobeSimple size={14} />
      )}
    </span>
  );
};

export const BrowserTabBar: React.FC<BrowserTabBarProps> = ({
  tabs,
  activeTabId,
  isLoading,
  onAddTab,
  onSelectTab,
  onCloseTab,
  children,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active tab in view when it changes (e.g. Ctrl+PageDown).
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('.bx-tab.is-active');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId, tabs.length]);

  // Vertical wheel scrolls the strip horizontally.
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const list = listRef.current;
    if (!list || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    list.scrollLeft += event.deltaY;
  };

  return (
    <div className="bx-tabs">
      <div ref={listRef} className="bx-tabs__list" role="tablist" aria-label="Browser tabs" onWheel={handleWheel}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const title = tab.title || getUrlTabLabel(tab.url);
          return (
            <div
              key={tab.id}
              className={`bx-tab${isActive ? ' is-active' : ''}`}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="bx-tab__main"
                title={isNewTabUrl(tab.url) ? title : `${title}\n${tab.url}`}
                onClick={() => onSelectTab(tab.id)}
              >
                <BrowserFavicon url={tab.url} favicon={tab.favicon} loading={isActive && isLoading} />
                <span className="bx-tab__title">{title}</span>
              </button>
              <button
                type="button"
                className="bx-btn bx-btn--sm bx-tab__close"
                onClick={() => onCloseTab(tab.id)}
                aria-label={`Close ${title}`}
                title="Close tab (Ctrl+W)"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="bx-btn"
        onClick={onAddTab}
        aria-label="New tab"
        title="New tab (Ctrl+T)"
      >
        <Plus size={15} aria-hidden="true" />
      </button>
      {children && <div style={{ marginLeft: 'auto' }} className="bx-group">{children}</div>}
    </div>
  );
};
