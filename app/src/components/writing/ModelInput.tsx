import React, { useState } from 'react';
import type { WritingModelInfo } from '../../utils/writing/aiClient';

interface ModelInputProps {
  value: string;
  onChange: (value: string) => void;
  models: WritingModelInfo[];
  loading?: boolean;
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
}

const CUSTOM = '\u0000custom';

/** The CLI's own model list as a picker, with "Custom…" for any other id (free text when the CLI lists nothing). */
export const ModelInput: React.FC<ModelInputProps> = ({
  value,
  onChange,
  models,
  loading,
  placeholder,
  className,
  selectClassName,
  inputClassName,
}) => {
  const [custom, setCustom] = useState(false);
  const listed = models.some((model) => model.id === value);
  const typing = models.length === 0 || custom || (value !== '' && !listed);

  const selectClass = selectClassName ?? (className ? className.replace(/\b(pr|wr|st)-input\b/g, '$1-select') : undefined);
  const inputClass = inputClassName ?? (className ? className.replace(/\b(pr|wr|st)-select\b/g, '$1-input') : undefined);

  if (!typing) {
    return (
      <select className={selectClass} value={value} onChange={(event) => (event.target.value === CUSTOM ? setCustom(true) : onChange(event.target.value))}>
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
      className={inputClass}
      value={value}
      placeholder={loading ? 'Loading models…' : placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => { if (!value) setCustom(false); }}
      autoFocus={custom}
      spellCheck={false}
    />
  );
};
