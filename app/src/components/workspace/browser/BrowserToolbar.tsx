import React, { forwardRef, useState } from 'react';
import {
  AppWindow,
  ArrowClockwise,
  ArrowsClockwise,
  ArrowSquareOut,
  ArrowUpRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  CursorClick,
  DotsThreeVertical,
  DownloadSimple,
  EyedropperSample,
  SelectionAll,
  StackSimple,
  Swatches,
  TerminalWindow,
  X,
} from '@phosphor-icons/react';
import { BrowserMenu } from './BrowserMenu';
import { BrowserOmnibox, type BrowserOmniboxHandle } from './BrowserOmnibox';
import { getLocalhostLabel } from './browserModel';
import type { DevServerEntry } from './BrowserStartPage';

export type BrowserSidePanel = 'styles' | 'ui-references';

interface BrowserToolbarProps {
  url: string;
  isStartPage: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  inspectMode: boolean;
  pickStyleMode: boolean;
  pickUiElementMode: boolean;
  activePanel: BrowserSidePanel | null;
  styleCount: number;
  referenceCount: number;
  isPoppedOut: boolean;
  autoReload: boolean;
  servers: DevServerEntry[];
  deviceMenu: React.ReactNode;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onNavigate: (input: string) => void;
  onCopyUrl: () => void;
  onOpenServer: (url: string) => void;
  onScanServers: () => void;
  onToggleInspect: () => void;
  onTogglePickStyle: () => void;
  onTogglePickUi: () => void;
  onTogglePanel: (panel: BrowserSidePanel) => void;
  onOpenExternal: () => void;
  onTogglePopout: () => void;
  onExportSnapshot: () => void;
  onToggleAutoReload: () => void;
}

export const BrowserToolbar = forwardRef<BrowserOmniboxHandle, BrowserToolbarProps>((props, omniboxRef) => {
  const {
    url,
    isStartPage,
    isLoading,
    canGoBack,
    canGoForward,
    inspectMode,
    pickStyleMode,
    pickUiElementMode,
    activePanel,
    styleCount,
    referenceCount,
    isPoppedOut,
    autoReload,
    servers,
    deviceMenu,
  } = props;
  const [serversOpen, setServersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pageless = isStartPage;

  const runAndClose = (action: () => void) => () => {
    setMoreOpen(false);
    action();
  };

  return (
    <div className="bx-toolbar">
      <div className="bx-group" role="group" aria-label="Navigation">
        <button type="button" className="bx-btn" onClick={props.onBack} disabled={pageless || !canGoBack} aria-label="Back" title="Back (Alt+←)">
          <CaretLeft size={15} aria-hidden="true" />
        </button>
        <button type="button" className="bx-btn" onClick={props.onForward} disabled={pageless || !canGoForward} aria-label="Forward" title="Forward (Alt+→)">
          <CaretRight size={15} aria-hidden="true" />
        </button>
        {isLoading && !pageless ? (
          <button type="button" className="bx-btn" onClick={props.onStop} aria-label="Stop loading" title="Stop loading">
            <X size={15} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="bx-btn" onClick={props.onReload} disabled={pageless} aria-label="Reload" title="Reload (Ctrl+R)">
            <ArrowClockwise size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      <BrowserOmnibox ref={omniboxRef} url={url} onSubmit={props.onNavigate} onCopy={props.onCopyUrl} />

      <BrowserMenu
        open={serversOpen}
        onOpenChange={(open) => {
          setServersOpen(open);
          if (open) props.onScanServers();
        }}
        label="Local dev servers"
        align="end"
        width="15rem"
        trigger={(triggerProps) => (
          <button
            {...triggerProps}
            type="button"
            className="bx-btn bx-btn--label"
            title="Local dev servers"
            aria-label="Local dev servers"
          >
            <TerminalWindow size={15} aria-hidden="true" />
            <span className="bx-hide-narrow">Localhost</span>
            {servers.some((server) => server.live) && (
              <span className="bx-count bx-count--inline">{servers.filter((server) => server.live).length}</span>
            )}
            <CaretDown size={11} aria-hidden="true" />
          </button>
        )}
      >
        <div className="bx-menu__label">Local dev servers</div>
        {servers.length > 0 ? servers.map((server) => (
          <button
            key={server.url}
            type="button"
            role="menuitem"
            className="bx-menu__item"
            onClick={() => {
              setServersOpen(false);
              props.onOpenServer(server.url);
            }}
          >
            <span className={`bx-dot${server.live ? '' : ' bx-dot--idle'}`} aria-hidden="true" />
            <span className="bx-menu__text">{getLocalhostLabel(server.url)}</span>
            <span className="bx-menu__meta">{server.live ? 'running' : 'stopped'}</span>
            <ArrowUpRight size={12} aria-hidden="true" />
          </button>
        )) : (
          <div className="bx-menu__empty">
            No server detected. Start a dev server in a terminal and it shows up here.
          </div>
        )}
      </BrowserMenu>

      <span className="bx-divider" aria-hidden="true" />

      <div className="bx-group" role="group" aria-label="Design tools">
        <button
          type="button"
          className="bx-btn bx-tool bx-tool--inspect"
          aria-pressed={inspectMode}
          onClick={props.onToggleInspect}
          disabled={pageless}
          aria-label="Inspect element"
          title="Inspect an element and send edits to an agent (Ctrl+Shift+C)"
        >
          <CursorClick size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="bx-btn bx-tool bx-tool--style"
          aria-pressed={pickStyleMode}
          onClick={props.onTogglePickStyle}
          disabled={pageless}
          aria-label="Pick style"
          title="Copy an element's style"
        >
          <EyedropperSample size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="bx-btn bx-btn--label bx-tool bx-tool--capture"
          aria-pressed={pickUiElementMode}
          onClick={props.onTogglePickUi}
          disabled={pageless}
          aria-label="Copy UI component"
          title="Capture a component from this page to rebuild in your project"
        >
          <SelectionAll size={16} aria-hidden="true" />
          <span className="bx-hide-narrow">Copy UI</span>
        </button>
      </div>

      <span className="bx-divider" aria-hidden="true" />

      <div className="bx-group" role="group" aria-label="Panels">
        <button
          type="button"
          className="bx-btn"
          aria-pressed={activePanel === 'styles'}
          onClick={() => props.onTogglePanel('styles')}
          aria-label={`Style clipboard${styleCount ? ` (${styleCount})` : ''}`}
          title="Style clipboard"
        >
          <Swatches size={16} aria-hidden="true" />
          {styleCount > 0 && <span className="bx-count">{styleCount}</span>}
        </button>
        <button
          type="button"
          className="bx-btn"
          aria-pressed={activePanel === 'ui-references'}
          onClick={() => props.onTogglePanel('ui-references')}
          aria-label={`UI references${referenceCount ? ` (${referenceCount})` : ''}`}
          title="UI references"
        >
          <StackSimple size={16} aria-hidden="true" />
          {referenceCount > 0 && <span className="bx-count">{referenceCount}</span>}
        </button>
      </div>

      <span className="bx-divider" aria-hidden="true" />

      <div className="bx-toolbar__end">
        {deviceMenu}

        <BrowserMenu
          open={moreOpen}
          onOpenChange={setMoreOpen}
          label="More browser actions"
          align="end"
          width="15rem"
          trigger={(triggerProps) => (
            <button {...triggerProps} type="button" className="bx-btn" aria-label="More actions" title="More actions">
              <DotsThreeVertical size={16} weight="bold" aria-hidden="true" />
            </button>
          )}
        >
          <button type="button" role="menuitem" className="bx-menu__item" onClick={runAndClose(props.onOpenExternal)} disabled={pageless}>
            <ArrowSquareOut size={14} aria-hidden="true" />
            <span className="bx-menu__text">Open in system browser</span>
          </button>
          <button type="button" role="menuitem" className="bx-menu__item" onClick={runAndClose(props.onTogglePopout)} disabled={pageless && !isPoppedOut}>
            <AppWindow size={14} aria-hidden="true" />
            <span className="bx-menu__text">{isPoppedOut ? 'Dock browser here' : 'Open in separate window'}</span>
          </button>
          <button type="button" role="menuitem" className="bx-menu__item" onClick={runAndClose(props.onExportSnapshot)} disabled={pageless}>
            <DownloadSimple size={14} aria-hidden="true" />
            <span className="bx-menu__text">Export page snapshot</span>
            <span className="bx-menu__meta">.html</span>
          </button>
          <div className="bx-menu__separator" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={autoReload}
            className="bx-menu__item"
            onClick={props.onToggleAutoReload}
          >
            <ArrowsClockwise size={14} aria-hidden="true" />
            <span className="bx-menu__text">Auto-reload on file changes</span>
            {autoReload && <Check size={12} aria-hidden="true" />}
          </button>
        </BrowserMenu>
      </div>

      {isLoading && !pageless && <div className="bx-progress" aria-hidden="true" />}
    </div>
  );
});

BrowserToolbar.displayName = 'BrowserToolbar';
