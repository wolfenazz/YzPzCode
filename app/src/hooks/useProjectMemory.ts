import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import type { FileContent, GitFileStatus } from '../types';

const MEMORY_FILE = '.yzpzcode/memory.md';
/** Token budget guard: keep the injected brief small enough to never crowd the prompt. */
const MAX_BRIEF_CHARS = 12_000;
const MAX_CHANGED_FILES = 20;

/**
 * Per-workspace project memory. Loads `.yzpzcode/memory.md` (created on
 * demand) plus the current git changed-files list, and composes a compact
 * "project brief" injected into every new agent session's system prompt so
 * the agent remembers decisions and sees what's in flight without being told
 * again. The agent can also edit memory.md with its normal write_file tool.
 */
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

  const readChangedFiles = useCallback(async (): Promise<GitFileStatus[]> => {
    const workspacePath = currentWorkspace?.path;
    if (!workspacePath) return [];
    try {
      const statuses = await invoke<GitFileStatus[]>('get_git_status', { workspacePath });
      return Array.isArray(statuses) ? statuses.slice(0, MAX_CHANGED_FILES) : [];
    } catch {
      return [];
    }
  }, [currentWorkspace?.path]);

  /** Compose the brief that gets appended to the agent's system prompt. */
  const buildProjectBrief = useCallback(async (): Promise<string> => {
    const [memory, changedFiles] = await Promise.all([readMemory(), readChangedFiles()]);
    const workspaceName = currentWorkspace?.name ?? currentWorkspace?.path ?? 'workspace';
    const parts: string[] = [];

    parts.push(`# Project context: ${workspaceName}`);

    if (memory.trim()) {
      parts.push('\n## Persistent project memory (from .yzpzcode/memory.md)\n');
      parts.push(memory.trim());
    }

    if (changedFiles.length > 0) {
      parts.push('\n## Files currently changed in git (working tree)\n');
      changedFiles.forEach((f) => {
        parts.push(`- [${f.change}] ${f.path}`);
      });
      parts.push('\nKeep these in-flight changes in mind when editing related files.');
    }

    const brief = parts.join('\n').slice(0, MAX_BRIEF_CHARS);
    return brief.trim();
  }, [currentWorkspace?.name, currentWorkspace?.path, readMemory, readChangedFiles]);

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
    readChangedFiles,
    buildProjectBrief,
    writeMemoryNote,
  };
};
