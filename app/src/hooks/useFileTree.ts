import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TreeApi } from 'react-arborist';
import type { FileEntry } from '../types';
import { normalizeFilePath } from '../utils/fileSync';

export interface TreeNodeData {
  id: string;
  name: string;
  children?: TreeNodeData[];
  path: string;
  extension: string | null;
  isDir: boolean;
  loaded?: boolean;
}

function entryToNode(entry: FileEntry): TreeNodeData {
  if (entry.isDir) {
    return {
      id: entry.path,
      name: entry.name,
      children: [],
      path: entry.path,
      extension: entry.extension,
      isDir: true,
      loaded: false,
    };
  }
  return {
    id: entry.path,
    name: entry.name,
    path: entry.path,
    extension: entry.extension,
    isDir: false,
  };
}

function updateNodeInTreeWithCallback(
  data: TreeNodeData[],
  nodeId: string,
  updater: (node: TreeNodeData) => Partial<TreeNodeData>,
): TreeNodeData[] {
  return data.map((node) => {
    if (node.id === nodeId) {
      return { ...node, ...updater(node) };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeInTreeWithCallback(node.children, nodeId, updater),
      };
    }
    return node;
  });
}

function removeNodeFromTree(data: TreeNodeData[], nodeId: string): TreeNodeData[] {
  return data
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (node.children) {
        return { ...node, children: removeNodeFromTree(node.children, nodeId) };
      }
      return node;
    });
}

function sortNodes(nodes: TreeNodeData[]): TreeNodeData[] {
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * Reconcile a directory listing without discarding descendants that have
 * already been loaded. Replacing those nodes with fresh lazy placeholders
 * makes react-arborist collapse every open folder after a filesystem event.
 */
export function mergePreservingLoaded(
  previous: TreeNodeData[],
  fresh: TreeNodeData[],
): TreeNodeData[] {
  const previousByPath = new Map<string, TreeNodeData>();
  const index = (nodes: TreeNodeData[]) => {
    for (const node of nodes) {
      previousByPath.set(node.path, node);
      if (node.children) index(node.children);
    }
  };
  index(previous);

  const merge = (nodes: TreeNodeData[]): TreeNodeData[] =>
    nodes.map((entry) => {
      const previousNode = previousByPath.get(entry.path);
      if (entry.isDir && previousNode?.isDir && previousNode.loaded && previousNode.children) {
        return {
          ...entry,
          loaded: true,
          children: merge(previousNode.children),
        };
      }
      return entry;
    });

  return sortNodes(merge(fresh));
}

function upsertNode(nodes: TreeNodeData[], node: TreeNodeData): TreeNodeData[] {
  const withoutStaleCopy = nodes.filter((entry) => entry.id !== node.id);
  return sortNodes([...withoutStaleCopy, node]);
}

function rebaseNodePath(node: TreeNodeData, oldBasePath: string, newBasePath: string): TreeNodeData {
  const nextPath = node.path === oldBasePath
    ? newBasePath
    : node.path.replace(oldBasePath, newBasePath);

  return {
    ...node,
    id: nextPath,
    path: nextPath,
    children: node.children?.map((child) => rebaseNodePath(child, oldBasePath, newBasePath)),
  };
}

function detachNode(
  data: TreeNodeData[],
  nodeId: string,
): { tree: TreeNodeData[]; removed: TreeNodeData | null } {
  let removed: TreeNodeData | null = null;

  const walk = (nodes: TreeNodeData[]): TreeNodeData[] =>
    nodes.flatMap((node) => {
      if (node.id === nodeId) {
        removed = node;
        return [];
      }

      if (!node.children) {
        return [node];
      }

      return [
        {
          ...node,
          children: walk(node.children),
        },
      ];
    });

  return { tree: walk(data), removed };
}

function insertNodeIntoDirectory(
  data: TreeNodeData[],
  parentPath: string | null,
  nodeToInsert: TreeNodeData,
): { tree: TreeNodeData[]; inserted: boolean } {
  if (parentPath === null) {
    return { tree: sortNodes([...data, nodeToInsert]), inserted: true };
  }

  let inserted = false;

  const walk = (nodes: TreeNodeData[]): TreeNodeData[] =>
    nodes.map((node) => {
      if (node.path === parentPath) {
        inserted = true;
        // If the target folder was never expanded (loaded: false), do NOT
        // mark it loaded — its real children are unknown. Keep loaded: false
        // so the next expand re-fetches the true directory contents instead
        // of showing only the node that was just moved/inserted.
        if (!node.loaded) {
          return { ...node };
        }
        const nextChildren = sortNodes([...(node.children ?? []), nodeToInsert]);
        return {
          ...node,
          children: nextChildren,
          loaded: true,
        };
      }

      if (!node.children) {
        return node;
      }

      return {
        ...node,
        children: walk(node.children),
      };
    });

  return { tree: walk(data), inserted };
}

function buildNodeMap(nodes: TreeNodeData[]): Map<string, TreeNodeData> {
  const map = new Map<string, TreeNodeData>();
  function walk(list: TreeNodeData[]) {
    for (const node of list) {
      map.set(node.id, node);
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);
  return map;
}

function findParentPath(nodeId: string): string | null {
  const sep = nodeId.includes('\\') ? '\\' : '/';
  const lastSep = nodeId.lastIndexOf(sep);
  if (lastSep <= 0) return null;
  return nodeId.substring(0, lastSep);
}

export type ExplorerUndoOp =
  | { kind: 'move'; sourcePath: string; destinationDir: string; name: string }
  | { kind: 'delete'; path: string; isDir: boolean }
  | { kind: 'create'; path: string; isDir: boolean }
  | { kind: 'rename'; oldPath: string; newPath: string }
  | { kind: 'duplicate'; sourcePath: string; createdPath: string }
  /** Several ops undone together, newest first (one paste of many items). */
  | { kind: 'batch'; ops: ExplorerUndoOp[] };

export function useFileTree(workspacePath: string | null) {
  const [treeData, setTreeData] = useState<TreeNodeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const treeRef = useRef<TreeApi<TreeNodeData> | null>(null);

  // ---- Undo log -----------------------------------------------------------
  // Defined before the ops below so every mutating callback can push undo
  // records without a temporal-dead-zone reference error.
  type UndoOp = ExplorerUndoOp;

  const undoLogRef = useRef<UndoOp[]>([]);
  const MAX_UNDO = 30;

  const pushUndoOp = useCallback((op: UndoOp) => {
    undoLogRef.current = [...undoLogRef.current.slice(-(MAX_UNDO - 1)), op];
  }, []);

  const clearUndoLog = useCallback(() => {
    undoLogRef.current = [];
  }, []);

  const nodeMap = useMemo(() => buildNodeMap(treeData), [treeData]);

  const dataRef = useRef(treeData);
  dataRef.current = treeData;
  const generationRef = useRef({ path: workspacePath, requests: new Map<string, number>() });
  if (generationRef.current.path !== workspacePath) generationRef.current = { path: workspacePath, requests: new Map() };

  const refreshPath = useCallback(async (dirPath: string | null): Promise<void> => {
    const target = dirPath ?? workspacePath;
    if (!target) return;
    const generation = generationRef.current;
    const request = (generation.requests.get(target) ?? 0) + 1;
    generation.requests.set(target, request);
    try {
      const entries = await invoke<FileEntry[]>('list_directory_entries', { path: target });
      if (generationRef.current !== generation || generation.requests.get(target) !== request) return;
      const children = entries.map(entryToNode);
      setTreeData((previous) => target === workspacePath
        ? mergePreservingLoaded(previous, children)
        : updateNodeInTreeWithCallback(previous, target, (node) => ({
            children: mergePreservingLoaded(node.children ?? [], children), loaded: true,
          })));
    } catch (error) {
      if (generationRef.current === generation) console.error('Failed to refresh directory:', error);
    }
  }, [workspacePath]);

  const refreshChangedPaths = useCallback(async (paths: string[] = []): Promise<void> => {
    if (!workspacePath) return;
    const root = normalizeFilePath(workspacePath);
    const loaded = [...buildNodeMap(dataRef.current).values()].filter((node) => node.isDir && node.loaded);
    const targets = new Set<string>();
    // A full refresh reconciles every loaded folder, not only the root listing.
    if (paths.length === 0 || paths.some((path) => normalizeFilePath(path) === root)) {
      targets.add(workspacePath);
      loaded.forEach((node) => targets.add(node.path));
    } else {
      for (const path of paths) {
        const normalized = normalizeFilePath(path);
        if (!normalized.startsWith(`${root}/`)) continue;
        const parents = loaded.filter((node) => normalized.startsWith(`${normalizeFilePath(node.path)}/`))
          .sort((a, b) => b.path.length - a.path.length);
        targets.add(parents[0]?.path ?? workspacePath);
        // A replaced directory needs to reconcile any already loaded descendants.
        loaded.filter((node) => normalizeFilePath(node.path) === normalized || normalizeFilePath(node.path).startsWith(`${normalized}/`))
          .forEach((node) => targets.add(node.path));
      }
    }
    await Promise.all([...targets].map(refreshPath));
  }, [workspacePath, refreshPath]);

  const loadRoot = useCallback(async (): Promise<void> => {
    const generation = generationRef.current;
    await refreshChangedPaths();
    if (generationRef.current === generation) setIsLoading(false);
  }, [refreshChangedPaths]);

  useEffect(() => {
    generationRef.current = { path: workspacePath, requests: new Map() };
    dataRef.current = [];
    setTreeData([]);
    setIsLoading(true);
    undoLogRef.current = [];
    void loadRoot();
    return () => { generationRef.current = { path: null, requests: new Map() }; };
  }, [loadRoot]);

  const handleToggle = useCallback(async (id: string): Promise<void> => {
    const found = buildNodeMap(dataRef.current).get(id);
    if (found?.isDir && !found.loaded) await refreshPath(found.path);
  }, [refreshPath]);

  const moveEntries = useCallback(
    async (dragIds: string[], destDir: string) => {
      if (dragIds.length === 0 || !workspacePath) return;

      // Determine which of the dragged nodes actually change parent folders.
      // Items already living in destDir stay put (the tree is always sorted,
      // so intra-folder reordering is a no-op).
      const movingIds = dragIds.filter((sourcePath) => {
        const currentParent = findParentPath(sourcePath) ?? workspacePath;
        return destDir !== currentParent;
      });
      if (movingIds.length === 0) return;

      // Guard against moving a folder into itself or its own descendant.
      const destNode = nodeMap.get(destDir);
      for (const sourcePath of movingIds) {
        const sourceNode = nodeMap.get(sourcePath);
        if (!sourceNode) {
          loadRoot();
          return;
        }
        if (sourceNode.isDir && destNode) {
          const dragPath = sourceNode.path;
          const destPath = destNode.path;
          if (dragPath === destPath) return;
          if (
            destPath.startsWith(dragPath + '/') ||
            destPath.startsWith(dragPath + '\\')
          ) {
            return;
          }
        }
      }

      const separator = destDir.includes('\\') ? '\\' : '/';

      try {
        // Move every dragged item on disk first.
        for (const sourcePath of movingIds) {
          const sourceNode = nodeMap.get(sourcePath);
          await invoke('move_entry', {
            sourcePath,
            destinationDir: destDir,
          });
          if (sourceNode) {
            pushUndoOp({ kind: 'move', sourcePath, destinationDir: destDir, name: sourceNode.name });
          }
        }

        setTreeData((prev) => {
          // Detach all moved nodes first (handles siblings & ancestors).
          let tree = prev;
          const movedNodes: TreeNodeData[] = [];
          for (const sourcePath of movingIds) {
            const { tree: next, removed } = detachNode(tree, sourcePath);
            if (removed) {
              tree = next;
              movedNodes.push(removed);
            }
          }

          const parentPath = destDir === workspacePath ? null : destDir;
          for (const node of movedNodes) {
            const movedPath = `${destDir}${separator}${node.name}`;
            const rebased = rebaseNodePath(node, node.path, movedPath);
            const inserted = insertNodeIntoDirectory(tree, parentPath, rebased);
            if (!inserted.inserted) {
              loadRoot();
              return prev;
            }
            tree = inserted.tree;
          }
          return tree;
        });

        // Reveal the destination folder so the moved items are visible.
        if (destDir !== workspacePath) {
          setTimeout(() => treeRef.current?.open(destDir), 50);
        }
      } catch (err) {
        console.error('Failed to move entry:', err);
        loadRoot();
      }
    },
    [workspacePath, loadRoot, nodeMap]
  );

  const handleMove = useCallback(
    async ({
      dragIds,
      parentId,
      parentNode,
      index: _index,
    }: {
      dragIds: string[];
      parentId: string | null;
      parentNode: { data: TreeNodeData } | null;
      index: number;
    }) => {
      if (dragIds.length === 0 || !workspacePath) return;
      const destDir = parentId && parentNode ? parentNode.data.path : workspacePath;
      if (!destDir) return;
      await moveEntries(dragIds, destDir);
    },
    [workspacePath, moveEntries]
  );

  /** Resolves to the entry's new path (null when it had vanished). */
  const handleRename = useCallback(
    async ({
      id,
      name,
    }: {
      id: string;
      name: string;
    }): Promise<string | null> => {
      const oldNode = nodeMap.get(id);
      if (!oldNode) {
        loadRoot();
        return null;
      }
      try {
        await invoke('rename_entry', { oldPath: id, newName: name });
        const parentPath = findParentPath(id);
        const sep = id.includes('\\') ? '\\' : '/';
        const newPath = parentPath ? parentPath + sep + name.replace(/[\\/]/g, sep) : name;
        const nested = /[\\/]/.test(name);
        // Naming a just-created placeholder finishes that creation: undo
        // should delete the named entry, not rename it back to "untitled".
        const last = undoLogRef.current[undoLogRef.current.length - 1];
        if (last?.kind === 'create' && last.path === id) {
          undoLogRef.current = [...undoLogRef.current.slice(0, -1), { ...last, path: newPath }];
        } else if (nested) {
          pushUndoOp({
            kind: 'move',
            sourcePath: id,
            destinationDir: findParentPath(newPath) ?? workspacePath ?? '',
            name: newPath.split(/[\\/]/).pop() ?? name,
          });
        } else {
          pushUndoOp({ kind: 'rename', oldPath: id, newPath });
        }
        if (nested) {
          // "src/lib/util.ts" created folders: reload the listing so they
          // appear, then open them and reveal the entry inside.
          await refreshPath(parentPath);
          let dir = parentPath ?? workspacePath ?? '';
          for (const segment of name.split(/[\\/]/).slice(0, -1)) {
            dir = `${dir}${sep}${segment}`;
            await refreshPath(dir);
            treeRef.current?.open(dir);
          }
          setTimeout(() => {
            treeRef.current?.select(newPath);
            treeRef.current?.scrollTo(newPath);
          }, 60);
          return newPath;
        }
        setTreeData((prev) =>
          updateNodeInTreeWithCallback(prev, id, (node) => ({
            ...rebaseNodePath(node, id, newPath),
            name,
            extension: name.includes('.') ? name.split('.').pop() ?? null : null,
          }))
        );
        return newPath;
      } catch (err) {
        console.error('Failed to rename entry:', err);
        loadRoot();
        throw err;
      }
    },
    [loadRoot, nodeMap, pushUndoOp, refreshPath, workspacePath]
  );

  const handleDelete = useCallback(
    async ({ ids, nodes }: { ids: string[]; nodes: { data: TreeNodeData }[] }) => {
      const deletedPaths = new Set<string>();
      for (const id of ids) {
        try {
          const node = nodes.find((n) => n.data.id === id)?.data;
          await invoke('delete_entry', { path: id });
          if (node) {
            pushUndoOp({ kind: 'delete', path: id, isDir: node.isDir });
          }
          deletedPaths.add(id);
        } catch (err) {
          console.error('Failed to delete entry:', err);
        }
      }
      if (deletedPaths.size > 0) {
        setTreeData((prev) => {
          let result = prev;
          for (const id of deletedPaths) {
            result = removeNodeFromTree(result, id);
          }
          return result;
        });
      }
    },
    [pushUndoOp]
  );

  const createNewEntry = useCallback(
    async (
      parentPath: string | null,
      name: string,
      type: 'file' | 'directory'
    ) => {
      const dir = parentPath || workspacePath;
      if (!dir) return null;

      const sep = dir.includes('\\') ? '\\' : '/';
      let fullPath = `${dir}${sep}${name}`;

      try {
        // "untitled" may already exist (an earlier placeholder): take the
        // first free "untitled-N" instead of failing silently.
        for (let attempt = 0; ; attempt++) {
          if (attempt > 0) fullPath = `${dir}${sep}${name}-${attempt}`;
          try {
            await invoke(type === 'file' ? 'create_file' : 'create_directory', { path: fullPath });
            break;
          } catch (err) {
            if (attempt >= 50 || !String(err).includes('already exists')) throw err;
          }
        }
        const createdName = fullPath.slice(dir.length + 1);

        const newNode: TreeNodeData = {
          id: fullPath,
          name: createdName,
          path: fullPath,
          extension: createdName.includes('.') ? createdName.split('.').pop() ?? null : null,
          isDir: type === 'directory',
          ...(type === 'directory' ? { children: [], loaded: false } : {}),
        };

        pushUndoOp({ kind: 'create', path: fullPath, isDir: type === 'directory' });

        if (dir === workspacePath) {
          setTreeData((prev) => upsertNode(prev, newNode));
        } else if (buildNodeMap(dataRef.current).get(dir)?.loaded) {
          setTreeData((prev) =>
            updateNodeInTreeWithCallback(prev, dir, (prevNode) => {
              const children = upsertNode(prevNode.children ?? [], newNode);
              return { children, loaded: true };
            })
          );
        } else {
          // Never expanded: load the real listing rather than showing a
          // folder that holds only the new entry.
          await refreshPath(dir);
        }

        if (dir !== workspacePath) {
          treeRef.current?.openParents(dir);
          treeRef.current?.open(dir);
        }
        setTimeout(() => {
          if (treeRef.current) {
            treeRef.current.scrollTo(fullPath);
            treeRef.current.edit(fullPath);
          }
        }, 100);
        return fullPath;
      } catch (err) {
        console.error(`Failed to create ${type}:`, err);
        throw err;
      }
    },
    [workspacePath, pushUndoOp, refreshPath]
  );

  /**
   * Drops a just-created placeholder whose naming was cancelled, so Escape
   * leaves no stray "untitled" behind (VS Code parity).
   */
  const discardCreatedEntry = useCallback(async (path: string) => {
    const last = undoLogRef.current[undoLogRef.current.length - 1];
    if (last?.kind === 'create' && last.path === path) {
      undoLogRef.current = undoLogRef.current.slice(0, -1);
    }
    setTreeData((prev) => removeNodeFromTree(prev, path));
    try {
      await invoke('delete_entry', { path });
    } catch (err) {
      console.error('Failed to discard new entry:', err);
    }
  }, []);

  const deleteEntry = useCallback(
    async (path: string) => {
      const node = nodeMap.get(path);
      try {
        await invoke('delete_entry', { path });
        if (node) {
          pushUndoOp({ kind: 'delete', path, isDir: node.isDir });
        }
        setTreeData((prev) => removeNodeFromTree(prev, path));
      } catch (err) {
        console.error('Failed to delete entry:', err);
      }
    },
    [nodeMap, pushUndoOp]
  );

  const renameEntry = useCallback(
    async (oldPath: string, newName: string) => {
      const oldNode = nodeMap.get(oldPath);
      if (!oldNode) {
        loadRoot();
        return;
      }
      try {
        await invoke('rename_entry', { oldPath, newName });
        const parentPath = findParentPath(oldPath);
        const sep = oldPath.includes('\\') ? '\\' : '/';
        const newPath = parentPath ? parentPath + sep + newName : newName;
        pushUndoOp({ kind: 'rename', oldPath, newPath });
        setTreeData((prev) =>
          updateNodeInTreeWithCallback(prev, oldPath, (node) => ({
            ...rebaseNodePath(node, oldPath, newPath),
            name: newName,
            extension: newName.includes('.') ? newName.split('.').pop() ?? null : null,
          }))
        );
      } catch (err) {
        console.error('Failed to rename entry:', err);
        loadRoot();
      }
    },
    [loadRoot, nodeMap, pushUndoOp]
  );

  const revealInFileManager = useCallback(async (path: string) => {
    try {
      await invoke('reveal_in_file_manager', { path });
    } catch (err) {
      console.error('Failed to reveal in file manager:', err);
    }
  }, []);

  const importExternalFiles = useCallback(
    async (sourcePaths: string[], destinationDir: string) => {
      try {
        await invoke('import_files', { sourcePaths, destinationDir });
        loadRoot();
      } catch (err) {
        console.error('Failed to import files:', err);
        loadRoot();
      }
    },
    [loadRoot]
  );

  // ---- Undo log -----------------------------------------------------------
  const revertOp = useCallback(async (op: UndoOp): Promise<void> => {
      switch (op.kind) {
        case 'batch': {
          for (const inner of op.ops) await revertOp(inner);
          break;
        }
        case 'move': {
          // Inverse: move the item back to its original parent.
          await invoke('move_entry', {
            sourcePath: `${op.destinationDir}${op.destinationDir.includes('\\') ? '\\' : '/'}${op.name}`,
            destinationDir: findParentPath(op.sourcePath) ?? workspacePath,
          });
          break;
        }
        case 'delete': {
          // Workspace deletes now move to .yzpzcode/trash — restore the
          // original content instead of re-creating an empty shell.
          if (op.isDir) {
            try {
              await invoke('restore_from_trash', { workspacePath, originalPath: op.path });
              break;
            } catch {
              await invoke('create_directory', { path: op.path });
            }
          } else {
            try {
              await invoke('restore_from_trash', { workspacePath, originalPath: op.path });
              break;
            } catch {
              await invoke('create_file', { path: op.path });
            }
          }
          break;
        }
        case 'create': {
          await invoke('delete_entry', { path: op.path });
          break;
        }
        case 'rename': {
          await invoke('rename_entry', { oldPath: op.newPath, newName: op.oldPath.split(/[\\/]/).pop() ?? op.oldPath });
          break;
        }
        case 'duplicate': {
          await invoke('delete_entry', { path: op.createdPath });
          break;
        }
      }
  }, [workspacePath]);

  /** Reverts the newest explorer change; resolves false when there was none. */
  const undoExplorerOp = useCallback(async (): Promise<boolean> => {
    const op = undoLogRef.current.pop();
    if (!op) return false;
    try {
      await revertOp(op);
      return true;
    } finally {
      void loadRoot();
    }
  }, [loadRoot, revertOp]);

  const externalRefreshRef = useRef<((paths: string[]) => void) | null>(null);

  const registerExternalRefresh = useCallback(
    (cb: (paths: string[]) => void) => {
      externalRefreshRef.current = cb;
      return () => {
        externalRefreshRef.current = null;
      };
    },
    []
  );

  return {
    treeData,
    isLoading,
    treeRef,
    handleToggle,
    handleMove,
    moveEntries,
    handleRename,
    handleDelete,
    createNewEntry,
    discardCreatedEntry,
    deleteEntry,
    renameEntry,
    revealInFileManager,
    refreshRoot: loadRoot,
    refreshPath,
    refreshChangedPaths,
    importExternalFiles,
    registerExternalRefresh,
    undoExplorerOp,
    pushUndoOp,
    clearUndoLog,
  };
}
