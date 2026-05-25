import React from 'react';
import { Icon } from '@iconify/react';

interface ApplyModeToolbarProps {
  onUndo: () => void;
  onKeep: () => void;
  onCopyCss: () => void;
}

export const ApplyModeToolbar: React.FC<ApplyModeToolbarProps> = ({
  onUndo,
  onKeep,
  onCopyCss,
}) => {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 backdrop-blur-sm px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      <button
        onClick={onUndo}
        className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 transition-colors cursor-pointer"
      >
        <Icon icon="material-symbols:undo-rounded" className="h-3 w-3" aria-hidden="true" />
        undo
      </button>
      <button
        onClick={onKeep}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 transition-colors cursor-pointer"
      >
        <Icon icon="material-symbols:check-rounded" className="h-3 w-3" aria-hidden="true" />
        keep
      </button>
      <button
        onClick={onCopyCss}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-primary)] hover:border-zinc-600 hover:bg-[var(--bg-primary)] transition-colors cursor-pointer"
      >
        <Icon icon="material-symbols:content-copy-outline-rounded" className="h-3 w-3" aria-hidden="true" />
        copy css
      </button>
    </div>
  );
};
