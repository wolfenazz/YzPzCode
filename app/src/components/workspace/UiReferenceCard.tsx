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
    <div
      className={`border p-2.5 transition-colors ${
        isActive
          ? 'border-cyan-800 bg-cyan-950/20'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onSelect}
          className="min-w-0 flex-1 text-left cursor-pointer"
          aria-pressed={isActive}
        >
          <div className="flex items-center gap-1.5">
            <Icon icon="material-symbols:view-in-ar-rounded" className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden="true" />
            <span className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-300">
              {reference.componentLabel}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
            <span>{reference.tagName}</span>
            <span className="h-1 w-1 bg-zinc-700" />
            <span>{reference.layout.display}</span>
            <span className="h-1 w-1 bg-zinc-700" />
            <span>{reference.layout.width}</span>
          </div>
        </button>
        <button
          onClick={onRemove}
          className="inline-flex h-5 w-5 items-center justify-center text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer"
          aria-label="Remove UI reference"
        >
          <Icon icon="material-symbols:close-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <button
        onClick={onSelect}
        className="mt-2 block w-full cursor-pointer"
      >
        <div className="border border-zinc-800 bg-zinc-950/70 p-2 text-left">
          <div style={previewStyles}>
            <span className="truncate text-[10px]">
              {reference.textContent || reference.componentLabel}
            </span>
          </div>
        </div>
      </button>

      <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-zinc-500">
        {reference.designIntent}
      </p>

      <div className="mt-2 flex items-center gap-1 font-mono text-[9px] text-zinc-600">
        <Icon icon="material-symbols:link-rounded" className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{reference.sourceUrl.replace(/^https?:\/\//, '')}</span>
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          onClick={onSelect}
          className={`flex-1 border px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition-colors cursor-pointer ${
            isActive
              ? 'border-cyan-800 bg-cyan-950/40 text-cyan-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-cyan-800 hover:text-cyan-300'
          }`}
        >
          use
        </button>
        <button
          onClick={onCopyJson}
          className="flex-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 cursor-pointer"
        >
          copy json
        </button>
      </div>
    </div>
  );
};
