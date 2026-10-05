import { useEffect, useState } from 'react';
import { normalizeHex } from '../../../utils/customTheme';

interface ThemeColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** A native color picker paired with an editable hex value, so exact brand colors can be typed or pasted. */
export const ThemeColorField = ({ label, value, onChange }: ThemeColorFieldProps) => {
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  const commit = (): void => {
    const hex = normalizeHex(text);
    if (hex) {
      onChange(hex);
      setText(hex);
    } else {
      setText(value);
    }
  };

  return (
    <div className="st-colorfield">
      <input
        aria-label={`${label} color picker`}
        className="st-colorfield__swatch"
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
      <input
        aria-label={`${label} hex value`}
        className="st-input st-input--mono st-colorfield__hex"
        maxLength={7}
        onBlur={commit}
        onChange={(event) => {
          setText(event.target.value);
          // Apply as soon as a full #rrggbb is typed; shorter forms wait for blur/Enter.
          if (/^#[\da-f]{6}$/i.test(event.target.value)) onChange(event.target.value.toLowerCase());
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        spellCheck={false}
        value={text}
      />
    </div>
  );
};
