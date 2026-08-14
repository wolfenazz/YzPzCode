import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, FileContent, FileTab } from '../types';
import { useAppStore } from '../stores/appStore';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tiff', 'tif',
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'ppt',
]);

// Images open in the built-in Image Editor (layer-based) rather than the read-only preview.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tiff', 'tif']);

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

function isLikelyBinary(entry: FileEntry): boolean {
  if (entry.extension && BINARY_EXTENSIONS.has(entry.extension.toLowerCase())) {
    return true;
  }
  return false;
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
    const openFiles = state.openFiles;
    const existing = openFiles.find((f) => f.path === entry.path);
    if (existing) {
      openFileTab(existing);
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
            openFileTab(tab);
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
            openFileTab(tab);
          }
        }
      } else if (IMAGE_EXTENSIONS.has(entry.extension?.toLowerCase() ?? '')) {
        useAppStore.getState().openInImageEditor(entry.path);
      } else if (isLikelyBinary(entry)) {
        const tab: FileTab = {
          path: entry.path,
          name: entry.name,
          language: entry.extension?.toLowerCase() ?? 'plaintext',
          content: '',
          originalContent: '',
          isDirty: false,
        };
        openFileTab(tab);
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
        const result = await invoke<FileContent>('read_file_content', { path: entry.path });
        const tab: FileTab = {
          path: entry.path,
          name: entry.name,
          language: result.language,
          content: result.content,
          originalContent: result.content,
          isDirty: false,
        };
        openFileTab(tab);
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
