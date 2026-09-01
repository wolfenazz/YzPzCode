import { useEffect, useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import type { GitDiffStat, GitFileStatus } from '../types';

interface FileWatcherState {
  refreshGitStatus: () => Promise<void>;
  isRefreshingGit: boolean;
  gitRefreshError: string | null;
}

export const useFileWatcher = (workspacePath: string | null): FileWatcherState => {
  const setGitStatuses = useAppStore((s) => s.setGitStatuses);
  const setGitDiffStats = useAppStore((s) => s.setGitDiffStats);
  const [isRefreshingGit, setIsRefreshingGit] = useState(false);
  const [gitRefreshError, setGitRefreshError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const activeWorkspacePathRef = useRef(workspacePath);
  activeWorkspacePathRef.current = workspacePath;

  const refreshGitStatus = useCallback(async () => {
    if (!workspacePath) return;
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    setIsRefreshingGit(true);
    setGitRefreshError(null);

    try {
      do {
        refreshQueuedRef.current = false;

        const [statuses, diffStats] = await Promise.all([
          invoke<GitFileStatus[]>('get_git_status', { workspacePath }),
          invoke<GitDiffStat[]>('get_git_diff_stats', { workspacePath }),
        ]);

        if (activeWorkspacePathRef.current !== workspacePath) return;
        setGitStatuses(statuses);
        setGitDiffStats(diffStats);
      } while (refreshQueuedRef.current);
    } catch (error) {
      if (activeWorkspacePathRef.current === workspacePath) {
        setGitRefreshError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      refreshInFlightRef.current = false;
      if (activeWorkspacePathRef.current === workspacePath) {
        setIsRefreshingGit(false);
      }
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

    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setupListener = async () => {
      try {
        const stopListening = await listen('file-system-changed', debouncedRefresh);
        if (disposed) {
          stopListening();
          return;
        }
        unlisten = stopListening;
        await invoke('start_fs_watcher', { workspacePath });
        if (!disposed) {
          await refreshGitStatus();
        }
      } catch (error) {
        if (!disposed) {
          console.error('Failed to start file watcher:', error);
          setGitRefreshError(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void setupListener();

    return () => {
      disposed = true;
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
  }, [workspacePath, debouncedRefresh, refreshGitStatus]);

  return { refreshGitStatus, isRefreshingGit, gitRefreshError };
};
