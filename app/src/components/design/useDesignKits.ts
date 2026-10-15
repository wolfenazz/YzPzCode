import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileContent, FileEntry } from '../../types';
import { DESIGN_FOLDER, joinPath } from '../../utils/design/project';
import { KIT_EXTENSION, KIT_FOLDER, kitFileName, parseKit, serializeKit, type Kit } from '../../utils/design/kits';
import type { DesignTokens } from '../../utils/design/types';

export interface SavedKit extends Kit {
  /** Absolute path of the kit's file. */
  path: string;
}

/** The saved design systems in `Designs/.kits/`: list, save the current system, delete. */
export function useDesignKits(root: string) {
  const [kits, setKits] = useState<SavedKit[]>([]);
  const folder = root ? joinPath(root, DESIGN_FOLDER, KIT_FOLDER) : '';

  const refresh = useCallback(async (): Promise<void> => {
    if (!folder) return;
    try {
      if (!(await invoke<boolean>('path_exists', { path: folder }).catch(() => false))) {
        setKits([]);
        return;
      }
      const entries = await invoke<FileEntry[]>('list_directory_entries', { path: folder });
      const found: SavedKit[] = [];
      await Promise.all(entries.filter((entry) => !entry.isDir && entry.name.toLowerCase().endsWith(KIT_EXTENSION)).map(async (entry) => {
        try {
          const file = await invoke<FileContent>('read_file_content', { path: entry.path });
          const kit = parseKit(file.content);
          if (kit) found.push({ ...kit, path: entry.path });
        } catch {
          /* an unreadable kit is left out */
        }
      }));
      setKits(found.sort((a, b) => b.created - a.created));
    } catch (error) {
      console.error('Could not list kits:', error);
    }
  }, [folder]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (name: string, tokens: DesignTokens): Promise<SavedKit | null> => {
    if (!folder) return null;
    const clean = name.trim().slice(0, 80) || tokens.name;
    const taken = new Set(kits.map((kit) => kit.path.split(/[\\/]/).pop()?.toLowerCase() ?? ''));
    const kit: Kit = { version: 1, id: `k-${Date.now().toString(36)}`, name: clean, tokens: { ...tokens, name: tokens.name }, created: Date.now() };
    const path = joinPath(folder, kitFileName(clean, taken));
    await invoke('write_file_content', { path, content: serializeKit(kit) });
    await refresh();
    return { ...kit, path };
  }, [folder, kits, refresh]);

  const remove = useCallback(async (kit: SavedKit): Promise<void> => {
    await invoke('delete_entry', { path: kit.path }).catch(() => undefined);
    await refresh();
  }, [refresh]);

  return { kits, save, remove, refresh };
}
