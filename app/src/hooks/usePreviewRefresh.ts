import { useCallback, useEffect, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

interface FileSystemChangedPayload {
  workspacePath: string;
  paths: string[];
}

/**
 * Returns a monotonically increasing `refreshKey` (that increments whenever
 * the given `filePath` changes on disk via the backend `file-system-changed`
 * watcher event) plus a `refresh` callback to trigger a manual reload.
 * Preview components include the key in their load effect deps so external
 * edits (e.g. "Open in Word/Excel/PowerPoint") refresh automatically, with a
 * manual button as a fallback.
 */
export const usePreviewRefresh = (filePath: string): { refreshKey: number; refresh: () => void } => {
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    const setupListener = async () => {
      unlisten = await listen<FileSystemChangedPayload>('file-system-changed', (event) => {
        if (cancelled) return;
        const changed = event.payload?.paths ?? [];
        const normalized = filePath.replace(/\\/g, '/').toLowerCase();
        const matches = changed.some((p) => p.replace(/\\/g, '/').toLowerCase() === normalized);
        if (matches) {
          setRefreshKey((k) => k + 1);
        }
      });
    };
    void setupListener();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [filePath]);

  return { refreshKey, refresh };
};
