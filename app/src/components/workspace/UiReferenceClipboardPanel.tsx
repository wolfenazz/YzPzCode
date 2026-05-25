import React from 'react';
import { Icon } from '@iconify/react';
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
        <Icon
          icon="material-symbols:view-in-ar-outline-rounded"
          className="mb-3 h-8 w-8 text-cyan-300/25"
          aria-hidden="true"
        />
        <p className="text-[11px] font-medium text-[var(--accent)]/60 leading-5">
          no UI references captured yet
        </p>
        <p className="mt-1 text-[10px] text-[var(--accent)]/40 leading-4">
          use pick UI element on any website, then recreate it cleanly in localhost
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
