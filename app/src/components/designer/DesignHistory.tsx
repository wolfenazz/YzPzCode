import React from 'react';
import type { DesignerHistoryEntry } from './types';

interface DesignHistoryProps {
  entries: DesignerHistoryEntry[];
  activeDesignId: string | null;
  onRestore: (entryId: string) => void;
  onUndo: () => void;
}

const formatTime = (timestamp: number): string =>
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);

export const DesignHistory: React.FC<DesignHistoryProps> = ({
  entries,
  activeDesignId,
  onRestore,
  onUndo,
}) => (
  <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70">
    <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
      <div>
        <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-100">History</h2>
        <p className="mt-1 text-[10px] text-zinc-500">Undo or restore previous generated versions.</p>
      </div>
      <button
        onClick={onUndo}
        disabled={entries.length < 2}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
        title="Undo to previous design"
        aria-label="Undo to previous design"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l-4-4 4-4M5 10h8a6 6 0 110 12h-1" />
        </svg>
      </button>
    </div>

    <div className="max-h-[230px] space-y-1.5 overflow-y-auto p-3">
      {entries.length === 0 ? (
        <p className="px-1 py-3 text-[10px] leading-4 text-zinc-600">Generated designs will appear here.</p>
      ) : (
        entries.map((entry) => {
          const isActive = entry.design.id === activeDesignId;
          return (
            <button
              key={entry.id}
              onClick={() => onRestore(entry.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                isActive
                  ? 'border-emerald-500/35 bg-emerald-500/10'
                  : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[10px] font-bold text-zinc-300">{entry.label}</span>
                <span className="mt-0.5 block text-[9px] uppercase tracking-[0.14em] text-zinc-600">{formatTime(entry.timestamp)}</span>
              </span>
              {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
            </button>
          );
        })
      )}
    </div>
  </section>
);
