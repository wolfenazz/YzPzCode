import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, FileContent, FileTab } from '../types';
import { useAppStore } from '../stores/appStore';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tiff', 'tif',
  'pdf', 'docx', 'doc', 'xlsx', 'xls',
]);

function isLikelyBinary(entry: FileEntry): boolean {
  if (entry.extension && BINARY_EXTENSIONS.has(entry.extension.toLowerCase())) {
    return true;
  }
  return false;
}

export const useFileEditor = () => {
  const [isOpening, setIsOpening] = useState(false);
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
      console.error('Failed to open file:', entry.path, err);
    }
    setIsOpening(false);
  }, [openFileTab]);

  return { openFile, isOpening };
};
