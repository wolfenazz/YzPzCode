import React, { useEffect } from 'react';
import type { WritingModelInfo } from '../../utils/writing/aiClient';
import { effortLabel, effortOptions } from '../../utils/writing/efforts';

interface EffortSelectProps {
  value: string;
  onChange: (value: string) => void;
  models: WritingModelInfo[];
  /** The chosen model id; empty is the CLI's default model. */
  model: string;
  className?: string;
}

/** Thinking-effort picker. Renders nothing when the engine or model has no effort levels. */
export const EffortSelect: React.FC<EffortSelectProps> = ({ value, onChange, models, model, className }) => {
  const options = effortOptions(models, model);
  // A saved level the chosen model does not accept would make the CLI fail.
  useEffect(() => {
    if (value && options.length > 0 && !options.includes(value)) onChange('');
  }, [value, options, onChange]);
  if (options.length === 0) return null;
  return (
    <select className={className} value={options.includes(value) ? value : ''} onChange={(event) => onChange(event.target.value)} aria-label="Thinking effort">
      <option value="">Default</option>
      {options.map((effort) => <option key={effort} value={effort}>{effortLabel(effort)}</option>)}
    </select>
  );
};

/** Whether the engine/model combination has any effort levels to offer. */
export const hasEfforts = (models: WritingModelInfo[], model: string): boolean => effortOptions(models, model).length > 0;
