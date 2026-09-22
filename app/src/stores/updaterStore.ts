import { create } from 'zustand';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

interface UpdaterState {
  checking: boolean;
  downloading: boolean;
  downloadProgress: number;
  updateAvailable: UpdateInfo | null;
  upToDate: boolean;
  error: string | null;
  lastChecked: number;

  checkForUpdates: (force?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<boolean>;
  dismissUpdate: () => void;
  clearError: () => void;
  resetUpToDate: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  checking: false,
  downloading: false,
  downloadProgress: 0,
  updateAvailable: null,
  upToDate: false,
  error: null,
  lastChecked: 0,

  checkForUpdates: async (force = false) => {
    const { lastChecked } = get();
    
    if (!force && Date.now() - lastChecked < 30000) {
      return;
    }

    if (import.meta.env.DEV) {
      set({ checking: true, error: null, upToDate: false });
      await new Promise((r) => setTimeout(r, 800));
      set({ upToDate: true, checking: false, lastChecked: Date.now() });
      return;
    }

    set({ checking: true, error: null, upToDate: false });

    try {
      const update = await check();
      console.log('[Updater] Check result:', update);

      if (update) {
        set({
          updateAvailable: {
            version: update.version,
            currentVersion: update.currentVersion,
            date: update.date,
            body: update.body,
          },
          upToDate: false,
          checking: false,
          lastChecked: Date.now(),
        });
      } else {
        set({
          updateAvailable: null,
          upToDate: true,
          checking: false,
          lastChecked: Date.now(),
        });
      }
    } catch (err) {
      console.error('[Updater] Check failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      set({
        error: errorMessage || 'Failed to check for updates',
        checking: false,
      });
    }
  },

  downloadAndInstall: async () => {
    try {
      const update = await check();

      if (!update) {
        set({ error: 'No update available' });
        return false;
      }

      set({ downloading: true, downloadProgress: 0, error: null });

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            set({ downloadProgress: 0 });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              const progress = (downloaded / contentLength) * 100;
              set({ downloadProgress: Math.round(progress) });
            }
            break;
          case 'Finished':
            set({ downloadProgress: 100 });
            break;
        }
      });

      await relaunch();
      return true;
    } catch (err) {
      console.error('[Updater] Download/install failed:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to install update',
        downloading: false,
      });
      return false;
    }
  },

  dismissUpdate: () => {
    set({ updateAvailable: null });
  },

  clearError: () => {
    set({ error: null });
  },

  resetUpToDate: () => {
    set({ upToDate: false });
  },
}));
