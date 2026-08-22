import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DiffEditor } from '@monaco-editor/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowBendUpLeft, ArrowsLeftRight, ArrowClockwise, ClockCounterClockwise, FileText, Warning, X } from '@phosphor-icons/react';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import type { FileBackupInfo, GitFileDiff } from '../../types';

interface DiffViewerProps {
  workspacePath: string;
  /** Repo-relative or absolute file path to diff (working tree vs HEAD). */
  filePath: string;
  fileName: string;
  onClose: () => void;
  /** Called after a discard/commit so the caller refreshes status. */
  onChanged?: () => void;
}

/**
 * Side-by-side working-tree diff for one file (Monaco DiffEditor), with
 * Discard (revert to HEAD) and Commit buttons. Untracked files diff against
 * an empty original.
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({ workspacePath, filePath, fileName, onClose, onChanged }) => {
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [backups, setBackups] = useState<FileBackupInfo[]>([]);
  const effectiveTheme = useEffectiveTheme();
  const language = useMemo(() => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return ext;
  }, [fileName]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<GitFileDiff>('git_file_diff', { workspacePath, filePath });
      setDiff(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspacePath, filePath]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDiscard = useCallback(async () => {
    if (!diff || busy) return;
    const confirmed = window.confirm(
      `Discard all changes to ${fileName}?\n\nThis restores the file to its last committed version. This cannot be undone.`
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await invoke('git_discard_file', { workspacePath, filePath });
      setNotice('Changes discarded.');
      onChanged?.();
      // Refresh the diff to show the restored file.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [diff, busy, workspacePath, filePath, fileName, load, onChanged]);

  // ── Content history (.yzpzcode/history) ─────────────────────────────
  const loadBackups = useCallback(async () => {
    try {
      const list = await invoke<FileBackupInfo[]>('list_file_backups', { workspacePath, filePath });
      setBackups(Array.isArray(list) ? list : []);
    } catch {
      setBackups([]);
    }
  }, [workspacePath, filePath]);

  const handleRestoreBackup = useCallback(
    async (name: string) => {
      const confirmed = window.confirm(
        `Restore ${fileName} from a saved snapshot (${new Date(Number(name.split('.')[0]) || Date.now()).toLocaleString()})?\n\nThe current version will be kept as another snapshot.`
      );
      if (!confirmed) return;
      setBusy(true);
      setError(null);
      try {
        await invoke('restore_file_backup', { workspacePath, filePath, backupName: name });
        setNotice('Snapshot restored.');
        onChanged?.();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [workspacePath, filePath, fileName, load, onChanged]
  );

  const editorTheme = effectiveTheme === 'light' ? 'light' : 'vs-dark';

  return (
    <div className="flex h-full min-h-0 flex-col bg-theme-card">
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border-primary)] px-2">
        <ArrowsLeftRight size={14} className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-bold text-[var(--text-primary)]">
          {fileName}
        </span>
        <span className="font-mono text-[8.5px] uppercase tracking-widest text-[var(--text-secondary)]/50">
          working tree vs HEAD
        </span>
        {!diff?.original && diff && (
          <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 font-mono text-[8px] font-bold uppercase text-sky-400">
            untracked
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setShowHistory((v) => !v);
            if (!showHistory) void loadBackups();
          }}
          title="Saved snapshots (.yzpzcode/history)"
          className={`flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[8.5px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${
            showHistory
              ? 'bg-[var(--accent-light)]/20 text-[var(--accent)]'
              : 'text-[var(--text-secondary)]/60 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <ClockCounterClockwise size={12} aria-hidden="true" />
          History
        </button>
        <button
          type="button"
          onClick={() => void load()}
          title="Refresh diff"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--text-secondary)]/60 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ArrowClockwise size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close diff"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--text-secondary)]/60 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {loading && (
          <div className="flex h-full items-center justify-center font-mono text-[10px] text-[var(--text-secondary)]/50">
            Loading diff…
          </div>
        )}
        {!loading && error && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <Warning size={20} weight="fill" className="text-rose-400" aria-hidden="true" />
            <p className="max-w-sm font-mono text-[10px] text-[var(--text-secondary)]">{error}</p>
          </div>
        )}
        {!loading && !error && diff && (
          <DiffEditor
            original={diff.original}
            modified={diff.current}
            language={language}
            theme={editorTheme}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              renderOverviewRuler: false,
              automaticLayout: true,
              diffWordWrap: 'on',
            }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-col border-t border-[var(--border-primary)]">
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/60"
            >
              <div className="max-h-32 overflow-y-auto custom-scrollbar px-2 py-1.5">
                {backups.length === 0 && (
                  <p className="px-1 py-1 font-mono text-[8.5px] text-[var(--text-secondary)]/50">
                    No snapshots yet. Approved agent edits and manual saves are snapshotted automatically.
                  </p>
                )}
                {backups.map((backup) => (
                  <div key={backup.name} className="flex items-center gap-2 px-1 py-1">
                    <FileText size={12} className="shrink-0 text-[var(--text-secondary)]/50" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-[var(--text-secondary)]">
                      {new Date(backup.timestampMs).toLocaleString()}
                    </span>
                    <span className="font-mono text-[8px] text-[var(--text-secondary)]/40">
                      {(backup.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRestoreBackup(backup.name)}
                      disabled={busy}
                      className="inline-flex h-5 cursor-pointer items-center gap-1 rounded border border-[var(--accent-border)] bg-[var(--accent-light)]/10 px-1.5 font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--accent)] transition-colors hover:bg-[var(--accent-light)]/25 disabled:opacity-40"
                    >
                      <ArrowBendUpLeft size={10} aria-hidden="true" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2 px-2 py-1.5">
          {notice && <span className="font-mono text-[9px] text-emerald-400">{notice}</span>}
          {error && <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-rose-400">{error}</span>}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleDiscard()}
              disabled={busy || loading}
              className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 font-mono text-[8.5px] font-bold uppercase tracking-widest text-rose-400 transition-colors hover:bg-rose-500/15 disabled:cursor-default disabled:opacity-40"
            >
              <ArrowBendUpLeft size={12} aria-hidden="true" />
              Discard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
