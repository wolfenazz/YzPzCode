// Explorer clipboard decisions, kept dependency-free so they can be tested
// without Tauri (`npm run test:explorer`). The IPC side lives in
// `hooks/useExplorerClipboard.ts`.

import type { ExplorerUndoOp } from '../hooks/useFileTree';

export type ClipboardOperation = 'copy' | 'cut';

export interface ExplorerClipboardEntry {
  path: string;
  name: string;
  isDir: boolean;
}

/** The explorer's own clipboard (appStore.explorerClipboard). */
export interface AppClipboard {
  operation: ClipboardOperation;
  entries: ExplorerClipboardEntry[];
}

/** What the OS clipboard holds (Rust `read_clipboard_files`). */
export interface SystemClipboard {
  paths: string[];
  operation: ClipboardOperation;
  hasImage: boolean;
}

/** One pasted entry (Rust `paste_entries`). */
export interface PasteOutcome {
  source: string;
  path: string | null;
  error: string | null;
  skipped: boolean;
}

export type PasteSource =
  | { kind: 'files'; operation: ClipboardOperation; paths: string[]; origin: 'app' | 'system' }
  | { kind: 'image' };

export interface ExplorerNotice {
  tone: 'info' | 'error';
  text: string;
}

// Same rule as utils/fileSync normalizeFilePath (Windows paths compare
// case-insensitively), inlined to keep this module dependency-free.
const normalize = (path: string): string => {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized;
};

export const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export const parentDir = (path: string): string | null => {
  const sep = path.includes('\\') ? '\\' : '/';
  const index = path.lastIndexOf(sep);
  return index <= 0 ? null : path.slice(0, index);
};

export function samePathSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a.map(normalize));
  return b.every((path) => set.has(normalize(path)));
}

/**
 * Decides what Ctrl+V pastes. Copying in the explorer also writes the files
 * to the OS clipboard, so when both agree the explorer's own record wins
 * (it knows cut vs copy everywhere). Anything newer on the OS clipboard,
 * such as files copied in the system file manager or a screenshot, wins
 * over a stale explorer copy.
 */
export function pickPasteSource(app: AppClipboard | null, system: SystemClipboard | null): PasteSource | null {
  const appPaths = app?.entries.map((entry) => entry.path) ?? [];
  if (system && system.paths.length > 0) {
    if (app && samePathSet(system.paths, appPaths)) {
      return { kind: 'files', operation: app.operation, paths: appPaths, origin: 'app' };
    }
    return { kind: 'files', operation: system.operation, paths: system.paths, origin: 'system' };
  }
  if (system?.hasImage) return { kind: 'image' };
  if (app && appPaths.length > 0) {
    return { kind: 'files', operation: app.operation, paths: appPaths, origin: 'app' };
  }
  return null;
}

/** Folder a paste lands in: the folder itself, or the file's folder. */
export function pasteTargetDir(node: { path: string; isDir: boolean } | null, workspacePath: string): string {
  if (!node) return workspacePath;
  return node.isDir ? node.path : parentDir(node.path) ?? workspacePath;
}

/** One undo record for a whole paste, newest change first. */
export function buildPasteUndo(
  outcomes: PasteOutcome[],
  operation: ClipboardOperation,
  destinationDir: string,
): ExplorerUndoOp | null {
  const ops: ExplorerUndoOp[] = outcomes
    .filter((outcome): outcome is PasteOutcome & { path: string } => !!outcome.path)
    .map((outcome) =>
      operation === 'cut'
        ? { kind: 'move', sourcePath: outcome.source, destinationDir, name: baseName(outcome.path) }
        : { kind: 'duplicate', sourcePath: outcome.source, createdPath: outcome.path },
    );
  if (ops.length === 0) return null;
  return ops.length === 1 ? ops[0] : { kind: 'batch', ops: ops.reverse() };
}

const items = (count: number): string => `${count} item${count === 1 ? '' : 's'}`;

export function summarizePaste(outcomes: PasteOutcome[], operation: ClipboardOperation): ExplorerNotice | null {
  const done = outcomes.filter((outcome) => outcome.path);
  const failed = outcomes.filter((outcome) => outcome.error);
  const verb = operation === 'cut' ? 'Moved' : 'Pasted';
  if (failed.length === 0) {
    if (done.length === 0) return outcomes.length ? { tone: 'info', text: 'Already in this folder' } : null;
    return { tone: 'info', text: `${verb} ${done.length === 1 ? baseName(done[0].path!) : items(done.length)}` };
  }
  const reason = failed[0].error ?? 'Unknown error';
  if (done.length === 0 && failed.length === 1) return { tone: 'error', text: reason };
  return {
    tone: 'error',
    text: `${verb} ${done.length} of ${outcomes.length}. ${failed.length} failed: ${reason}`,
  };
}

/** Text for Copy Path / Copy Relative Path, one entry per line. */
export function formatPaths(paths: string[], workspacePath: string, relative: boolean): string {
  if (!relative) return paths.join('\n');
  const root = normalize(workspacePath);
  return paths
    .map((path) => {
      const normalized = normalize(path);
      if (normalized === root) return '.';
      return normalized.startsWith(`${root}/`) ? path.slice(workspacePath.replace(/[\\/]+$/, '').length + 1) : path;
    })
    .join('\n');
}

export function describeClipboard(clipboard: AppClipboard | null): string | null {
  if (!clipboard || clipboard.entries.length === 0) return null;
  const what = clipboard.entries.length === 1 ? clipboard.entries[0].name : items(clipboard.entries.length);
  return `${what} ${clipboard.operation === 'cut' ? 'cut' : 'copied'}`;
}
