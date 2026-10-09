import React, { useId } from 'react';
import type { WritingModelInfo } from '../../utils/writing/aiClient';

interface ModelInputProps {
  value: string;
  onChange: (value: string) => void;
  models: WritingModelInfo[];
  loading?: boolean;
  placeholder?: string;
  className?: string;
}

/** Free-text model field with the CLI's own model list as suggestions. */
export const ModelInput: React.FC<ModelInputProps> = ({ value, onChange, models, loading, placeholder, className }) => {
  const listId = useId();
  return (
    <>
      <input
        className={className}
        value={value}
        list={models.length ? listId : undefined}
        placeholder={loading ? 'Loading models…' : placeholder}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
      {models.length > 0 && (
        <datalist id={listId}>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.connected ? model.label : `${model.label} — not signed in`}
            </option>
          ))}
        </datalist>
      )}
    </>
  );
};
