import React, { useState } from 'react';
import type { WritingModelInfo } from '../../utils/writing/aiClient';

interface ModelInputProps {
  value: string;
  onChange: (value: string) => void;
  models: WritingModelInfo[];
  loading?: boolean;
  placeholder?: string;
  className?: string;
}

const CUSTOM = '\u0000custom';

/** The CLI's own model list as a picker, with "Custom…" for any other id (free text when the CLI lists nothing). */
export const ModelInput: React.FC<ModelInputProps> = ({ value, onChange, models, loading, placeholder, className }) => {
  const [custom, setCustom] = useState(false);
  const listed = models.some((model) => model.id === value);
  const typing = models.length === 0 || custom || (value !== '' && !listed);

  if (!typing) {
    return (
      <select className={className} value={value} onChange={(event) => (event.target.value === CUSTOM ? setCustom(true) : onChange(event.target.value))}>
        <option value="">{'CLI default'}</option>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.connected ? model.label : `${model.label} — not signed in`}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
    );
  }
  return (
    <input
      className={className}
      value={value}
      placeholder={loading ? 'Loading models…' : placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => { if (!value) setCustom(false); }}
      autoFocus={custom}
      spellCheck={false}
    />
  );
};
