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
      const sourcePath = dragIds[0];
      if (!sourcePath || !workspacePath) return;

      const destDir =
        parentId && parentNode ? parentNode.data.path : workspacePath;

      try {
        await invoke('move_entry', {
          sourcePath,
          destinationDir: destDir,
        });
        loadRoot();
      } catch (err) {
        console.error('Failed to move entry:', err);
        loadRoot();
      }
    },
    [workspacePath, loadRoot]
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
        setTreeData((prev) =>
          updateNodeInTree(prev, id, {
            id: newPath,
            name,
            path: newPath,
            extension: name.includes('.') ? name.split('.').pop() ?? null : null,
          })
        );
      } catch (err) {
        console.error('Failed to rename entry:', err);
        loadRoot();
      }
    },
    [loadRoot, nodeMap]
  );

  const handleDelete = useCallback(
    async ({ ids }: { ids: string[]; nodes: { data: TreeNodeData }[] }) => {
      const deletedPaths = new Set<string>();
      for (const id of ids) {
        try {
          await invoke('delete_entry', { path: id });
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
    []
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
      try {
        await invoke('delete_entry', { path });
        setTreeData((prev) => removeNodeFromTree(prev, path));
      } catch (err) {
        console.error('Failed to delete entry:', err);
      }
    },
    []
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
        setTreeData((prev) =>
          updateNodeInTree(prev, oldPath, {
            id: newPath,
            name: newName,
            path: newPath,
            extension: newName.includes('.') ? newName.split('.').pop() ?? null : null,
          })
        );
      } catch (err) {
        console.error('Failed to rename entry:', err);
        loadRoot();
      }
    },
    [loadRoot, nodeMap]
  );

  const revealInFileManager = useCallback(async (path: string) => {
    try {
      await invoke('reveal_in_file_manager', { path });
    } catch (err) {
      console.error('Failed to reveal in file manager:', err);
    }
  }, []);

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
  };
}
