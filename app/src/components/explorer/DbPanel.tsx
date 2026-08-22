import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@iconify/react';

export interface SqlQueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

interface DbPanelProps {
  /** Workspace root — scanned for *.db / *.sqlite / *.sqlite3 files. */
  workspacePath: string;
}

const DB_EXTENSIONS = ['.db', '.sqlite', '.sqlite3', '.db3'];

const isDbFile = (name: string): boolean => DB_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

const PREVIEW_SQL = 'SELECT * FROM';

/**
 * Read-only SQLite explorer: pick a .db/.sqlite file in the workspace, browse
 * tables, and run bounded SELECT queries. Uses the bundled rusqlite backend.
 */
export const DbPanel: React.FC<DbPanelProps> = ({ workspacePath }) => {
  const [expanded, setExpanded] = useState(false);
  const [dbFiles, setDbFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [sql, setSql] = useState(PREVIEW_SQL);
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const runSeqRef = useRef(0);

  // Discover DB files once when the workspace changes (shallow scan: root only).
  useEffect(() => {
    if (!expanded) return;
    void invoke<{ name: string }[]>('list_directory_entries', { path: workspacePath })
      .then((entries) =>
        setDbFiles((entries ?? []).map((e) => e.name).filter((name) => isDbFile(name)).sort())
      )
      .catch(() => undefined);
  }, [expanded, workspacePath]);

  const selectDb = useCallback(async (dbPath: string) => {
    setSelected(dbPath);
    setTables([]);
    setResult(null);
    setSql(PREVIEW_SQL);
    setError(null);
    try {
      const list = await invoke<string[]>('sqlite_list_tables', { dbPath });
      setTables(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length > 0) {
        setSql(`${PREVIEW_SQL} ${JSON.stringify(list[0])}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const runQuery = useCallback(async () => {
    if (!selected || !sql.trim()) return;
    const seq = ++runSeqRef.current;
    setBusy(true);
    setError(null);
    try {
      const res = await invoke<SqlQueryResult>('sqlite_query', { dbPath: selected, sql: sql.trim() });
      if (seq !== runSeqRef.current) return;
      setResult(res);
    } catch (err) {
      if (seq !== runSeqRef.current) return;
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === runSeqRef.current) setBusy(false);
    }
  }, [selected, sql]);

  const cellText = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 64);
    return String(value).slice(0, 64);
  };

  const selectedName = selected ? selected.split(/[\\/]/).pop() : null;

  return (
    <div className="shrink-0 border-t border-[var(--border-primary)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-7 w-full cursor-pointer items-center gap-2 px-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
        title="SQLite databases — browse tables and run read-only queries"
      >
        <Icon icon="lucide:database" className="h-3 w-3 shrink-0 text-violet-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
          Databases
        </span>
        {dbFiles.length > 0 && <span className="font-mono text-[8px] tabular-nums text-violet-400/80">{dbFiles.length}</span>}
        <Icon
          icon={expanded ? 'lucide:chevron-down' : 'lucide:chevron-up'}
          className="h-3 w-3 shrink-0 text-[var(--text-secondary)]/50"
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="db-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-[var(--border-primary)]"
          >
            <div className="px-2 py-1.5">
              {/* File picker */}
              {dbFiles.length === 0 && (
                <p className="font-mono text-[8.5px] text-[var(--text-secondary)]/50">
                  No SQLite files (.db / .sqlite / .sqlite3) found in the workspace root.
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {dbFiles.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => void selectDb(`${workspacePath.replace(/[\\/]+$/, '')}/${name}`)}
                    className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded border px-1.5 font-mono text-[8.5px] transition-colors ${
                      selectedName === name
                        ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                        : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon icon="lucide:file-database" className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {name}
                  </button>
                ))}
              </div>

              {selected && (
                <>
                  {/* Tables */}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/50">
                      Tables
                    </span>
                    {tables.map((table) => (
                      <button
                        key={table}
                        type="button"
                        onClick={() => {
                          setSql(`${PREVIEW_SQL} ${JSON.stringify(table)} LIMIT 100`);
                          void runQuery();
                        }}
                        className="rounded border border-[var(--border-primary)] px-1.5 py-0.5 font-mono text-[8.5px] text-violet-300/90 transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 cursor-pointer"
                        title="Preview first 100 rows"
                      >
                        {table}
                      </button>
                    ))}
                  </div>

                  {/* Query box */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      value={sql}
                      onChange={(e) => setSql(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void runQuery();
                      }}
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[9px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]/40 focus:border-violet-500/40"
                      placeholder="SELECT …"
                    />
                    <button
                      type="button"
                      onClick={() => void runQuery()}
                      disabled={busy}
                      className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 font-mono text-[8.5px] font-bold uppercase tracking-widest text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-40"
                    >
                      <Icon icon={busy ? 'svg-spinners:3-dots-scale' : 'lucide:play'} className="h-3 w-3" aria-hidden="true" />
                      Run
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-[7.5px] text-[var(--text-secondary)]/40">
                    Read-only · mutating statements are blocked · max {500} rows
                  </p>

                  {error && <p className="mt-1 font-mono text-[8.5px] text-rose-400">{error}</p>}

                  {/* Result grid */}
                  {result && result.columns.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-auto custom-scrollbar premium-scrollbar rounded border border-[var(--border-primary)]">
                      <table className="w-full border-collapse font-mono text-[8.5px]">
                        <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                          <tr>
                            {result.columns.map((col) => (
                              <th key={col} className="border-b border-[var(--border-primary)] px-1.5 py-1 text-left font-bold text-violet-300/90">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.map((row, rowIdx) => (
                            <tr key={rowIdx} className="odd:bg-[var(--bg-primary)]/40">
                              {row.map((cell, cellIdx) => (
                                <td key={cellIdx} className="border-b border-[var(--border-primary)]/40 px-1.5 py-0.5 text-[var(--text-secondary)]">
                                  {cellText(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {result.rows.length === 0 && (
                            <tr>
                              <td colSpan={result.columns.length} className="px-1.5 py-1 text-[var(--text-secondary)]/50">
                                0 rows
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};