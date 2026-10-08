import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowsIn, ArrowClockwise, Crosshair, FilePlus, FolderPlus, FolderSimple, MagnifyingGlass, Scissors, Copy, CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import { Tree, type NodeApi } from 'react-arborist';
import type { FileEntry, TerminalSession } from '../../types';
import { useFileTree, type TreeNodeData } from '../../hooks/useFileTree';
import { useExplorerClipboard } from '../../hooks/useExplorerClipboard';
import {
  describeClipboard,
  formatPaths,
  pasteTargetDir,
  type ExplorerNotice,
  type PasteSource,
} from '../../utils/explorerClipboard';
import { TreeNode, ExplorerContext, type ExplorerClipboardEntry } from './TreeNode';
import { FileIcon } from './FileIcon';
import { MemoryPanel } from './MemoryPanel';
import { SearchPanel } from './SearchPanel';
import { DockerPanel } from './DockerPanel';
import { DbPanel } from './DbPanel';
import { ExplorerContextMenu, type ExplorerMenuActions, type ExplorerMenuState } from './ExplorerContextMenu';
import { useAppStore } from '../../stores/appStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { normalizeFilePath } from '../../utils/fileSync';
import type { FileSystemChangedPayload } from '../../utils/fileSync';

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

/** A tree drag drops as a move; holding Ctrl (Option on macOS) copies. */
const isCopyDrag = (e: { ctrlKey: boolean; altKey: boolean }): boolean => e.ctrlKey || e.altKey;

const entryOf = (data: TreeNodeData): ExplorerClipboardEntry => ({
  path: data.path,
  name: data.name,
  isDir: data.isDir,
});

/** An "Open editors" row as a tree entry, so it gets the same commands. */
const openEditorNode = (file: { path: string; name: string }): TreeNodeData => ({
  id: file.path,
  name: file.name,
  path: file.path,
  extension: file.name.includes('.') ? file.name.split('.').pop() ?? null : null,
  isDir: false,
});

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
    className={`explorer-header-action app-icon-button h-6 w-6 rounded cursor-pointer ${
      active ? 'is-active' : ''
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
  const explorerClipboard = useAppStore((s) => s.explorerClipboard);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const addSession = useAppStore((s) => s.addSession);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setGitDiffFile = useAppStore((s) => s.setGitDiffFile);
  const openFiles = useAppStore((s) => s.openFiles);
  const closeFileTab = useAppStore((s) => s.closeFileTab);
  const closeOtherFiles = useAppStore((s) => s.closeOtherFiles);
  const closeSavedFiles = useAppStore((s) => s.closeSavedFiles);
  const closeAllFiles = useAppStore((s) => s.closeAllFiles);
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
    discardCreatedEntry,
    deleteEntry,
    revealInFileManager,
    refreshRoot,
    refreshPath,
    refreshChangedPaths,
    importExternalFiles,
    undoExplorerOp,
    pushUndoOp,
  } = useFileTree(workspacePath);
  const { copyEntries, clearClipboard, peekPasteSource, pasteInto, copyInto } = useExplorerClipboard(pushUndoOp);

  // Short-lived status line for paste results and failures, which used to
  // go only to the console.
  const [notice, setNotice] = useState<ExplorerNotice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.tone === 'error' ? 6000 : 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  const notifyError = useCallback((prefix: string, err: unknown) => {
    console.error(prefix, err);
    setNotice({ tone: 'error', text: `${prefix} ${String(err).replace(/^Error:\s*/, '')}` });
  }, []);

  /** What Paste would insert, refreshed whenever a context menu opens. */
  const [pasteSource, setPasteSource] = useState<PasteSource | null>(null);
  /** A New File/Folder placeholder still waiting for its name. */
  const pendingCreateRef = useRef<{ path: string; isDir: boolean } | null>(null);
  const confirmDeleteRef = useRef<(paths: string[]) => Promise<void>>(async () => {});

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [filesystemRevision, setFilesystemRevision] = useState(0);
  const [contextMenu, setContextMenu] = useState<ExplorerMenuState | null>(null);
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
  }, [debouncedSearchQuery, workspacePath, filesystemRevision]);

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

  // Batch reconciliation while IPC is in flight; every burst gets a final pass.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let running = false;
    const pending = new Set<string>();
    const drain = async (): Promise<void> => {
      if (running || disposed) return;
      running = true;
      try {
        while (pending.size && !disposed) {
          const paths = [...pending];
          pending.clear();
          await refreshChangedPaths(paths);
          if (!disposed) setFilesystemRevision((value) => value + 1);
        }
      } finally { running = false; }
    };
    const queue = (paths: string[]): void => {
      for (const path of paths.length ? paths : [workspacePath]) pending.add(path);
      void drain();
    };
    const refresh = (): void => queue([workspacePath]);
    void listen<FileSystemChangedPayload>('file-system-changed', (event) => {
      if (!disposed && normalizeFilePath(event.payload.workspacePath) === normalizeFilePath(workspacePath)) queue(event.payload.paths);
    }).then((stopListening) => {
      if (disposed) stopListening(); else unlisten = stopListening;
    }).catch(console.error);
    // Also refresh expanded descendants when coming back to the app.
    window.addEventListener('focus', refresh);
    const fallback = window.setInterval(refresh, 3000);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('focus', refresh);
      window.clearInterval(fallback);
    };
  }, [refreshChangedPaths, workspacePath]);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDelete(null);
      else if (e.key === 'Enter') {
        e.preventDefault();
        void confirmDeleteRef.current(pendingDelete.paths);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  const openContextMenu = useCallback(
    (e: React.MouseEvent, nodeData: TreeNodeData | null, source: ExplorerMenuState['source'] = 'tree') => {
      setContextMenu({ x: e.clientX, y: e.clientY, node: nodeData, source });
      // The Paste item reflects the OS clipboard too (files copied in the
      // system file manager, a screenshot), so ask for it on every open.
      void peekPasteSource().then(setPasteSource);
    },
    [peekPasteSource]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, nodeData: TreeNodeData | null) => {
      // Right-clicking outside the selection selects that row first, so
      // keyboard shortcuts afterwards act on what the menu showed.
      const tree = treeRef.current;
      if (tree && nodeData && !tree.get(nodeData.id)?.isSelected) tree.select(nodeData.id, { focus: true });
      openContextMenu(e, nodeData);
    },
    [openContextMenu, treeRef]
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

  /** Reloads the tree, opens `destDir` and selects the pasted entries. */
  const revealPasted = useCallback(
    async (paths: string[], destDir: string) => {
      await refreshRoot();
      if (paths.length === 0) return;
      if (destDir !== workspacePath) {
        await refreshPath(destDir);
        treeRef.current?.openParents(destDir);
        treeRef.current?.open(destDir);
      }
      setTimeout(() => {
        const tree = treeRef.current;
        if (!tree) return;
        tree.select(paths[0]);
        for (const path of paths.slice(1)) tree.selectMulti(path);
        tree.scrollTo(paths[0]);
      }, 80);
    },
    [refreshRoot, refreshPath, treeRef, workspacePath]
  );

  const nativeDropEntries = useCallback(
    async (entries: ExplorerClipboardEntry[], destDir: string, copy: boolean) => {
      const paths = entries.map((e) => e.path);
      if (!copy) {
        await moveEntries(paths, destDir);
        return;
      }
      const result = await copyInto(paths, destDir);
      setNotice(result.notice);
      await revealPasted(result.created, destDir);
    },
    [moveEntries, copyInto, revealPasted]
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
        e.dataTransfer.effectAllowed = 'copyMove';
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
      if (e.dataTransfer) e.dataTransfer.dropEffect = isCopyDrag(e) ? 'copy' : 'move';
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
      void nativeDropEntries(entries, destDir, isCopyDrag(e));
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
  }, [workspacePath, nativeDropEntries]);

  // Neutralize react-dnd's HTML5 backend by pointing its event listeners at a
  // detached element. Without this, react-dnd's window-level dragover handler
  // sets dataTransfer.dropEffect = 'none' whenever its canDrop chain fails,
  // showing a "not-allowed" cursor and blocking native drops.
  const dndRootElement = useMemo(() => document.createElement('div'), []);

  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      openContextMenu(e, null);
    },
    [openContextMenu]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openEntryInEditor = useCallback(
    (entry: { name: string; path: string; extension: string | null }) => {
      setGitDiffFile(null);
      onFileClick({
        name: entry.name,
        path: entry.path,
        isDir: false,
        size: 0,
        modifiedAt: 0,
        extension: entry.extension,
      });
    },
    [onFileClick, setGitDiffFile]
  );

  const startCreate = useCallback(
    async (parentPath: string | null, type: 'file' | 'directory') => {
      try {
        const created = await createNewEntry(parentPath || workspacePath, 'untitled', type);
        if (created) pendingCreateRef.current = { path: created, isDir: type === 'directory' };
      } catch (err) {
        notifyError(`Couldn't create the ${type === 'file' ? 'file' : 'folder'}:`, err);
      }
    },
    [workspacePath, createNewEntry, notifyError]
  );

  const handleNewFile = useCallback(
    (parentPath: string | null) => void startCreate(parentPath, 'file'),
    [startCreate]
  );

  const handleNewFolder = useCallback(
    (parentPath: string | null) => void startCreate(parentPath, 'directory'),
    [startCreate]
  );

  // Wraps the tree's rename so a failure shows a notice instead of leaving
  // the row stuck in edit mode, and a newly named file opens in the editor.
  const handleTreeRename = useCallback(
    async (args: { id: string; name: string }) => {
      const pending = pendingCreateRef.current?.path === args.id ? pendingCreateRef.current : null;
      if (pending) pendingCreateRef.current = null;
      try {
        const newPath = await handleRename(args);
        if (pending && newPath && !pending.isDir) {
          const name = newPath.split(/[\\/]/).pop() ?? args.name;
          openEntryInEditor({ name, path: newPath, extension: name.includes('.') ? name.split('.').pop() ?? null : null });
        }
      } catch (err) {
        notifyError(`Couldn't rename to "${args.name}":`, err);
      }
    },
    [handleRename, openEntryInEditor, notifyError]
  );

  const handleEditCancel = useCallback(
    (path: string) => {
      if (pendingCreateRef.current?.path !== path) return;
      pendingCreateRef.current = null;
      void discardCreatedEntry(path);
    },
    [discardCreatedEntry]
  );

  /**
   * Opens every folder above `path` (loading folders that were never
   * expanded), then selects and scrolls to it.
   */
  const revealPath = useCallback(
    async (path: string): Promise<void> => {
      const tree = treeRef.current;
      if (!tree) return;
      const root = workspacePath.replace(/[\\/]+$/, '');
      const sep = path.includes('\\') ? '\\' : '/';
      if (normalizeFilePath(path).startsWith(`${normalizeFilePath(root)}/`)) {
        let dir = root;
        for (const segment of path.slice(root.length + 1).split(/[\\/]/).slice(0, -1)) {
          dir = `${dir}${sep}${segment}`;
          await refreshPath(dir);
          treeRef.current?.open(dir);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
      treeRef.current?.select(path);
      treeRef.current?.scrollTo(path);
    },
    [treeRef, workspacePath, refreshPath]
  );

  const handleRenameFromMenu = useCallback(
    (node: TreeNodeData) => {
      void revealPath(node.path).then(() => treeRef.current?.edit(node.path));
    },
    [revealPath, treeRef]
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
  // The dialog's key listener is registered before this callback exists.
  confirmDeleteRef.current = confirmDelete;

  /** The tree's current selection (read live, not from React state). */
  const getSelection = useCallback(
    (): ExplorerClipboardEntry[] =>
      (treeRef.current?.selectedNodes ?? []).map((n) => entryOf(n.data as TreeNodeData)),
    [treeRef]
  );

  const handleCopy = useCallback(
    (node: TreeNodeData) => void copyEntries([entryOf(node)], 'copy'),
    [copyEntries]
  );

  const handleCut = useCallback(
    (node: TreeNodeData) => void copyEntries([entryOf(node)], 'cut'),
    [copyEntries]
  );

  const copyText = useCallback((text: string, what: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => setNotice({ tone: 'info', text: `${what} copied` }))
      .catch((err) => notifyError(`Couldn't copy the ${what.toLowerCase()}:`, err));
  }, [notifyError]);

  const copyPaths = useCallback(
    (paths: string[], relative: boolean) => {
      if (paths.length === 0) return;
      const label = `${relative ? 'Relative path' : 'Path'}${paths.length > 1 ? 's' : ''}`;
      copyText(formatPaths(paths, workspacePath, relative), label);
    },
    [copyText, workspacePath]
  );

  const handleCopyPath = useCallback(
    (node: TreeNodeData) => copyPaths([node.path], false),
    [copyPaths]
  );

  const handleCopyRelativePath = useCallback(
    (node: TreeNodeData) => copyPaths([node.path], true),
    [copyPaths]
  );

  const terminalDirOf = useCallback(
    (node: TreeNodeData) => (node.isDir ? node.path : findParentPath(node.path) ?? workspacePath),
    [workspacePath]
  );

  // A new shell pane in the workspace's terminal grid, started in the folder,
  // then switch to the terminal view and focus it. The index is the next
  // grid slot (it used to send -1, which the backend's unsigned index
  // rejected, so this always failed).
  const handleOpenInTerminal = useCallback(
    async (node: TreeNodeData) => {
      if (!currentWorkspace) return;
      try {
        const session = await invoke<TerminalSession>('create_single_terminal_session', {
          request: {
            workspaceId: currentWorkspace.id,
            workspacePath: terminalDirOf(node),
            index: useAppStore.getState().sessions.length,
            agent: null,
            shell: null,
          },
        });
        addSession(session);
        setActiveSession(session.id);
        setActiveView('terminal');
      } catch (err) {
        notifyError("Couldn't open a terminal:", err);
      }
    },
    [currentWorkspace, terminalDirOf, addSession, setActiveSession, setActiveView, notifyError]
  );

  const handleOpenInExternalTerminal = useCallback(
    async (node: TreeNodeData) => {
      try {
        await invoke('open_external_terminal', { directory: terminalDirOf(node) });
      } catch (err) {
        notifyError("Couldn't open an external terminal:", err);
      }
    },
    [terminalDirOf, notifyError]
  );

  const duplicateEntries = useCallback(
    async (entries: ExplorerClipboardEntry[]) => {
      const created: string[] = [];
      try {
        for (const entry of entries) {
          const createdPath = await invoke<string>('duplicate_entry', { path: entry.path });
          pushUndoOp({ kind: 'duplicate', sourcePath: entry.path, createdPath });
          created.push(createdPath);
        }
      } catch (err) {
        notifyError("Couldn't duplicate:", err);
      }
      await refreshRoot();
      if (created.length) {
        treeRef.current?.select(created[0]);
        for (const path of created.slice(1)) treeRef.current?.selectMulti(path);
      }
    },
    [pushUndoOp, refreshRoot, treeRef, notifyError]
  );

  const handleDuplicate = useCallback(
    (node: TreeNodeData) => void duplicateEntries([entryOf(node)]),
    [duplicateEntries]
  );

  const handleMultiDuplicate = useCallback(
    () => void duplicateEntries(getSelection()),
    [duplicateEntries, getSelection]
  );

  const handleMultiDelete = useCallback(() => {
    const selection = getSelection();
    if (selection.length === 0) return;
    setPendingDelete({
      paths: selection.map((e) => e.path),
      names: selection.map((e) => e.name),
      isDir: selection[0]?.isDir ?? false,
    });
  }, [getSelection]);

  const handleMultiCopy = useCallback(
    () => void copyEntries(getSelection(), 'copy'),
    [copyEntries, getSelection]
  );

  const handleMultiCut = useCallback(
    () => void copyEntries(getSelection(), 'cut'),
    [copyEntries, getSelection]
  );

  const handleMultiOpen = useCallback(() => {
    for (const node of treeRef.current?.selectedNodes ?? []) {
      const data = node.data as TreeNodeData;
      if (!data.isDir) openEntryInEditor(data);
    }
  }, [treeRef, openEntryInEditor]);

  const handleMultiCopyPaths = useCallback(
    (relative: boolean) => copyPaths(getSelection().map((e) => e.path), relative),
    [copyPaths, getSelection]
  );

  const handleCopyName = useCallback(
    (node: TreeNodeData) => copyText(node.name, 'Name'),
    [copyText]
  );

  // "Open to the Side" (VS Code parity): open the file in the editor. The
  // editor is tab-based, so the file opens in its own tab alongside the
  // current one — the closest equivalent to a side-by-side editor group.
  const handleOpenToSide = useCallback(
    (node: TreeNodeData) => {
      if (!node.isDir) openEntryInEditor(node);
    },
    [openEntryInEditor]
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
      const relative = formatPaths([node.path], workspacePath, true);
      copyText(relative.replace(/\.[^./\\]+$/, '').replace(/\\/g, '/'), 'Import path');
    },
    [workspacePath, copyText]
  );

  const handlePaste = useCallback(
    async (destDir: string) => {
      const result = await pasteInto(destDir);
      if (result.notice) setNotice(result.notice);
      await revealPasted(result.created, destDir);
    },
    [pasteInto, revealPasted]
  );

  const handlePasteFromMenu = useCallback(
    (node: TreeNodeData | null) => void handlePaste(pasteTargetDir(node, workspacePath)),
    [handlePaste, workspacePath]
  );

  const handleUndo = useCallback(async () => {
    try {
      const undone = await undoExplorerOp();
      setNotice({ tone: 'info', text: undone ? 'Undone' : 'Nothing to undo' });
    } catch (err) {
      notifyError("Couldn't undo:", err);
    }
  }, [undoExplorerOp, notifyError]);

  const handleCollapseAll = useCallback(() => {
    treeRef.current?.closeAll();
  }, [treeRef]);

  const handleRevealActiveFile = useCallback(() => {
    if (!activeFilePath) return;
    void revealPath(activeFilePath).then(() => treeRef.current?.focus(activeFilePath));
  }, [activeFilePath, revealPath, treeRef]);

  // ---- Open editors -------------------------------------------------------
  const confirmDiscard = useCallback(
    (paths: string[]): boolean => {
      const dirty = openFiles.filter((file) => file.isDirty && paths.includes(file.path));
      if (dirty.length === 0) return true;
      const what = dirty.length === 1 ? dirty[0].name : `${dirty.length} files`;
      return window.confirm(`Discard unsaved changes to ${what}?`);
    },
    [openFiles]
  );

  const handleCloseEditor = useCallback(
    (path: string) => {
      if (confirmDiscard([path])) closeFileTab(path);
    },
    [confirmDiscard, closeFileTab]
  );

  const handleCloseOtherEditors = useCallback(
    (path: string) => {
      if (confirmDiscard(openFiles.filter((file) => file.path !== path).map((file) => file.path))) closeOtherFiles(path);
    },
    [confirmDiscard, openFiles, closeOtherFiles]
  );

  const handleCloseAllEditors = useCallback(() => {
    if (confirmDiscard(openFiles.map((file) => file.path))) closeAllFiles();
  }, [confirmDiscard, openFiles, closeAllFiles]);

  const handleRevealInTree = useCallback(
    (node: TreeNodeData) => {
      setSearchQuery('');
      void revealPath(node.path).then(() => treeRef.current?.focus(node.path));
    },
    [revealPath, treeRef]
  );

  const menuActions = useMemo<ExplorerMenuActions>(
    () => ({
      newFile: handleNewFile,
      newFolder: handleNewFolder,
      rename: handleRenameFromMenu,
      delete: handleDeleteFromMenu,
      reveal: revealInFileManager,
      refresh: refreshRoot,
      collapseAll: handleCollapseAll,
      copy: handleCopy,
      cut: handleCut,
      paste: handlePasteFromMenu,
      duplicate: handleDuplicate,
      copyPath: handleCopyPath,
      copyRelativePath: handleCopyRelativePath,
      copyName: handleCopyName,
      copyAsImportPath: handleCopyAsImportPath,
      openInTerminal: handleOpenInTerminal,
      openInExternalTerminal: handleOpenInExternalTerminal,
      openToSide: handleOpenToSide,
      findInFolder: handleFindInFolder,
      revealInTree: handleRevealInTree,
      closeEditor: handleCloseEditor,
      closeOtherEditors: handleCloseOtherEditors,
      closeSavedEditors: closeSavedFiles,
      closeAllEditors: handleCloseAllEditors,
      multiOpen: handleMultiOpen,
      multiCopy: handleMultiCopy,
      multiCut: handleMultiCut,
      multiDelete: handleMultiDelete,
      multiDuplicate: handleMultiDuplicate,
      multiCopyPaths: handleMultiCopyPaths,
    }),
    [
      handleNewFile, handleNewFolder, handleRenameFromMenu, handleDeleteFromMenu, revealInFileManager,
      refreshRoot, handleCollapseAll, handleCopy, handleCut, handlePasteFromMenu, handleDuplicate,
      handleCopyPath, handleCopyRelativePath, handleCopyName, handleCopyAsImportPath, handleOpenInTerminal, handleOpenInExternalTerminal,
      handleOpenToSide, handleFindInFolder, handleRevealInTree, handleCloseEditor, handleCloseOtherEditors,
      closeSavedFiles, handleCloseAllEditors, handleMultiOpen, handleMultiCopy, handleMultiCut,
      handleMultiDelete, handleMultiDuplicate, handleMultiCopyPaths,
    ]
  );

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
      e.preventDefault();
      e.stopPropagation();
      if (!data.isDir) openEntryInEditor(data);
      else tree?.toggle(node.id);
    },
    [openEntryInEditor, treeRef]
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
      if (!tree || tree.isEditing) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const focused = (tree.focusedNode ?? tree.mostRecentNode)?.data as TreeNodeData | undefined;
      const selection = getSelection();

      if (e.key === 'F2') {
        if (focused) {
          e.preventDefault();
          tree.edit(focused.id);
        }
      } else if (e.key === 'Delete') {
        if (selection.length > 0) {
          e.preventDefault();
          setPendingDelete({
            paths: selection.map((d) => d.path),
            names: selection.map((d) => d.name),
            isDir: selection[0]?.isDir ?? false,
          });
        }
      } else if (e.key === 'Escape') {
        // Esc first cancels a pending cut, then clears the selection.
        if (explorerClipboard?.operation === 'cut') {
          e.preventDefault();
          void clearClipboard();
        } else if (selection.length > 0) {
          e.preventDefault();
          tree.deselectAll();
        }
      } else if (!mod) {
        return;
      } else if (e.code === 'KeyC' && e.altKey) {
        e.preventDefault();
        copyPaths(selection.map((d) => d.path), true);
      } else if (key === 'c' && e.shiftKey) {
        e.preventDefault();
        copyPaths(selection.map((d) => d.path), false);
      } else if (key === 'c') {
        if (selection.length > 0) {
          e.preventDefault();
          void copyEntries(selection, 'copy');
        }
      } else if (key === 'x') {
        if (selection.length > 0) {
          e.preventDefault();
          void copyEntries(selection, 'cut');
        }
      } else if (key === 'v') {
        e.preventDefault();
        void handlePaste(pasteTargetDir(focused ?? null, workspacePath));
      } else if (key === 'a' && !e.shiftKey) {
        // react-arborist only binds ⌘A; Ctrl+A selects all on Windows/Linux.
        e.preventDefault();
        tree.selectAll();
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void handleUndo();
      } else if (e.shiftKey && key === 'f') {
        // Find in Files (VS Code parity).
        e.preventDefault();
        setSearchSignal((s) => s + 1);
      }
    },
    [treeRef, getSelection, explorerClipboard, clearClipboard, copyPaths, copyEntries, handlePaste, workspacePath, handleUndo]
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
        e.dataTransfer.dropEffect = isCopyDrag(e) ? 'copy' : 'move';
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
        await nativeDropEntries(entries, workspacePath, isCopyDrag(e));
        return;
      }
      await handleExternalDrop(e);
    },
    [workspacePath, nativeDropEntries, handleExternalDrop]
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
      onEditCancel: handleEditCancel,
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
      handleEditCancel,
    ]
  );

  const clipboardLabel = describeClipboard(explorerClipboard);

  return (
    <div
      className="explorer-pane h-full flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-primary)] select-none overflow-hidden"
      data-explorer-ready
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
            <Crosshair size={15} aria-hidden="true" />
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
            <kbd className="explorer-kbd pointer-events-none">/</kbd>
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
                  onAuxClick={(e) => {
                    // Middle-click closes, as on editor tabs.
                    if (e.button !== 1) return;
                    e.preventDefault();
                    handleCloseEditor(file.path);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openContextMenu(e, openEditorNode(file), 'openEditors');
                  }}
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
                      handleCloseEditor(file.path);
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
            <div aria-label="File explorer" className="h-full w-full">
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
                onRename={handleTreeRename}
                onSelect={handleTreeSelect}
                onClick={(e) => {
                  // Rows stop their own clicks, so this is empty space:
                  // clear the selection, as in VS Code.
                  if (!(e.target as HTMLElement).closest('[data-file-path]')) treeRef.current?.deselectAll();
                }}
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
          actions={menuActions}
          selectedEntries={selectedEntries}
          pasteSource={pasteSource}
          openEditorCount={openFiles.length}
        />

        {isExternalDrag && (
          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-zinc-500/40 rounded-md z-40 bg-zinc-500/5" />
        )}

        <AnimatePresence>
          {notice && (
            <motion.div
              key={notice.text}
              role={notice.tone === 'error' ? 'alert' : 'status'}
              className={`explorer-notice ${notice.tone === 'error' ? 'is-error' : ''}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              onClick={() => setNotice(null)}
            >
              {notice.tone === 'error' ? (
                <WarningCircle size={14} className="shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle size={14} className="shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">{notice.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {(selectedEntries.length > 1 || clipboardLabel) && (
        <div className="explorer-status" aria-live="polite">
          {selectedEntries.length > 1 && (
            <span className="explorer-status__item">{selectedEntries.length} selected</span>
          )}
          {clipboardLabel && (
            <span
              className="explorer-status__item explorer-status__clip"
              title="Paste with Ctrl+V here or in your file manager"
            >
              {explorerClipboard?.operation === 'cut' ? (
                <Scissors size={12} aria-hidden="true" />
              ) : (
                <Copy size={12} aria-hidden="true" />
              )}
              <span className="truncate">{clipboardLabel}</span>
              <button
                type="button"
                className="app-icon-button h-4 w-4 rounded-sm"
                title="Clear clipboard"
                aria-label="Clear clipboard"
                onClick={() => void clearClipboard()}
              >
                <X size={10} aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
      )}

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
