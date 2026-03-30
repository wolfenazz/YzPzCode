import { useState, useCallback, useRef, useEffect } from 'react';
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

export function useFileTree(workspacePath: string | null) {
  const [treeData, setTreeData] = useState<TreeNodeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const treeRef = useRef<TreeApi<TreeNodeData> | null>(null);

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
      let found: TreeNodeData | null = null;

      const findNode = (nodes: TreeNodeData[]): TreeNodeData | null => {
        for (const n of nodes) {
          if (n.id === id) return n;
          if (n.children) {
            const f = findNode(n.children);
            if (f) return f;
          }
        }
        return null;
      };

      found = findNode(treeData);
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
    [treeData]
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
      node: { data: TreeNodeData };
    }) => {
      try {
        await invoke('rename_entry', { oldPath: id, newName: name });
        loadRoot();
      } catch (err) {
        console.error('Failed to rename entry:', err);
      }
    },
    [loadRoot]
  );

  const handleDelete = useCallback(
    async ({ ids }: { ids: string[]; nodes: { data: TreeNodeData }[] }) => {
      for (const id of ids) {
        try {
          await invoke('delete_entry', { path: id });
        } catch (err) {
          console.error('Failed to delete entry:', err);
        }
      }
      loadRoot();
    },
    [loadRoot]
  );

  const createNewEntry = useCallback(
    async (
      parentPath: string | null,
      name: string,
      type: 'file' | 'directory'
    ) => {
      const dir = parentPath || workspacePath;
      if (!dir) return;

      const fullPath = `${dir}/${name}`;

      try {
        if (type === 'file') {
          await invoke('create_file', { path: fullPath });
        } else {
          await invoke('create_directory', { path: fullPath });
        }
        await loadRoot();

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
    [workspacePath, loadRoot]
  );

  const deleteEntry = useCallback(
    async (path: string) => {
      try {
        await invoke('delete_entry', { path });
        loadRoot();
      } catch (err) {
        console.error('Failed to delete entry:', err);
      }
    },
    [loadRoot]
  );

  const renameEntry = useCallback(
    async (oldPath: string, newName: string) => {
      try {
        await invoke('rename_entry', { oldPath, newName });
        loadRoot();
      } catch (err) {
        console.error('Failed to rename entry:', err);
      }
    },
    [loadRoot]
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
