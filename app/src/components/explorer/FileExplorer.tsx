import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Tree } from 'react-arborist';
import { FileEntry } from '../../types';
import { useFileTree, type TreeNodeData } from '../../hooks/useFileTree';
import { TreeNode, ExplorerContext } from './TreeNode';
import { GitChangesPanel } from './GitChangesPanel';
import { ExplorerContextMenu } from './ExplorerContextMenu';
import { useAppStore } from '../../stores/appStore';

interface FileExplorerProps {
  workspacePath: string;
  workspaceName: string;
  onFileClick: (entry: FileEntry, change?: string) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  workspacePath,
  workspaceName,
  onFileClick,
}) => {
  const gitStatuses = useAppStore((s) => s.gitStatuses);
  const gitDiffStats = useAppStore((s) => s.gitDiffStats);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const setExplorerClipboard = useAppStore((s) => s.setExplorerClipboard);

  const {
    treeData,
    isLoading,
    treeRef,
    handleToggle,
    handleMove,
    handleRename,
    handleDelete,
    createNewEntry,
    deleteEntry,
    revealInFileManager,
    refreshRoot,
  } = useFileTree(workspacePath);

  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNodeData | null;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [treeSize, setTreeSize] = useState({ width: 300, height: 400 });

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
      deleteEntry(node.path);
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

  const explorerContextValue = useMemo(
    () => ({
      onFileClick,
      gitStatuses,
      activeFilePath,
      onContextMenu: handleContextMenu,
    }),
    [onFileClick, gitStatuses, activeFilePath, handleContextMenu]
  );

  return (
    <div
      className="h-full flex flex-col bg-zinc-950/50 backdrop-blur-sm border-r border-zinc-800/50 select-none overflow-hidden"
      onContextMenu={handleContainerContextMenu}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/50 shrink-0 bg-zinc-900/20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md bg-amber-500/10 border border-amber-500/20">
            <svg
              className="w-3 h-3 text-amber-500 shrink-0"
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                d="M2 3.5h4l1.5 1.5H14a1 1 0 011 1V12a1 1 0 01-1 1H2a1 1 0 01-1-1v-8a1 1 0 011-1z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] truncate">
            {workspaceName}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleNewFile(null)}
            className="p-1.5 hover:bg-zinc-800 rounded-md transition-all duration-200 text-zinc-500 hover:text-blue-400 cursor-pointer group"
            title="New File"
          >
            <svg
              className="w-3.5 h-3.5 group-hover:scale-110 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </button>
          <button
            onClick={() => handleNewFolder(null)}
            className="p-1.5 hover:bg-zinc-800 rounded-md transition-all duration-200 text-zinc-500 hover:text-amber-400 cursor-pointer group"
            title="New Folder"
          >
            <svg
              className="w-3.5 h-3.5 group-hover:scale-110 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
          </button>
          <button
            onClick={refreshRoot}
            className="p-1.5 hover:bg-zinc-800 rounded-md transition-all duration-200 text-zinc-500 hover:text-emerald-400 cursor-pointer group"
            title="Refresh"
          >
            <svg
              className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-2 py-2 border-b border-zinc-800/50 bg-zinc-900/10">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800/50 rounded-lg focus-within:border-blue-500/50 transition-colors shadow-inner">
          <svg
            className="w-3.5 h-3.5 text-zinc-600 shrink-0"
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patterns..."
            className="flex-1 bg-transparent text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 hover:bg-zinc-800 rounded-md cursor-pointer text-zinc-500 hover:text-zinc-300"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative bg-zinc-950/20" ref={containerRef}>
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
          <div className="flex items-center justify-center py-8 text-zinc-600 text-[10px] uppercase tracking-widest">
            Empty directory
          </div>
        ) : (
          <ExplorerContext.Provider value={explorerContextValue}>
            <Tree<TreeNodeData>
              ref={treeRef}
              data={treeData}
              width={treeSize.width}
              height={treeSize.height}
              indent={14}
              rowHeight={28}
              openByDefault={false}
              searchTerm={searchQuery || undefined}
              onToggle={handleToggle}
              onMove={handleMove}
              onRename={handleRename}
              onDelete={handleDelete}
              disableDrop={({ parentNode }) =>
                parentNode !== null && parentNode.isLeaf
              }
              padding={4}
              overscanCount={10}
            >
              {TreeNode}
            </Tree>
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
          containerRef={containerRef}
        />
      </div>

      <GitChangesPanel
        gitStatuses={gitStatuses}
        gitDiffStats={gitDiffStats}
        workspacePath={workspacePath}
        onFileClick={onFileClick}
      />
    </div>
  );
};
