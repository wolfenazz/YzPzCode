import React, { useEffect, useState } from 'react';
import { listWritingEngines, type WritingEngineInfo } from '../../utils/writing/aiClient';
import { useEngineModels } from '../../utils/writing/useEngineModels';
import type { EngineChoice, WritingEngineId } from '../../utils/writing/types';
import { ModelInput } from '../writing/ModelInput';

/** Engine and model for one deck. */
export const EnginePicker: React.FC<{ value: EngineChoice; onChange: (value: EngineChoice) => void; compact?: boolean }> = ({ value, onChange, compact }) => {
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  useEffect(() => {
    let alive = true;
    listWritingEngines().then((list) => { if (alive) setEngines(list); }).catch(() => { if (alive) setEngines([]); });
    return () => { alive = false; };
  }, []);
  const installed = engines?.find((engine) => engine.engine === value.engine)?.installed ?? false;
  const { models, loading } = useEngineModels(value.engine, installed);

  return (
    <div className={compact ? 'pr-engine pr-engine--compact' : 'pr-grid-2'}>
      <label className="pr-field">
        <span className="pr-field__label">AI engine</span>
        <select className="pr-select" value={value.engine} onChange={(event) => onChange({ ...value, engine: event.target.value as WritingEngineId, model: '' })}>
          {(engines ?? [{ engine: value.engine, displayName: value.engine, installed: true } as WritingEngineInfo]).map((engine) => (
            <option key={engine.engine} value={engine.engine} disabled={!engine.installed}>
              {engine.displayName}{engine.installed ? '' : ' (not installed)'}
            </option>
          ))}
        </select>
      </label>
      <label className="pr-field">
        <span className="pr-field__label">Model <span className="pr-field__opt">optional</span></span>
        <ModelInput className="pr-input" value={value.model} onChange={(model) => onChange({ ...value, model })} models={models} loading={loading} placeholder="CLI default" />
      </label>
    </div>
  );
};
