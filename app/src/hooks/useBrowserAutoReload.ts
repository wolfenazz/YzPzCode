import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import { useBrowser } from './useBrowser';

interface FileSystemChangedPayload {
  workspacePath: string;
  paths: string[];
}

const RELOAD_QUIET_MS = 750;
const RELOAD_MAX_DELAY_MS = 4_000;

/**
 * Hot-reload for the embedded browser: when files in the workspace change and
 * the active tab points at a local dev server, reload the webview after the
 * change storm quiets down (debounce that resets on churn, but capped so a
 * running build doesn't starve the refresh). Capture modes (inspect / pick /
 * apply) intentionally pause the watcher.
 */
export const useBrowserAutoReload = (workspaceId: string, webviewVisible: boolean) => {
  const { reloadBrowserView } = useBrowser();
  const quietTimerRef = useRef<number | null>(null);
  const capTimerRef = useRef<number | null>(null);
  const pendingUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!webviewVisible) return;

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    const setup = async () => {
      unlisten = await listen<FileSystemChangedPayload>('file-system-changed', () => {
        if (cancelled) return;
        const state = useAppStore.getState().browserStateByWorkspace[workspaceId];
        if (!state) return;
        const activeTab = state.browserTabs.find((t) => t.id === state.activeTabId);
        const url = activeTab?.url ?? state.currentUrl;
        if (!url || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?($|\/)/i.test(url)) return;
        // Skip while a capture/apply mode is active — reloading under an
        // inspect overlay would rip the overlay out from under the user.
        if (state.inspectMode || state.pickStyleMode || state.pickUiElementMode || state.applyMode) return;

        pendingUrlRef.current = url;

        // Debounce: restart the quiet timer on every change...
        if (quietTimerRef.current !== null) window.clearTimeout(quietTimerRef.current);
        quietTimerRef.current = window.setTimeout(() => {
          quietTimerRef.current = null;
          if (cancelled) return;
          if (pendingUrlRef.current) {
            pendingUrlRef.current = null;
            void reloadBrowserView(workspaceId).catch(() => undefined);
          }
        }, RELOAD_QUIET_MS);

        // ...but cap the total wait so long build churn doesn't starve it.
        if (capTimerRef.current === null) {
          capTimerRef.current = window.setTimeout(() => {
            capTimerRef.current = null;
            if (cancelled) return;
            if (pendingUrlRef.current) {
              pendingUrlRef.current = null;
              void reloadBrowserView(workspaceId).catch(() => undefined);
            }
          }, RELOAD_MAX_DELAY_MS);
        }
      });
    };

    void setup();

    return () => {
      cancelled = true;
      if (quietTimerRef.current !== null) window.clearTimeout(quietTimerRef.current);
      if (capTimerRef.current !== null) window.clearTimeout(capTimerRef.current);
      quietTimerRef.current = null;
      capTimerRef.current = null;
      if (unlisten) unlisten();
    };
  }, [workspaceId, webviewVisible, reloadBrowserView]);
};