import React from 'react';
import { useAppStore } from '../../../stores/appStore';

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
  } = useAppStore();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase mb-1">Appearance</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Customize the look and feel of YzPzCode</p>
      </div>

      <div className="space-y-6">
        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Theme</h3>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-300">Color Theme</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Choose between dark and light mode</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 uppercase">{theme}</span>
              <button
                onClick={toggleTheme}
                className="relative w-11 h-6 rounded-full bg-zinc-800 border border-zinc-700 transition-colors duration-200 cursor-pointer"
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-zinc-300 transition-transform duration-200 ${
                    theme === 'light' ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Accent Color</h3>
          
          <div className="flex items-center gap-3 flex-wrap">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setAccentColor(color.value)}
                className={`group relative w-8 h-8 rounded-full border-2 transition-all duration-200 cursor-pointer ${
                  accentColor === color.value
                    ? 'border-zinc-300 scale-110'
                    : 'border-zinc-800 hover:border-zinc-600'
                }`}
                title={color.name}
              >
                <div
                  className="absolute inset-1 rounded-full"
                  style={{ backgroundColor: color.color }}
                />
                {accentColor === color.value && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">UI Density</h3>
          
          <div className="flex items-center gap-2">
            {UI_DENSITIES.map((density) => (
              <button
                key={density.value}
                onClick={() => setUiDensity(density.value)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  uiDensity === density.value
                    ? 'bg-theme-main/10 text-theme-main border border-theme-main/20'
                    : 'bg-zinc-900/50 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {density.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Toggles</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-300">Custom Cursor</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">Enable the custom crosshair cursor</p>
              </div>
              <button
                onClick={() => setCustomCursor(!customCursor)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                  customCursor ? 'bg-emerald-600/60' : 'bg-zinc-800'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-zinc-300 transition-transform duration-200 ${
                    customCursor ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-300">Animations</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">Enable motion animations throughout the app</p>
              </div>
              <button
                onClick={() => setAnimationsEnabled(!animationsEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                  animationsEnabled ? 'bg-emerald-600/60' : 'bg-zinc-800'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-zinc-300 transition-transform duration-200 ${
                    animationsEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
