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
/** ...and done this long after the assistant's last activity. */
const DONE_REPORT_DELAY_MS = 3000;

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
