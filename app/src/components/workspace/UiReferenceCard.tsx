import React from 'react';
import { BracketsCurly, LinkSimple, Trash } from '@phosphor-icons/react';
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
    minHeight: '2.25rem',
    maxWidth: '100%',
    padding: reference.spacing.padding || '10px 14px',
    borderRadius: reference.spacing.borderRadius || '10px',
    background: reference.visuals.background || 'transparent',
    color: reference.visuals.color || 'inherit',
    border: reference.visuals.border || undefined,
    boxShadow: reference.visuals.boxShadow || 'none',
    fontFamily: reference.typography.fontFamily || 'inherit',
    fontSize: reference.typography.fontSize || '12px',
    fontWeight: (reference.typography.fontWeight || '600') as React.CSSProperties['fontWeight'],
    opacity: Number(reference.visuals.opacity || '1') || 1,
    overflow: 'hidden',
  };
  const nodeCount = reference.structure.captureStats?.capturedNodeCount ?? reference.structure.childCount + 1;

  return (
    <article className={`bx-card${isActive ? ' is-active' : ''}`}>
      <div className="bx-card__head">
        <button type="button" className="bx-card__titles" onClick={onSelect} aria-pressed={isActive}>
          <div className="bx-card__title">{reference.componentLabel}</div>
          <div className="bx-card__meta bx-mono">
            &lt;{reference.tagName}&gt; · {reference.layout.display} · {nodeCount} nodes
            {reference.assets.length > 0 && ` · ${reference.assets.length} assets`}
          </div>
        </button>
        <button type="button" className="bx-btn bx-btn--sm bx-btn--danger" onClick={onRemove} aria-label="Remove UI reference" title="Remove">
          <Trash size={13} aria-hidden="true" />
        </button>
      </div>

      <button type="button" className="bx-card__preview" onClick={onSelect} aria-label={`Use ${reference.componentLabel}`} style={{ border: 0, cursor: 'pointer' }}>
        <span style={previewStyles}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {reference.textContent || reference.componentLabel}
          </span>
        </span>
      </button>

      {reference.designIntent && <p className="bx-muted" style={{ margin: 0 }}>{reference.designIntent}</p>}

      <div className="bx-card__source">
        <LinkSimple size={11} aria-hidden="true" />
        <span>{reference.sourceUrl.replace(/^https?:\/\//, '')}</span>
      </div>

      <div className="bx-card__actions">
        <button type="button" className="bx-btn bx-btn--outline" onClick={onSelect} aria-pressed={isActive}>
          {isActive ? 'Selected' : 'Use'}
        </button>
        <button type="button" className="bx-btn bx-btn--outline" onClick={onCopyJson}>
          <BracketsCurly size={13} aria-hidden="true" /> Copy JSON
        </button>
      </div>
    </article>
  );
};
