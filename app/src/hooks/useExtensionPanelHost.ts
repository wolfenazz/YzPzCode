import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import { useExtensionStore } from '../stores/extensionStore';
import type { WorkspaceConfig, WorkspaceExtensionPanel } from '../types';
import type { AgentActivityState } from '../utils/agentDoneNotifier';

/**
 * Hosts one extension panel's native webview over a DOM placeholder: starts the
 * panel's extension host, keeps the webview on top of `contentRef`, and tracks
 * the done-state hold. Shared by the Extensions view panes and the editor's side
 * panel, so a panel can move between them without restarting.
 */

interface PanelSync {
  panelId: string;
  bounds: { x: number; y: number; width: number; height: number };
  visible: boolean;
}

const IDLE_ACTIVITY: AgentActivityState = { phase: 'idle' };
/** How long a finished panel keeps its done state once it is on screen. */
const DONE_HOLD_MS = 8000;

// Syncs are queued per panel, not per component: when a panel moves between
// the grid and the side panel, the old host's "hide" must land before the new
// host's "show".
const syncChains = new Map<string, Promise<void>>();

function syncPanel(request: PanelSync): Promise<void> {
  const previous = syncChains.get(request.panelId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => invoke<void>('sync_extension_panel', { ...request }));
  syncChains.set(request.panelId, next);
  void next.catch(() => undefined).then(() => { if (syncChains.get(request.panelId) === next) syncChains.delete(request.panelId); });
  return next;
}

interface ExtensionPanelHostOptions {
  panel: WorkspaceExtensionPanel;
  workspace: WorkspaceConfig;
  contentRef: RefObject<HTMLElement | null>;
  /** Start the host and allow the webview on screen. */
  active: boolean;
  /** Temporarily keep the webview off screen (drags, animations, overlays). */
  hidden?: boolean;
}

interface ExtensionPanelHost {
  ready: boolean;
  error: string | null;
  closing: boolean;
  activity: AgentActivityState;
  retry: () => void;
  close: () => Promise<void>;
}

export function useExtensionPanelHost({ panel, workspace, contentRef, active, hidden = false }: ExtensionPanelHostOptions): ExtensionPanelHost {
  const appZoom = useAppStore((state) => state.appZoom);
  const closePanel = useExtensionStore((state) => state.closePanel);
  const activity = useExtensionStore((state) => state.activityByPanel[panel.id]) ?? IDLE_ACTIVITY;
  const setPanelActivity = useExtensionStore((state) => state.setPanelActivity);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    setReady(false);
    setError(null);
    void invoke('start_extension_panel', { panelId: panel.id, workspaceId: workspace.id, workspacePath: workspace.path, extensionId: panel.extensionId })
      .then(() => { if (!disposed) setReady(true); })
      .catch((error: unknown) => { if (!disposed) setError(String(error)); });
    return () => { disposed = true; };
  }, [panel.id, panel.extensionId, workspace.id, workspace.path, attempt, active]);

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
      const shown = active && !hidden && !closing && !modal && rect.width > 0 && rect.height > 0;
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
  }, [panel.id, ready, active, hidden, error, closing, appZoom, contentRef]);

  // The assistant runs in a native webview, so which panel the user is looking
  // at can't be observed; a finished panel stays marked for a while once shown.
  const finishedAt = activity.phase === 'done' ? activity.finishedAt : null;
  const onScreen = active && !hidden;
  useEffect(() => {
    if (finishedAt === null || !onScreen) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startHold = (): void => {
      clearTimeout(timer);
      if (document.visibilityState !== 'visible') return;
      timer = setTimeout(() => {
        const current = useExtensionStore.getState().activityByPanel[panel.id];
        if (current?.phase === 'done' && current.finishedAt === finishedAt) setPanelActivity(panel.id, IDLE_ACTIVITY);
      }, DONE_HOLD_MS);
    };
    startHold();
    document.addEventListener('visibilitychange', startHold);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', startHold);
    };
  }, [finishedAt, onScreen, panel.id, setPanelActivity]);

  // A host that failed or restarted can't finish the request it was working on.
  useEffect(() => {
    if (error && useExtensionStore.getState().activityByPanel[panel.id]?.phase === 'busy') setPanelActivity(panel.id, IDLE_ACTIVITY);
  }, [error, panel.id, setPanelActivity]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const close = useCallback(async (): Promise<void> => {
    setClosing(true);
    try { await closePanel(panel.id); }
    catch (error) { setError(String(error)); setClosing(false); }
  }, [panel.id, closePanel]);

  return { ready, error, closing, activity, retry, close };
}
