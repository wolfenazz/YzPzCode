import React from 'react';
import { EyedropperSample } from '@phosphor-icons/react';
import type { CapturedStyle } from '../../types';
import { StylePreviewCard } from './StylePreviewCard';

interface StyleClipboardPanelProps {
  styles: CapturedStyle[];
  activeStyleId: string | null;
  onRemove: (styleId: string) => void;
  onApply: (style: CapturedStyle) => void;
  onCopyCss: (style: CapturedStyle) => void;
  onStartPicking: () => void;
}

export const StyleClipboardPanel: React.FC<StyleClipboardPanelProps> = ({
  styles,
  activeStyleId,
  onRemove,
  onApply,
  onCopyCss,
  onStartPicking,
}) => {
  if (styles.length === 0) {
    return (
      <div className="bx-empty">
        <span className="bx-empty__icon"><EyedropperSample size={18} aria-hidden="true" /></span>
        <span className="bx-empty__title">No styles yet</span>
        <span className="bx-empty__text">
          Pick an element on any page to copy its look, then apply it to an element on your local site.
        </span>
        <button type="button" className="bx-btn bx-btn--outline" onClick={onStartPicking}>
          <EyedropperSample size={13} aria-hidden="true" /> Pick a style
        </button>
      </div>
    );
  }

  return (
    <div className="bx-panel__stack">
      {styles.map((style) => (
        <StylePreviewCard
          key={style.id}
          style={style}
          isActive={style.id === activeStyleId}
          onRemove={() => onRemove(style.id)}
          onApply={() => onApply(style)}
          onCopyCss={() => onCopyCss(style)}
        />
      ))}
    </div>
  );
};
