import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DotsSixVertical, PuzzlePiece, X } from '@phosphor-icons/react';
import { useSortable } from '@dnd-kit/sortable';
import { useAppStore } from '../../stores/appStore';
import { useExtensionStore } from '../../stores/extensionStore';
import { getExtensionIcon } from '../../data/extensionIcons';
import { TerminalLayoutPicker } from './TerminalLayoutPicker';
import type { WorkspaceConfig, WorkspaceExtensionPanel } from '../../types';

interface ExtensionPaneProps {
  panel: WorkspaceExtensionPanel;
  workspace: WorkspaceConfig;
  visible: boolean;
  suspended: boolean;
}

interface PanelSync {
  panelId: string;
  bounds: { x: number; y: number; width: number; height: number };
  visible: boolean;
}

export function ExtensionPane({ panel, workspace, visible, suspended }: ExtensionPaneProps): React.JSX.Element {
  const appZoom = useAppStore((state) => state.appZoom);
  const closePanel = useExtensionStore((state) => state.closePanel);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [closing, setClosing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: panel.id });
  const syncPanel = useCallback((request: PanelSync): Promise<void> => {
    const next = syncChainRef.current.catch(() => undefined).then(() => invoke<void>('sync_extension_panel', { ...request }));
    syncChainRef.current = next;
    return next;
  }, []);

  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    setReady(false);
    setError(null);
    void invoke('start_extension_panel', { panelId: panel.id, workspaceId: workspace.id, workspacePath: workspace.path, extensionId: panel.extensionId })
      .then(() => { if (!disposed) setReady(true); })
      .catch((error: unknown) => { if (!disposed) setError(String(error)); });
    return () => { disposed = true; };
  }, [panel.id, panel.extensionId, workspace.id, workspace.path, attempt, visible]);

  useEffect(() => {
    if (!ready || error) return;
    const content = contentRef.current;
    if (!content) return;
    let frame = 0;
    let disposed = false;
    let running = false;
    let desired: PanelSync | null = null;
    let previous = '';
    const flush = async (): Promise<void> => {
      if (running) return;
      running = true;
      while (desired && !disposed) {
        const request = desired;
        desired = null;
        try { await syncPanel(request); }
        catch (error) { if (!disposed) setError(String(error)); }
      }
      running = false;
    };
    const measure = (): void => {
      frame = 0;
      if (disposed) return;
      const rect = content.getBoundingClientRect();
      const modal = [...document.querySelectorAll('[aria-modal="true"], [role="dialog"], .fixed.inset-0')].some((element) => element.getClientRects().length > 0);
      const shown = visible && !closing && !suspended && !isDragging && !modal && rect.width > 0 && rect.height > 0;
      const viewport = content.closest('.workspace-view')?.getBoundingClientRect();
      const x = Math.max(rect.x, viewport?.left ?? 0);
      const y = Math.max(rect.y, viewport?.top ?? 0);
      const right = Math.min(rect.right, viewport?.right ?? window.innerWidth);
      const bottom = Math.min(rect.bottom, viewport?.bottom ?? window.innerHeight);
      // DOM bounds are CSS pixels in the zoomed main webview. Tauri child
      // webviews use unzoomed logical pixels, just like the browser panel.
      const appZoomFactor = appZoom / 100;
      const request: PanelSync = {
        panelId: panel.id,
        bounds: {
          x: x * appZoomFactor,
          y: y * appZoomFactor,
          width: Math.max(0, right - x) * appZoomFactor,
          height: Math.max(0, bottom - y) * appZoomFactor,
        },
        visible: shown,
      };
      const key = JSON.stringify(request);
      if (key === previous) return;
      previous = key;
      desired = request;
      void flush();
    };
    const schedule = (): void => { if (!frame && !disposed) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(content);
    // Native child views must follow animated sidebar widths and modal visibility.
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-modal'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      // Queue hiding behind any outstanding bounds update to prevent stale shows.
      void syncPanel({ panelId: panel.id, bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false }).catch(() => undefined);
    };
  }, [panel.id, ready, visible, suspended, isDragging, error, closing, syncPanel, appZoom]);

  const handleClose = useCallback(async (): Promise<void> => {
    setClosing(true);
    try { await closePanel(panel.id); }
    catch (error) { setError(String(error)); setClosing(false); }
  }, [panel.id, closePanel]);

  return (
    <section ref={setNodeRef} className={`app-surface flex h-full min-h-0 flex-col overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-primary)] ${isDragging ? 'opacity-40' : ''}`} aria-label={`${panel.name} extension panel`}>
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2">
        <button type="button" {...attributes} {...listeners} className="app-icon-button app-icon-button--compact cursor-grab" aria-label={`Move ${panel.name} panel`}><DotsSixVertical size={14} /></button>
        {getExtensionIcon(panel.extensionId) ? <img src={getExtensionIcon(panel.extensionId)} alt="" className="h-4 w-4 shrink-0 object-contain" draggable={false} /> : <PuzzlePiece size={14} className="shrink-0 text-[var(--text-secondary)]" />}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{panel.name}</span>
        <span className="text-[9px] text-[var(--text-secondary)]">Extension</span>
        <TerminalLayoutPicker panelId={panel.id} panelName={panel.name} />
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={() => void handleClose()} disabled={closing} aria-label={`Close ${panel.name}`} title={`Close ${panel.name}`}><X size={14} /></button>
      </header>
      <div ref={contentRef} className="relative min-h-0 flex-1 overflow-hidden">
        {error ? <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center"><p role="alert" className="max-w-sm break-words text-xs leading-5 text-rose-500">{error}</p><button type="button" className="app-button" onClick={() => setAttempt((value) => value + 1)}>Retry opening</button></div> : !ready ? <p role="status" className="flex h-full items-center justify-center p-4 text-xs text-[var(--text-secondary)]">Starting {panel.name} extension…</p> : null}
      </div>
    </section>
  );
}
