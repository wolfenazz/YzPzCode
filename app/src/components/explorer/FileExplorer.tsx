import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Tree } from 'react-arborist';
import { FileEntry } from '../../types';
import { useFileTree, type TreeNodeData } from '../../hooks/useFileTree';
import { TreeNode, ExplorerContext } from './TreeNode';
import { GitChangesPanel } from './GitChangesPanel';
import { ExplorerContextMenu } from './ExplorerContextMenu';
import { useAppStore } from '../../stores/appStore';
import { invoke } from '@tauri-apps/api/core';

interface FileExplorerProps {
  workspacePath: string;
  workspaceName: string;
  onFileClick: (entry: FileEntry, change?: string) => void;
}

const findParentPath = (path: string): string | null => {
  const sep = path.includes('\\') ? '\\' : '/';
  const lastSep = path.lastIndexOf(sep);
  if (lastSep <= 0) return null;
  return path.substring(0, lastSep);
};

const HeaderIconButton: React.FC<{
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, onClick, children }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className="p-1 rounded-sm text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/40 cursor-pointer transition-colors duration-75"
  >
    {children}
  </button>
);

export const FileExplorer: React.FC<FileExplorerProps> = ({
  workspacePath,
  workspaceName,
  onFileClick,
}) => {
  const gitStatuses = useAppStore((s) => s.gitStatuses);
  const gitDiffStats = useAppStore((s) => s.gitDiffStats);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const setExplorerClipboard = useAppStore((s) => s.setExplorerClipboard);
  const explorerClipboard = useAppStore((s) => s.explorerClipboard);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const addSession = useAppStore((s) => s.addSession);
  const setGitStatuses = useAppStore((s) => s.setGitStatuses);
  const setGitDiffStats = useAppStore((s) => s.setGitDiffStats);

  const {
    treeData,
    isLoading,
    treeRef,
    handleToggle,
    handleMove,
    handleRename,
    createNewEntry,
    deleteEntry,
    revealInFileManager,
    refreshRoot,
    importExternalFiles,
  } = useFileTree(workspacePath);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNodeData | null;
  } | null>(null);
  const [externalDropTarget, setExternalDropTarget] = useState<string | null>(null);
  const [isExternalDrag, setIsExternalDrag] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    path: string;
    name: string;
    isDir: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [treeSize, setTreeSize] = useState({ width: 300, height: 400 });

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setTreeSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, nodeData: TreeNodeData | null) => {
      setContextMenu({ x: e.clientX, y: e.clientY, node: nodeData });
    },
    []
  );

  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, node: null });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleNewFile = useCallback(
    (parentPath: string | null) => {
      const dir = parentPath || workspacePath;
      createNewEntry(dir, 'untitled', 'file');
    },
    [workspacePath, createNewEntry]
  );

  const handleNewFolder = useCallback(
    (parentPath: string | null) => {
      const dir = parentPath || workspacePath;
      createNewEntry(dir, 'untitled', 'directory');
    },
    [workspacePath, createNewEntry]
  );

  const handleRenameFromMenu = useCallback(
    (node: TreeNodeData) => {
      if (treeRef.current) {
        treeRef.current.edit(node.id);
      }
    },
    [treeRef]
  );

  const handleDeleteFromMenu = useCallback(
    (node: TreeNodeData) => {
      setPendingDelete({ path: node.path, name: node.name, isDir: node.isDir });
    },
    []
  );

  const confirmDelete = useCallback(
    async (path: string) => {
      try {
        await deleteEntry(path);
      } finally {
        setPendingDelete(null);
      }
    },
    [deleteEntry]
  );

  const handleCopy = useCallback(
    (node: TreeNodeData) => {
      setExplorerClipboard({ operation: 'copy', path: node.path, name: node.name, isDir: node.isDir });
    },
    [setExplorerClipboard]
  );

  const handleCut = useCallback(
    (node: TreeNodeData) => {
      setExplorerClipboard({ operation: 'cut', path: node.path, name: node.name, isDir: node.isDir });
    },
    [setExplorerClipboard]
  );

  const handleCopyPath = useCallback(
    (node: TreeNodeData) => {
      navigator.clipboard.writeText(node.path).catch(console.error);
    },
    []
  );

  const handleCopyRelativePath = useCallback(
    (node: TreeNodeData) => {
      const relative = node.path.startsWith(workspacePath)
        ? node.path.slice(workspacePath.length).replace(/^[\\/]/, '')
        : node.path;
      navigator.clipboard.writeText(relative).catch(console.error);
    },
    [workspacePath]
  );

  const handleOpenInTerminal = useCallback(
    async (node: TreeNodeData) => {
      if (!currentWorkspace || !node.isDir) return;
      try {
        const session = await invoke<{ id: string }>('create_single_terminal_session', {
          request: {
            workspaceId: currentWorkspace.id,
            workspacePath: node.path,
            index: -1,
            agent: null,
          },
        });
        addSession({
          id: session.id,
          workspaceId: currentWorkspace.id,
          index: -1,
          cwd: node.path,
          status: 'idle',
          shell: '',
        });
      } catch (err) {
        console.error('Failed to open terminal:', err);
      }
    },
    [currentWorkspace, addSession]
  );

  const handleDuplicate = useCallback(
    async (node: TreeNodeData) => {
      try {
        await invoke('duplicate_entry', { path: node.path });
        refreshRoot();
      } catch (err) {
        console.error('Failed to duplicate:', err);
      }
    },
    [refreshRoot]
  );

  const handleCopyAsImportPath = useCallback(
    (node: TreeNodeData) => {
      const relative = node.path.startsWith(workspacePath)
        ? node.path.slice(workspacePath.length).replace(/^[\\/]/, '')
        : node.path;
      const withoutExt = relative.replace(/\.[^.]+$/, '');
      const withSlashes = withoutExt.replace(/\\/g, '/');
      navigator.clipboard.writeText(withSlashes).catch(console.error);
    },
    [workspacePath]
  );

  const handlePaste = useCallback(
    async (targetDir: string | null) => {
      const clip = explorerClipboard;
      if (!clip) return;
      const destDir = targetDir || workspacePath;
      try {
        if (clip.operation === 'copy') {
          await invoke('copy_entry', { sourcePath: clip.path, destinationDir: destDir });
        } else {
          await invoke('move_entry', { sourcePath: clip.path, destinationDir: destDir });
          setExplorerClipboard(null);
        }
        refreshRoot();
        if (destDir && destDir !== workspacePath) {
          setTimeout(() => treeRef.current?.open(destDir), 50);
        }
      } catch (err) {
        console.error('Failed to paste:', err);
        refreshRoot();
      }
    },
    [explorerClipboard, workspacePath, setExplorerClipboard, refreshRoot]
  );

  const handlePasteFromMenu = useCallback(
    (node: TreeNodeData | null) => {
      let targetDir: string | null = null;
      if (node) {
        targetDir = node.isDir ? node.path : findParentPath(node.path);
      }
      handlePaste(targetDir);
    },
    [handlePaste]
  );

  const handleCollapseAll = useCallback(() => {
    treeRef.current?.closeAll();
  }, [treeRef]);

  const handleStageFile = useCallback(
    async (filePath: string) => {
      try {
        await invoke('git_stage_file', { workspacePath, filePath });
        const statuses = await invoke<{ path: string; change: string }[]>('get_git_status', { workspacePath });
        setGitStatuses(statuses as never[]);
        const stats = await invoke<{ path: string; linesAdded: number; linesDeleted: number }[]>('get_git_diff_stats', { workspacePath });
        setGitDiffStats(stats as never[]);
      } catch (err) {
        console.error('Failed to stage file:', err);
      }
    },
    [workspacePath, setGitStatuses, setGitDiffStats]
  );

  const handleUnstageFile = useCallback(
    async (filePath: string) => {
      try {
        await invoke('git_unstage_file', { workspacePath, filePath });
        const statuses = await invoke<{ path: string; change: string }[]>('get_git_status', { workspacePath });
        setGitStatuses(statuses as never[]);
        const stats = await invoke<{ path: string; linesAdded: number; linesDeleted: number }[]>('get_git_diff_stats', { workspacePath });
        setGitDiffStats(stats as never[]);
      } catch (err) {
        console.error('Failed to unstage file:', err);
      }
    },
    [workspacePath, setGitStatuses, setGitDiffStats]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      const tree = treeRef.current;
      if (!tree) return;

      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'F2') {
        const node = tree.focusedNode ?? tree.mostRecentNode;
        if (node) {
          e.preventDefault();
          tree.edit(node.id);
        }
      } else if (e.key === 'Delete') {
        const nodes = tree.selectedNodes;
        if (nodes.length > 0) {
          e.preventDefault();
          const data = nodes[0].data;
          setPendingDelete({ path: data.path, name: data.name, isDir: data.isDir });
        }
      } else if (mod && e.key.toLowerCase() === 'c') {
        const nodes = tree.selectedNodes;
        if (nodes.length > 0) {
          e.preventDefault();
          const data = nodes[0].data;
          setExplorerClipboard({ operation: 'copy', path: data.path, name: data.name, isDir: data.isDir });
        }
      } else if (mod && e.key.toLowerCase() === 'x') {
        const nodes = tree.selectedNodes;
        if (nodes.length > 0) {
          e.preventDefault();
          const data = nodes[0].data;
          setExplorerClipboard({ operation: 'cut', path: data.path, name: data.name, isDir: data.isDir });
        }
      } else if (mod && e.key.toLowerCase() === 'v') {
        const node = tree.focusedNode ?? tree.mostRecentNode;
        const data = node?.data;
        if (data) {
          const targetDir = data.isDir ? data.path : findParentPath(data.path);
          handlePaste(targetDir);
        } else {
          handlePaste(workspacePath);
        }
      }
    },
    [handlePaste, workspacePath, setExplorerClipboard]
  );

  const findExternalDropTarget = useCallback(
    (e: React.DragEvent): string => {
      const target = e.target as HTMLElement;
      const row = target.closest('[data-file-path]') as HTMLElement | null;
      if (row) {
        const path = row.dataset.filePath!;
        const isDir = row.dataset.isDir === 'true';
        if (isDir) return path;
        const sep = path.includes('\\') ? '\\' : '/';
        const lastSep = path.lastIndexOf(sep);
        if (lastSep > 0) return path.substring(0, lastSep);
      }
      return workspacePath;
    },
    [workspacePath]
  );

  const handleExternalDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      if (!isExternalDrag) setIsExternalDrag(true);
      const targetPath = findExternalDropTarget(e);
      setExternalDropTarget((prev) => (prev !== targetPath ? targetPath : prev));
    },
    [isExternalDrag, findExternalDropTarget]
  );

  const handleExternalDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (relatedTarget && containerRef.current?.contains(relatedTarget)) return;
      setIsExternalDrag(false);
      setExternalDropTarget(null);
    },
    []
  );

  const handleExternalDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsExternalDrag(false);
      setExternalDropTarget(null);

      const targetDir = findExternalDropTarget(e);
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as File & { path?: string };
        if (file.path) {
          paths.push(file.path);
        } else if (file.name) {
          paths.push(file.name);
        }
      }

      if (paths.length > 0) {
        await importExternalFiles(paths, targetDir);
      }
    },
    [findExternalDropTarget, importExternalFiles]
  );

  const explorerContextValue = useMemo(
    () => ({
      onFileClick,
      gitStatuses,
      activeFilePath,
      onContextMenu: handleContextMenu,
      externalDropTarget,
      clipboard: explorerClipboard,
    }),
    [onFileClick, gitStatuses, activeFilePath, handleContextMenu, externalDropTarget, explorerClipboard]
  );

  return (
    <div
      className="h-full flex flex-col bg-theme-main border-r border-theme select-none overflow-hidden"
      onContextMenu={handleContainerContextMenu}
    >
      <div className="group/explorer flex items-center justify-between pr-2 pl-3 h-9 shrink-0 border-b border-theme">
        <div className="flex items-center gap-2 min-w-0">
          <span
            title={workspaceName}
            className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.18em] truncate"
          >
            Explorer
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/explorer:opacity-100 transition-opacity duration-150">
          <HeaderIconButton title="New File..." onClick={() => handleNewFile(null)}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </HeaderIconButton>
          <HeaderIconButton title="New Folder..." onClick={() => handleNewFolder(null)}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
          </HeaderIconButton>
          <HeaderIconButton title="Refresh Explorer" onClick={refreshRoot}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </HeaderIconButton>
          <HeaderIconButton title="Collapse All" onClick={handleCollapseAll}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 9l8 8 8-8"
              />
            </svg>
          </HeaderIconButton>
        </div>
      </div>

      <div className="px-2 py-1.5 border-b border-theme">
        <div className="flex items-center gap-2 px-2 h-7 bg-theme-card/60 border border-theme rounded-sm focus-within:border-zinc-600 transition-colors shadow-inner">
          <svg
            className="w-3 h-3 text-zinc-600 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            aria-label="Search files"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patterns..."
            className="flex-1 bg-transparent text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="p-0.5 hover:bg-theme-hover rounded-sm cursor-pointer text-zinc-500 hover:text-zinc-200"
              title="Clear Search"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : (
            <span className="text-[9px] font-mono text-zinc-700 pointer-events-none">/</span>
          )}
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative"
        ref={containerRef}
        onKeyDown={handleKeyDown}
        onDragOver={handleExternalDragOver}
        onDragLeave={handleExternalDragLeave}
        onDrop={handleExternalDrop}
      >
        {isLoading && treeData.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="w-5 h-5 animate-spin text-zinc-700"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : treeData.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
            <svg className="w-8 h-8 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
              />
            </svg>
            <span className="text-[11px] text-zinc-600">No items in this folder</span>
            <button
              onClick={() => handleNewFile(null)}
              className="text-[10px] px-2.5 py-1 rounded-sm bg-theme-card border border-theme text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
            >
              New File
            </button>
          </div>
        ) : (
          <ExplorerContext.Provider value={explorerContextValue}>
            <div role="tree" aria-label="File explorer" className="h-full w-full">
              <Tree<TreeNodeData>
                ref={treeRef}
                data={treeData}
                width={treeSize.width}
                height={treeSize.height}
                indent={14}
                rowHeight={26}
                openByDefault={false}
                searchTerm={debouncedSearchQuery || undefined}
                onToggle={handleToggle}
                onMove={handleMove}
                onRename={handleRename}
                onDelete={({ nodes }) => {
                  const first = nodes[0]?.data;
                  if (first) {
                    setPendingDelete({ path: first.path, name: first.name, isDir: first.isDir });
                  }
                }}
                disableDrop={({ parentNode, dragNodes }) => {
                  if (parentNode !== null && parentNode.isLeaf) return true;
                  for (const drag of dragNodes) {
                    if (!drag) continue;
                    if (drag.isInternal && parentNode) {
                      if (drag.id === parentNode.id) return true;
                      const dragPath = (drag.data as TreeNodeData | undefined)?.path;
                      const parentPath = (parentNode.data as TreeNodeData | undefined)?.path;
                      if (
                        dragPath &&
                        parentPath &&
                        (parentPath.startsWith(dragPath + '/') ||
                          parentPath.startsWith(dragPath + '\\'))
                      ) {
                        return true;
                      }
                    }
                  }
                  return false;
                }}
                padding={4}
                overscanCount={10}
              >
                {TreeNode}
              </Tree>
            </div>
          </ExplorerContext.Provider>
        )}

        <ExplorerContextMenu
          menu={contextMenu}
          onClose={closeContextMenu}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRenameFromMenu}
          onDelete={handleDeleteFromMenu}
          onReveal={revealInFileManager}
          onRefresh={refreshRoot}
          onCopy={handleCopy}
          onCut={handleCut}
          onCopyPath={handleCopyPath}
          onCopyRelativePath={handleCopyRelativePath}
          onOpenInTerminal={handleOpenInTerminal}
          onDuplicate={handleDuplicate}
          onCopyAsImportPath={handleCopyAsImportPath}
          onPaste={handlePasteFromMenu}
          clipboard={explorerClipboard}
          containerRef={containerRef}
        />

        {isExternalDrag && (
          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-zinc-500/40 rounded-md z-40 bg-zinc-500/5" />
        )}
      </div>

      <GitChangesPanel
        gitStatuses={gitStatuses}
        gitDiffStats={gitDiffStats}
        workspacePath={workspacePath}
        onFileClick={onFileClick}
        onStageFile={handleStageFile}
        onUnstageFile={handleUnstageFile}
      />

      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPendingDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 6 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="w-[360px] rounded-lg border border-theme bg-theme-card shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pt-3.5 pb-1">
                <h2 className="text-[13px] font-semibold text-theme-main">
                  Delete {pendingDelete.isDir ? 'Folder' : 'File'}?
                </h2>
              </div>
              <div className="px-4 py-2">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Are you sure you want to delete{' '}
                  <span className="font-mono text-zinc-200">{pendingDelete.name}</span>? This action
                  is permanent and cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 px-4 py-3 bg-zinc-950/40 border-t border-theme">
                <button
                  onClick={() => setPendingDelete(null)}
                  className="px-3.5 py-1.5 rounded-sm text-[11px] text-zinc-300 hover:bg-theme-hover transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmDelete(pendingDelete.path)}
                  className="px-3.5 py-1.5 rounded-sm text-[11px] font-medium text-white bg-rose-600/90 hover:bg-rose-600 transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
