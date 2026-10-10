import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileContent, FileEntry } from '../../types';
import { usePresentationSessionStore } from '../../stores/presentationSessionStore';
import { usePresentationStore } from '../../stores/presentationStore';
import { deckPath, parseDeck, PRESENTATIONS_FOLDER, serializeDeck, YZDECK_EXTENSION } from '../../utils/presentation/deck';
import type { YzDeck } from '../../utils/presentation/types';
import { fileName, joinPath, parentPath } from '../../utils/writing/document';

export interface DeckListing {
  path: string;
  title: string;
  modifiedAt: number;
  slides: number;
  preserve: boolean;
  /** AI-designed (SVG) deck. */
  designed: boolean;
  /** Opened from a PowerPoint file. */
  imported: boolean;
}

async function listDecks(workspacePath: string): Promise<DeckListing[]> {
  const root = joinPath(workspacePath, PRESENTATIONS_FOLDER);
  if (!(await invoke<boolean>('path_exists', { path: root }).catch(() => false))) return [];
  const folders = await invoke<FileEntry[]>('list_directory_entries', { path: root });
  const decks: DeckListing[] = [];
  for (const folder of folders.filter((entry) => entry.isDir)) {
    const entries = await invoke<FileEntry[]>('list_directory_entries', { path: folder.path }).catch(() => [] as FileEntry[]);
    for (const entry of entries) {
      if (!entry.isDir && entry.name.toLowerCase().endsWith(YZDECK_EXTENSION)) {
        // The file system reports seconds since the epoch.
        decks.push({ path: entry.path, title: folder.name, modifiedAt: entry.modifiedAt * 1000, slides: 0, preserve: false, designed: false, imported: false });
      }
    }
  }
  await Promise.all(decks.map(async (deck) => {
    try {
      const file = await invoke<FileContent>('read_file_content', { path: deck.path });
      const parsed = parseDeck(file.content);
      deck.title = parsed.meta.title;
      deck.slides = parsed.source ? parsed.source.slides.length : parsed.design ? parsed.design.slides.length : parsed.slides.length;
      deck.preserve = Boolean(parsed.source);
      deck.designed = Boolean(parsed.design);
      deck.imported = Boolean(parsed.design?.origin);
    } catch {
      deck.title = fileName(deck.path).replace(YZDECK_EXTENSION, '');
    }
  }));
  return decks.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

async function writeSnapshot(path: string, content: string, limit: number): Promise<void> {
  if (limit <= 0) return;
  const historyDir = joinPath(parentPath(path), '.history');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await invoke('write_file_content', { path: joinPath(historyDir, `${stamp}${YZDECK_EXTENSION}`), content });
  const entries = await invoke<FileEntry[]>('list_directory_entries', { path: historyDir }).catch(() => [] as FileEntry[]);
  const snapshots = entries.filter((entry) => entry.name.endsWith(YZDECK_EXTENSION)).sort((a, b) => b.name.localeCompare(a.name));
  for (const old of snapshots.slice(limit)) await invoke('delete_entry', { path: old.path }).catch(() => undefined);
}

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

export function useDeckDocument(workspaceId: string, workspacePath: string) {
  const [decks, setDecks] = useState<DeckListing[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const autosaveTimer = useRef<number | null>(null);
  const lastSnapshot = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const store = usePresentationSessionStore.getState;

  const refreshDecks = useCallback(async (): Promise<void> => {
    setLoadingList(true);
    try {
      setDecks(await listDecks(workspacePath));
    } catch (error) {
      console.error('Could not list presentations:', error);
    } finally {
      setLoadingList(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void refreshDecks();
  }, [refreshDecks]);

  const save = useCallback(async (): Promise<void> => {
    if (saving.current) await saving.current;
    const session = store().sessions[workspaceId];
    if (!session?.deck || !session.deckPath) return;
    const { deck, deckPath: path } = session;
    const task = (async () => {
      store().update(workspaceId, { saving: true });
      try {
        const content = serializeDeck(deck);
        await invoke('write_file_content', { path, content });
        store().update(workspaceId, (current) => ({
          saving: false,
          // Edits made while writing stay dirty.
          dirty: current.deck !== deck,
          lastSavedAt: Date.now(),
          error: null,
        }));
        if (Date.now() - lastSnapshot.current > SNAPSHOT_INTERVAL_MS) {
          lastSnapshot.current = Date.now();
          void writeSnapshot(path, content, usePresentationStore.getState().snapshotLimit).catch(() => undefined);
        }
      } catch (error) {
        store().update(workspaceId, { saving: false, error: `Could not save: ${error instanceof Error ? error.message : String(error)}` });
      }
    })();
    saving.current = task;
    await task;
    saving.current = null;
  }, [store, workspaceId]);

  const scheduleSave = useCallback((): void => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      void save();
    }, usePresentationStore.getState().autosaveDelayMs);
  }, [save]);

  // Every deck change autosaves.
  useEffect(() => usePresentationSessionStore.subscribe((state, previous) => {
    const now = state.sessions[workspaceId];
    const before = previous.sessions[workspaceId];
    if (now?.deck && now.dirty && now.deckPath && now.deck !== before?.deck) scheduleSave();
  }), [scheduleSave, workspaceId]);

  const flush = useCallback(async (): Promise<void> => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (store().sessions[workspaceId]?.dirty) await save();
  }, [save, store, workspaceId]);

  // Closing the workspace (unmount) saves what is pending.
  useEffect(() => () => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      void save();
    }
  }, [save]);

  const loadDeck = useCallback((deck: YzDeck, path: string): void => {
    store().update(workspaceId, (session) => ({
      deckPath: path,
      deck,
      selectedIds: deck.design?.slides[0] ? [deck.design.slides[0].id] : deck.slides[0] ? [deck.slides[0].id] : deck.source?.slides[0] ? [deck.source.slides[0].key] : [],
      selectedSlot: null,
      dirty: false,
      saving: false,
      error: null,
      run: null,
      past: [],
      future: [],
      warnings: {},
      version: session.version + 1,
    }));
    usePresentationStore.getState().setLastDeck(workspaceId, path);
  }, [store, workspaceId]);

  const openDeck = useCallback(async (path: string): Promise<void> => {
    await flush();
    try {
      const file = await invoke<FileContent>('read_file_content', { path });
      loadDeck(parseDeck(file.content), path);
    } catch (error) {
      store().update(workspaceId, { error: error instanceof Error ? error.message : String(error) });
      if (usePresentationStore.getState().lastDeckByWorkspace[workspaceId] === path) usePresentationStore.getState().setLastDeck(workspaceId, null);
    }
  }, [flush, loadDeck, store, workspaceId]);

  /** The path a new deck with this title would get. */
  const pathFor = useCallback((title: string): string => {
    const taken = new Set(decks.map((deck) => deck.path.toLowerCase()));
    return deckPath(workspacePath, title, taken);
  }, [decks, workspacePath]);

  /** Writes a new deck file and opens it. */
  const createDeckFile = useCallback(async (deck: YzDeck, path = pathFor(deck.meta.title)): Promise<string> => {
    await flush();
    await invoke('write_file_content', { path, content: serializeDeck(deck) });
    loadDeck(deck, path);
    void refreshDecks();
    return path;
  }, [flush, loadDeck, pathFor, refreshDecks]);

  const deleteDeck = useCallback(async (path: string): Promise<void> => {
    await invoke('delete_entry', { path: parentPath(path) });
    if (store().sessions[workspaceId]?.deckPath === path) {
      store().update(workspaceId, (session) => ({ deckPath: null, deck: null, selectedIds: [], dirty: false, run: null, past: [], future: [], warnings: {}, version: session.version + 1 }));
      usePresentationStore.getState().setLastDeck(workspaceId, null);
    }
    void refreshDecks();
  }, [refreshDecks, store, workspaceId]);

  const closeDeck = useCallback(async (): Promise<void> => {
    await flush();
    store().update(workspaceId, (session) => ({ deckPath: null, deck: null, selectedIds: [], selectedSlot: null, run: null, past: [], future: [], warnings: {}, version: session.version + 1 }));
    usePresentationStore.getState().setLastDeck(workspaceId, null);
    void refreshDecks();
  }, [flush, refreshDecks, store, workspaceId]);

  return { decks, loadingList, refreshDecks, openDeck, createDeckFile, deleteDeck, closeDeck, save, flush, pathFor };
}
