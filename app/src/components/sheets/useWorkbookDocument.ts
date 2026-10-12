import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileContent, FileEntry } from '../../types';
import { useSheetsSessionStore, type ChatTurn } from '../../stores/sheetsSessionStore';
import { useSheetsStore } from '../../stores/sheetsStore';
import { parseCsv } from '../../utils/sheets/csv';
import { cellDisplay } from '../../utils/sheets/display';
import { recalculate } from '../../utils/sheets/formula/recalc';
import { applyOps } from '../../utils/sheets/ops';
import { emptyWorkbook, type Pivot, type Workbook } from '../../utils/sheets/types';
import { readXlsx } from '../../utils/sheets/xlsxRead';
import { writeXlsx } from '../../utils/sheets/xlsxWrite';
import { sheetToCsv } from '../../utils/sheets/csv';
import { fileName, joinPath, parentPath, slugify } from '../../utils/writing/document';
import { readBytes } from '../../utils/writing/sources';
import { importLegacySpreadsheet } from './legacyImport';

export const SHEETS_FOLDER = 'Sheets';
export const SIDECAR_FOLDER = '.yzsheet';
export const XLSX_EXTENSION = '.xlsx';
const WORKBOOK_EXTENSIONS = ['.xlsx', '.xlsm', '.csv', '.tsv', '.xls', '.ods'];

export interface WorkbookListing {
  path: string;
  title: string;
  modifiedAt: number;
  sheets: number;
  /** A few rows of the first sheet as text, for the card on the home. */
  preview: string[][];
}

interface SidecarMeta {
  title: string;
  sheets: number;
  preview: string[][];
  updatedAt: number;
}

/** Pivot definitions live beside the workbook so they survive restarts and can be refreshed. */
const PIVOTS_FILE = 'pivots.json';
/** Unsaved work written while editing, offered back after a crash. */
const RECOVERY_FILE = 'recovery.json';
/** Recovery snapshots bigger than this are skipped. */
const RECOVERY_LIMIT = 25 * 1024 * 1024;

interface RecoveryFile {
  savedAt: number;
  wb: Workbook;
  originalBase64: string | null;
}

const isPivot = (value: unknown): value is Pivot => {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.source === 'string' && typeof p.target === 'string' && Array.isArray(p.rows) && Array.isArray(p.values);
};

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export const extensionOf = (path: string): string => {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot).toLowerCase();
};

export const isWorkbookFile = (path: string): boolean => WORKBOOK_EXTENSIONS.includes(extensionOf(path));

/** `Sheets/<slug>/<slug>.xlsx`, with a number added when the folder exists. */
export function workbookPath(workspacePath: string, title: string, taken: Set<string> = new Set()): string {
  const base = slugify(title) || 'workbook';
  let slug = base;
  let counter = 2;
  const candidate = (): string => joinPath(workspacePath, SHEETS_FOLDER, slug, `${slug}${XLSX_EXTENSION}`);
  while (taken.has(candidate().toLowerCase())) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return candidate();
}

function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The folder next to a workbook that holds its chat, history and previews. */
export function sidecarDir(path: string, workspacePath: string): string {
  const studioRoot = joinPath(workspacePath, SHEETS_FOLDER).toLowerCase();
  const dir = parentPath(path);
  if (dir.toLowerCase().startsWith(studioRoot)) return joinPath(dir, SIDECAR_FOLDER);
  return joinPath(workspacePath, SHEETS_FOLDER, '.external', `${slugify(fileName(path))}-${hashText(path.toLowerCase())}`, SIDECAR_FOLDER);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await invoke('write_file_bytes', { path, base64Data: bytesToBase64(bytes) });
}

function previewOf(wb: Workbook): string[][] {
  const sheet = wb.sheets[0];
  const rows: string[][] = [];
  for (let r = 0; r < 7; r += 1) {
    const line: string[] = [];
    for (let c = 0; c < 6; c += 1) line.push(cellDisplay(wb, sheet, r, c).text.slice(0, 18));
    rows.push(line);
  }
  while (rows.length && rows[rows.length - 1].every((cell) => cell === '')) rows.pop();
  return rows;
}

async function listWorkbooks(workspacePath: string): Promise<WorkbookListing[]> {
  const root = joinPath(workspacePath, SHEETS_FOLDER);
  if (!(await invoke<boolean>('path_exists', { path: root }).catch(() => false))) return [];
  const folders = await invoke<FileEntry[]>('list_directory_entries', { path: root });
  const found: WorkbookListing[] = [];
  for (const folder of folders.filter((entry) => entry.isDir && !entry.name.startsWith('.'))) {
    const entries = await invoke<FileEntry[]>('list_directory_entries', { path: folder.path }).catch(() => [] as FileEntry[]);
    for (const entry of entries) {
      if (entry.isDir || !['.xlsx', '.xlsm', '.csv', '.tsv'].includes(extensionOf(entry.name))) continue;
      found.push({ path: entry.path, title: folder.name, modifiedAt: entry.modifiedAt * 1000, sheets: 0, preview: [] });
    }
  }
  await Promise.all(found.map(async (item) => {
    try {
      const meta = await invoke<FileContent>('read_file_content', { path: joinPath(parentPath(item.path), SIDECAR_FOLDER, 'meta.json') });
      const parsed = JSON.parse(meta.content) as SidecarMeta;
      item.title = parsed.title || item.title;
      item.sheets = parsed.sheets ?? 0;
      item.preview = Array.isArray(parsed.preview) ? parsed.preview : [];
    } catch {
      item.title = fileName(item.path).replace(/\.[^.]+$/, '');
    }
  }));
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** Text rows to a workbook (CSV opens as one sheet with typed cells). */
function workbookFromRows(rows: string[][], sheetName: string): Workbook {
  const base = emptyWorkbook();
  base.sheets[0].name = sheetName.slice(0, 31) || 'Sheet1';
  const result = applyOps(base, [{ op: 'setValues', at: 'A1', values: rows.map((row) => row.map((cell) => (cell === '' ? null : cell))), parse: true }]);
  return result.wb;
}

export interface LoadedWorkbook {
  wb: Workbook;
  original: Uint8Array | null;
  format: 'xlsx' | 'csv' | 'tsv';
  notes: string[];
}

export async function loadWorkbookFile(path: string): Promise<LoadedWorkbook> {
  const extension = extensionOf(path);
  const bytes = await readBytes(path);
  if (extension === '.csv' || extension === '.tsv') {
    const text = new TextDecoder('utf-8').decode(bytes);
    const rows = parseCsv(text, extension === '.tsv' ? '\t' : undefined);
    return { wb: workbookFromRows(rows, fileName(path).replace(/\.[^.]+$/, '')), original: null, format: extension === '.tsv' ? 'tsv' : 'csv', notes: [] };
  }
  if (extension === '.xls' || extension === '.ods') {
    const { wb, notes } = await importLegacySpreadsheet(bytes);
    return { wb: recalculate(wb), original: null, format: 'xlsx', notes: [...notes, 'This file was converted to .xlsx; saving writes a new .xlsx copy.'] };
  }
  const { wb, warnings } = await readXlsx(bytes);
  return { wb: recalculate(wb), original: bytes, format: 'xlsx', notes: warnings };
}

async function writeSnapshot(dir: string, bytes: Uint8Array, limit: number): Promise<void> {
  if (limit <= 0) return;
  const historyDir = joinPath(dir, 'history');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeBytes(joinPath(historyDir, `${stamp}.xlsx`), bytes);
  const entries = await invoke<FileEntry[]>('list_directory_entries', { path: historyDir }).catch(() => [] as FileEntry[]);
  const snapshots = entries.filter((entry) => entry.name.endsWith('.xlsx')).sort((a, b) => b.name.localeCompare(a.name));
  for (const old of snapshots.slice(limit)) await invoke('delete_entry', { path: old.path }).catch(() => undefined);
}

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

export function useWorkbookDocument(workspaceId: string, workspacePath: string) {
  const [workbooks, setWorkbooks] = useState<WorkbookListing[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const autosaveTimer = useRef<number | null>(null);
  const chatTimer = useRef<number | null>(null);
  const recoveryTimer = useRef<number | null>(null);
  const pivotsTimer = useRef<number | null>(null);
  const lastSnapshot = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const store = useSheetsSessionStore.getState;

  const refresh = useCallback(async (): Promise<void> => {
    setLoadingList(true);
    try {
      setWorkbooks(await listWorkbooks(workspacePath));
    } catch (error) {
      console.error('Could not list workbooks:', error);
    } finally {
      setLoadingList(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveChat = useCallback(async (): Promise<void> => {
    const session = store().sessions[workspaceId];
    if (!session?.path || session.chat.length === 0) return;
    const dir = sidecarDir(session.path, workspacePath);
    await invoke('write_file_content', { path: joinPath(dir, 'chat.json'), content: JSON.stringify(session.chat.slice(-60)) }).catch(() => undefined);
  }, [store, workspaceId, workspacePath]);

  /** Writes the current workbook to the recovery snapshot (or removes it once saved). */
  const writeRecovery = useCallback(async (): Promise<void> => {
    const session = store().sessions[workspaceId];
    if (!session?.path || !session.wb) return;
    const dir = sidecarDir(session.path, workspacePath);
    const file: RecoveryFile = { savedAt: Date.now(), wb: session.wb, originalBase64: session.original ? bytesToBase64(session.original) : null };
    const content = JSON.stringify(file);
    if (content.length > RECOVERY_LIMIT) return;
    await invoke('write_file_content', { path: joinPath(dir, RECOVERY_FILE), content }).catch(() => undefined);
  }, [store, workspaceId, workspacePath]);

  const clearRecovery = useCallback(async (): Promise<void> => {
    const session = store().sessions[workspaceId];
    if (!session?.path) return;
    await invoke('delete_entry', { path: joinPath(sidecarDir(session.path, workspacePath), RECOVERY_FILE) }).catch(() => undefined);
  }, [store, workspaceId, workspacePath]);

  const scheduleRecovery = useCallback((): void => {
    if (recoveryTimer.current) window.clearTimeout(recoveryTimer.current);
    recoveryTimer.current = window.setTimeout(() => {
      recoveryTimer.current = null;
      void writeRecovery();
    }, 2500);
  }, [writeRecovery]);

  const savePivots = useCallback(async (): Promise<void> => {
    const session = store().sessions[workspaceId];
    if (!session?.path) return;
    const dir = sidecarDir(session.path, workspacePath);
    await invoke('write_file_content', { path: joinPath(dir, PIVOTS_FILE), content: JSON.stringify(session.pivots) }).catch(() => undefined);
  }, [store, workspaceId, workspacePath]);

  const save = useCallback(async (): Promise<void> => {
    if (saving.current) await saving.current;
    const session = store().sessions[workspaceId];
    if (!session?.wb || !session.path) return;
    const { wb, path, format } = session;
    const task = (async () => {
      store().update(workspaceId, { saving: true });
      try {
        let bytes: Uint8Array | null = null;
        if (format === 'xlsx') {
          bytes = await writeXlsx(wb, session.original);
          await writeBytes(path, bytes);
        } else {
          const csv = sheetToCsv(wb.sheets[Math.min(wb.activeSheet, wb.sheets.length - 1)], wb.styles, format === 'tsv' ? '\t' : ',');
          await invoke('write_file_content', { path, content: csv });
        }
        const dir = sidecarDir(path, workspacePath);
        const meta: SidecarMeta = { title: fileName(path).replace(/\.[^.]+$/, ''), sheets: wb.sheets.length, preview: previewOf(wb), updatedAt: Date.now() };
        void invoke('write_file_content', { path: joinPath(dir, 'meta.json'), content: JSON.stringify(meta) }).catch(() => undefined);
        store().update(workspaceId, (current) => ({
          saving: false,
          // Edits made while writing stay dirty.
          dirty: current.wb !== wb,
          lastSavedAt: Date.now(),
          error: null,
          original: bytes ?? current.original,
        }));
        if (bytes && Date.now() - lastSnapshot.current > SNAPSHOT_INTERVAL_MS) {
          lastSnapshot.current = Date.now();
          void writeSnapshot(dir, bytes, useSheetsStore.getState().snapshotLimit).catch(() => undefined);
        }
        // A saved workbook needs no recovery snapshot.
        void clearRecovery();
      } catch (error) {
        store().update(workspaceId, { saving: false, error: `Could not save: ${error instanceof Error ? error.message : String(error)}` });
      }
    })();
    saving.current = task;
    await task;
    saving.current = null;
  }, [clearRecovery, store, workspaceId, workspacePath]);

  const scheduleSave = useCallback((): void => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      void save();
    }, useSheetsStore.getState().autosaveDelayMs);
  }, [save]);

  // Every change autosaves; chat is written a moment after it settles.
  useEffect(() => useSheetsSessionStore.subscribe((state, previous) => {
    const now = state.sessions[workspaceId];
    const before = previous.sessions[workspaceId];
    if (now?.wb && now.dirty && now.path && now.wb !== before?.wb) {
      scheduleSave();
      scheduleRecovery();
    }
    if (now?.chat !== before?.chat && now?.path) {
      if (chatTimer.current) window.clearTimeout(chatTimer.current);
      chatTimer.current = window.setTimeout(() => { chatTimer.current = null; void saveChat(); }, 800);
    }
    if (now?.pivots !== before?.pivots && now?.path) {
      if (pivotsTimer.current) window.clearTimeout(pivotsTimer.current);
      pivotsTimer.current = window.setTimeout(() => { pivotsTimer.current = null; void savePivots(); }, 800);
    }
  }), [saveChat, savePivots, scheduleRecovery, scheduleSave, workspaceId]);

  const flush = useCallback(async (): Promise<void> => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (store().sessions[workspaceId]?.dirty) await save();
  }, [save, store, workspaceId]);

  useEffect(() => () => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      void save();
    }
    if (chatTimer.current) {
      window.clearTimeout(chatTimer.current);
      void saveChat();
    }
    if (recoveryTimer.current) {
      window.clearTimeout(recoveryTimer.current);
      recoveryTimer.current = null;
    }
    if (pivotsTimer.current) {
      window.clearTimeout(pivotsTimer.current);
      pivotsTimer.current = null;
      void savePivots();
    }
  }, [save, saveChat, savePivots]);

  const loadChat = useCallback(async (path: string): Promise<ChatTurn[]> => {
    try {
      const file = await invoke<FileContent>('read_file_content', { path: joinPath(sidecarDir(path, workspacePath), 'chat.json') });
      const parsed = JSON.parse(file.content) as ChatTurn[];
      return Array.isArray(parsed) ? parsed.filter((turn) => turn && typeof turn.text === 'string').slice(-60).map((turn) => ({ ...turn, outcome: turn.outcome === 'pending' ? 'discarded' : turn.outcome })) : [];
    } catch {
      return [];
    }
  }, [workspacePath]);

  const install = useCallback((loaded: LoadedWorkbook, path: string, external: boolean, chat: ChatTurn[], pivots: Pivot[] = []): void => {
    store().update(workspaceId, (session) => ({
      path,
      external,
      wb: loaded.wb,
      original: loaded.original,
      format: loaded.format,
      dirty: false,
      saving: false,
      error: null,
      past: [],
      future: [],
      proposal: null,
      run: null,
      chat,
      pivots,
      recovery: null,
      importNotes: loaded.notes,
      version: session.version + 1,
      selection: { active: { row: 0, col: 0 }, ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }] },
    }));
    useSheetsStore.getState().setLastWorkbook(workspaceId, path);
  }, [store, workspaceId]);

  const loadPivots = useCallback(async (path: string): Promise<Pivot[]> => {
    try {
      const file = await invoke<FileContent>('read_file_content', { path: joinPath(sidecarDir(path, workspacePath), PIVOTS_FILE) });
      const parsed = JSON.parse(file.content) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isPivot) : [];
    } catch {
      return [];
    }
  }, [workspacePath]);

  /** Offer unsaved work left behind by a crash, if it differs from the file. */
  const checkRecovery = useCallback(async (path: string, loaded: Workbook): Promise<void> => {
    try {
      const file = await invoke<FileContent>('read_file_content', { path: joinPath(sidecarDir(path, workspacePath), RECOVERY_FILE) });
      const parsed = JSON.parse(file.content) as Partial<RecoveryFile>;
      if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.wb || !Array.isArray((parsed.wb as Workbook).sheets)) return;
      if (JSON.stringify(parsed.wb) === JSON.stringify(loaded)) {
        await invoke('delete_entry', { path: joinPath(sidecarDir(path, workspacePath), RECOVERY_FILE) }).catch(() => undefined);
        return;
      }
      let original: Uint8Array | null = null;
      try {
        original = parsed.originalBase64 ? base64ToBytes(parsed.originalBase64) : null;
      } catch {
        original = null;
      }
      store().update(workspaceId, { recovery: { wb: parsed.wb as Workbook, original, savedAt: parsed.savedAt } });
    } catch {
      // No recovery snapshot: nothing to offer.
    }
  }, [store, workspaceId, workspacePath]);

  const open = useCallback(async (path: string): Promise<void> => {
    await flush();
    try {
      const loaded = await loadWorkbookFile(path);
      const studioRoot = joinPath(workspacePath, SHEETS_FOLDER).toLowerCase();
      const external = !parentPath(path).toLowerCase().startsWith(studioRoot);
      // A legacy file opens as a new .xlsx beside the studio's workbooks, never over the original.
      if (['.xls', '.ods'].includes(extensionOf(path))) {
        const target = workbookPath(workspacePath, fileName(path).replace(/\.[^.]+$/, ''), new Set(workbooks.map((w) => w.path.toLowerCase())));
        const bytes = await writeXlsx(loaded.wb, null);
        await writeBytes(target, bytes);
        install({ ...loaded, original: bytes }, target, false, []);
        void refresh();
        return;
      }
      install(loaded, path, external, await loadChat(path), await loadPivots(path));
      await checkRecovery(path, loaded.wb);
    } catch (error) {
      store().update(workspaceId, { error: error instanceof Error ? error.message : String(error) });
      if (useSheetsStore.getState().lastWorkbookByWorkspace[workspaceId] === path) useSheetsStore.getState().setLastWorkbook(workspaceId, null);
    }
  }, [checkRecovery, flush, install, loadChat, loadPivots, refresh, store, workbooks, workspaceId, workspacePath]);

  const pathFor = useCallback((title: string): string => workbookPath(workspacePath, title, new Set(workbooks.map((w) => w.path.toLowerCase()))), [workbooks, workspacePath]);

  /** Writes a new workbook file and opens it. */
  const create = useCallback(async (wb: Workbook, title: string, chat: ChatTurn[] = []): Promise<string> => {
    await flush();
    const path = pathFor(title);
    const bytes = await writeXlsx(wb, null);
    await writeBytes(path, bytes);
    install({ wb, original: bytes, format: 'xlsx', notes: [] }, path, false, chat);
    void refresh();
    return path;
  }, [flush, install, pathFor, refresh]);

  const remove = useCallback(async (path: string): Promise<void> => {
    await invoke('delete_entry', { path: parentPath(path) });
    if (store().sessions[workspaceId]?.path === path) {
      store().update(workspaceId, (session) => ({ path: null, wb: null, original: null, dirty: false, run: null, proposal: null, past: [], future: [], chat: [], pivots: [], recovery: null, version: session.version + 1 }));
      useSheetsStore.getState().setLastWorkbook(workspaceId, null);
    }
    void refresh();
  }, [refresh, store, workspaceId]);

  const close = useCallback(async (): Promise<void> => {
    await flush();
    await saveChat();
    await clearRecovery();
    store().update(workspaceId, (session) => ({ path: null, wb: null, original: null, dirty: false, run: null, proposal: null, past: [], future: [], chat: [], pivots: [], recovery: null, version: session.version + 1 }));
    useSheetsStore.getState().setLastWorkbook(workspaceId, null);
    void refresh();
  }, [clearRecovery, flush, refresh, saveChat, store, workspaceId]);

  /** A copy of an external file inside the studio folder (the sidecar and history follow). */
  const saveCopy = useCallback(async (): Promise<string | null> => {
    const session = store().sessions[workspaceId];
    if (!session?.wb || !session.path) return null;
    await flush();
    const title = fileName(session.path).replace(/\.[^.]+$/, '');
    const path = pathFor(title);
    const bytes = await writeXlsx(session.wb, session.original);
    await writeBytes(path, bytes);
    install({ wb: session.wb, original: bytes, format: 'xlsx', notes: [] }, path, false, session.chat, session.pivots);
    void refresh();
    return path;
  }, [flush, install, pathFor, refresh, store, workspaceId]);

  /** Saves a pivot definition (replacing the one at the same target) so it can be refreshed later. */
  const recordPivot = useCallback((def: Pivot): void => {
    store().update(workspaceId, (session) => ({
      pivots: [...session.pivots.filter((entry) => entry.target.toLowerCase() !== def.target.toLowerCase()), def],
    }));
  }, [store, workspaceId]);

  const removePivot = useCallback((id: string): void => {
    store().update(workspaceId, (session) => ({ pivots: session.pivots.filter((entry) => entry.id !== id) }));
  }, [store, workspaceId]);

  /** Puts the crashed session's work back on the grid; the snapshot file stays until the next save. */
  const restoreRecovery = useCallback((): void => {
    const session = store().sessions[workspaceId];
    if (!session?.recovery) return;
    const { wb, original } = session.recovery;
    store().update(workspaceId, { recovery: null });
    store().commit(workspaceId, wb);
    if (original) store().update(workspaceId, { original });
  }, [store, workspaceId]);

  /** Throws the crashed session's work away. */
  const discardRecovery = useCallback((): void => {
    store().update(workspaceId, { recovery: null });
    void clearRecovery();
  }, [clearRecovery, store, workspaceId]);

  return { workbooks, loadingList, refresh, open, create, remove, close, save, flush, saveCopy, pathFor, recordPivot, removePivot, restoreRecovery, discardRecovery };
}

