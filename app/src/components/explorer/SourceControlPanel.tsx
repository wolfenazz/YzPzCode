import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowBendUpLeft,
  ArrowClockwise,
  ArrowsLeftRight,
  Check,
  CircleNotch,
  CloudArrowDown,
  CloudArrowUp,
  FunnelSimple,
  GitCommit,
  MagnifyingGlass,
  Plus,
  Minus,
  X,
} from '@phosphor-icons/react';
import { loadGitRemote, gitFetch, gitPush, gitPull } from '../../utils/gitRemote';
import { GitFileStatus, GitDiffStat, GitBranchInfo, GitCommitInfo, GitRemoteInfo } from '../../types';
import { FileIcon } from './FileIcon';
import { useAppStore } from '../../stores/appStore';

interface SourceControlPanelProps {
  gitStatuses: GitFileStatus[];
  gitDiffStats: GitDiffStat[];
  workspacePath: string;
  onStageFile: (filePath: string) => void;
  onUnstageFile: (filePath: string) => void;
  onOpenDiff: (file: { path: string; name: string }) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  refreshError: string | null;
}

interface ChangedFile {
  path: string;
  name: string;
  change: 'added' | 'modified' | 'deleted' | 'untracked';
  linesAdded: number;
  linesDeleted: number;
}

/**
 * GitHub Desktop-style Source Control view. A full-height panel that replaces
 * the Explorer sidebar when opened, showing a "Changes / History" tab bar,
 * the changed-file list, and a commit bar at the bottom — like GitHub Desktop.
 */
export const SourceControlPanel: React.FC<SourceControlPanelProps> = ({
  gitStatuses,
  gitDiffStats,
  workspacePath,
  onStageFile,
  onUnstageFile,
  onOpenDiff,
  onRefresh,
  isRefreshing,
  refreshError,
}) => {
  const setGitDiffFile = useAppStore((s) => s.setGitDiffFile);

  const [tab, setTab] = useState<'changes' | 'history'>('changes');
  const [filterQuery, setFilterQuery] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitNotice, setCommitNotice] = useState<string | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo | null>(null);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showOnlyUntracked, setShowOnlyUntracked] = useState(false);

  // ── Remote sync state ─────────────────────────────────────────────
  const [remoteInfo, setRemoteInfo] = useState<GitRemoteInfo | null>(null);
  const [syncBusy, setSyncBusy] = useState<'fetch' | 'push' | 'pull' | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const getRelativePath = useCallback((fullPath: string): string => {
    if (fullPath.startsWith(workspacePath)) {
      return fullPath.slice(workspacePath.length).replace(/^[\\/]/, '');
    }
    return fullPath.split(/[/\\]/).pop() || fullPath;
  }, [workspacePath]);

  // Load branch info + recent commits once when the panel mounts / workspace changes.
  useEffect(() => {
    let cancelled = false;
    void invoke<GitBranchInfo>('git_branches', { workspacePath })
      .then((b) => { if (!cancelled) setBranches(b); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [workspacePath]);

  const refreshCommitLog = useCallback(async () => {
    try {
      const log = await invoke<GitCommitInfo[]>('git_log', { workspacePath, limit: 20 });
      setCommits(Array.isArray(log) ? log : []);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    }
  }, [workspacePath]);

  useEffect(() => {
    if (tab === 'history') void refreshCommitLog();
  }, [tab, refreshCommitLog]);

  const loadRemote = useCallback(async () => {
    try {
      const remote = await loadGitRemote(workspacePath);
      setRemoteInfo(remote);
    } catch {
      setRemoteInfo(null);
    }
  }, [workspacePath]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  const handleSync = useCallback(
    async (op: 'fetch' | 'push' | 'pull') => {
      if (syncBusy) return;
      setSyncBusy(op);
      setSyncError(null);
      setSyncNotice(null);
      try {
        if (op === 'fetch') {
          await gitFetch(workspacePath);
          setSyncNotice('Fetched from origin.');
        } else if (op === 'push') {
          await gitPush(workspacePath);
          setSyncNotice('Pushed to origin.');
        } else {
          await gitPull(workspacePath);
          setSyncNotice('Pulled from origin.');
        }
        await loadRemote();
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : String(err));
      } finally {
        setSyncBusy(null);
      }
    },
    [syncBusy, workspacePath, loadRemote]
  );

  const changedFiles = useMemo(() => {
    const statsMap = new Map<string, GitDiffStat>();
    gitDiffStats.forEach((stat) => statsMap.set(stat.path, stat));

    const files: ChangedFile[] = [];
    gitStatuses.forEach((status) => {
      const path = status.path;
      const name = path.split(/[/\\]/).pop() || path;
      const stat = statsMap.get(path);
      files.push({
        path,
        name,
        change: status.change,
        linesAdded: stat?.linesAdded ?? 0,
        linesDeleted: stat?.linesDeleted ?? 0,
      });
    });

    const changeOrder: Record<string, number> = {
      modified: 0,
      added: 1,
      untracked: 2,
      deleted: 3,
    };

    files.sort((a, b) => {
      const orderDiff = changeOrder[a.change] - changeOrder[b.change];
      if (orderDiff !== 0) return orderDiff;
      return a.path.localeCompare(b.path);
    });

    const query = filterQuery.trim().toLowerCase();
    if (query) {
      return files.filter((f) =>
        f.name.toLowerCase().includes(query) ||
        getRelativePath(f.path).toLowerCase().includes(query)
      );
    }
    return files;
  }, [gitStatuses, gitDiffStats, filterQuery, getRelativePath]);

  const filteredFiles = useMemo(() => {
    if (!showOnlyUntracked) return changedFiles;
    return changedFiles.filter((f) => f.change === 'untracked');
  }, [changedFiles, showOnlyUntracked]);

  const handleFileClick = useCallback(
    (file: ChangedFile) => {
      setSelectedFile(file.path);
      onOpenDiff({ path: file.path, name: file.name });
    },
    [onOpenDiff]
  );

  const handleDiscard = useCallback(
    async (file: ChangedFile) => {
      const confirmed = window.confirm(
        `Discard all changes to ${file.name}?\n\nThis restores the file to its last committed version (or deletes it if untracked). This cannot be undone.`
      );
      if (!confirmed) return;
      try {
        await invoke('git_discard_file', { workspacePath, filePath: file.path });
        setGitDiffFile(null);
        await onRefresh();
      } catch (err) {
        setCommitError(err instanceof Error ? err.message : String(err));
      }
    },
    [workspacePath, setGitDiffFile, onRefresh]
  );

  const handleCommit = useCallback(async () => {
    const summary = commitMessage.trim();
    if (!summary || committing) return;
    const description = commitDescription.trim();
    // GitHub-style: subject line + blank line + body.
    const message = description ? `${summary}\n\n${description}` : summary;
    setCommitting(true);
    setCommitError(null);
    setCommitNotice(null);
    try {
      await invoke('git_commit', { workspacePath, message });
      await onRefresh();
      setCommitMessage('');
      setCommitDescription('');
      setCommitNotice(`Committed: ${summary.slice(0, 60)}`);
      void refreshCommitLog();
      void loadRemote();
      if (pushAfterCommit && remoteInfo) {
        await gitPush(workspacePath);
        setCommitNotice(`Committed and pushed to ${remoteInfo.name}.`);
        void loadRemote();
      }
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  }, [commitMessage, commitDescription, committing, workspacePath, refreshCommitLog, loadRemote, pushAfterCommit, remoteInfo, onRefresh]);

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!branch) return;
      try {
        await invoke('git_checkout', { workspacePath, branch });
        const b = await invoke<GitBranchInfo>('git_branches', { workspacePath });
        setBranches(b);
        setTab('changes');
      } catch (err) {
        setCommitError(err instanceof Error ? err.message : String(err));
      }
    },
    [workspacePath]
  );

  const nothingToShow = tab === 'changes' && filteredFiles.length === 0;

  return (
    <div className="source-control flex h-full flex-col bg-[var(--bg-secondary)] select-none overflow-hidden">
      {/* Tab bar: Changes | History (GitHub Desktop style) */}
      <div className="flex h-10 shrink-0 items-stretch border-b border-[var(--border-primary)]">
        <button
          onClick={() => setTab('changes')}
          className={`relative flex flex-1 items-center justify-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            tab === 'changes' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)]'
          }`}
        >
          Changes
          {gitStatuses.length > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-light)]/25 px-1 text-[9px] font-black tabular-nums text-[var(--accent)]">
              {gitStatuses.length}
            </span>
          )}
          {tab === 'changes' && (
            <motion.span
              layoutId="source-control-tab"
              className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--accent)]"
            />
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`relative flex flex-1 items-center justify-center font-mono text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            tab === 'history' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)]'
          }`}
        >
          History
          {tab === 'history' && (
            <motion.span
              layoutId="source-control-tab"
              className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--accent)]"
            />
          )}
        </button>
      </div>

      {/* Branch + sync controls (GitHub Desktop style) */}
      <div className="shrink-0 border-b border-[var(--border-primary)] px-2 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <GitCommit size={14} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
            <div className="min-w-0">
              <span className="block truncate font-mono text-[10.5px] font-bold text-[var(--text-primary)]">
                {branches?.current ?? 'main'}
              </span>
              <span className="block truncate font-mono text-[8px] text-[var(--text-secondary)]/55">
                {remoteInfo?.url ?? 'No remote configured'}
              </span>
            </div>
          </div>
          {remoteInfo && (remoteInfo.ahead > 0 || remoteInfo.behind > 0) && (
            <div className="flex shrink-0 items-center gap-1 font-mono text-[8.5px] font-bold">
              {remoteInfo.ahead > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0.5 text-emerald-400">↑{remoteInfo.ahead}</span>
              )}
              {remoteInfo.behind > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/15 px-1 py-0.5 text-sky-400">↓{remoteInfo.behind}</span>
              )}
            </div>
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Fetch */}
            <button
              onClick={() => void handleSync('fetch')}
              disabled={syncBusy !== null}
              title="Fetch from origin"
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40 ${
                syncBusy === 'fetch'
                  ? 'bg-[var(--accent-light)]/20 text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {syncBusy === 'fetch' ? <CircleNotch size={13} className="animate-spin" /> : <ArrowClockwise size={13} aria-hidden="true" />}
            </button>
            {/* Pull */}
            <button
              onClick={() => void handleSync('pull')}
              disabled={syncBusy !== null || !remoteInfo}
              title="Pull from origin"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer disabled:cursor-default disabled:opacity-40"
            >
              {syncBusy === 'pull' ? <CircleNotch size={13} className="animate-spin" /> : <CloudArrowDown size={13} aria-hidden="true" />}
            </button>
            {/* Push */}
            <button
              onClick={() => void handleSync('push')}
              disabled={syncBusy !== null || !remoteInfo}
              title="Push to origin"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer disabled:cursor-default disabled:opacity-40"
            >
              {syncBusy === 'push' ? <CircleNotch size={13} className="animate-spin" /> : <CloudArrowUp size={13} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {(syncError || syncNotice) && (
          <p className={`mt-1.5 truncate font-mono text-[8.5px] ${syncError ? 'text-rose-400' : 'text-emerald-400'}`}>
            {syncError ?? syncNotice}
          </p>
        )}
      </div>

      {/* ── Changes tab ─────────────────────────────────────────────── */}
      {tab === 'changes' && (
        <>
          <div className="shrink-0 border-b border-[var(--border-primary)] px-2 py-2">
            <div className="flex items-center gap-1.5">
              {/* Filter toggle (GitHub Desktop's inverted funnel) */}
              <button
                onClick={() => setShowOnlyUntracked((v) => !v)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  showOnlyUntracked
                    ? 'bg-[var(--accent-light)]/20 text-[var(--accent)]'
                    : 'border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                title={showOnlyUntracked ? 'Show all changes' : 'Show only untracked changes'}
              >
                <FunnelSimple size={13} weight={showOnlyUntracked ? 'fill' : 'regular'} aria-hidden="true" />
              </button>
              <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 transition-colors focus-within:border-[var(--accent)]">
                <MagnifyingGlass size={13} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                <input
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter"
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
                />
                {filterQuery && (
                  <button
                    onClick={() => setFilterQuery('')}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* Count line */}
            <div className="mt-2 flex items-center gap-1.5 px-0.5">
              <span className="min-w-0 flex-1 font-mono text-[10px] font-bold text-[var(--text-primary)]">
                {changedFiles.length} changed file{changedFiles.length !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={isRefreshing}
                title="Refresh local changes"
                aria-label="Refresh local changes"
                className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-50"
              >
                <ArrowClockwise size={12} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
            </div>
            {refreshError && (
              <p className="mt-1 truncate px-0.5 font-mono text-[8.5px] text-rose-400" title={refreshError}>
                Could not refresh changes: {refreshError}
              </p>
            )}
          </div>

          {/* File list */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-1">
            {nothingToShow ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <GitCommit size={22} className="text-[var(--text-secondary)]/40" aria-hidden="true" />
                <p className="font-mono text-[10px] text-[var(--text-secondary)]">
                  No changes yet — everything is committed.
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredFiles.map((file, idx) => {
                  const isSelected = selectedFile === file.path;
                  const hasChanges = file.linesAdded > 0 || file.linesDeleted > 0;
                  return (
                    <motion.div
                      key={file.path}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.01 }}
                      onClick={() => handleFileClick(file)}
                      className={`group/file mx-1 flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
                        isSelected
                          ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/15'
                          : 'border-transparent hover:border-[var(--border-primary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <FileIcon
                        extension={file.name.includes('.') ? file.name.split('.').pop() || null : null}
                        isDir={false}
                        className={`w-4 h-4 shrink-0 transition-transform group-hover/file:scale-110 ${file.change === 'deleted' ? 'opacity-50' : ''}`}
                        name={file.name}
                      />
                      <div className="flex min-w-0 flex-1 flex-col ml-1">
                        <span className="truncate text-[10.5px] font-medium text-[var(--text-primary)]">
                          {file.name}
                        </span>
                        <span className="truncate font-mono text-[8px] uppercase tracking-tighter text-[var(--text-secondary)]/60">
                          {getRelativePath(file.path)}
                        </span>
                      </div>

                      {/* Right side: change badges */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <div className="flex items-center gap-1 font-mono text-[9px] tabular-nums">
                          {file.linesAdded > 0 && (
                            <span className="font-black text-emerald-500">+{file.linesAdded}</span>
                          )}
                          {file.linesDeleted > 0 && (
                            <span className="font-black text-rose-500">-{file.linesDeleted}</span>
                          )}
                          {!hasChanges && (
                            <span className={`text-[8px] font-black uppercase ${file.change === 'deleted' ? 'text-rose-500/60' : file.change === 'added' ? 'text-emerald-500/60' : file.change === 'untracked' ? 'text-sky-500/60' : 'text-amber-500/60'}`}>
                              {file.change === 'deleted' ? 'del' : 'new'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hover actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenDiff({ path: file.path, name: file.name }); }}
                          title="Compare with HEAD"
                          className="p-0.5 rounded hover:bg-sky-500/20 text-zinc-500 hover:text-sky-400 cursor-pointer transition-colors"
                        >
                          <ArrowsLeftRight size={13} aria-hidden="true" />
                        </button>
                        {file.change !== 'deleted' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); void handleDiscard(file); }}
                            title="Discard changes"
                            className="p-0.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 cursor-pointer transition-colors"
                          >
                            <ArrowBendUpLeft size={13} aria-hidden="true" />
                          </button>
                        )}
                        {(file.change === 'untracked' || file.change === 'modified') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onStageFile(file.path); }}
                            title="Stage file"
                            className="p-0.5 rounded hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 cursor-pointer transition-colors"
                          >
                            <Plus size={13} aria-hidden="true" />
                          </button>
                        )}
                        {(file.change === 'added' || file.change === 'modified') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onUnstageFile(file.path); }}
                            title="Unstage file"
                            className="p-0.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 cursor-pointer transition-colors"
                          >
                            <Minus size={13} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Commit bar */}
          {filteredFiles.length > 0 && (
            <div className="shrink-0 border-t border-[var(--border-primary)]/70 bg-[var(--bg-secondary)]/30 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-primary)] text-[var(--text-secondary)]">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleCommit();
                    }
                  }}
                  placeholder="Summary (required)"
                  className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500/50"
                />
              </div>
              <textarea
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                placeholder="Description"
                rows={3}
                className="mt-1.5 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[10px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500/50 custom-scrollbar"
              />
              <div className="mt-1.5 flex items-center gap-1 text-[var(--text-secondary)]/50">
                <button className="p-1 rounded hover:text-[var(--text-primary)] cursor-pointer transition-colors" title="Co-authors">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </button>
                <button className="p-1 rounded hover:text-[var(--text-primary)] cursor-pointer transition-colors" title="Attach changes">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                <button className="p-1 rounded hover:text-[var(--text-primary)] cursor-pointer transition-colors" title="Options">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              {remoteInfo && (
                <label className="mt-1 flex items-center gap-1.5 select-none cursor-pointer group/push">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={pushAfterCommit}
                    onClick={() => setPushAfterCommit((v) => !v)}
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors cursor-pointer ${
                      pushAfterCommit ? 'border-blue-500 bg-blue-600 text-white' : 'border-zinc-600 bg-transparent'
                    }`}
                  >
                    {pushAfterCommit && <Check size={9} weight="bold" aria-hidden="true" />}
                  </button>
                  <span className="font-mono text-[8.5px] text-[var(--text-secondary)] group-hover/push:text-[var(--text-primary)] transition-colors">
                    Push to {remoteInfo.name} after commit
                  </span>
                </label>
              )}
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={committing || !commitMessage.trim()}
                className="mt-1.5 flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-blue-600 font-mono text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-500 disabled:cursor-default disabled:opacity-40"
              >
                {committing ? <CircleNotch size={13} className="animate-spin" /> : <GitCommit size={13} />}
                Commit {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} to {branches?.current ?? 'main'}
              </button>
              {(commitError || commitNotice) && (
                <p className={`mt-1.5 font-mono text-[9px] ${commitError ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {commitError ?? commitNotice}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── History tab ─────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {branches && (
            <div className="border-b border-[var(--border-primary)] px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Branch</span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-primary)]">
                  <GitCommit size={11} aria-hidden="true" /> {branches.current}
                </span>
              </div>
              {branches.branches.length > 1 && (
                <div className="mt-1.5 space-y-0.5">
                  {branches.branches.map((branch) => (
                    <button
                      key={branch}
                      onClick={() => void handleCheckout(branch)}
                      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-[9.5px] transition-colors cursor-pointer ${
                        branch === branches.current
                          ? 'bg-[var(--accent-light)]/15 text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <GitCommit size={11} aria-hidden="true" />
                      <span className="truncate">{branch}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {commits.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <GitCommit size={22} className="text-[var(--text-secondary)]/40" aria-hidden="true" />
              <p className="font-mono text-[10px] text-[var(--text-secondary)]">No commits yet.</p>
            </div>
          ) : (
            <div className="space-y-0.5 p-1.5">
              {commits.map((commit) => (
                <div key={commit.hash} className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--bg-hover)]">
                  <GitCommit size={13} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[10px] text-[var(--text-primary)]">{commit.message}</p>
                    <p className="font-mono text-[8.5px] text-[var(--text-secondary)]">
                      {commit.shortHash} · {commit.author}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[8px] text-[var(--text-secondary)]/40">
                    {new Date(commit.date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
