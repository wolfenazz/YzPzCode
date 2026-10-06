import React from 'react';
import { SelectionAll } from '@phosphor-icons/react';
import type { CapturedUiElementReference } from '../../types';
import { UiReferenceCard } from './UiReferenceCard';

interface UiReferenceClipboardPanelProps {
  references: CapturedUiElementReference[];
  activeReferenceId: string | null;
  onSelect: (referenceId: string) => void;
  onRemove: (referenceId: string) => void;
  onCopyJson: (reference: CapturedUiElementReference) => void;
  onStartCapture: () => void;
}

export const UiReferenceClipboardPanel: React.FC<UiReferenceClipboardPanelProps> = ({
  references,
  activeReferenceId,
  onSelect,
  onRemove,
  onCopyJson,
  onStartCapture,
}) => {
  if (references.length === 0) {
    return (
      <div className="bx-empty">
        <span className="bx-empty__icon"><SelectionAll size={18} aria-hidden="true" /></span>
        <span className="bx-empty__title">No components captured</span>
        <span className="bx-empty__text">
          Capture a component from any website, then have an agent rebuild it in your project.
        </span>
        <button type="button" className="bx-btn bx-btn--outline" onClick={onStartCapture}>
          <SelectionAll size={13} aria-hidden="true" /> Capture a component
        </button>
      </div>
    );
  }

  return (
    <div className="bx-panel__stack">
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
