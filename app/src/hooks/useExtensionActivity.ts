import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import { useExtensionStore } from '../stores/extensionStore';
import { playExtensionDoneSound } from '../utils/agentDoneNotifier';

/**
 * Records whether each extension panel's assistant is working or has finished,
 * and plays the extension done sound. Detection runs inside the panel's
 * webview (src-tauri/src/extension_host/webview-activity.js).
 *
 * Listening app-wide keeps the state while the Extensions view is closed, so a
 * panel that finished in the background still shows as done when reopened.
 */

/** The webview reports busy about this long after the user submits. */
const BUSY_REPORT_DELAY_MS = 1000;
/** ...and done this long after the assistant's last activity (QUIET_MS in webview-activity.js). */
const DONE_REPORT_DELAY_MS = 5000;

export function useExtensionActivity(): void {
  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const track = (promise: Promise<() => void>) => {
      void promise.then((unlisten) => {
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      });
    };

    // Presses inside an extension pane or dock tab focus that panel; any other
    // press moves focus away. Presses inside the assistant's webview never reach
    // the page, so those come in as `extension-panel-focus` below.
    const onPointerDown = (event: PointerEvent) => {
      const panel = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-extension-panel-id]') : null;
      useExtensionStore.getState().setFocusedPanel(panel?.dataset.extensionPanelId ?? null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    unlisteners.push(() => document.removeEventListener('pointerdown', onPointerDown, true));

    track(listen<{ panelId: string }>('extension-panel-focus', ({ payload }) => {
      useExtensionStore.getState().setFocusedPanel(payload.panelId);
    }));

    track(listen<{ panelId: string; busy: boolean }>('extension-panel-activity', ({ payload }) => {
      const { activityByPanel, setPanelActivity } = useExtensionStore.getState();
      const current = activityByPanel[payload.panelId];
      if (payload.busy) {
        if (current?.phase === 'busy') return;
        setPanelActivity(payload.panelId, { phase: 'busy', startedAt: Date.now() - BUSY_REPORT_DELAY_MS });
      } else if (current?.phase === 'busy') {
        setPanelActivity(payload.panelId, { phase: 'idle' });
      }
    }));

    track(listen<{ panelId: string }>('extension-panel-task-complete', ({ payload }) => {
      const { activityByPanel, setPanelActivity } = useExtensionStore.getState();
      const current = activityByPanel[payload.panelId];
      // A completion only ends a run that is not already done. Anything else
      // is a duplicate event; replaying it would restart the done sound and
      // shorten the visible duration.
      if (current?.phase === 'done') return;
      const now = Date.now();
      setPanelActivity(payload.panelId, {
        phase: 'done',
        durationMs: current?.phase === 'busy' ? Math.max(0, now - DONE_REPORT_DELAY_MS - current.startedAt) : 0,
        finishedAt: now,
      });
      const { extensionDoneSoundEnabled, notificationSoundVolume } = useAppStore.getState();
      if (extensionDoneSoundEnabled) playExtensionDoneSound(notificationSoundVolume);
    }));

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}
