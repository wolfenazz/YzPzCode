import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import type { FileContent } from '../types';

const MEMORY_FILE = '.yzpzcode/memory.md';

/** Read and update the workspace project memory file. */
export const useProjectMemory = () => {
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);

  const memoryFilePath = useCallback((): string | null => {
    const workspacePath = currentWorkspace?.path;
    if (!workspacePath) return null;
    return `${workspacePath.replace(/[\\/]+$/, '')}/${MEMORY_FILE}`;
  }, [currentWorkspace?.path]);

  const readMemory = useCallback(async (): Promise<string> => {
    const path = memoryFilePath();
    if (!path) return '';
    try {
      const result = await invoke<FileContent>('read_file_content', { path });
      return result.content ?? '';
    } catch {
      return '';
    }
  }, [memoryFilePath]);

  const ensureMemoryFile = useCallback(async (): Promise<string | null> => {
    const path = memoryFilePath();
    if (!path) return null;
    const exists = await invoke<boolean>('path_exists', { path }).catch(() => false);
    if (!exists) {
      const header = '# Project Memory\n\nDecisions, conventions, and context to remember for this project.\n';
      await invoke('write_file_content', { path, content: header }).catch(() => undefined);
    }
    return path;
  }, [memoryFilePath]);

  const writeMemoryNote = useCallback(
    async (note: string): Promise<boolean> => {
      const trimmed = note.trim();
      if (!trimmed) return false;
      const path = memoryFilePath();
      if (!path) return false;
      try {
        const existing = await readMemory();
        const entry = `\n- ${trimmed.replace(/\n+/g, ' ').trim()}`;
        const next = existing.trim() ? `${existing.trim()}${entry}\n` : `# Project Memory\n\n- ${trimmed.replace(/\n+/g, ' ').trim()}\n`;
        await invoke('write_file_content', { path, content: next });
        return true;
      } catch (err) {
        console.error('[project-memory] failed to write note:', err);
        return false;
      }
    },
    [memoryFilePath, readMemory]
  );

  return {
    memoryFilePath,
    ensureMemoryFile,
    readMemory,
    writeMemoryNote,
  };
};
