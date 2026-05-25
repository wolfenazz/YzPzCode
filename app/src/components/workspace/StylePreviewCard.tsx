import React from 'react';
import { Icon } from '@iconify/react';
import type { CapturedStyle } from '../../types';

interface StylePreviewCardProps {
  style: CapturedStyle;
  onRemove: () => void;
  onApply: () => void;
  onCopyCss: () => void;
  isActive: boolean;
}

export const StylePreviewCard: React.FC<StylePreviewCardProps> = ({
  style,
  onRemove,
  onApply,
  onCopyCss,
  isActive,
}) => {
  const previewStyles: React.CSSProperties = {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '4px',
    background: style.computedStyles['background-color'] || style.computedStyles['background'] || '#27272a',
    color: style.computedStyles['color'] || '#fafafa',
    fontFamily: style.computedStyles['font-family'] || 'inherit',
    fontSize: style.computedStyles['font-size'] || '11px',
    border: style.computedStyles['border'] || '1px solid transparent',
    boxShadow: style.computedStyles['box-shadow'] || 'none',
  };

  return (
    <div className={`rounded-lg border p-2.5 transition-colors ${
      isActive
        ? 'border-emerald-500/30 bg-emerald-500/8 shadow-[0_0_12px_rgba(52,211,153,0.08)]'
        : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon icon="material-symbols:code-rounded" className="h-3 w-3 text-[var(--accent)]/60" aria-hidden="true" />
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            {style.tagName}{style.selector ? ` ${style.selector.slice(0, 20)}${style.selector.length > 20 ? '…' : ''}` : ''}
          </span>
        </div>
        <button
          onClick={onRemove}
          className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-[var(--accent)]/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          aria-label="Remove style"
        >
          <Icon icon="material-symbols:close-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mb-2">
        <div className="rounded border border-[var(--border-primary)] p-1.5 bg-[var(--bg-primary)]">
          <div style={previewStyles}>
            <span className="text-[10px] font-medium">preview</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[9px] text-[var(--accent)]/50 truncate mb-2.5">
        <Icon icon="material-symbols:link-rounded" className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{style.sourceUrl.replace(/^https?:\/\//, '')}</span>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={onApply}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-primary)] hover:border-emerald-500/30 hover:bg-emerald-500/8 hover:text-emerald-300 transition-all cursor-pointer"
        >
          <Icon icon="material-symbols:check-rounded" className="h-3 w-3" aria-hidden="true" />
          apply
        </button>
        <button
          onClick={onCopyCss}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-primary)] hover:border-sky-500/30 hover:bg-sky-500/8 hover:text-sky-300 transition-all cursor-pointer"
        >
          <Icon icon="material-symbols:content-copy-outline-rounded" className="h-3 w-3" aria-hidden="true" />
          copy css
        </button>
      </div>
    </div>
  );
};
