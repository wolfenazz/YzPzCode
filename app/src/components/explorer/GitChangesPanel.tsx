import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowBendUpLeft,
  ArrowsLeftRight,
  CaretDown,
  CircleNotch,
  GitBranch,
  GitCommit,
  Minus,
  Plus,
} from '@phosphor-icons/react';
import { GitFileStatus, GitDiffStat, FileEntry, GitBranchInfo, GitCommitInfo } from '../../types';
import { GitStatusBadge } from './GitStatusBadge';
import { FileIcon } from './FileIcon';
import { useAppStore } from '../../stores/appStore';

interface GitChangesPanelProps {
  gitStatuses: GitFileStatus[];
  gitDiffStats: GitDiffStat[];
  workspacePath: string;
  onFileClick: (entry: FileEntry, change?: string) => void;
  onStageFile: (filePath: string) => void;
  onUnstageFile: (filePath: string) => void;
}

interface ChangedFile {
  path: string;
  name: string;
  change: 'added' | 'modified' | 'deleted' | 'untracked';
  linesAdded: number;
  linesDeleted: number;
}

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 380;
const DEFAULT_HEIGHT = 170;

export const GitChangesPanel: React.FC<GitChangesPanelProps> = ({
  gitStatuses,
  gitDiffStats,
  workspacePath,
  onFileClick,
  onStageFile,
  onUnstageFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const setGitDiffFile = useAppStore((s) => s.setGitDiffFile);

  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitNotice, setCommitNotice] = useState<string | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo | null>(null);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [showCommitLog, setShowCommitLog] = useState(false);

  const changedFiles = useMemo(() => {
    const statsMap = new Map<string, GitDiffStat>();
    gitDiffStats.forEach((stat) => {
      statsMap.set(stat.path, stat);
    });

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

    return files;
  }, [gitStatuses, gitDiffStats]);

  const totalAdded = useMemo(
    () => changedFiles.reduce((sum, f) => sum + f.linesAdded, 0),
    [changedFiles]
  );

  const totalDeleted = useMemo(
    () => changedFiles.reduce((sum, f) => sum + f.linesDeleted, 0),
    [changedFiles]
  );

  const hasAnyDiffLines = totalAdded > 0 || totalDeleted > 0;

  const maxChanges = useMemo(() => {
    const max = Math.max(...changedFiles.map((f) => f.linesAdded + f.linesDeleted), 0);
    return max || 1;
  }, [changedFiles]);

  // Load branch info + recent commits once when the panel mounts or the
  // workspace changes, so the header shows the current branch.
  useEffect(() => {
    let cancelled = false;
    void invoke<GitBranchInfo>('git_branches', { workspacePath })
      .then((b) => { if (!cancelled) setBranches(b); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspacePath]);

  const refreshCommitLog = useCallback(async () => {
    try {
      const log = await invoke<GitCommitInfo[]>('git_log', { workspacePath, limit: 15 });
      setCommits(Array.isArray(log) ? log : []);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    }
  }, [workspacePath]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = panelHeight;
  }, [panelHeight]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const delta = startYRef.current - e.clientY;
    const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeightRef.current + delta));
    setPanelHeight(newHeight);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleFileClick = useCallback((file: ChangedFile) => {
    // Opening a regular file leaves diff mode.
    setGitDiffFile(null);
    const entry: FileEntry = {
      name: file.name,
      path: file.path,
      isDir: false,
      size: 0,
      modifiedAt: Date.now(),
      extension: file.name.includes('.') ? file.name.split('.').pop() || null : null,
    };
    onFileClick(entry, file.change);
  }, [onFileClick, setGitDiffFile]);

  const openDiff = useCallback((file: ChangedFile) => {
    setGitDiffFile({ path: file.path, name: file.name });
  }, [setGitDiffFile]);

  const handleDiscard = useCallback(async (file: ChangedFile) => {
    const confirmed = window.confirm(
      `Discard all changes to ${file.name}?\n\nThis restores the file to its last committed version (or deletes it if untracked). This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await invoke('git_discard_file', { workspacePath, filePath: file.path });
      setGitDiffFile(null);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    }
  }, [workspacePath, setGitDiffFile]);

  const handleCommit = useCallback(async () => {
    const message = commitMessage.trim();
    if (!message || committing) return;
    setCommitting(true);
    setCommitError(null);
    setCommitNotice(null);
    try {
      await invoke('git_commit', { workspacePath, message });
      setCommitMessage('');
      setCommitNotice(`Committed: ${message.slice(0, 60)}`);
      void refreshCommitLog();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  }, [commitMessage, committing, workspacePath, refreshCommitLog]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!branch) return;
    try {
      await invoke('git_checkout', { workspacePath, branch });
      const b = await invoke<GitBranchInfo>('git_branches', { workspacePath });
      setBranches(b);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    }
  }, [workspacePath]);

  const getRelativePath = useCallback((fullPath: string) => {
    if (fullPath.startsWith(workspacePath)) {
      return fullPath.slice(workspacePath.length).replace(/^[\\/]/, '');
    }
    return fullPath.split(/[/\\]/).pop() || fullPath;
  }, [workspacePath]);

  const getChangeLabel = useCallback((change: string) => {
    switch (change) {
      case 'added': return 'Added';
      case 'deleted': return 'Deleted';
      case 'modified': return 'Modified';
      case 'untracked': return 'Untracked';
      default: return change;
    }
  }, []);

  if (changedFiles.length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 overflow-hidden border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/20">
      <div
        className={`flex min-h-8 items-center justify-between border-b border-[var(--border-primary)]/60 px-2.5 py-1.5 cursor-pointer select-none transition-colors group/git-header ${
          isExpanded ? 'bg-[var(--bg-secondary)]/50' : 'hover:bg-[var(--bg-hover)]'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <motion.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-[var(--text-secondary)]/60 group-hover/git-header:text-[var(--accent)] transition-colors"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[10px] font-medium text-[var(--text-primary)] transition-colors">
              Source control
            </span>
            <span className="truncate font-mono text-[8px] text-[var(--text-secondary)]/55">
              {changedFiles.length} changed{branches ? ` · ${branches.current}` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {branches && branches.branches.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCommitLog((v) => !v);
                  if (!showCommitLog) void refreshCommitLog();
                }}
                title="Recent commits & branches"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-violet-400 hover:bg-violet-500/10 border border-transparent hover:border-violet-500/30 transition-colors cursor-pointer"
              >
                <GitBranch size={12} aria-hidden="true" />
                <span className="max-w-[70px] truncate">{branches.current}</span>
                <CaretDown size={10} className="opacity-60" aria-hidden="true" />
              </button>
              <AnimatePresence>
                {showCommitLog && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-6 right-0 z-50 w-64 rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-2xl backdrop-blur-md"
                  >
                    <div className="border-b border-zinc-800 px-2 py-1.5">
                      <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-zinc-400">Branches</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto custom-scrollbar py-1">
                      {branches.branches.map((branch) => (
                        <button
                          key={branch}
                          type="button"
                          onClick={() => void handleCheckout(branch)}
                          className={`flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono text-[9px] transition-colors hover:bg-zinc-800/60 cursor-pointer ${
                            branch === branches.current ? 'text-violet-400' : 'text-zinc-300'
                          }`}
                          title={branch === branches.current ? 'Current branch' : `Switch to ${branch}`}
                        >
                          {branch === branches.current ? <GitBranch size={12} /> : <GitBranch size={12} weight="regular" />}
                          <span className="truncate">{branch}</span>
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-zinc-800 px-2 py-1.5">
                      <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Recent commits</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto custom-scrollbar pb-1">
                      {commits.length === 0 && (
                        <p className="px-2 py-1 font-mono text-[8.5px] text-[var(--text-secondary)]">No commits yet</p>
                      )}
                      {commits.map((commit) => (
                        <div key={commit.hash} className="flex items-start gap-1.5 px-2 py-1">
                          <GitCommit size={12} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[8.5px] text-[var(--text-primary)]">{commit.message}</p>
                            <p className="font-mono text-[7.5px] text-[var(--text-secondary)]">
                              {commit.shortHash} · {commit.author}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-1.5 py-0.5">
            {hasAnyDiffLines ? (
              <>
                {totalAdded > 0 && (
                  <span className="text-[9px] font-black text-emerald-500">+{totalAdded}</span>
                )}
                {totalAdded > 0 && totalDeleted > 0 && (
                  <div className="h-2 w-[1px] bg-zinc-800" />
                )}
                {totalDeleted > 0 && (
                  <span className="text-[9px] font-black text-rose-500">-{totalDeleted}</span>
                )}
              </>
            ) : (
              <span className="text-[9px] font-black text-zinc-500">
                {changedFiles.filter(f => f.change === 'modified').length > 0 && 'modified '}
                {changedFiles.filter(f => f.change === 'added').length > 0 && 'added '}
                {changedFiles.filter(f => f.change === 'deleted').length > 0 && 'deleted '}
                {changedFiles.filter(f => f.change === 'untracked').length > 0 && 'new '}
              </span>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: panelHeight - 40, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative overflow-hidden bg-[var(--bg-primary)]/25"
          >
            <div
              className="absolute inset-x-8 top-0 z-10 mt-0.5 h-1 cursor-ns-resize rounded-full transition-colors hover:bg-[var(--accent)]/40 active:bg-[var(--accent)]"
              onMouseDown={handleMouseDown}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="h-full overflow-y-auto custom-scrollbar">
              <div className="space-y-0.5 py-1.5">
                {changedFiles.map((file, idx) => {
                  const hasChanges = file.linesAdded > 0 || file.linesDeleted > 0;
                  const addedPercent = hasChanges ? (file.linesAdded / maxChanges) * 100 : 0;
                  const deletedPercent = hasChanges ? (file.linesDeleted / maxChanges) * 100 : 0;

                  return (
                    <motion.div
                      key={file.path}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="group/file mx-1 flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-[var(--border-primary)] hover:bg-[var(--bg-hover)]"
                      onClick={() => handleFileClick(file)}
                    >
                      <div className="relative">
                        <FileIcon
                          extension={file.name.includes('.') ? file.name.split('.').pop() || null : null}
                          isDir={false}
                          className="w-4 h-4 shrink-0 transition-transform group-hover/file:scale-110"
                        />
                         <div className="absolute -top-1 -right-1">
                            <GitStatusBadge change={file.change === 'untracked' ? 'untracked' : file.change} />
                         </div>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1 ml-1">
                        <span className="truncate text-[10px] font-medium text-[var(--text-primary)] transition-colors">
                          {file.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-[var(--text-secondary)] truncate font-mono uppercase tracking-tighter opacity-60">
                            {getRelativePath(file.path)}
                          </span>
                          {!hasChanges && (
                            <span className={`text-[7px] font-bold uppercase tracking-wider ${
                              file.change === 'deleted' ? 'text-rose-500/70' :
                              file.change === 'added' ? 'text-emerald-500/70' :
                              file.change === 'untracked' ? 'text-sky-500/70' :
                              'text-amber-500/70'
                            }`}>
                              {getChangeLabel(file.change)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                         <div className="flex items-center gap-1 font-mono text-[9px] tabular-nums">
                            {file.linesAdded > 0 && (
                              <span className="text-emerald-500 font-black">+{file.linesAdded}</span>
                            )}
                            {file.linesDeleted > 0 && (
                              <span className="text-rose-500 font-black">-{file.linesDeleted}</span>
                            )}
                            {!hasChanges && file.change === 'deleted' && (
                              <span className="text-rose-500/50 font-black text-[8px]">removed</span>
                            )}
                            {!hasChanges && file.change === 'added' && (
                              <span className="text-emerald-500/50 font-black text-[8px]">new</span>
                            )}
                            {!hasChanges && file.change === 'untracked' && (
                              <span className="text-sky-500/50 font-black text-[8px]">new</span>
                            )}
                         </div>

                         <div className="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); openDiff(file); }}
                              className="p-0.5 rounded hover:bg-sky-500/20 text-zinc-500 hover:text-sky-400 cursor-pointer transition-colors"
                              title="Compare with HEAD"
                            >
                              <ArrowsLeftRight size={14} aria-hidden="true" />
                            </button>
                            {file.change !== 'deleted' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); void handleDiscard(file); }}
                                className="p-0.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 cursor-pointer transition-colors"
                                title="Discard changes"
                              >
                                <ArrowBendUpLeft size={14} aria-hidden="true" />
                              </button>
                            )}
                            {(file.change === 'untracked' || file.change === 'modified') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onStageFile(file.path); }}
                                className="p-0.5 rounded hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 cursor-pointer transition-colors"
                                title="Stage file"
                              >
                                <Plus size={14} />
                              </button>
                            )}
                            {(file.change === 'added' || file.change === 'modified') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onUnstageFile(file.path); }}
                                className="p-0.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 cursor-pointer transition-colors"
                                title="Unstage file"
                              >
                                <Minus size={14} />
                              </button>
                            )}
                         </div>
                         
                         <div className="w-14 h-1.5 rounded-full overflow-hidden shrink-0 bg-zinc-900 border border-zinc-800/50 flex shadow-inner">
                            {hasChanges ? (
                              <>
                                <div
                                  className="h-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                                  style={{ width: `${addedPercent}%` }}
                                />
                                <div
                                  className="h-full bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                                  style={{ width: `${deletedPercent}%` }}
                                />
                              </>
                            ) : (
                              <div
                                className={`h-full ${
                                  file.change === 'deleted' ? 'bg-rose-500/30' :
                                  file.change === 'added' ? 'bg-emerald-500/30' :
                                  file.change === 'untracked' ? 'bg-sky-500/30' :
                                  'bg-amber-500/30'
                                }`}
                                style={{ width: '100%' }}
                              />
                            )}
                         </div>
                       </div>
                     </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Commit bar */}
            <div className="shrink-0 border-t border-[var(--border-primary)]/70 bg-[var(--bg-secondary)]/30 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <input
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleCommit();
                    }
                  }}
                  placeholder="Commit message (stages all changes)…"
                  className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[9.5px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500/50"
                />
                <button
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={committing || !commitMessage.trim()}
                  title="Stage all changes and commit"
                  className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-blue-500/40 bg-blue-500/10 px-2 font-mono text-[8.5px] font-bold uppercase tracking-widest text-blue-400 transition-colors hover:bg-blue-500/20 disabled:cursor-default disabled:opacity-40"
                >
                  {committing ? <CircleNotch size={12} className="animate-spin" /> : <GitCommit size={12} />}
                  Commit
                </button>
              </div>
              {(commitError || commitNotice) && (
                <p className={`mt-1 font-mono text-[8.5px] ${commitError ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {commitError ?? commitNotice}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isResizing && (
        <div className="absolute inset-0 cursor-ns-resize z-50" />
      )}
    </div>
  );
};