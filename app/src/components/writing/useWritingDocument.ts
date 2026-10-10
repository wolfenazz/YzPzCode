import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Editor } from '@tiptap/react';
import type { FileContent, FileEntry } from '../../types';
import { useWritingSessionStore } from '../../stores/writingSessionStore';
import { useWritingStore } from '../../stores/writingStore';
import {
  fileName,
  joinPath,
  parentPath,
  parseDoc,
  REPORTS_FOLDER,
  reportPath,
  serializeDoc,
  YZDOC_EXTENSION,
} from '../../utils/writing/document';
import type { DocNode, YzDoc } from '../../utils/writing/types';

export interface ReportListing {
  path: string;
  title: string;
  modifiedAt: number;
}

async function listReports(workspacePath: string): Promise<ReportListing[]> {
  const root = joinPath(workspacePath, REPORTS_FOLDER);
  if (!(await invoke<boolean>('path_exists', { path: root }).catch(() => false))) return [];
  const folders = await invoke<FileEntry[]>('list_directory_entries', { path: root });
  const reports: ReportListing[] = [];
  for (const folder of folders.filter((entry) => entry.isDir)) {
    const entries = await invoke<FileEntry[]>('list_directory_entries', { path: folder.path }).catch(() => [] as FileEntry[]);
    for (const entry of entries) {
      if (!entry.isDir && entry.name.toLowerCase().endsWith(YZDOC_EXTENSION)) {
        // The file system reports seconds since the epoch.
        reports.push({ path: entry.path, title: folder.name, modifiedAt: entry.modifiedAt * 1000 });
      }
    }
  }
  // Titles come from the files; read them lazily but in parallel.
  await Promise.all(reports.map(async (report) => {
    try {
      const file = await invoke<FileContent>('read_file_content', { path: report.path });
      report.title = parseDoc(file.content).meta.title;
    } catch {
      report.title = fileName(report.path).replace(YZDOC_EXTENSION, '');
    }
  }));
  return reports.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

async function writeSnapshot(docPath: string, content: string, limit: number): Promise<void> {
  if (limit <= 0) return;
  const historyDir = joinPath(parentPath(docPath), '.history');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await invoke('write_file_content', { path: joinPath(historyDir, `${stamp}${YZDOC_EXTENSION}`), content });
  const entries = await invoke<FileEntry[]>('list_directory_entries', { path: historyDir }).catch(() => [] as FileEntry[]);
  const snapshots = entries.filter((entry) => entry.name.endsWith(YZDOC_EXTENSION)).sort((a, b) => b.name.localeCompare(a.name));
  for (const old of snapshots.slice(limit)) {
    await invoke('delete_entry', { path: old.path }).catch(() => undefined);
  }
}

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

export function useWritingDocument(workspaceId: string, workspacePath: string, getEditor: () => Editor | null) {
  const [reports, setReports] = useState<ReportListing[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [pendingContent, setPendingContent] = useState<{ key: string; content: DocNode } | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const lastSnapshot = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const update = useWritingSessionStore.getState().update;

  const refreshReports = useCallback(async (): Promise<void> => {
    setLoadingList(true);
    try {
      setReports(await listReports(workspacePath));
    } catch (error) {
      console.error('Could not list reports:', error);
    } finally {
      setLoadingList(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void refreshReports();
  }, [refreshReports]);

  /** Builds the file from the session and the live editor content. */
  const snapshotDoc = useCallback((contentOverride?: DocNode): YzDoc | null => {
    const session = useWritingSessionStore.getState().sessions[workspaceId];
    const editor = getEditor();
    // Never write a document without its content.
    if (!session?.meta || !session.brief || (!editor && !contentOverride)) return null;
    const title = session.brief.details.title.trim() || session.meta.title;
    return {
      format: 'yzdoc',
      version: 1,
      meta: { ...session.meta, title },
      brief: session.brief,
      outline: session.outline,
      bibliography: session.bibliography,
      content: contentOverride ?? (editor!.getJSON() as DocNode),
    };
  }, [getEditor, workspaceId]);

  const save = useCallback(async (contentOverride?: DocNode): Promise<void> => {
    if (saving.current) await saving.current;
    const session = useWritingSessionStore.getState().sessions[workspaceId];
    const doc = snapshotDoc(contentOverride);
    if (!doc || !session?.docPath) return;
    const path = session.docPath;
    const task = (async () => {
      update(workspaceId, { saving: true, error: null });
      try {
        const content = serializeDoc(doc);
        await invoke('write_file_content', { path, content });
        update(workspaceId, (current) => ({
          saving: false,
          dirty: false,
          lastSavedAt: Date.now(),
          meta: current.meta ? { ...current.meta, title: doc.meta.title, updatedAt: Date.now() } : current.meta,
        }));
        if (Date.now() - lastSnapshot.current > SNAPSHOT_INTERVAL_MS) {
          lastSnapshot.current = Date.now();
          void writeSnapshot(path, content, useWritingStore.getState().snapshotLimit).catch(() => undefined);
        }
      } catch (error) {
        update(workspaceId, { saving: false, error: `Could not save: ${error instanceof Error ? error.message : String(error)}` });
      }
    })();
    saving.current = task;
    await task;
    saving.current = null;
  }, [snapshotDoc, update, workspaceId]);

  const scheduleSave = useCallback((): void => {
    update(workspaceId, { dirty: true });
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      void save();
    }, useWritingStore.getState().autosaveDelayMs);
  }, [save, update, workspaceId]);

  // Brief edits (cover fields, style) mark the session dirty; save them too.
  useEffect(() => useWritingSessionStore.subscribe((state, previous) => {
    const now = state.sessions[workspaceId];
    const before = previous.sessions[workspaceId];
    if (now?.dirty && now.docPath && (now.brief !== before?.brief || now.outline !== before?.outline || now.bibliography !== before?.bibliography)) {
      scheduleSave();
    }
  }), [scheduleSave, workspaceId]);

  const flush = useCallback(async (): Promise<void> => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (useWritingSessionStore.getState().sessions[workspaceId]?.dirty) await save();
  }, [save, workspaceId]);

  useEffect(() => () => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
  }, []);

  /** Called with the editor's last content just before it is destroyed. */
  const saveOnDispose = useCallback((content: DocNode): void => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (useWritingSessionStore.getState().sessions[workspaceId]?.dirty) void save(content);
  }, [save, workspaceId]);

  const loadDoc = useCallback((doc: YzDoc, path: string): void => {
    update(workspaceId, (session) => ({
      docPath: path,
      meta: doc.meta,
      brief: doc.brief,
      outline: doc.outline,
      bibliography: doc.bibliography,
      dirty: false,
      saving: false,
      error: null,
      run: null,
      contentVersion: session.contentVersion + 1,
    }));
    setPendingContent({ key: `${path}#${Date.now()}`, content: doc.content });
    useWritingStore.getState().setLastDoc(workspaceId, path);
  }, [update, workspaceId]);

  const openReport = useCallback(async (path: string): Promise<void> => {
    await flush();
    try {
      const file = await invoke<FileContent>('read_file_content', { path });
      loadDoc(parseDoc(file.content), path);
    } catch (error) {
      update(workspaceId, { error: error instanceof Error ? error.message : String(error) });
      if (useWritingStore.getState().lastDocByWorkspace[workspaceId] === path) useWritingStore.getState().setLastDoc(workspaceId, null);
    }
  }, [flush, loadDoc, update, workspaceId]);

  /** Writes a new report file and opens it. */
  const createReport = useCallback(async (doc: YzDoc): Promise<string> => {
    await flush();
    const taken = new Set(reports.map((report) => report.path.toLowerCase()));
    const path = reportPath(workspacePath, doc.meta.title, taken);
    await invoke('write_file_content', { path, content: serializeDoc(doc) });
    loadDoc(doc, path);
    void refreshReports();
    return path;
  }, [flush, loadDoc, refreshReports, reports, workspacePath]);

  const deleteReport = useCallback(async (path: string): Promise<void> => {
    const session = useWritingSessionStore.getState().sessions[workspaceId];
    await invoke('delete_entry', { path: parentPath(path) });
    if (session?.docPath === path) {
      update(workspaceId, (current) => ({ docPath: null, meta: null, brief: null, outline: [], bibliography: [], dirty: false, run: null, contentVersion: current.contentVersion + 1 }));
      setPendingContent({ key: `closed#${Date.now()}`, content: { type: 'doc', content: [{ type: 'paragraph' }] } });
      useWritingStore.getState().setLastDoc(workspaceId, null);
    }
    void refreshReports();
  }, [refreshReports, update, workspaceId]);

  return {
    reports,
    loadingList,
    refreshReports,
    openReport,
    createReport,
    deleteReport,
    loadDoc,
    save,
    saveOnDispose,
    scheduleSave,
    flush,
    snapshotDoc,
    pendingContent,
  };
}
