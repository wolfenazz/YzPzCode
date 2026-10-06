import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { ArrowRight, DownloadSimple, Plus, PuzzlePiece, SidebarSimple, SquaresFour, X } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { DEFAULT_DOCK_STATE, DOCK_DEFAULT_WIDTH, DOCK_MIN_WIDTH, EMPTY_EXTENSION_PANELS, isSidePanel, useExtensionStore } from '../../stores/extensionStore';
import { useTerminalLayoutStore } from '../../stores/terminalLayoutStore';
import { useExtensionPanelHost } from '../../hooks/useExtensionPanelHost';
import { ExtensionLogo } from '../common/ExtensionLogo';
import { AgentActivityAura } from './AgentActivityIndicator';
import type { AgentActivityState } from '../../utils/agentDoneNotifier';
import type { ExtensionInfo, WorkspaceConfig, WorkspaceExtensionPanel } from '../../types';
import './ExtensionDock.css';

/**
 * The editor's right side panel: extension assistants (Claude Code, Antigravity…)
 * docked beside the code, like VS Code's secondary sidebar.
 *
 * Each assistant is a native webview drawn above the DOM, so the webview is kept
 * off screen while the panel slides, while the launcher is shown, and while the
 * editor view is hidden; the DOM splash underneath fills those moments.
 */

/** Room the editor keeps when the side panel is widened. */
const EDITOR_MIN_WIDTH = 320;
const DOCK_MAX_WIDTH = 1100;
const SLIDE_MS = 340;
const SLIDE_EASE = [0.22, 1, 0.36, 1] as const;
const IDLE_ACTIVITY: AgentActivityState = { phase: 'idle' };

function useMotionEnabled(): boolean {
  const animationsEnabled = useAppStore((state) => state.animationsEnabled);
  const reduceMotion = useReducedMotion();
  return animationsEnabled && !reduceMotion;
}

interface ExtensionDockProps {
  workspace: WorkspaceConfig;
  /** False while the editor view is hidden; the webviews must leave the screen with it. */
  visible: boolean;
  /** Opens the full Extensions catalog in the left sidebar. */
  onBrowseExtensions: () => void;
}

export function ExtensionDock({ workspace, visible, onBrowseExtensions }: ExtensionDockProps): React.JSX.Element {
  const open = useExtensionStore((state) => (state.dockByWorkspace[workspace.id] ?? DEFAULT_DOCK_STATE).open);
  return (
    <AnimatePresence initial={false}>
      {open && <DockFrame key="dock" workspace={workspace} visible={visible} onBrowseExtensions={onBrowseExtensions} />}
    </AnimatePresence>
  );
}

function DockFrame({ workspace, visible, onBrowseExtensions }: ExtensionDockProps): React.JSX.Element {
  const framePresent = useIsPresent();
  const motionOn = useMotionEnabled();
  const activityGlowEnabled = useAppStore((state) => state.agentActivityGlowEnabled);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const dock = useExtensionStore((state) => state.dockByWorkspace[workspace.id]) ?? DEFAULT_DOCK_STATE;
  const allPanels = useExtensionStore((state) => state.panelsByWorkspace[workspace.id] ?? EMPTY_EXTENSION_PANELS);
  const setDockOpen = useExtensionStore((state) => state.setDockOpen);
  const setDockWidth = useExtensionStore((state) => state.setDockWidth);
  const setDockActivePanel = useExtensionStore((state) => state.setDockActivePanel);
  const movePanel = useExtensionStore((state) => state.movePanel);
  const closePanel = useExtensionStore((state) => state.closePanel);
  const panels = useMemo(() => allPanels.filter(isSidePanel), [allPanels]);
  const activePanel = panels.find((panel) => panel.id === dock.activePanelId) ?? panels[0] ?? null;
  const activity = useExtensionStore((state) => (activePanel ? state.activityByPanel[activePanel.id] : undefined)) ?? IDLE_ACTIVITY;

  const asideRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragWidthRef = useRef<number | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [closingIds, setClosingIds] = useState<string[]>([]);
  // The webview waits for the slide-in to finish; the splash covers it meanwhile.
  const [sliding, setSliding] = useState(motionOn);

  useEffect(() => {
    if (!sliding) return;
    const timer = setTimeout(() => setSliding(false), SLIDE_MS + 40);
    return () => clearTimeout(timer);
  }, [sliding]);

  // Keep the editor usable when the window narrows. A hidden editor measures 0;
  // keep the last real size so the panel doesn't animate on the way back.
  useLayoutEffect(() => {
    const container = asideRef.current?.parentElement;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width); });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const maxWidth = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, (containerWidth ?? Infinity) - EDITOR_MIN_WIDTH));
  const width = Math.min(maxWidth, Math.max(DOCK_MIN_WIDTH, dragWidth ?? dock.width));

  // A stale active id (closed elsewhere, restored layout) falls back to the first tab.
  useEffect(() => {
    if (activePanel && activePanel.id !== dock.activePanelId) setDockActivePanel(workspace.id, activePanel.id);
  }, [activePanel, dock.activePanelId, setDockActivePanel, workspace.id]);

  const showLauncher = launcherOpen || panels.length === 0;
  const hideWebviews = !visible || !framePresent || sliding || showLauncher;

  const selectPanel = useCallback((panelId: string) => {
    setLauncherOpen(false);
    setDockActivePanel(workspace.id, panelId);
  }, [setDockActivePanel, workspace.id]);

  const handleClosePanel = useCallback(async (panel: WorkspaceExtensionPanel) => {
    setClosingIds((ids) => [...ids, panel.id]);
    try { await closePanel(panel.id); }
    catch (error) { console.error(`Could not close ${panel.name}:`, error); }
    finally { setClosingIds((ids) => ids.filter((id) => id !== panel.id)); }
  }, [closePanel]);

  const moveToExtensionsView = useCallback((panel: WorkspaceExtensionPanel) => {
    movePanel(panel.id, 'grid');
    const layouts = useTerminalLayoutStore.getState();
    const layoutId = `extensions:${workspace.id}`;
    layouts.setArrangement(layoutId, layouts.arrangements[layoutId]?.preset ?? 'grid', panel.id);
    setActiveView('extensions');
  }, [movePanel, setActiveView, workspace.id]);

  // ── Resize ───────────────────────────────────────────────────────────
  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragWidthRef.current = width;
    setDragWidth(width);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const moveResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const right = asideRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    const next = Math.min(maxWidth, Math.max(DOCK_MIN_WIDTH, right - event.clientX));
    dragWidthRef.current = next;
    setDragWidth(next);
  };
  const endResize = (): void => {
    const finalWidth = dragWidthRef.current;
    if (finalWidth === null) return;
    dragWidthRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setDockWidth(workspace.id, finalWidth);
    setDragWidth(null);
  };
  const keyResize = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 64 : 16;
    if (event.key === 'ArrowLeft') setDockWidth(workspace.id, Math.min(maxWidth, width + step));
    else if (event.key === 'ArrowRight') setDockWidth(workspace.id, Math.max(DOCK_MIN_WIDTH, width - step));
    else if (event.key === 'Home') setDockWidth(workspace.id, DOCK_DEFAULT_WIDTH);
    else return;
    event.preventDefault();
  };

  const resizing = dragWidth !== null;
  const showAura = activityGlowEnabled && !showLauncher && activity.phase !== 'idle';
  const slide = motionOn ? { duration: SLIDE_MS / 1000, ease: SLIDE_EASE } : { duration: 0 };

  return (
    <motion.aside
      ref={asideRef}
      className={`xd${resizing ? ' xd--resizing' : ''}`}
      initial={{ width: 0 }}
      animate={{ width }}
      exit={{ width: 0 }}
      transition={resizing ? { duration: 0 } : slide}
      aria-label="Extension side panel"
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize side panel"
        aria-valuenow={Math.round(width)}
        aria-valuemin={DOCK_MIN_WIDTH}
        aria-valuemax={Math.round(maxWidth)}
        className="xd__resizer"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onLostPointerCapture={endResize}
        onDoubleClick={() => setDockWidth(workspace.id, DOCK_DEFAULT_WIDTH)}
        onKeyDown={keyResize}
      />
      <motion.div
        className={`xd__frame ext-pane${showAura ? ` term-pane--${activity.phase}` : ''}`}
        style={{ width }}
        initial={motionOn ? { x: 36, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        exit={motionOn ? { x: 36, opacity: 0 } : { opacity: 0 }}
        transition={slide}
      >
        <header className="xd__bar ext-header">
          <div className="xd__tabs" role="tablist" aria-label="Side panel extensions">
            {panels.map((panel) => (
              <DockTab
                key={panel.id}
                panel={panel}
                workspaceId={workspace.id}
                selected={!showLauncher && panel.id === activePanel?.id}
                motionOn={motionOn}
                onSelect={() => selectPanel(panel.id)}
                onClose={() => void handleClosePanel(panel)}
              />
            ))}
            <button
              type="button"
              className={`xd__add${showLauncher ? ' is-active' : ''}`}
              onClick={() => setLauncherOpen((value) => panels.length === 0 ? true : !value)}
              aria-pressed={showLauncher}
              title="Open an extension in the side panel"
              aria-label="Open an extension in the side panel"
            >
              <Plus size={13} weight="bold" />
            </button>
          </div>
          <div className="xd__actions">
            {activePanel && !showLauncher && (
              <button type="button" className="app-icon-button app-icon-button--compact" onClick={() => moveToExtensionsView(activePanel)} title="Move to Extensions view" aria-label={`Move ${activePanel.name} to the Extensions view`}>
                <SquaresFour size={14} />
              </button>
            )}
            <button type="button" className="app-icon-button app-icon-button--compact" onClick={() => setDockOpen(workspace.id, false)} title="Hide side panel (Ctrl+Alt+B)" aria-label="Hide side panel">
              <SidebarSimple size={14} mirrored />
            </button>
          </div>
        </header>

        <div className="xd__body">
          {panels.map((panel) => (
            <DockPanelView
              key={panel.id}
              panel={panel}
              workspace={workspace}
              active={panel.id === activePanel?.id}
              hidden={hideWebviews || closingIds.includes(panel.id)}
            />
          ))}
          <AnimatePresence initial={false}>
            {showLauncher && (
              <DockLauncher
                key="launcher"
                workspace={workspace}
                motionOn={motionOn}
                canDismiss={panels.length > 0}
                onDismiss={() => setLauncherOpen(false)}
                onOpened={() => setLauncherOpen(false)}
                onBrowseExtensions={onBrowseExtensions}
              />
            )}
          </AnimatePresence>
        </div>
        {showAura && <AgentActivityAura activity={activity} />}
      </motion.div>
    </motion.aside>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────

interface DockTabProps {
  panel: WorkspaceExtensionPanel;
  workspaceId: string;
  selected: boolean;
  motionOn: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function DockTab({ panel, workspaceId, selected, motionOn, onSelect, onClose }: DockTabProps): React.JSX.Element {
  const phase = useExtensionStore((state) => state.activityByPanel[panel.id]?.phase ?? 'idle');
  const status = phase === 'busy' ? `${panel.name} is working` : phase === 'done' ? `${panel.name} finished` : panel.name;
  return (
    <div className={`xd__tab${selected ? ' is-selected' : ''}`} data-phase={phase}>
      {selected && (
        <motion.span
          layoutId={`xd-tab-${workspaceId}`}
          className="xd__tab-pill"
          transition={motionOn ? { type: 'spring', stiffness: 520, damping: 40 } : { duration: 0 }}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        className="xd__tab-main"
        onClick={onSelect}
        onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); onClose(); } }}
        title={status}
      >
        <span className="xd__tab-logo">
          <ExtensionLogo extensionId={panel.extensionId} name={panel.name} small />
          {phase !== 'idle' && <span className="xd__tab-dot" aria-hidden="true" />}
        </span>
        <span className="xd__tab-label">{panel.name}</span>
      </button>
      <button type="button" className="xd__tab-close" onClick={onClose} title={`Close ${panel.name}`} aria-label={`Close ${panel.name}`}>
        <X size={11} weight="bold" />
      </button>
    </div>
  );
}

// ── Panel view ───────────────────────────────────────────────────────────

interface DockPanelViewProps {
  panel: WorkspaceExtensionPanel;
  workspace: WorkspaceConfig;
  active: boolean;
  hidden: boolean;
}

/** Holds a panel's webview; the splash shows whenever the webview is off screen. */
function DockPanelView({ panel, workspace, active, hidden }: DockPanelViewProps): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  const { ready, error, retry } = useExtensionPanelHost({ panel, workspace, contentRef, active, hidden });
  return (
    <div
      ref={contentRef}
      role="tabpanel"
      aria-label={panel.name}
      aria-hidden={!active}
      className={`xd__view${active ? ' is-active' : ''}`}
    >
      {active && (error ? (
        <div className="xd__splash">
          <ExtensionLogo extensionId={panel.extensionId} name={panel.name} />
          <p role="alert" className="xd__error">{error}</p>
          <button type="button" className="app-button h-8 min-h-0 px-3 text-xs" onClick={retry}>Retry opening</button>
        </div>
      ) : (
        <div className={`xd__splash${ready ? '' : ' is-starting'}`} role="status">
          <span className="xd__splash-logo"><ExtensionLogo extensionId={panel.extensionId} name={panel.name} /></span>
          <span className="xd__splash-title">{panel.name}</span>
          {!ready && <span className="xd__splash-hint">Starting extension…</span>}
        </div>
      ))}
    </div>
  );
}

// ── Launcher ─────────────────────────────────────────────────────────────

interface DockLauncherProps {
  workspace: WorkspaceConfig;
  motionOn: boolean;
  canDismiss: boolean;
  onDismiss: () => void;
  onOpened: () => void;
  onBrowseExtensions: () => void;
}

function DockLauncher({ workspace, motionOn, canDismiss, onDismiss, onOpened, onBrowseExtensions }: DockLauncherProps): React.JSX.Element {
  const catalog = useExtensionStore((state) => state.catalog);
  const backendReady = useExtensionStore((state) => state.backendReady);
  const loading = useExtensionStore((state) => state.loading);
  const error = useExtensionStore((state) => state.error);
  const installing = useExtensionStore((state) => state.installing);
  const progress = useExtensionStore((state) => state.progress);
  const refreshCatalog = useExtensionStore((state) => state.refreshCatalog);
  const install = useExtensionStore((state) => state.install);
  const openPanel = useExtensionStore((state) => state.openPanel);

  useEffect(() => { if (!backendReady) void refreshCatalog(); }, [backendReady, refreshCatalog]);

  const sorted = useMemo(() => [...catalog].sort((a, b) => Number(Boolean(b.installedVersion)) - Number(Boolean(a.installedVersion))), [catalog]);

  const open = (extension: ExtensionInfo): void => {
    if (openPanel(workspace.id, extension, 'side')) onOpened();
  };

  return (
    <motion.section
      className="xd__launcher"
      aria-label="Open an extension in the side panel"
      initial={motionOn ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={motionOn ? { opacity: 0, y: 6, transition: { duration: 0.14 } } : { opacity: 0, transition: { duration: 0 } }}
      transition={{ duration: 0.26, ease: SLIDE_EASE }}
    >
      <div className="xd__launcher-head">
        <span className="xd__launcher-icon" aria-hidden="true"><PuzzlePiece size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="xd__launcher-title">Side panel</h2>
          <p className="xd__launcher-sub">Run an assistant beside your code. It works in {workspace.name}.</p>
        </div>
        {canDismiss && (
          <button type="button" className="app-icon-button app-icon-button--compact" onClick={onDismiss} title="Back to open extensions" aria-label="Back to open extensions"><X size={14} /></button>
        )}
      </div>

      <div className="xd__launcher-list" aria-busy={loading}>
        {error && !backendReady && (
          <div role="alert" className="xd__launcher-note xd__launcher-note--error">
            <p>{error}</p>
            <button type="button" className="app-button h-7 min-h-0 px-2.5 text-xs" onClick={() => void refreshCatalog()}>Retry</button>
          </div>
        )}
        {sorted.map((extension, index) => {
          const busy = installing.includes(extension.id);
          const status = progress[extension.id];
          const percent = status?.totalBytes ? Math.min(100, Math.round(status.downloadedBytes / status.totalBytes * 100)) : null;
          const installed = Boolean(extension.installedVersion);
          return (
            <motion.article
              key={extension.id}
              className="xd__card"
              initial={motionOn ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: SLIDE_EASE, delay: motionOn ? 0.04 + index * 0.035 : 0 }}
            >
              <button
                type="button"
                className="xd__card-main"
                disabled={!backendReady || busy}
                onClick={() => installed ? open(extension) : void install(extension.id)}
                aria-label={installed ? `Open ${extension.name} in the side panel` : `Install ${extension.name}`}
              >
                <ExtensionLogo extensionId={extension.id} name={extension.name} />
                <span className="min-w-0 flex-1">
                  <span className="xd__card-name">{extension.name}</span>
                  <span className="xd__card-meta">
                    {busy && status ? `${status.message}${percent !== null ? ` ${percent}%` : ''}`
                      : status?.stage === 'failed' ? 'Install failed — click to retry'
                      : installed ? `${extension.publisher} · v${extension.installedVersion}` : `${extension.publisher} · Not installed`}
                  </span>
                </span>
                <span className={`xd__card-cta${installed ? ' is-open' : ''}`} aria-hidden="true">
                  {busy ? <span className="xd__spinner" /> : installed ? <>Open<ArrowRight size={12} weight="bold" /></> : <><DownloadSimple size={12} weight="bold" />Install</>}
                </span>
              </button>
              {busy && percent !== null && <span className="xd__card-progress" style={{ '--xd-progress': `${percent}%` } as CSSProperties} aria-hidden="true" />}
            </motion.article>
          );
        })}
        {loading && sorted.length === 0 && <p className="xd__launcher-note">Checking installed extensions…</p>}
      </div>

      <button type="button" className="xd__launcher-browse" onClick={onBrowseExtensions}>
        <PuzzlePiece size={13} />Browse all extensions
        <span className="xd__kbd">Ctrl+Shift+X</span>
      </button>
    </motion.section>
  );
}
