import React from 'react';
import { Crosshair } from '@phosphor-icons/react';
import type { CapturedUiElementReference } from '../../types';
import { UiReferenceCard } from './UiReferenceCard';

interface UiReferenceClipboardPanelProps {
  references: CapturedUiElementReference[];
  activeReferenceId: string | null;
  onSelect: (referenceId: string) => void;
  onRemove: (referenceId: string) => void;
  onCopyJson: (reference: CapturedUiElementReference) => void;
}

export const UiReferenceClipboardPanel: React.FC<UiReferenceClipboardPanelProps> = ({
  references,
  activeReferenceId,
  onSelect,
  onRemove,
  onCopyJson,
}) => {
  if (references.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
        <Crosshair size={32} className="mb-3 h-8 w-8 text-cyan-300/25" aria-hidden="true" />
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]/60 leading-5">
          nothing captured yet
        </p>
        <p className="mt-1 text-[10px] text-[var(--text-secondary)]/40 leading-4">
          press copy UI, then click any element on this page to capture it
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {references.map((reference) => (
        <UiReferenceCard
          key={reference.id}
          reference={reference}
          isActive={reference.id === activeReferenceId}
          onSelect={() => onSelect(reference.id)}
          onRemove={() => onRemove(reference.id)}
          onCopyJson={() => onCopyJson(reference)}
        />
      ))}
    </div>
  );
};
