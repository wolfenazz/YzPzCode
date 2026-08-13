import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from '../types';

/** A directory/file entry with its workspace-relative path (forward slashes). */
export interface MentionItem extends FileEntry {
  relPath: string;
  /** Parent directory (relative, forward slashes); '' when at the root. */
  dir: string;
  /** Character positions in `relPath` matched by the fuzzy query (empty in drill view). */
  indices: Set<number>;
}

/** Live state of the `@` mention popup. `start` = index of the triggering `@`. */
export interface MentionState {
  start: number;
  /** Directory being browsed ('' when doing a whole-workspace fuzzy search). */
  basePath: string;
  /** Last path segment being filtered ('' when showing a full directory). */
  filter: string;
  items: MentionItem[];
}

export interface UseAgentMentionResult {
  mention: MentionState | null;
  loading: boolean;
  selectedIndex: number;
  move: (delta: 1 | -1) => void;
  close: () => void;
  update: (value: string, cursorPos: number) => void;
  selectCurrent: () => { item: MentionItem; relPath: string } | null;
  setSelectedIndex: (i: number) => void;
}

const MAX_RESULTS = 80;

/** Root entry with a lazily computed relative path, cached per workspace. */
interface TreeEntry {
  entry: FileEntry;
  relPath: string;
}

const toRelPath = (absPath: string, workspacePath: string): string => {
  const stripped = absPath.startsWith(workspacePath)
    ? absPath.slice(workspacePath.length)
    : absPath;
  return stripped.replace(/^[\\/]+/, '').replace(/\\/g, '/');
};

const parentDir = (relPath: string): string => {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? '' : relPath.slice(0, idx);
};

/**
 * Fuzzy-match `query` against `text`. Returns whether it matched and a score
 * (path-segment starts and camelCase boundaries rank higher), plus the matched
 * character positions so callers can highlight them.
 */
function fuzzyMatch(query: string, text: string): { match: boolean; score: number; indices: Set<number> } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  const indices = new Set<number>();

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.add(ti);
      if (ti === 0 || t[ti - 1] === '/' || t[ti - 1] === '\\') {
        score += 10;
      } else if (ti > 0 && text[ti] === text[ti].toUpperCase() && text[ti - 1] === text[ti - 1].toLowerCase()) {
        score += 8;
      } else {
        score += 1;
      }
      qi++;
    }
  }

  return { match: qi === q.length, score, indices };
}

/**
 * `@` file-mention autocomplete for the agent input.
 *
 * Loads the whole workspace tree once (files + directories, noise dirs
 * excluded) and then supports two modes:
 *  - a whole-workspace fuzzy search across every relative path, and
 *  - a directory drill-in when the query contains a `/` (e.g. `@src/compo`).
 */
export function useAgentMention(workspacePath: string): UseAgentMentionResult {
  const [mention, setMention] = useState<MentionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndexState] = useState(0);

  const mentionRef = useRef<MentionState | null>(null);
  const selectedIndexRef = useRef(0);
  const requestIdRef = useRef(0);
  const treeRef = useRef<{ workspacePath: string; entries: TreeEntry[] } | null>(null);
  const lastUpdateRef = useRef<{ value: string; cursorPos: number } | null>(null);

  const close = useCallback(() => {
    requestIdRef.current += 1;
    mentionRef.current = null;
    selectedIndexRef.current = 0;
    setMention(null);
    setLoading(false);
    setSelectedIndexState(0);
  }, []);

  const setSelectedIndex = useCallback((i: number) => {
    selectedIndexRef.current = i;
    setSelectedIndexState(i);
  }, []);

  const toItem = useCallback(
    (t: TreeEntry, indices: Set<number>): MentionItem => ({
      ...t.entry,
      relPath: t.relPath,
      dir: parentDir(t.relPath),
      indices,
    }),
    []
  );

  const setState = useCallback((next: MentionState) => {
    mentionRef.current = next;
    setMention(next);
    setSelectedIndex(0);
  }, [setSelectedIndex]);

  const rootChildren = useCallback(
    (tree: TreeEntry[]): MentionItem[] =>
      tree
        .filter((t) => parentDir(t.relPath) === '')
        .sort((a, b) => {
          if (a.entry.isDir !== b.entry.isDir) return a.entry.isDir ? -1 : 1;
          return a.entry.name.toLowerCase().localeCompare(b.entry.name.toLowerCase());
        })
        .map((t) => toItem(t, new Set())),
    [toItem]
  );

  const buildItems = useCallback(
    (tree: TreeEntry[], query: string): { basePath: string; filter: string; items: MentionItem[] } => {
      const lastSep = Math.max(query.lastIndexOf('/'), query.lastIndexOf('\\'));

      // Bare `@` (or `@` + only separators) browses the directory tree from the root.
      if (query === '' || query.replace(/[/\\]/g, '') === '') {
        return { basePath: '', filter: '', items: rootChildren(tree) };
      }

      if (lastSep === -1) {
        // Whole-workspace fuzzy search over every relative path.
        const q = query.toLowerCase();
        const scored: { item: MentionItem; score: number }[] = [];
        for (const t of tree) {
          const r = fuzzyMatch(query, t.relPath);
          if (!r.match) continue;
          const nameMatch = fuzzyMatch(query, t.entry.name).match;
          const dirMatch = parentDir(t.relPath).toLowerCase().includes(q);
          const score =
            r.score +
            (nameMatch ? 60 : 0) +
            (t.entry.isDir ? 8 : 0) +
            (dirMatch ? 6 : 0);
          scored.push({ item: toItem(t, r.indices), score });
        }
        scored.sort((a, b) => b.score - a.score || a.item.relPath.localeCompare(b.item.relPath));
        return { basePath: '', filter: query, items: scored.slice(0, MAX_RESULTS).map((s) => s.item) };
      }

      // Drill view: list direct children of the path prefix, filtered by the
      // final segment (prefix + substring, keeps navigation predictable).
      const basePath = query.slice(0, lastSep).replace(/\\/g, '/');
      const filter = query.slice(lastSep + 1);
      const needle = filter.toLowerCase();
      const children = tree
        .filter((t) => parentDir(t.relPath) === basePath)
        .filter((t) => needle === '' || t.entry.name.toLowerCase().includes(needle))
        .sort((a, b) => {
          if (a.entry.isDir !== b.entry.isDir) return a.entry.isDir ? -1 : 1;
          return a.entry.name.toLowerCase().localeCompare(b.entry.name.toLowerCase());
        });
      return {
        basePath,
        filter,
        items: children.slice(0, MAX_RESULTS).map((t) => toItem(t, new Set())),
      };
    },
    [toItem, rootChildren]
  );

  const loadTree = useCallback(
    (value: string, cursorPos: number, atIdx: number) => {
      requestIdRef.current += 1;
      const id = requestIdRef.current;
      setLoading(true);
      setState({ start: atIdx, basePath: '', filter: value.slice(atIdx + 1, cursorPos), items: [] });
      const fullPath = workspacePath;
      invoke<FileEntry[]>('list_all_entries', { path: fullPath })
        .then((entries) => {
          if (id !== requestIdRef.current) return;
          treeRef.current = {
            workspacePath,
            entries: entries.map((entry) => ({
              entry,
              relPath: toRelPath(entry.path, workspacePath),
            })),
          };
          setLoading(false);
          const pending = lastUpdateRef.current;
          if (pending) {
            // Re-run the update now that the tree is available; the trigger is
            // still the same `@` so the mention start is preserved.
            updateRef.current(pending.value, pending.cursorPos);
          }
        })
        .catch(() => {
          if (id !== requestIdRef.current) return;
          setLoading(false);
          close();
        });
    },
    [workspacePath, setState, close]
  );

  // Stable ref so loadTree can re-invoke the latest update after the tree loads.
  const updateRef = useRef<(value: string, cursorPos: number) => void>(() => undefined);

  const update = useCallback(
    (value: string, cursorPos: number) => {
      lastUpdateRef.current = { value, cursorPos };
      if (!workspacePath) {
        close();
        return;
      }

      // 1. Find the last `@` at or before the cursor. It must start the string
      //    or be preceded by whitespace, otherwise it is not a mention trigger.
      const before = value.slice(0, cursorPos);
      let atIdx = -1;
      for (let i = before.length - 1; i >= 0; i--) {
        if (before.charCodeAt(i) === 64 /* '@' */) {
          atIdx = i;
          break;
        }
      }
      if (atIdx === -1) {
        close();
        return;
      }
      if (atIdx > 0 && !/\s/.test(before[atIdx - 1])) {
        close();
        return;
      }

      // 2. A space inside the query means the mention is over.
      const query = before.slice(atIdx + 1);
      if (query.includes(' ')) {
        close();
        return;
      }

      // 3. Load the tree on first use (then cache per workspace).
      const tree = treeRef.current;
      if (!tree || tree.workspacePath !== workspacePath) {
        loadTree(value, cursorPos, atIdx);
        return;
      }

      setLoading(false);
      const { basePath, filter, items } = buildItems(tree.entries, query);
      setState({ start: atIdx, basePath, filter, items });
    },
    [workspacePath, close, buildItems, setState, loadTree]
  );

  updateRef.current = update;

  // Preload the workspace tree so the first `@` is instant. Reset the cache
  // when the workspace changes.
  useEffect(() => {
    treeRef.current = null;
    requestIdRef.current += 1;
    if (!workspacePath) return;
    const id = requestIdRef.current;
    invoke<FileEntry[]>('list_all_entries', { path: workspacePath })
      .then((entries) => {
        if (id !== requestIdRef.current) return;
        treeRef.current = {
          workspacePath,
          entries: entries.map((entry) => ({
            entry,
            relPath: toRelPath(entry.path, workspacePath),
          })),
        };
      })
      .catch(() => undefined);
  }, [workspacePath]);

  const move = useCallback((delta: 1 | -1) => {
    const len = mentionRef.current?.items.length ?? 0;
    if (len === 0) return;
    const next = (selectedIndexRef.current + delta + len) % len;
    selectedIndexRef.current = next;
    setSelectedIndexState(next);
  }, []);

  const selectCurrent = useCallback((): { item: MentionItem; relPath: string } | null => {
    const m = mentionRef.current;
    if (!m || m.items.length === 0) return null;
    const idx = Math.min(selectedIndexRef.current, m.items.length - 1);
    const item = m.items[idx];
    return { item, relPath: item.relPath };
  }, []);

  return {
    mention,
    loading,
    selectedIndex,
    move,
    close,
    update,
    selectCurrent,
    setSelectedIndex,
  };
}
