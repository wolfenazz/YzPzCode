import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileContent, FileEntry } from '../../types';
import { useDesignSessionStore } from '../../stores/designSessionStore';
import { useDesignStore } from '../../stores/designStore';
import { designPath, DESIGN_FOLDER, joinPath, parentPath, parseProject, serializeProject, YZDESIGN_EXTENSION } from '../../utils/design/project';
import type { DesignKind, DesignProject } from '../../utils/design/types';

export interface DesignListing {
  path: string;
  title: string;
  modifiedAt: number;
  kind: DesignKind;
  boards: number;
  /** Sizes of the first boards, for the cover. */
  cover: Array<{ width: number; height: number }>;
}

async function listProjects(root: string): Promise<DesignListing[]> {
  const folderPath = joinPath(root, DESIGN_FOLDER);
  if (!(await invoke<boolean>('path_exists', { path: folderPath }).catch(() => false))) return [];
  const folders = await invoke<FileEntry[]>('list_directory_entries', { path: folderPath });
  const found: DesignListing[] = [];
  for (const folder of folders.filter((entry) => entry.isDir && !entry.name.startsWith('.'))) {
    const entries = await invoke<FileEntry[]>('list_directory_entries', { path: folder.path }).catch(() => [] as FileEntry[]);
    for (const entry of entries) {
      if (!entry.isDir && entry.name.toLowerCase().endsWith(YZDESIGN_EXTENSION)) {
        // The file system reports seconds since the epoch.
        found.push({ path: entry.path, title: folder.name, modifiedAt: entry.modifiedAt * 1000, kind: 'app', boards: 0, cover: [] });
      }
    }
  }
  await Promise.all(found.map(async (listing) => {
    try {
      const file = await invoke<FileContent>('read_file_content', { path: listing.path });
      const project = parseProject(file.content);
      listing.title = project.title;
      listing.kind = project.kind;
      listing.boards = project.boards.length;
      listing.cover = project.boards.filter((board) => !board.hidden).slice(0, 4).map((board) => ({ width: board.width, height: board.height }));
    } catch {
      /* the folder name stays as the title */
    }
  }));
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

async function writeSnapshot(path: string, content: string, limit: number): Promise<void> {
  if (limit <= 0) return;
  const historyDir = joinPath(parentPath(path), '.history');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await invoke('write_file_content', { path: joinPath(historyDir, `${stamp}${YZDESIGN_EXTENSION}`), content });
  const entries = await invoke<FileEntry[]>('list_directory_entries', { path: historyDir }).catch(() => [] as FileEntry[]);
  const snapshots = entries.filter((entry) => entry.name.endsWith(YZDESIGN_EXTENSION)).sort((a, b) => b.name.localeCompare(a.name));
  for (const old of snapshots.slice(limit)) await invoke('delete_entry', { path: old.path }).catch(() => undefined);
}

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

/** Loading, creating, autosaving and deleting the Design studio's project files for one workspace. */
export function useDesignDocument(workspaceId: string, root: string) {
  const [projects, setProjects] = useState<DesignListing[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const autosaveTimer = useRef<number | null>(null);
  const lastSnapshot = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const store = useDesignSessionStore.getState;

  const refresh = useCallback(async (): Promise<void> => {
    if (!root) return;
    setLoadingList(true);
    try {
      setProjects(await listProjects(root));
    } catch (error) {
      console.error('Could not list designs:', error);
    } finally {
      setLoadingList(false);
    }
  }, [root]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (): Promise<void> => {
    if (saving.current) await saving.current;
    const session = store().sessions[workspaceId];
    if (!session?.project || !session.projectPath) return;
    const { project, projectPath: path } = session;
    const task = (async () => {
      store().update(workspaceId, { saving: true });
      try {
        const content = serializeProject(project);
        await invoke('write_file_content', { path, content });
        store().update(workspaceId, (current) => ({
          saving: false,
          // Edits made while writing stay dirty.
          dirty: current.project !== project,
          lastSavedAt: Date.now(),
          error: null,
        }));
        if (Date.now() - lastSnapshot.current > SNAPSHOT_INTERVAL_MS) {
          lastSnapshot.current = Date.now();
          void writeSnapshot(path, content, useDesignStore.getState().snapshotLimit).catch(() => undefined);
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
    }, useDesignStore.getState().autosaveDelayMs);
  }, [save]);

  // Every project change autosaves.
  useEffect(() => useDesignSessionStore.subscribe((state, previous) => {
    const now = state.sessions[workspaceId];
    const before = previous.sessions[workspaceId];
    if (now?.project && now.dirty && now.projectPath && now.project !== before?.project) scheduleSave();
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

  const load = useCallback((project: DesignProject, path: string): void => {
    store().update(workspaceId, (session) => ({
      project,
      projectPath: path,
      selectedIds: [],
      dirty: false,
      saving: false,
      error: null,
      fitted: false,
      past: [],
      future: [],
      version: session.version + 1,
    }));
    useDesignStore.getState().setLastProject(workspaceId, path);
  }, [store, workspaceId]);

  const open = useCallback(async (path: string): Promise<void> => {
    await flush();
    try {
      const file = await invoke<FileContent>('read_file_content', { path });
      load(parseProject(file.content), path);
    } catch (error) {
      store().update(workspaceId, { error: error instanceof Error ? error.message : String(error) });
      if (useDesignStore.getState().lastProjectByWorkspace[workspaceId] === path) useDesignStore.getState().setLastProject(workspaceId, null);
    }
  }, [flush, load, store, workspaceId]);

  /** Writes a new project file and opens it. */
  const create = useCallback(async (project: DesignProject): Promise<string> => {
    await flush();
    const taken = new Set(projects.map((entry) => entry.path.toLowerCase()));
    const path = designPath(root, project.title, taken);
    await invoke('write_file_content', { path, content: serializeProject(project) });
    load(project, path);
    void refresh();
    return path;
  }, [flush, load, projects, refresh, root]);

  const remove = useCallback(async (path: string): Promise<void> => {
    await invoke('delete_entry', { path: parentPath(path) });
    if (store().sessions[workspaceId]?.projectPath === path) {
      store().update(workspaceId, (session) => ({ project: null, projectPath: null, selectedIds: [], dirty: false, past: [], future: [], version: session.version + 1 }));
      useDesignStore.getState().setLastProject(workspaceId, null);
    }
    void refresh();
  }, [refresh, store, workspaceId]);

  const close = useCallback(async (): Promise<void> => {
    await flush();
    store().update(workspaceId, (session) => ({ project: null, projectPath: null, selectedIds: [], past: [], future: [], fitted: false, version: session.version + 1 }));
    useDesignStore.getState().setLastProject(workspaceId, null);
    void refresh();
  }, [flush, refresh, store, workspaceId]);

  return { projects, loadingList, refresh, open, create, remove, close, save, flush };
}
