import type { FileContent, FileTab } from '../types';

export interface FileSystemChangedPayload {
  workspacePath: string;
  paths: string[];
}

export function normalizeFilePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized;
}

export function pathAffectedByChanges(path: string, changed: string[]): boolean {
  const normalized = normalizeFilePath(path);
  return changed.length === 0 || changed.some((entry) => {
    const parent = normalizeFilePath(entry);
    return normalized === parent || normalized.startsWith(`${parent}/`);
  });
}

export function reconcileFileFromDisk(file: FileTab, disk: FileContent | null): FileTab {
  if (disk === null) return file.diskContent === null || file.recreateOnSave ? file : { ...file, diskContent: null };
  if (file.isDirty && file.content !== disk.content) {
    const diskContent = disk.content === file.originalContent ? undefined : disk.content;
    return file.diskContent === diskContent ? file : { ...file, diskContent };
  }
  if (file.content === disk.content && file.originalContent === disk.content && file.diskContent === undefined && file.language === disk.language) return file;
  return { ...file, content: disk.content, originalContent: disk.content, language: disk.language, isDirty: false, diskContent: undefined, recreateOnSave: undefined, gitChange: undefined };
}

export function resolveDiskChange(file: FileTab, keepEdits: boolean): FileTab {
  if (file.diskContent === undefined) return file;
  const content = keepEdits ? file.content : file.diskContent ?? '';
  const originalContent = file.diskContent ?? '';
  return { ...file, content, originalContent, isDirty: content !== originalContent || (keepEdits && file.diskContent === null), diskContent: undefined, recreateOnSave: keepEdits && file.diskContent === null };
}

export function markSavedContent(file: FileTab, savedContent: string): FileTab {
  return { ...file, originalContent: savedContent, isDirty: file.content !== savedContent, diskContent: undefined, recreateOnSave: undefined };
}
