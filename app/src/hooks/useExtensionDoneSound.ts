import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import { playExtensionDoneSound } from '../utils/agentDoneNotifier';

/** Plays the extension done sound when an extension panel finishes a task. */
export function useExtensionDoneSound(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<{ panelId: string }>('extension-panel-task-complete', () => {
      const { extensionDoneSoundEnabled, notificationSoundVolume } = useAppStore.getState();
      if (extensionDoneSoundEnabled) playExtensionDoneSound(notificationSoundVolume);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
