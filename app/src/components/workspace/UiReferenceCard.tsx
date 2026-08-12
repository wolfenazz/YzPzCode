import React from 'react';
import { Icon } from '@iconify/react';
import type { CapturedUiElementReference } from '../../types';

interface UiReferenceCardProps {
  reference: CapturedUiElementReference;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onCopyJson: () => void;
}

export const UiReferenceCard: React.FC<UiReferenceCardProps> = ({
  reference,
  isActive,
  onSelect,
  onRemove,
  onCopyJson,
}) => {
  const previewStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '40px',
    minWidth: reference.layout.width.includes('%') ? '100%' : '140px',
    maxWidth: '100%',
    padding: reference.spacing.padding || '10px 14px',
    borderRadius: reference.spacing.borderRadius || '12px',
    background: reference.visuals.background || '#303030',
    color: reference.visuals.color || '#faf8f1',
    border: reference.visuals.border || '1px solid rgba(255,255,255,0.08)',
    boxShadow: reference.visuals.boxShadow || 'none',
    fontFamily: reference.typography.fontFamily || 'inherit',
    fontSize: reference.typography.fontSize || '11px',
    fontWeight: reference.typography.fontWeight || '600',
    opacity: Number(reference.visuals.opacity || '1') || 1,
  };

  return (
    <div className={`rounded-xl border p-2.5 transition-all ${
      isActive
        ? 'border-cyan-500/35 bg-cyan-500/8 shadow-[0_0_18px_rgba(34,211,238,0.12)]'
        : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 hover:border-[var(--accent)]/30'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onSelect}
          className="min-w-0 flex-1 text-left cursor-pointer"
          aria-pressed={isActive}
        >
          <div className="flex items-center gap-1.5">
            <Icon icon="material-symbols:view-in-ar-rounded" className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden="true" />
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">
              {reference.componentLabel}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[var(--accent)]/55">
            <span>{reference.tagName}</span>
            <span className="h-1 w-1 rounded-full bg-[var(--accent)]/25" />
            <span>{reference.layout.display}</span>
          </div>
        </button>
        <button
          onClick={onRemove}
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-[var(--accent)]/50 transition-colors hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer"
          aria-label="Remove UI reference"
        >
          <Icon icon="material-symbols:close-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <button
        onClick={onSelect}
        className="mt-2 block w-full cursor-pointer"
      >
        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/70 p-2 text-left">
          <div style={previewStyles}>
            <span className="truncate text-[10px]">
              {reference.textContent || reference.componentLabel}
            </span>
          </div>
        </div>
      </button>

      <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--accent)]/60">
        {reference.designIntent}
      </p>

      <div className="mt-2 flex items-center gap-1 text-[9px] text-[var(--accent)]/45">
        <Icon icon="material-symbols:link-rounded" className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{reference.sourceUrl.replace(/^https?:\/\//, '')}</span>
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          onClick={onSelect}
          className="flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] transition-colors hover:border-cyan-500/35 hover:bg-cyan-500/8 hover:text-cyan-200 cursor-pointer"
        >
          Use
        </button>
        <button
          onClick={onCopyJson}
          className="flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] transition-colors hover:border-sky-500/35 hover:bg-sky-500/8 hover:text-sky-200 cursor-pointer"
        >
          Copy JSON
        </button>
      </div>
    </div>
  );
};
