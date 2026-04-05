import React from 'react';
import { useAppStore } from '../../../stores/appStore';
import { SettingsToggle } from '../../common/SettingsToggle';

const ACCENT_COLORS = [
  { name: 'Default', value: 'default', color: '#a1a1aa' },
  { name: 'Blue', value: 'blue', color: '#3b82f6' },
  { name: 'Purple', value: 'purple', color: '#8b5cf6' },
  { name: 'Green', value: 'green', color: '#10b981' },
  { name: 'Orange', value: 'orange', color: '#f97316' },
  { name: 'Red', value: 'red', color: '#ef4444' },
  { name: 'Pink', value: 'pink', color: '#ec4899' },
  { name: 'Cyan', value: 'cyan', color: '#06b6d4' },
];

const UI_DENSITIES = [
  { value: 'compact' as const, label: 'Compact' },
  { value: 'comfortable' as const, label: 'Comfortable' },
  { value: 'spacious' as const, label: 'Spacious' },
];

const Divider = () => (
  <div className="h-px bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent" />
);

export const SettingsAppearance: React.FC = () => {
  const {
    theme,
    toggleTheme,
    customCursor,
    setCustomCursor,
    accentColor,
    setAccentColor,
    uiDensity,
    setUiDensity,
    animationsEnabled,
    setAnimationsEnabled,
    setupViewMode,
    setSetupViewMode,
  } = useAppStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em] mb-1">
          Appearance
        </h2>
        <p className="text-[10px] text-zinc-600 font-mono">Customize the look and feel of YzPzCode</p>
      </div>

      <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          Theme
        </h3>

        <SettingsToggle
          enabled={theme === 'light'}
          onToggle={toggleTheme}
          label="Color Theme"
          description={`Currently using ${theme} mode`}
        />
      </div>

      <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          Accent Color
        </h3>
        <p className="text-[10px] text-zinc-600 font-mono">Select a primary accent for UI highlights</p>

        <div className="flex items-center gap-3 flex-wrap">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => setAccentColor(color.value)}
              className={`group relative w-8 h-8 rounded-full transition-all duration-200 cursor-pointer ${
                accentColor === color.value
                  ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[#0a0a0f] scale-110'
                  : 'hover:scale-105'
              }`}
              title={color.name}
            >
              <div
                className="absolute inset-1 rounded-full border border-white/10"
                style={{ backgroundColor: color.color }}
              />
              {accentColor === color.value && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          UI Density
        </h3>
        <p className="text-[10px] text-zinc-600 font-mono">Adjust spacing and sizing across the interface</p>

        <div className="flex items-center gap-2">
          {UI_DENSITIES.map((density) => (
            <button
              key={density.value}
              onClick={() => setUiDensity(density.value)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                uiDensity === density.value
                  ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                  : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:text-zinc-300 hover:border-[#1a1a2e]/60'
              }`}
            >
              {density.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          Preferences
        </h3>

        <div className="space-y-4">
          <SettingsToggle enabled={customCursor} onToggle={() => setCustomCursor(!customCursor)} label="Custom Cursor" description="Enable the custom crosshair cursor" />

          <Divider />

          <SettingsToggle enabled={animationsEnabled} onToggle={() => setAnimationsEnabled(!animationsEnabled)} label="Animations" description="Enable motion animations throughout the app" />

          <Divider />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-300 font-mono">Setup View Mode</p>
              <p className="text-[10px] text-zinc-600 font-mono mt-0.5">Choose between page layout or guided stepper</p>
            </div>
            <div className="flex items-center gap-2">
              {(['page', 'stepper'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSetupViewMode(mode)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                    setupViewMode === mode
                      ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                      : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:text-zinc-300 hover:border-[#1a1a2e]/60'
                  }`}
                >
                  {mode === 'page' ? 'Page' : 'Stepper'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
