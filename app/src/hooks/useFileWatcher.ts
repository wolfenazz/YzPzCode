import { useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import type { GitDiffStat } from '../types';

export const useFileWatcher = (workspacePath: string | null) => {
  const setGitStatuses = useAppStore((s) => s.setGitStatuses);
  const setGitDiffStats = useAppStore((s) => s.setGitDiffStats);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  const refreshGitStatus = useCallback(async () => {
    if (!workspacePath) return;
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;

    try {
      do {
        refreshQueuedRef.current = false;

        const [statuses, diffStats] = await Promise.all([
          invoke<any[]>('get_git_status', { workspacePath }),
          invoke<GitDiffStat[]>('get_git_diff_stats', { workspacePath }),
        ]);
        setGitStatuses(statuses);
        setGitDiffStats(diffStats);
      } while (refreshQueuedRef.current);
    } catch {
      setGitStatuses([]);
      setGitDiffStats([]);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [workspacePath, setGitStatuses, setGitDiffStats]);

  const debouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      refreshGitStatus();
    }, 300);
  }, [refreshGitStatus]);

  useEffect(() => {
    refreshInFlightRef.current = false;
    refreshQueuedRef.current = false;

    if (!workspacePath) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      return;
    }

    invoke('start_fs_watcher', { workspacePath }).catch((err) => {
      console.error('Failed to start file watcher:', err);
    });

    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen('file-system-changed', debouncedRefresh);
    };
    setupListener();

    return () => {
      invoke('stop_fs_watcher').catch((err) => {
        console.error('Failed to stop file watcher:', err);
      });
      if (unlisten) unlisten();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      refreshInFlightRef.current = false;
      refreshQueuedRef.current = false;
    };
  }, [workspacePath, debouncedRefresh]);
};
