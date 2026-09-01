import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowsIn, ArrowClockwise, FilePlus, FolderPlus, FolderSimple, MagnifyingGlass, X } from '@phosphor-icons/react';
import { Tree, type NodeApi } from 'react-arborist';
import { FileEntry } from '../../types';
import { useFileTree, type TreeNodeData } from '../../hooks/useFileTree';
import { TreeNode, ExplorerContext, type ExplorerClipboardEntry } from './TreeNode';
import { FileIcon } from './FileIcon';
import { MemoryPanel } from './MemoryPanel';
import { SearchPanel } from './SearchPanel';
import { DockerPanel } from './DockerPanel';
import { DbPanel } from './DbPanel';
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
  active?: boolean;
}> = ({ title, onClick, children, active }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`explorer-header-action app-icon-button h-6 w-6 rounded transition-colors duration-75 cursor-pointer ${
      active
        ? 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
    }`}
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
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const setExplorerClipboard = useAppStore((s) => s.setExplorerClipboard);
  const explorerClipboard = useAppStore((s) => s.explorerClipboard);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const addSession = useAppStore((s) => s.addSession);
  const setGitDiffFile = useAppStore((s) => s.setGitDiffFile);
  const openFiles = useAppStore((s) => s.openFiles);
  const closeFileTab = useAppStore((s) => s.closeFileTab);
  const [searchSignal, setSearchSignal] = useState(0);

  const {
    treeData,
    isLoading,
    treeRef,
    handleToggle,
    handleMove,
    moveEntries,
    handleRename,
    createNewEntry,
    deleteEntry,
    revealInFileManager,
    refreshRoot,
    refreshPath,
    importExternalFiles,
    undoExplorerOp,
    pushUndoOp,
  } = useFileTree(workspacePath);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNodeData | null;
  } | null>(null);
  const [externalDropTarget, setExternalDropTarget] = useState<string | null>(null);
  const [isExternalDrag, setIsExternalDrag] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    paths: string[];
    names: string[];
    isDir: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [treeSize, setTreeSize] = useState({ width: 300, height: 400 });

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Workspace-wide filename search. The lazy tree only knows about folders
  // that were expanded, so we query the whole workspace recursively instead
  // of relying on react-arborist's `searchTerm` (which can't see unloaded
  // folders). Files are found even when their folder is closed.
  useEffect(() => {
    const term = debouncedSearchQuery.trim().toLowerCase();
    if (!term) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    invoke<FileEntry[]>('list_all_files', { path: workspacePath })
      .then((all) => {
        if (cancelled) return;
        const matches = all
          .filter((f) => {
            const name = f.name.toLowerCase();
            const rel = f.path.replace(/\\/g, '/').toLowerCase();
            return name.includes(term) || rel.includes(term);
          })
          // Name matches first, then path matches, then alphabetical.
          .sort((a, b) => {
            const aName = a.name.toLowerCase().includes(term);
            const bName = b.name.toLowerCase().includes(term);
            if (aName !== bName) return aName ? -1 : 1;
            return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
          })
          .slice(0, 200);
        setSearchResults(matches);
      })
      .catch((err) => {
        console.error('Failed to search files:', err);
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQuery, workspacePath]);

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

  // Let the FS watcher refresh the tree when files change on disk.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      unlisten = await listen<{ workspacePath: string; paths: string[] }>(
        'file-system-changed',
        (event) => {
          const paths = event.payload?.paths;
          if (!paths || paths.length === 0) {
            refreshRoot();
            return;
          }
          // Refresh affected loaded parents (or the root for unknown paths).
          const dirsToRefresh = new Set<string>();
          for (const p of paths) {
            const parent = findParentPath(p);
            if (parent && parent !== workspacePath) {
              dirsToRefresh.add(parent);
            }
          }
          if (dirsToRefresh.size === 0) {
            refreshRoot();
          } else {
            refreshRoot();
            for (const dir of dirsToRefresh) {
              refreshPath(dir);
            }
          }
        }
      );
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refreshRoot, refreshPath, workspacePath]);

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

  const [selectedEntries, setSelectedEntries] = useState<ExplorerClipboardEntry[]>([]);

  // Native HTML5 drag & drop state (react-dnd is neutralized — see
  // dndRootElement below — because its canDrop chain can't resolve reliably
  // with the installed react-dnd version skew, causing a "not-allowed" cursor).
  const [nativeDrag, setNativeDrag] = useState<ExplorerClipboardEntry[] | null>(null);
  const [nativeDropTarget, setNativeDropTarget] = useState<string | null>(null);
  // Synchronous mirror of the in-flight drag payload. The native `dragover`
  // event can fire before React flushes the state update from `dragstart`, so
  // the handlers must read the payload from a ref (never from state) to be able
  // to call preventDefault() + set dropEffect='move' on the very first event.
  // Without this, the browser shows a "not-allowed" cursor for the first
  // dragover(s) and the drop is blocked.
  const nativeDragRef = useRef<ExplorerClipboardEntry[] | null>(null);
  const selectedEntriesRef = useRef<ExplorerClipboardEntry[]>([]);

  useEffect(() => {
    selectedEntriesRef.current = selectedEntries;
  }, [selectedEntries]);

  const handleTreeSelect = useCallback((nodes: NodeApi<TreeNodeData>[]) => {
    setSelectedEntries(
      nodes.map((n) => {
        const data = n.data as TreeNodeData;
        return { path: data.path, name: data.name, isDir: data.isDir };
      })
    );
  }, []);

  const nativeMoveEntries = useCallback(
    async (entries: ExplorerClipboardEntry[], destDir: string) => {
      const paths = entries.map((e) => e.path);
      await moveEntries(paths, destDir);
    },
    [moveEntries]
  );

  // Native drag & drop listeners attached directly to the tree container (not
  // via React synthetic events). We call stopPropagation() so that neither
  // react-arborist's react-dnd backend (whose window-level dragover handler
  // sets dropEffect='none') nor React's delegated handlers can override the
  // cursor. This guarantees the "move" cursor and makes the drop actually work.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getRow = (target: EventTarget | null): HTMLElement | null => {
      const node = target as HTMLElement | null;
      return node && node.closest ? (node.closest('[data-file-path]') as HTMLElement | null) : null;
    };

    const onDragStart = (e: DragEvent) => {
      const row = getRow(e.target);
      if (!row) return;
      const path = row.getAttribute('data-file-path');
      if (!path) return;
      const isDir = row.getAttribute('data-is-dir') === 'true';
      const name = path.split(/[\\/]/).pop() ?? path;
      const selected = selectedEntriesRef.current;
      const inSelection = selected.some((s) => s.path === path);
      const entries =
        inSelection && selected.length > 1
          ? selected
          : [{ path, name, isDir }];
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', path);
      }
      nativeDragRef.current = entries;
      setNativeDrag(entries);
      setNativeDropTarget(null);
      e.stopPropagation();
    };

    const onDragOver = (e: DragEvent) => {
      if (!nativeDragRef.current) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const row = getRow(e.target);
      let targetPath = workspacePath;
      if (row) {
        const p = row.getAttribute('data-file-path');
        const isDir = row.getAttribute('data-is-dir') === 'true';
        if (p) targetPath = isDir ? p : findParentPath(p) ?? workspacePath;
      }
      setNativeDropTarget((prev) => (prev !== targetPath ? targetPath : prev));
      e.stopPropagation();
    };

    const onDrop = (e: DragEvent) => {
      const entries = nativeDragRef.current;
      if (!entries || entries.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const row = getRow(e.target);
      let destDir = workspacePath;
      if (row) {
        const p = row.getAttribute('data-file-path');
        const isDir = row.getAttribute('data-is-dir') === 'true';
        if (p) destDir = isDir ? p : findParentPath(p) ?? workspacePath;
      }
      nativeDragRef.current = null;
      setNativeDrag(null);
      setNativeDropTarget(null);
      void nativeMoveEntries(entries, destDir);
    };

    const onDragEnd = () => {
      nativeDragRef.current = null;
      setNativeDrag(null);
      setNativeDropTarget(null);
    };

    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    el.addEventListener('dragend', onDragEnd);
    return () => {
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
      el.removeEventListener('dragend', onDragEnd);
    };
  }, [workspacePath, nativeMoveEntries]);

  // Neutralize react-dnd's HTML5 backend by pointing its event listeners at a
  // detached element. Without this, react-dnd's window-level dragover handler
  // sets dataTransfer.dropEffect = 'none' whenever its canDrop chain fails,
  // showing a "not-allowed" cursor and blocking native drops.
  const dndRootElement = useMemo(() => document.createElement('div'), []);

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
      setPendingDelete({ paths: [node.path], names: [node.name], isDir: node.isDir });
    },
    []
  );

  const confirmDelete = useCallback(
    async (paths: string[]) => {
      try {
        for (const path of paths) {
          await deleteEntry(path);
        }
      } finally {
        setPendingDelete(null);
      }
    },
    [deleteEntry]
  );

  const handleCopy = useCallback(
    (node: TreeNodeData) => {
      const entries: ExplorerClipboardEntry[] = [{ path: node.path, name: node.name, isDir: node.isDir }];
      setExplorerClipboard({ operation: 'copy', entries });
    },
    [setExplorerClipboard]
  );

  const handleCut = useCallback(
    (node: TreeNodeData) => {
      const entries: ExplorerClipboardEntry[] = [{ path: node.path, name: node.name, isDir: node.isDir }];
      setExplorerClipboard({ operation: 'cut', entries });
    },
    [setExplorerClipboard]
  );

  const copySelectionToClipboard = useCallback(
    (operation: 'copy' | 'cut') => {
      const tree = treeRef.current;
      if (!tree) return;
      const nodes = tree.selectedNodes;
      if (nodes.length === 0) return;
      const entries: ExplorerClipboardEntry[] = nodes.map((n) => {
        const data = n.data as TreeNodeData;
        return { path: data.path, name: data.name, isDir: data.isDir };
      });
      setExplorerClipboard({ operation, entries });
    },
    [treeRef, setExplorerClipboard]
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
        const createdPath = await invoke<string>('duplicate_entry', { path: node.path });
        pushUndoOp({ kind: 'duplicate', sourcePath: node.path, createdPath });
        refreshRoot();
      } catch (err) {
        console.error('Failed to duplicate:', err);
      }
    },
    [refreshRoot, pushUndoOp]
  );

  const handleMultiDuplicate = useCallback(async () => {
    try {
      for (const entry of selectedEntries) {
        const createdPath = await invoke<string>('duplicate_entry', { path: entry.path });
        pushUndoOp({ kind: 'duplicate', sourcePath: entry.path, createdPath });
      }
      refreshRoot();
    } catch (err) {
      console.error('Failed to duplicate selection:', err);
    }
  }, [selectedEntries, refreshRoot, pushUndoOp]);

  const handleMultiDelete = useCallback(() => {
    if (selectedEntries.length === 0) return;
    setPendingDelete({
      paths: selectedEntries.map((e) => e.path),
      names: selectedEntries.map((e) => e.name),
      isDir: selectedEntries[0]?.isDir ?? false,
    });
  }, [selectedEntries]);

  const handleMultiCopy = useCallback(() => {
    if (selectedEntries.length === 0) return;
    setExplorerClipboard({ operation: 'copy', entries: selectedEntries });
  }, [selectedEntries, setExplorerClipboard]);

  const handleMultiCut = useCallback(() => {
    if (selectedEntries.length === 0) return;
    setExplorerClipboard({ operation: 'cut', entries: selectedEntries });
  }, [selectedEntries, setExplorerClipboard]);

  const handleCopyName = useCallback((node: TreeNodeData) => {
    navigator.clipboard.writeText(node.name).catch(console.error);
  }, []);

  // "Open to the Side" (VS Code parity): open the file in the editor. The
  // editor is tab-based, so the file opens in its own tab alongside the
  // current one — the closest equivalent to a side-by-side editor group.
  const handleOpenToSide = useCallback(
    (node: TreeNodeData) => {
      if (node.isDir) return;
      setGitDiffFile(null);
      onFileClick({
        name: node.name,
        path: node.path,
        isDir: false,
        size: 0,
        modifiedAt: 0,
        extension: node.extension,
      });
    },
    [onFileClick, setGitDiffFile]
  );

  const handleFindInFolder = useCallback((node: TreeNodeData) => {
    // Focus the search box and pre-fill with the folder name to quickly
    // narrow the tree to entries inside that folder.
    const query = node.isDir ? node.name : findParentPath(node.path)?.split(/[\\/]/).pop() ?? '';
    setSearchQuery(query);
    searchInputRef.current?.focus();
  }, []);

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
        for (const entry of clip.entries) {
          if (clip.operation === 'copy') {
            const createdPath = await invoke<string>('copy_entry', { sourcePath: entry.path, destinationDir: destDir });
            pushUndoOp({ kind: 'duplicate', sourcePath: entry.path, createdPath });
          } else {
            await invoke('move_entry', { sourcePath: entry.path, destinationDir: destDir });
            pushUndoOp({ kind: 'move', sourcePath: entry.path, destinationDir: destDir, name: entry.name });
          }
        }
        if (clip.operation === 'cut') {
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
    [explorerClipboard, workspacePath, setExplorerClipboard, refreshRoot, treeRef, pushUndoOp]
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

  const handleRevealActiveFile = useCallback(() => {
    if (!activeFilePath) return;
    const tree = treeRef.current;
    if (!tree) return;
    try {
      tree.openParents(activeFilePath);
      tree.scrollTo(activeFilePath);
      tree.select(activeFilePath);
      tree.focus(activeFilePath);
    } catch (err) {
      console.error('Failed to reveal active file:', err);
    }
  }, [activeFilePath, treeRef]);

  const handleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      // Intercept Enter in the capture phase so react-arborist's own
      // rename-on-Enter (bubble phase, child container) never fires. In VS
      // Code, Enter opens the focused file; F2 is used for rename.
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      const tree = treeRef.current;
      const node = tree?.focusedNode;
      if (!node || node.isEditing) return;
      const data = node.data as TreeNodeData;
      if (!data.isDir) {
        e.preventDefault();
        e.stopPropagation();
        setGitDiffFile(null);
        onFileClick({
          name: data.name,
          path: data.path,
          isDir: false,
          size: 0,
          modifiedAt: 0,
          extension: data.extension,
        });
      } else {
        e.preventDefault();
        e.stopPropagation();
        tree?.toggle(node.id);
      }
    },
    [onFileClick, treeRef]
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
          const data = nodes.map((n) => n.data as TreeNodeData);
          setPendingDelete({
            paths: data.map((d) => d.path),
            names: data.map((d) => d.name),
            isDir: data[0]?.isDir ?? false,
          });
        }
      } else if (mod && e.key.toLowerCase() === 'c') {
        if (tree.selectedNodes.length > 0) {
          e.preventDefault();
          copySelectionToClipboard('copy');
        }
      } else if (mod && e.key.toLowerCase() === 'x') {
        if (tree.selectedNodes.length > 0) {
          e.preventDefault();
          copySelectionToClipboard('cut');
        }
      } else if (mod && e.key.toLowerCase() === 'v') {
        const node = tree.focusedNode ?? tree.mostRecentNode;
        const data = node?.data as TreeNodeData | undefined;
        if (data) {
          const targetDir = data.isDir ? data.path : findParentPath(data.path);
          handlePaste(targetDir);
        } else {
          handlePaste(workspacePath);
        }
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (explorerClipboard === null) {
          e.preventDefault();
          undoExplorerOp();
        }
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        // Find in Files (VS Code parity).
        e.preventDefault();
        setSearchSignal((s) => s + 1);
      }
    },
    [handlePaste, workspacePath, copySelectionToClipboard, undoExplorerOp, explorerClipboard]
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

  const handleContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      // Allow dropping an in-tree drag onto empty space → move to workspace root.
      if (nativeDragRef.current) {
        const row = (e.target as HTMLElement).closest('[data-file-path]');
        if (row) return; // the row's own dragover handler manages it
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setNativeDropTarget(workspacePath);
        return;
      }
      handleExternalDragOver(e);
    },
    [workspacePath, handleExternalDragOver]
  );

  const handleContainerDrop = useCallback(
    async (e: React.DragEvent) => {
      const entries = nativeDragRef.current;
      if (entries && entries.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        nativeDragRef.current = null;
        setNativeDrag(null);
        setNativeDropTarget(null);
        await nativeMoveEntries(entries, workspacePath);
        return;
      }
      await handleExternalDrop(e);
    },
    [workspacePath, nativeMoveEntries, handleExternalDrop]
  );

  const handleContainerDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (nativeDragRef.current) {
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        if (relatedTarget && containerRef.current?.contains(relatedTarget)) return;
        setNativeDropTarget(null);
        return;
      }
      handleExternalDragLeave(e);
    },
    [handleExternalDragLeave]
  );

  const explorerContextValue = useMemo(
    () => ({
      onFileClick,
      gitStatusMap: new Map(gitStatuses.map((g) => [g.path, g.change])),
      activeFilePath,
      onContextMenu: handleContextMenu,
      externalDropTarget,
      clipboard: explorerClipboard,
      searchTerm: debouncedSearchQuery || undefined,
      nativeDropTarget,
      nativeDragging: !!nativeDrag,
    }),
    [
      onFileClick,
      gitStatuses,
      activeFilePath,
      handleContextMenu,
      externalDropTarget,
      explorerClipboard,
      debouncedSearchQuery,
      nativeDropTarget,
      nativeDrag,
    ]
  );

  return (
    <div
      className="explorer-pane h-full flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-primary)] select-none overflow-hidden"
      onContextMenu={handleContainerContextMenu}
    >
      <div className="explorer-pane__header flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-primary)] px-3">
        <div className="explorer-pane__heading flex min-w-0 items-center gap-2">
          <FolderSimple size={15} className="explorer-pane__heading-icon shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="explorer-pane__eyebrow block">Explorer</span>
            <span title={workspaceName} className="explorer-pane__workspace block truncate">{workspaceName}</span>
          </div>
        </div>
        <div className="explorer-pane__actions flex items-center gap-0.5">
          <HeaderIconButton title="New File..." onClick={() => handleNewFile(null)}>
            <FilePlus size={15} aria-hidden="true" />
          </HeaderIconButton>
          <HeaderIconButton title="New Folder..." onClick={() => handleNewFolder(null)}>
            <FolderPlus size={15} aria-hidden="true" />
          </HeaderIconButton>
          <HeaderIconButton
            title="Reveal Active File in Explorer"
            onClick={handleRevealActiveFile}
            active={!!activeFilePath}
          >
            <FolderSimple size={15} aria-hidden="true" />
          </HeaderIconButton>
          <HeaderIconButton title="Refresh Explorer" onClick={refreshRoot}>
            <ArrowClockwise size={15} aria-hidden="true" />
          </HeaderIconButton>
          <HeaderIconButton title="Collapse All" onClick={handleCollapseAll}>
            <ArrowsIn size={15} aria-hidden="true" />
          </HeaderIconButton>
        </div>
      </div>

      <div className="explorer-pane__search-wrap border-b border-[var(--border-primary)] px-2 py-2">
        <div className="explorer-pane__search flex h-8 items-center gap-2 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 transition-colors focus-within:border-[var(--text-secondary)]">
          <MagnifyingGlass size={14} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="text"
            aria-label="Search files"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults.length > 0) {
                onFileClick(searchResults[0]);
              }
            }}
            placeholder="Search patterns..."
            className="flex-1 bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="app-icon-button h-5 w-5 rounded-sm"
              title="Clear Search"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : (
            <span className="text-[10px] text-[var(--text-secondary)] pointer-events-none">/</span>
          )}
        </div>
      </div>

      {openFiles.length > 0 && (
        <div className="explorer-pane__open-editors shrink-0 border-b border-[var(--border-primary)] select-none">
          <div className="flex h-8 items-center gap-1.5 px-3">
            <span className="explorer-pane__section-label flex-1 text-[11px] font-medium text-[var(--text-secondary)]">
              Open editors
            </span>
            <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">{openFiles.length}</span>
          </div>
          <div className="pb-1 max-h-40 overflow-y-auto custom-scrollbar">
            {openFiles.map((file) => {
              const isActiveOpen = activeFilePath === file.path;
              return (
                <div
                  key={file.path}
                  onClick={() => onFileClick({ name: file.name, path: file.path, isDir: false, size: 0, modifiedAt: 0, extension: file.language } as FileEntry)}
                  className={`explorer-open-file group/openfile flex items-center gap-2 pl-3 pr-1.5 py-1 cursor-pointer transition-colors duration-75 ${
                    isActiveOpen ? 'is-active bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]'
                  }`}
                  title={file.path}
                >
                  <FileIcon extension={file.language ?? null} isDir={false} className="w-4 h-4 shrink-0" name={file.name} />
                  <span className="truncate text-xs flex-1 min-w-0">{file.name}</span>
                  {file.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeFileTab(file.path);
                    }}
                    className="app-icon-button h-5 w-5 rounded-sm text-[var(--text-secondary)] opacity-0 group-hover/openfile:opacity-100"
                    title="Close File"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div
        className="explorer-pane__tree flex-1 min-h-0 relative"
        ref={containerRef}
        onKeyDownCapture={handleKeyDownCapture}
        onKeyDown={handleKeyDown}
        onDragOver={handleContainerDragOver}
        onDragLeave={handleContainerDragLeave}
        onDrop={handleContainerDrop}
      >
        {debouncedSearchQuery.trim() ? (
          <div className="explorer-pane__search-results h-full overflow-y-auto custom-scrollbar">
            {searchLoading ? (
              <div className="flex items-center justify-center py-8">
                <svg
                  className="w-5 h-5 animate-spin text-[var(--text-secondary)]"
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
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                <MagnifyingGlass size={22} className="text-[var(--text-secondary)]/60" aria-hidden="true" />
                <span className="text-[11px] text-[var(--text-secondary)]">
                  No files match “{debouncedSearchQuery.trim()}”
                </span>
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} across workspace
                </div>
                {searchResults.map((file) => {
                  const normWorkspace = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '');
                  const rel = file.path
                    .replace(/\\/g, '/')
                    .replace(normWorkspace, '')
                    .replace(/^\//, '');
                  return (
                    <button
                      key={file.path}
                      onClick={() => onFileClick(file)}
                      className="group/result flex w-full items-center gap-2 px-2.5 py-1 text-left hover:bg-[var(--bg-primary)] cursor-pointer"
                      title={file.path}
                    >
                      <FileIcon
                        extension={file.extension}
                        isDir={false}
                        className="w-4 h-4 shrink-0"
                        name={file.name}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-[var(--text-primary)]">{file.name}</span>
                        <span className="block truncate text-[10px] text-[var(--text-secondary)]/70">{rel}</span>
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        ) : isLoading && treeData.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="w-5 h-5 animate-spin text-[var(--text-secondary)]"
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
            <svg className="w-8 h-8 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
              />
            </svg>
            <span className="text-[11px] text-[var(--text-secondary)]">No items in this folder</span>
            <button
              onClick={() => handleNewFile(null)}
              className="text-[10px] px-2.5 py-1 rounded-sm bg-theme-card border border-theme text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-zinc-600 transition-colors cursor-pointer"
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
                searchMatch={(node, term) => {
                  const data = node.data as TreeNodeData;
                  if (!term) return true;
                  return data.name.toLowerCase().includes(term.toLowerCase());
                }}
                onToggle={handleToggle}
                onMove={handleMove}
                onRename={handleRename}
                onSelect={handleTreeSelect}
                onDelete={({ nodes }) => {
                  const data = nodes.map((n) => n.data as TreeNodeData);
                  if (data.length > 0) {
                    setPendingDelete({
                      paths: data.map((d) => d.path),
                      names: data.map((d) => d.name),
                      isDir: data[0]?.isDir ?? false,
                    });
                  }
                }}
                dndRootElement={dndRootElement}
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
          onCopyName={handleCopyName}
          onOpenToSide={handleOpenToSide}
          onFindInFolder={handleFindInFolder}
          onPaste={handlePasteFromMenu}
          onMultiCopy={handleMultiCopy}
          onMultiCut={handleMultiCut}
          onMultiDelete={handleMultiDelete}
          onMultiDuplicate={handleMultiDuplicate}
          selectedEntries={selectedEntries}
          clipboard={explorerClipboard}
          containerRef={containerRef}
        />

        {isExternalDrag && (
          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-zinc-500/40 rounded-md z-40 bg-zinc-500/5" />
        )}
      </div>

      <MemoryPanel workspacePath={workspacePath} />

      <SearchPanel workspacePath={workspacePath} externalOpenSignal={searchSignal} />

      <DockerPanel workspaceId={currentWorkspace?.id ?? ''} workspacePath={workspacePath} />

      <DbPanel workspacePath={workspacePath} />

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
                  Delete {pendingDelete.names.length > 1 ? `${pendingDelete.names.length} items` : `${pendingDelete.isDir ? 'Folder' : 'File'}`}?
                </h2>
              </div>
              <div className="px-4 py-2">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Are you sure you want to delete{' '}
                  {pendingDelete.names.length > 1 ? (
                    <>
                      <span className="font-mono text-zinc-200">{pendingDelete.names.length} items</span>{' '}
                      (including <span className="font-mono text-zinc-200">{pendingDelete.names[0]}</span>)?
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-zinc-200">{pendingDelete.names[0]}</span>?
                    </>
                  )}{' '}
                  This action is permanent and cannot be undone.
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
                  onClick={() => confirmDelete(pendingDelete.paths)}
                  className="px-3.5 py-1.5 rounded-sm text-[11px] font-medium text-white bg-rose-600/90 hover:bg-rose-600 transition-colors cursor-pointer"
                >
                  Delete {pendingDelete.names.length > 1 ? `${pendingDelete.names.length} items` : ''}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
