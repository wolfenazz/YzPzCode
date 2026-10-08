import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import type { ExplorerUndoOp } from './useFileTree';
import {
  buildPasteUndo,
  pickPasteSource,
  samePathSet,
  summarizePaste,
  baseName,
  type ClipboardOperation,
  type ExplorerClipboardEntry,
  type ExplorerNotice,
  type PasteOutcome,
  type PasteSource,
  type SystemClipboard,
} from '../utils/explorerClipboard';

export interface PasteResult {
  notice: ExplorerNotice | null;
  /** Paths that now exist in the destination, to reveal and select. */
  created: string[];
}

const readSystemClipboard = async (): Promise<SystemClipboard | null> => {
  try {
    return await invoke<SystemClipboard>('read_clipboard_files');
  } catch (err) {
    // No OS clipboard (e.g. a Wayland session without X11): the explorer's
    // own clipboard keeps working.
    console.warn('Could not read the system clipboard:', err);
    return null;
  }
};

/**
 * Explorer copy / cut / paste, shared with the OS clipboard: files copied
 * here paste into the system file manager and the other way round.
 */
export function useExplorerClipboard(pushUndoOp: (op: ExplorerUndoOp) => void) {
  const setExplorerClipboard = useAppStore((s) => s.setExplorerClipboard);

  const copyEntries = useCallback(
    async (entries: ExplorerClipboardEntry[], operation: ClipboardOperation): Promise<void> => {
      if (entries.length === 0) return;
      setExplorerClipboard({ operation, entries });
      try {
        await invoke('write_clipboard_files', { paths: entries.map((entry) => entry.path), operation });
      } catch (err) {
        console.warn('Could not put files on the system clipboard:', err);
      }
    },
    [setExplorerClipboard],
  );

  const clearClipboard = useCallback(async (): Promise<void> => {
    const app = useAppStore.getState().explorerClipboard;
    setExplorerClipboard(null);
    if (!app) return;
    // Only clear the OS clipboard if it still holds our files.
    const system = await readSystemClipboard();
    if (system && samePathSet(system.paths, app.entries.map((entry) => entry.path))) {
      await invoke('write_clipboard_files', { paths: [], operation: 'copy' }).catch(() => {});
    }
  }, [setExplorerClipboard]);

  /** What a paste would insert right now (for menu labels). */
  const peekPasteSource = useCallback(async (): Promise<PasteSource | null> => {
    return pickPasteSource(useAppStore.getState().explorerClipboard, await readSystemClipboard());
  }, []);

  const pasteInto = useCallback(
    async (destinationDir: string): Promise<PasteResult> => {
      const source = await peekPasteSource();
      if (!source) return { notice: { tone: 'info', text: 'Nothing to paste. Copy files first.' }, created: [] };

      if (source.kind === 'image') {
        try {
          const created = await invoke<string>('paste_clipboard_image', { destinationDir });
          pushUndoOp({ kind: 'create', path: created, isDir: false });
          return { notice: { tone: 'info', text: `Saved image as ${baseName(created)}` }, created: [created] };
        } catch (err) {
          return { notice: { tone: 'error', text: String(err) }, created: [] };
        }
      }

      let outcomes: PasteOutcome[];
      try {
        outcomes = await invoke<PasteOutcome[]>('paste_entries', {
          sourcePaths: source.paths,
          destinationDir,
          operation: source.operation,
        });
      } catch (err) {
        return { notice: { tone: 'error', text: String(err) }, created: [] };
      }

      const undo = buildPasteUndo(outcomes, source.operation, destinationDir);
      if (undo) pushUndoOp(undo);

      // A cut is used up once pasted (as in every file manager); a copy can
      // be pasted again.
      if (source.operation === 'cut' && outcomes.some((outcome) => outcome.path)) {
        if (source.origin === 'app') await clearClipboard();
        else await invoke('write_clipboard_files', { paths: [], operation: 'copy' }).catch(() => {});
      }

      return {
        notice: summarizePaste(outcomes, source.operation),
        created: outcomes.flatMap((outcome) => (outcome.path ? [outcome.path] : [])),
      };
    },
    [peekPasteSource, pushUndoOp, clearClipboard],
  );

  /** Ctrl+drag: copy entries into a folder without touching the clipboard. */
  const copyInto = useCallback(
    async (paths: string[], destinationDir: string): Promise<PasteResult> => {
      try {
        const outcomes = await invoke<PasteOutcome[]>('paste_entries', {
          sourcePaths: paths,
          destinationDir,
          operation: 'copy',
        });
        const undo = buildPasteUndo(outcomes, 'copy', destinationDir);
        if (undo) pushUndoOp(undo);
        return {
          notice: summarizePaste(outcomes, 'copy'),
          created: outcomes.flatMap((outcome) => (outcome.path ? [outcome.path] : [])),
        };
      } catch (err) {
        return { notice: { tone: 'error', text: String(err) }, created: [] };
      }
    },
    [pushUndoOp],
  );

  return { copyEntries, clearClipboard, peekPasteSource, pasteInto, copyInto };
}
