import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import type { FileContent } from '../types';

const pendingSaves = new Map<string, Promise<void>>();

export function normalizeEditorContent(content: string, trimWhitespace: boolean): string {
  return trimWhitespace ? content.replace(/[ \t]+$/gm, '') : content;
}

/** All panes share the same save guard, including Save all and autosave. */
export async function saveEditorFile(workspaceId: string, path: string): Promise<void> {
  const key = `${workspaceId}:${path}`;
  while (pendingSaves.has(key)) await pendingSaves.get(key);
  const operation = (async () => {
    const state = useAppStore.getState();
    const file = state.filesByWorkspace[workspaceId]?.find((entry) => entry.path === path);
    if (!file?.isDirty) return;
    if (file.diskContent !== undefined) throw new Error(`Resolve the disk change in ${file.name} before saving. Your edits are preserved.`);
    const content = normalizeEditorContent(file.content, state.editorTrimWhitespace);
    let disk: FileContent | null;
    try {
      disk = await invoke<FileContent>('read_file_content', { path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.startsWith('File does not exist:')) throw error;
      disk = null;
    }
    if (disk?.content !== file.originalContent && !(disk === null && file.recreateOnSave)) {
      useAppStore.getState().reconcileFileDisk(workspaceId, path, disk);
      throw new Error(`${file.name} changed on disk. Resolve the disk change before saving.`);
    }
    const latest = useAppStore.getState().filesByWorkspace[workspaceId]?.find((entry) => entry.path === path);
    if (!latest || latest.diskContent !== undefined || latest.originalContent !== file.originalContent) return;
    // Reflect trimming in the editor without replacing edits made during the read.
    if (latest.content === file.content && content !== file.content && useAppStore.getState().activeWorkspaceId === workspaceId) {
      useAppStore.getState().updateFileContent(path, content);
    }
    await invoke('write_file_content', { path, content });
    useAppStore.getState().markFileSaved(path, content, workspaceId);
    // Lets save-driven tools (Flutter hot reload, pub get) react without a store dependency.
    window.dispatchEvent(new CustomEvent('yzpz:file-saved', { detail: { workspaceId, path } }));
  })();
  pendingSaves.set(key, operation);
  try { await operation; } finally { if (pendingSaves.get(key) === operation) pendingSaves.delete(key); }
}
