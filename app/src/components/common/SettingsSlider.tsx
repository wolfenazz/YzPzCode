import React from 'react';

interface SettingsSliderProps {
  label: string;
  description: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export const SettingsSlider: React.FC<SettingsSliderProps> = ({
  label,
  description,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
}) => (
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs text-zinc-300 font-mono">{label}</p>
      <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{description}</p>
    </div>
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-slider w-24 h-1 appearance-none bg-[#1a1a2e] rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_6px_var(--accent-glow)] [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--accent)] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-[0_0_6px_var(--accent-glow)]"
      />
      <span className="text-xs text-zinc-400 font-mono w-12 text-right">
        {displayValue}
      </span>
    </div>
  </div>
);
