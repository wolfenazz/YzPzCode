import React, { useState } from 'react';
import { DEFAULT_PRESET, clampCanvas, presetsFor, resolveFormat, sizeLabel } from '../../utils/design/formats';
import type { DesignKind } from '../../utils/design/types';

interface BoardSizePickerProps {
  kind: DesignKind;
  /** The confirm button text, e.g. "Add blank board". */
  label: string;
  onCreate: (format: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

/** Presets for the project's kind plus a custom width × height, ending in a create button. */
export const BoardSizePicker: React.FC<BoardSizePickerProps> = ({ kind, label, onCreate, onCancel, disabled = false }) => {
  const [preset, setPreset] = useState<string>('');
  const [custom, setCustom] = useState(false);
  const [width, setWidth] = useState('1200');
  const [height, setHeight] = useState('628');
  const chosen = custom ? null : resolveFormat(preset || DEFAULT_PRESET[kind]);
  const size = custom ? `${clampCanvas(Number(width))}x${clampCanvas(Number(height))}` : (preset || DEFAULT_PRESET[kind]);
  const valid = !custom || (Number.isFinite(Number(width)) && Number.isFinite(Number(height)) && Number(width) > 0 && Number(height) > 0);

  return (
    <div className="dz-sizepicker" role="group" aria-label="New board size">
      <label className="dz-field">
        <span>Size</span>
        <select
          className="dz-select"
          value={custom ? 'custom' : (preset || DEFAULT_PRESET[kind])}
          onChange={(event) => {
            if (event.target.value === 'custom') setCustom(true);
            else { setCustom(false); setPreset(event.target.value); }
          }}
        >
          {presetsFor(kind).map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {sizeLabel(entry.width, entry.height)}</option>)}
          <option value="custom">Custom size…</option>
        </select>
      </label>
      {custom && (
        <div className="dz-sizepicker__row">
          <label className="dz-field"><span>Width</span>
            <input className="dz-input" type="number" min={64} max={8000} value={width} onChange={(event) => setWidth(event.target.value)} onKeyDown={(event) => event.stopPropagation()} />
          </label>
          <label className="dz-field"><span>Height</span>
            <input className="dz-input" type="number" min={64} max={8000} value={height} onChange={(event) => setHeight(event.target.value)} onKeyDown={(event) => event.stopPropagation()} />
          </label>
        </div>
      )}
      <p className="dz-note">{custom ? `${clampCanvas(Number(width))} × ${clampCanvas(Number(height))} px` : chosen ? `${chosen.label} · ${sizeLabel(chosen.width, chosen.height)}` : ''}</p>
      <div className="dz-actions">
        {onCancel && <button type="button" className="dz-btn dz-btn--sm" onClick={onCancel}>Cancel</button>}
        <button type="button" className="dz-btn dz-btn--sm dz-btn--primary" disabled={disabled || !valid} onClick={() => onCreate(size)}>{label}</button>
      </div>
    </div>
  );
};
