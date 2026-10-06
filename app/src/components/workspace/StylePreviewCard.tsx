import React from 'react';
import { Copy, LinkSimple, PaintBrush, Trash } from '@phosphor-icons/react';
import type { CapturedStyle } from '../../types';

interface StylePreviewCardProps {
  style: CapturedStyle;
  onRemove: () => void;
  onApply: () => void;
  onCopyCss: () => void;
  isActive: boolean;
}

const isVisibleColor = (value: string | undefined): value is string =>
  !!value && value !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(value);

export const StylePreviewCard: React.FC<StylePreviewCardProps> = ({
  style,
  onRemove,
  onApply,
  onCopyCss,
  isActive,
}) => {
  const css = style.computedStyles;
  const previewStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '100%',
    padding: css['padding'] || '6px 12px',
    borderRadius: css['border-radius'] || '6px',
    background: css['background-color'] || css['background'] || 'transparent',
    color: css['color'] || 'inherit',
    fontFamily: css['font-family'] || 'inherit',
    fontSize: css['font-size'] || '12px',
    fontWeight: css['font-weight'] as React.CSSProperties['fontWeight'],
    letterSpacing: css['letter-spacing'],
    border: css['border'] || undefined,
    boxShadow: css['box-shadow'] || 'none',
  };
  const swatches = [
    { label: 'text', value: css['color'] },
    { label: 'fill', value: css['background-color'] },
    { label: 'border', value: css['border-color'] },
  ].filter((entry): entry is { label: string; value: string } => isVisibleColor(entry.value));
  const propertyCount = Object.keys(css).length;

  return (
    <article className={`bx-card${isActive ? ' is-active' : ''}`}>
      <div className="bx-card__head">
        <div className="bx-card__titles">
          <div className="bx-card__title bx-mono" title={style.selector}>
            {style.tagName}{style.selector ? ` ${style.selector}` : ''}
          </div>
          <div className="bx-card__meta">
            {propertyCount} properties
            {css['font-size'] && <span>· {css['font-size']} {css['font-weight'] ?? ''}</span>}
          </div>
        </div>
        <button type="button" className="bx-btn bx-btn--sm bx-btn--danger" onClick={onRemove} aria-label="Remove style" title="Remove">
          <Trash size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="bx-card__preview">
        <span style={previewStyles}>Aa · Preview</span>
      </div>

      {swatches.length > 0 && (
        <div className="bx-card__swatches">
          {swatches.map((swatch) => (
            <span key={swatch.label} className="bx-swatch" title={`${swatch.label}: ${swatch.value}`}>
              <span className="bx-swatch__color" style={{ background: swatch.value }} />
              {swatch.label}
            </span>
          ))}
        </div>
      )}

      <div className="bx-card__source">
        <LinkSimple size={11} aria-hidden="true" />
        <span>{style.sourceUrl.replace(/^https?:\/\//, '')}</span>
      </div>

      <div className="bx-card__actions">
        <button type="button" className="bx-btn bx-btn--outline" onClick={onApply} aria-pressed={isActive}>
          <PaintBrush size={13} aria-hidden="true" />
          {isActive ? 'Applying…' : 'Apply'}
        </button>
        <button type="button" className="bx-btn bx-btn--outline" onClick={onCopyCss}>
          <Copy size={13} aria-hidden="true" />
          Copy CSS
        </button>
      </div>
    </article>
  );
};
