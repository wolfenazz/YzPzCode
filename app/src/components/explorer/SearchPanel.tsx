import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@iconify/react';
import { useAppStore } from '../../stores/appStore';
import { useFileEditor } from '../../hooks/useFileEditor';
import type { FileEntry, SearchResult } from '../../types';

interface SearchPanelProps {
  workspacePath: string;
  /** Query/focus control from a Ctrl+Shift+F shortcut (bump to trigger). */
  externalOpenSignal: number;
}

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 300;

/**
 * Cross-file content search ("find in files"). Walks the workspace via the
 * `search_files` Rust command honoring ignore rules, renders bounded results,
 * and opens the file at the matching line in the editor.
 */
export const SearchPanel: React.FC<SearchPanelProps> = ({ workspacePath, externalOpenSignal }) => {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const { openFile } = useFileEditor();
  const setEditorRevealLine = useAppStore((s) => s.setEditorRevealLine);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        setSearched(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const found = await invoke<SearchResult[]>('search_files', {
          dirPath: workspacePath,
          query: trimmed,
          caseSensitive,
          maxResults: MAX_RESULTS,
        });
        setResults(Array.isArray(found) ? found : []);
        setSearched(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [workspacePath, caseSensitive]
  );

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // External Ctrl+Shift+F: expand + focus.
  useEffect(() => {
    if (externalOpenSignal > 0) {
      setExpanded(true);
    }
  }, [externalOpenSignal]);

  useEffect(() => {
    if (expanded) {
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [expanded]);

  const handleOpen = useCallback(
    (result: SearchResult) => {
      const name = result.path.split('/').pop() || result.path;
      const entry: FileEntry = {
        name,
        path: result.path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(result.path)
          ? result.path
          : `${workspacePath.replace(/[\\/]+$/, '')}/${result.path}`,
        isDir: false,
        size: 0,
        modifiedAt: Date.now(),
        extension: name.includes('.') ? name.split('.').pop() || null : null,
      };
      void openFile(entry);
      // The editor reveals this line once the tab mounts.
      setEditorRevealLine({ path: entry.path, line: result.line });
    },
    [openFile, setEditorRevealLine, workspacePath]
  );

  const groupLabel = (path: string): string => path.split('/').slice(0, -1).join('/') || '.';

  return (
    <div className="shrink-0 border-t border-[var(--border-primary)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-7 w-full cursor-pointer items-center gap-2 px-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
        title="Search files (Ctrl+Shift+F)"
      >
        <Icon icon="lucide:search" className="h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
          Find in Files
        </span>
        {searching && <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent text-[var(--text-secondary)]/50" />}
        {searched && !searching && (
          <span className="font-mono text-[8px] tabular-nums text-[var(--text-secondary)]/50">
            {results.length}
          </span>
        )}
        <Icon
          icon={expanded ? 'lucide:chevron-down' : 'lucide:chevron-up'}
          className="h-3 w-3 shrink-0 text-[var(--text-secondary)]/50"
          aria-hidden="true"
        />
      </button>
      <span className="sr-only">
        <kbd>Ctrl+Shift+F</kbd>
      </span>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="search-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-[var(--border-primary)]"
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <div className="relative min-w-0 flex-1">
                <Icon icon="lucide:search" className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-secondary)]/40" aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setExpanded(false);
                    }
                  }}
                  placeholder="Search across files…"
                  className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] py-1 pl-7 pr-2 font-mono text-[9.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]/40 focus:border-sky-500/40"
                />
              </div>
              <button
                type="button"
                onClick={() => setCaseSensitive((v) => !v)}
                title={caseSensitive ? 'Case-sensitive: on' : 'Case-sensitive: off'}
                className={`inline-flex h-6 shrink-0 cursor-pointer items-center rounded-md border px-1.5 font-mono text-[8px] font-bold uppercase tracking-widest transition-colors ${
                  caseSensitive
                    ? 'border-sky-500/50 bg-sky-500/10 text-sky-400'
                    : 'border-[var(--border-primary)] text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)]'
                }`}
              >
                Aa
              </button>
            </div>

            {/* Results */}
            <div className="max-h-48 overflow-y-auto custom-scrollbar premium-scrollbar border-t border-[var(--border-primary)]">
              {query.trim() && !searching && results.length === 0 && !error && (
                <p className="px-3 py-2 font-mono text-[8.5px] text-[var(--text-secondary)]/50">
                  No matches for “{query.trim()}”
                </p>
              )}
              {error && (
                <p className="px-3 py-2 font-mono text-[8.5px] text-rose-400">{error}</p>
              )}
              {searched && results.length > 0 && (
                <p className="px-3 py-1 font-mono text-[8px] text-[var(--text-secondary)]/40">
                  {results.length} match{results.length !== 1 ? 'es' : ''} across {new Set(results.map((r) => r.path)).size} file{new Set(results.map((r) => r.path)).size !== 1 ? 's' : ''}
                </p>
              )}
              {results.map((result, idx) => (
                <React.Fragment key={`${result.path}:${result.line}`}>
                  {idx === 0 || groupLabel(results[idx - 1].path) !== groupLabel(result.path) ? (
                    <div className="flex items-center gap-1.5 px-3 pt-1.5 font-mono text-[8px] font-bold uppercase tracking-widest text-sky-400/70">
                      <Icon icon="lucide:file" className="h-2.5 w-2.5" aria-hidden="true" />
                      {groupLabel(result.path)}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleOpen(result)}
                    className="group/result flex w-full items-start gap-2 px-3 py-1 text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
                    title={`${result.path}:${result.line}`}
                  >
                    <span className="mt-px shrink-0 font-mono text-[8px] tabular-nums text-[var(--text-secondary)]/45 group-hover/result:text-sky-400">
                      {result.line}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[9px] leading-relaxed text-[var(--text-secondary)] group-hover/result:text-[var(--text-primary)]">
                      {result.text}
                    </span>
                  </button>
                </React.Fragment>
              ))}
              {!query.trim() && (
                <p className="px-3 py-2 font-mono text-[8.5px] text-[var(--text-secondary)]/50">
                  Type to search every file in the workspace (node_modules and build output are skipped).
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};