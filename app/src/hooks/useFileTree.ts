import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TreeApi } from 'react-arborist';
import type { FileEntry } from '../types';

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

function updateNodeInTree(
  data: TreeNodeData[],
  nodeId: string,
  updates: Partial<TreeNodeData>,
): TreeNodeData[] {
  return data.map((node) => {
    if (node.id === nodeId) {
      return { ...node, ...updates };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeInTree(node.children, nodeId, updates),
      };
    }
    return node;
  });
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

export function useFileTree(workspacePath: string | null) {
  const [treeData, setTreeData] = useState<TreeNodeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const treeRef = useRef<TreeApi<TreeNodeData> | null>(null);

  // ---- Undo log -----------------------------------------------------------
  // Defined before the ops below so every mutating callback can push undo
  // records without a temporal-dead-zone reference error.
  type UndoOp =
    | { kind: 'move'; sourcePath: string; destinationDir: string; name: string }
    | { kind: 'delete'; path: string; isDir: boolean }
    | { kind: 'create'; path: string; isDir: boolean }
    | { kind: 'rename'; oldPath: string; newPath: string }
    | { kind: 'duplicate'; sourcePath: string; createdPath: string };

  const undoLogRef = useRef<UndoOp[]>([]);
  const MAX_UNDO = 30;

  const pushUndoOp = useCallback((op: UndoOp) => {
    undoLogRef.current = [...undoLogRef.current.slice(-(MAX_UNDO - 1)), op];
  }, []);

  const clearUndoLog = useCallback(() => {
    undoLogRef.current = [];
  }, []);

  const nodeMap = useMemo(() => buildNodeMap(treeData), [treeData]);

  const loadRoot = useCallback(async () => {
    if (!workspacePath) return;
    setIsLoading(true);
    try {
      const entries = await invoke<FileEntry[]>('list_directory_entries', {
        path: workspacePath,
      });
      setTreeData(entries.map(entryToNode));
    } catch (err) {
      console.error('Failed to load directory:', err);
    }
    setIsLoading(false);
  }, [workspacePath]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  const handleToggle = useCallback(
    async (id: string) => {
      const found = nodeMap.get(id);
      if (!found || !found.isDir || found.loaded) return;

      try {
        const entries = await invoke<FileEntry[]>('list_directory_entries', {
          path: found.path,
        });
        setTreeData((prev) =>
          updateNodeInTree(prev, id, {
            children: entries.map(entryToNode),
            loaded: true,
          })
        );
      } catch (err) {
        console.error('Failed to load directory:', err);
      }
    },
    [nodeMap]
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

  const handleRename = useCallback(
    async ({
      id,
      name,
    }: {
      id: string;
      name: string;
    }) => {
      const oldNode = nodeMap.get(id);
      if (!oldNode) {
        loadRoot();
        return;
      }
      try {
        await invoke('rename_entry', { oldPath: id, newName: name });
        const parentPath = findParentPath(id);
        const sep = id.includes('\\') ? '\\' : '/';
        const newPath = parentPath ? parentPath + sep + name : name;
        pushUndoOp({ kind: 'rename', oldPath: id, newPath });
        setTreeData((prev) =>
          updateNodeInTreeWithCallback(prev, id, (node) => ({
            ...rebaseNodePath(node, id, newPath),
            name,
            extension: name.includes('.') ? name.split('.').pop() ?? null : null,
          }))
        );
      } catch (err) {
        console.error('Failed to rename entry:', err);
        loadRoot();
      }
    },
    [loadRoot, nodeMap, pushUndoOp]
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
      if (!dir) return;

      const sep = dir.includes('\\') ? '\\' : '/';
      const fullPath = `${dir}${sep}${name}`;

      try {
        if (type === 'file') {
          await invoke('create_file', { path: fullPath });
        } else {
          await invoke('create_directory', { path: fullPath });
        }

        const newNode: TreeNodeData = {
          id: fullPath,
          name,
          path: fullPath,
          extension: name.includes('.') ? name.split('.').pop() ?? null : null,
          isDir: type === 'directory',
          ...(type === 'directory' ? { children: [], loaded: false } : {}),
        };

        pushUndoOp({ kind: 'create', path: fullPath, isDir: type === 'directory' });

        if (dir === workspacePath) {
          setTreeData((prev) => [...prev, newNode]);
        } else {
          setTreeData((prev) =>
            updateNodeInTreeWithCallback(prev, dir, (prevNode) => {
              const children = prevNode.children ? [...prevNode.children, newNode] : [newNode];
              return { children, loaded: true };
            })
          );
        }

        setTimeout(() => {
          if (treeRef.current) {
            treeRef.current.scrollTo(fullPath);
            treeRef.current.edit(fullPath);
          }
        }, 100);
      } catch (err) {
        console.error(`Failed to create ${type}:`, err);
      }
    },
    [workspacePath]
  );

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

  /**
   * Merge freshly-fetched children over existing tree nodes so already-loaded
   * directories keep their expanded children (and open state) intact.
   */
  const mergePreservingLoaded = useCallback(
    (prev: TreeNodeData[], fresh: TreeNodeData[]): TreeNodeData[] => {
      const prevMap = new Map<string, TreeNodeData>();
      const walk = (nodes: TreeNodeData[]) => {
        for (const node of nodes) {
          prevMap.set(node.path, node);
          if (node.children) walk(node.children);
        }
      };
      walk(prev);

      const merge = (nodes: TreeNodeData[]): TreeNodeData[] =>
        nodes.map((entry) => {
          const prevNode = prevMap.get(entry.path);
          if (prevNode?.isDir && prevNode.loaded && prevNode.children) {
            return {
              ...entry,
              loaded: true,
              children: merge(prevNode.children),
            };
          }
          return entry;
        });

      return merge(fresh);
    },
    []
  );

  /** Reload the children of a single (already loaded) directory in place. */
  const refreshPath = useCallback(
    async (dirPath: string | null) => {
      const target = dirPath ?? workspacePath;
      if (!target) return;
      try {
        const entries = await invoke<FileEntry[]>('list_directory_entries', {
          path: target,
        });
        const children = entries.map(entryToNode);
        setTreeData((prev) => {
          if (target === workspacePath) {
            return mergePreservingLoaded(prev, children);
          }
          return updateNodeInTree(prev, target, {
            children: mergePreservingLoaded(prev, children),
            loaded: true,
          });
        });
      } catch (err) {
        console.error('Failed to refresh path:', err);
      }
    },
    [workspacePath, mergePreservingLoaded]
  );

  // ---- Undo log -----------------------------------------------------------
  const undoExplorerOp = useCallback(async () => {
    const op = undoLogRef.current.pop();
    if (!op) return;
    try {
      switch (op.kind) {
        case 'move': {
          // Inverse: move the item back to its original parent.
          await invoke('move_entry', {
            sourcePath: `${op.destinationDir}${op.destinationDir.includes('\\') ? '\\' : '/'}${op.name}`,
            destinationDir: findParentPath(op.sourcePath) ?? workspacePath,
          });
          break;
        }
        case 'delete': {
          if (op.isDir) {
            await invoke('create_directory', { path: op.path });
          } else {
            await invoke('create_file', { path: op.path });
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
      loadRoot();
    } catch (err) {
      console.error('Failed to undo operation:', err);
      loadRoot();
    }
  }, [loadRoot, workspacePath]);

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
    handleRename,
    handleDelete,
    createNewEntry,
    deleteEntry,
    renameEntry,
    revealInFileManager,
    refreshRoot: loadRoot,
    refreshPath,
    importExternalFiles,
    registerExternalRefresh,
    undoExplorerOp,
    pushUndoOp,
    clearUndoLog,
  };
}
