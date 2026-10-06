import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, FileContent, FileTab } from '../types';
import { useAppStore } from '../stores/appStore';
import { getMediaKind } from '../utils/mediaFiles';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tiff', 'tif',
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'ppt',
]);

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

function isLikelyBinary(entry: FileEntry): boolean {
  if (entry.extension && BINARY_EXTENSIONS.has(entry.extension.toLowerCase())) {
    return true;
  }
  return getMediaKind(entry.extension) !== null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const useFileEditor = () => {
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const openFileTab = useAppStore((s) => s.openFileTab);

  const openFile = useCallback(async (entry: FileEntry, change?: string) => {
    const state = useAppStore.getState();
    const workspaceId = state.currentWorkspace?.id;
    const openFiles = state.openFiles;
    const openTab = (tab: FileTab): void => {
      if (useAppStore.getState().currentWorkspace?.id === workspaceId) openFileTab(tab);
    };
    const existing = openFiles.find((f) => f.path === entry.path);
    if (existing) {
      openTab(existing);
      if (workspaceId && !isLikelyBinary(entry) && !existing.binary) {
        try {
          const disk = await invoke<FileContent>('read_file_content', { path: entry.path });
          useAppStore.getState().reconcileFileDisk(workspaceId, entry.path, disk);
        } catch (error) {
          if (String(error).startsWith('File does not exist:')) useAppStore.getState().reconcileFileDisk(workspaceId, entry.path, null);
          else setOpenError(`Could not refresh file: ${String(error)}`);
        }
      }
      return;
    }

    setIsOpening(true);
    setOpenError(null);
    try {
      if (change === 'deleted') {
        const workspacePath = state.currentWorkspace?.path;
        if (workspacePath) {
          try {
            const content = await invoke<string>('get_git_file_content', {
              workspacePath,
              filePath: entry.path,
            });
            const tab: FileTab = {
              path: entry.path,
              name: entry.name,
              language: entry.extension?.toLowerCase() ?? 'plaintext',
              content,
              originalContent: content,
              isDirty: false,
              gitChange: 'deleted',
            };
            openTab(tab);
          } catch {
            const tab: FileTab = {
              path: entry.path,
              name: entry.name,
              language: 'plaintext',
              content: '',
              originalContent: '',
              isDirty: false,
              gitChange: 'deleted',
            };
            openTab(tab);
          }
        }
      } else if (isLikelyBinary(entry)) {
        const tab: FileTab = {
          path: entry.path,
          name: entry.name,
          language: entry.extension?.toLowerCase() ?? 'plaintext',
          content: '',
          originalContent: '',
          isDirty: false,
        };
        openTab(tab);
      } else {
        if (entry.size > LARGE_FILE_THRESHOLD) {
          const confirmed = window.confirm(
            `"${entry.name}" is ${formatFileSize(entry.size)}.\n\nLarge files may be slow to open and edit. Continue?`
          );
          if (!confirmed) {
            setIsOpening(false);
            return;
          }
        }
        try {
          const result = await invoke<FileContent>('read_file_content', { path: entry.path });
          openTab({
            path: entry.path,
            name: entry.name,
            language: result.language,
            content: result.content,
            originalContent: result.content,
            isDirty: false,
          });
        } catch (err) {
          // Any other non-text file (fonts, archives, executables…) opens in the hex viewer.
          if (!/valid UTF-8/i.test(String(err))) throw err;
          openTab({
            path: entry.path,
            name: entry.name,
            language: 'plaintext',
            content: '',
            originalContent: '',
            isDirty: false,
            binary: true,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOpenError(`Failed to open file: ${message}`);
    }
    setIsOpening(false);
  }, [openFileTab]);

  const clearError = useCallback(() => setOpenError(null), []);

  return { openFile, isOpening, openError, clearError };
};
