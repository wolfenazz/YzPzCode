import React from 'react';
import { Icon } from '@iconify/react';
import type { CapturedStyle } from '../../types';
import { StylePreviewCard } from './StylePreviewCard';

interface StyleClipboardPanelProps {
  styles: CapturedStyle[];
  activeStyleId: string | null;
  onRemove: (styleId: string) => void;
  onApply: (style: CapturedStyle) => void;
  onCopyCss: (style: CapturedStyle) => void;
}

export const StyleClipboardPanel: React.FC<StyleClipboardPanelProps> = ({
  styles,
  activeStyleId,
  onRemove,
  onApply,
  onCopyCss,
}) => {
  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <Icon
          icon="material-symbols:palette-outline-rounded"
          className="h-8 w-8 text-[var(--accent)]/30 mb-3"
          aria-hidden="true"
        />
        <p className="text-[11px] font-medium text-[var(--accent)]/60 leading-5">
          no styles captured yet
        </p>
        <p className="mt-1 text-[10px] text-[var(--accent)]/40 leading-4">
          toggle pick style mode and select an element
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 overflow-y-auto">
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
