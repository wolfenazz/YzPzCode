import { useEffect, useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import { normalizeFilePath, pathAffectedByChanges } from '../utils/fileSync';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from '../utils/mediaFiles';
import type { FileSystemChangedPayload } from '../utils/fileSync';
import type { FileContent, GitDiffStat, GitFileStatus } from '../types';

interface FileWatcherState {
  refreshGitStatus: () => Promise<void>;
  isRefreshingGit: boolean;
  gitRefreshError: string | null;
  fileSyncError: string | null;
}

// Order start/stop across async effect setup, workspace switches and StrictMode.
let watcherLifecycle: Promise<unknown> = Promise.resolve();
function scheduleWatcherOperation(operation: () => Promise<unknown>): Promise<unknown> {
  const next = watcherLifecycle.then(operation, operation);
  watcherLifecycle = next.catch(() => undefined);
  return next;
}

const PREVIEW_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tiff', 'tif', 'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'ppt', ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]);

export const useFileWatcher = (workspacePath: string | null): FileWatcherState => {
  const [isRefreshingGit, setIsRefreshingGit] = useState(false);
  const [gitRefreshError, setGitRefreshError] = useState<string | null>(null);
  const [fileSyncError, setFileSyncError] = useState<string | null>(null);
  const gitRunRef = useRef<{ path: string | null; pending: boolean; promise: Promise<void> | null }>({ path: workspacePath, pending: false, promise: null });
  if (gitRunRef.current.path !== workspacePath) gitRunRef.current = { path: workspacePath, pending: false, promise: null };

  const refreshGitStatus = useCallback(async (): Promise<void> => {
    if (!workspacePath) return;
    const run = gitRunRef.current;
    if (run.promise) { run.pending = true; return run.promise; }
    setIsRefreshingGit(true);
    run.promise = (async () => {
      do {
        run.pending = false;
        try {
          const [statuses, stats] = await Promise.all([
            invoke<GitFileStatus[]>('get_git_status', { workspacePath }),
            invoke<GitDiffStat[]>('get_git_diff_stats', { workspacePath }),
          ]);
          if (gitRunRef.current !== run) return;
          const state = useAppStore.getState();
          if (!state.currentWorkspace || normalizeFilePath(state.currentWorkspace.path) !== normalizeFilePath(workspacePath)) return;
          if (statuses.length !== state.gitStatuses.length || statuses.some((status, index) => status.path !== state.gitStatuses[index]?.path || status.change !== state.gitStatuses[index]?.change)) {
            state.setGitStatuses(statuses);
          }
          if (stats.length !== state.gitDiffStats.length || stats.some((stat, index) => stat.path !== state.gitDiffStats[index]?.path || stat.linesAdded !== state.gitDiffStats[index]?.linesAdded || stat.linesDeleted !== state.gitDiffStats[index]?.linesDeleted)) {
            state.setGitDiffStats(stats);
          }
          setGitRefreshError(null);
        } catch (error) {
          if (gitRunRef.current === run) setGitRefreshError(String(error));
        }
      } while (run.pending && gitRunRef.current === run);
    })().finally(() => {
      run.promise = null;
      if (gitRunRef.current === run) setIsRefreshingGit(false);
    });
    return run.promise;
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath) return;
    let disposed = false;
    let unlisten: UnlistenFn | null = null;
    let gitTimer: ReturnType<typeof setTimeout> | null = null;
    let syncing = false;
    const pendingPaths = new Set<string>();
    setFileSyncError(null);
    useAppStore.getState().setGitStatuses([]);
    useAppStore.getState().setGitDiffStats([]);

    const drainFiles = async (): Promise<void> => {
      if (syncing || disposed) return;
      syncing = true;
      try {
        while (pendingPaths.size > 0 && !disposed) {
          const paths = [...pendingPaths];
          pendingPaths.clear();
          const state = useAppStore.getState();
          const workspace = state.currentWorkspace;
          if (!workspace || normalizeFilePath(workspace.path) !== normalizeFilePath(workspacePath)) return;
          const workspaceId = workspace.id;
          const files = (state.filesByWorkspace[workspaceId] ?? []).filter((file) =>
            !file.binary && !PREVIEW_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() ?? '') && pathAffectedByChanges(file.path, paths));
          const results = await Promise.allSettled(files.map(async (file) => {
            let disk: FileContent | null;
            try {
              disk = await invoke<FileContent>('read_file_content', { path: file.path });
            } catch (error) {
              if (!String(error).startsWith('File does not exist:')) throw error;
              disk = null;
            }
            if (!disposed) useAppStore.getState().reconcileFileDisk(workspaceId, file.path, disk);
          }));
          if (!disposed) {
            const failure = results.find((result) => result.status === 'rejected');
            setFileSyncError(failure?.status === 'rejected' ? `Could not refresh an open file: ${String(failure.reason)}` : null);
          }
        }
      } finally { syncing = false; }
    };
    const queueFiles = (paths: string[]): void => {
      for (const path of paths.length ? paths : [workspacePath]) pendingPaths.add(path);
      void drainFiles();
    };
    const queueGit = (): void => {
      // A fixed deadline cannot be starved by continuous agent output.
      if (gitTimer !== null) return;
      gitTimer = setTimeout(() => { gitTimer = null; void refreshGitStatus(); }, 150);
    };
    const refresh = (): void => { queueFiles([workspacePath]); queueGit(); };
    const setup = async (): Promise<void> => {
      try {
        const stopListening = await listen<FileSystemChangedPayload>('file-system-changed', (event) => {
          if (disposed || normalizeFilePath(event.payload.workspacePath) !== normalizeFilePath(workspacePath)) return;
          queueFiles(event.payload.paths);
          queueGit();
        });
        if (disposed) { stopListening(); return; }
        unlisten = stopListening;
        await scheduleWatcherOperation(async () => {
          if (!disposed) await invoke('start_fs_watcher', { workspacePath });
        });
        if (!disposed) refresh();
      } catch (error) {
        if (!disposed) { setFileSyncError(`File watching failed: ${String(error)}`); refresh(); }
      }
    };
    void setup();
    // Recover missed OS notifications and edits made while the app was unfocused.
    const fallback = window.setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      if (gitTimer !== null) clearTimeout(gitTimer);
      window.clearInterval(fallback);
      window.removeEventListener('focus', refresh);
      unlisten?.();
      void scheduleWatcherOperation(() => invoke('stop_fs_watcher', { workspacePath })).catch(console.error);
    };
  }, [workspacePath, refreshGitStatus]);

  return { refreshGitStatus, isRefreshingGit, gitRefreshError, fileSyncError };
};
