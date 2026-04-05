import React from 'react';

interface SettingsToggleProps {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
}

export const SettingsToggle: React.FC<SettingsToggleProps> = ({
  enabled,
  onToggle,
  label,
  description,
}) => (
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs text-zinc-300 font-mono">{label}</p>
      {description && (
        <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{description}</p>
      )}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 cursor-pointer ${
        enabled
          ? 'bg-zinc-200'
          : 'bg-zinc-800 border border-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full transform transition-transform duration-200 ${
          enabled
            ? 'translate-x-[18px] bg-zinc-900'
            : 'translate-x-[2px] bg-zinc-500'
        }`}
      />
    </button>
  </div>
);
