import React, { useMemo, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitFileStatus, GitDiffStat, FileEntry } from '../../types';
import { GitStatusBadge } from './GitStatusBadge';
import { FileIcon } from './FileIcon';

interface GitChangesPanelProps {
  gitStatuses: GitFileStatus[];
  gitDiffStats: GitDiffStat[];
  workspacePath: string;
  onFileClick: (entry: FileEntry, change?: string) => void;
}

interface ChangedFile {
  path: string;
  name: string;
  change: 'added' | 'modified' | 'deleted' | 'untracked';
  linesAdded: number;
  linesDeleted: number;
}

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 320;
const DEFAULT_HEIGHT = 140;

export const GitChangesPanel: React.FC<GitChangesPanelProps> = ({
  gitStatuses,
  gitDiffStats,
  workspacePath,
  onFileClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

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

  React.useEffect(() => {
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
    const entry: FileEntry = {
      name: file.name,
      path: file.path,
      isDir: false,
      size: 0,
      modifiedAt: Date.now(),
      extension: file.name.includes('.') ? file.name.split('.').pop() || null : null,
    };
    onFileClick(entry, file.change);
  }, [onFileClick]);

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
    <div className="shrink-0 border-t border-zinc-800/30 bg-zinc-950/40 backdrop-blur-sm overflow-hidden">
      <div
        className={`flex items-center justify-between px-3 py-2 bg-zinc-900/20 border-b border-zinc-800/20 cursor-pointer select-none transition-all duration-300 group/git-header ${
          isExpanded ? 'bg-zinc-900/40' : 'hover:bg-zinc-900/60'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-zinc-500 group-hover/git-header:text-blue-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
          <div className="flex flex-col -space-y-0.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] group-hover/git-header:text-zinc-200 transition-colors">
              Source_Control
            </span>
            <span className="text-[7px] text-zinc-600 font-black tracking-widest uppercase opacity-70">
              {changedFiles.length} DIFFS_DETECTED
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-950 border border-zinc-800/50 shadow-inner group-hover/git-header:border-blue-500/30 transition-all duration-500">
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
            className="overflow-hidden relative bg-zinc-950/20"
          >
            <div
              className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500/40 active:bg-blue-500 transition-all duration-300 z-10 rounded-full mx-8 mt-0.5"
              onMouseDown={handleMouseDown}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="h-full overflow-y-auto custom-scrollbar">
              <div className="py-2 space-y-0.5">
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
                      className="group/file flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/40 cursor-pointer transition-all duration-200 mx-1 rounded-lg border border-transparent hover:border-zinc-800/50"
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
                        <span className="text-[10px] font-black text-zinc-300 truncate tracking-tight group-hover/file:text-white transition-colors">
                          {file.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-zinc-600 truncate font-mono uppercase tracking-tighter opacity-60">
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
                      
                      <div className="flex items-center gap-3">
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
          </motion.div>
        )}
      </AnimatePresence>

      {isResizing && (
        <div className="absolute inset-0 cursor-ns-resize z-50" />
      )}
    </div>
  );
};
