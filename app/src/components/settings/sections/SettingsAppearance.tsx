import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../../stores/appStore';
import { SettingsToggle } from '../../common/SettingsToggle';

const ACCENT_COLORS = [
  { name: 'Claude', value: 'default', color: '#d87757' },
  { name: 'Claude Blue', value: 'blue', color: '#1b7ede' },
  { name: 'Purple', value: 'purple', color: '#8b5cf6' },
  { name: 'Green', value: 'green', color: '#10b981' },
  { name: 'Orange', value: 'orange', color: '#f97316' },
  { name: 'Red', value: 'red', color: '#f14444' },
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
    customCursor,
    setCustomCursor,
    accentColor,
    setAccentColor,
    uiDensity,
    setUiDensity,
    animationsEnabled,
    setAnimationsEnabled,
    customBackgroundEnabled,
    setCustomBackgroundEnabled,
    customBackgroundColor,
    setCustomBackgroundColor,
    lightThemeEnabled,
    setLightThemeEnabled,
    setupViewMode,
    setSetupViewMode,
    discordRichPresence,
    setDiscordRichPresence,
  } = useAppStore();

  const [discordError, setDiscordError] = useState<string | null>(null);
  const [backgroundDraft, setBackgroundDraft] = useState(customBackgroundColor);

  useEffect(() => {
    setBackgroundDraft(customBackgroundColor);
  }, [customBackgroundColor]);

  const commitBackgroundColor = (value: string) => {
    setBackgroundDraft(value);
    if (/^#?[0-9a-f]{6}$/i.test(value.trim())) {
      const normalized = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
      setCustomBackgroundColor(normalized.toLowerCase());
    }
  };

  useEffect(() => {
    if (discordRichPresence) {
      invoke('enable_discord_presence').catch(() => {
        setDiscordError('Discord is not running. Open Discord to enable Rich Presence.');
      });
    } else {
      setDiscordError(null);
      invoke('disable_discord_presence').catch(() => {});
    }
  }, [discordRichPresence]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em] mb-1">
          Appearance
        </h2>
        <p className="text-[10px] text-zinc-600 font-mono">Customize the look and feel of YzPzCode</p>
      </div>

      <div className="bg-[#262626]/60 border border-[#3e3e38]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
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
                  ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[#262626] scale-110'
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

      <div className="bg-[#262626]/60 border border-[#3e3e38]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          Background
        </h3>
        <p className="text-[10px] text-zinc-600 font-mono">Replace the app's base background with any color you like — independent from the accent color</p>

        <SettingsToggle
          enabled={customBackgroundEnabled}
          onToggle={() => setCustomBackgroundEnabled(!customBackgroundEnabled)}
          label="Custom Background"
          description="Use a custom color for the application background"
        />

        <SettingsToggle
          enabled={lightThemeEnabled}
          onToggle={() => setLightThemeEnabled(!lightThemeEnabled)}
          label="Dark Text (Bright Background)"
          description="Switch all UI text to dark for bright/whitish backgrounds"
        />

        {customBackgroundEnabled && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(customBackgroundColor) ? customBackgroundColor : '#16161a'}
                onChange={(e) => {
                  setCustomBackgroundColor(e.target.value);
                  setBackgroundDraft(e.target.value);
                }}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-[#3e3e38] bg-[#1f1f1f] p-1"
                aria-label="Custom background color picker"
              />
              <input
                type="text"
                value={backgroundDraft}
                onChange={(e) => commitBackgroundColor(e.target.value)}
                placeholder="#16161a"
                spellCheck={false}
                className="h-9 flex-1 rounded-md border border-[#3e3e38] bg-[#1f1f1f]/60 px-3 font-mono text-[11px] uppercase tracking-widest text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[var(--accent-border)]"
                aria-label="Custom background color hex value"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomBackgroundColor('#16161a');
                  setBackgroundDraft('#16161a');
                }}
                className="h-9 shrink-0 rounded-md border border-[#3e3e38] bg-[#1f1f1f]/60 px-3 font-mono text-[10px] uppercase tracking-wider text-zinc-400 transition-colors duration-150 hover:text-zinc-200 hover:border-zinc-600 cursor-pointer"
              >
                Reset
              </button>
            </div>
            <div className="flex items-center gap-2">
              {['#16161a', '#0f172a', '#1a1c12', '#241a1a', '#0c1f1c'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setCustomBackgroundColor(preset);
                    setBackgroundDraft(preset);
                  }}
                  className={`h-7 w-7 rounded-full border border-white/10 transition-transform duration-150 cursor-pointer hover:scale-110 ${customBackgroundColor.toLowerCase() === preset ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[#262626]' : ''}`}
                  style={{ backgroundColor: preset }}
                  aria-label={`Use background ${preset}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#262626]/60 border border-[#3e3e38]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
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
                  : 'bg-[#1f1f1f]/40 text-zinc-500 border border-[#3e3e38]/30 hover:text-zinc-300 hover:border-[#3e3e38]/60'
              }`}
            >
              {density.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#262626]/60 border border-[#3e3e38]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          Preferences
        </h3>

        <div className="space-y-4">
          <SettingsToggle enabled={customCursor} onToggle={() => setCustomCursor(!customCursor)} label="Custom Cursor" description="Enable the custom crosshair cursor" />

          <Divider />

          <SettingsToggle enabled={animationsEnabled} onToggle={() => setAnimationsEnabled(!animationsEnabled)} label="Animations" description="Enable motion animations throughout the app" />

          <Divider />

          <SettingsToggle enabled={discordRichPresence} onToggle={() => { setDiscordRichPresence(!discordRichPresence); setDiscordError(null); }} label="Discord Rich Presence" description="Show your current workspace activity on Discord" />

          {discordRichPresence && discordError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/[0.06] border border-amber-500/20">
              <svg className="w-3 h-3 text-amber-400/80 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-[10px] font-mono text-amber-400/80">{discordError}</span>
              <button
                type="button"
                onClick={() => setDiscordError(null)}
                className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer shrink-0"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

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
                      : 'bg-[#1f1f1f]/40 text-zinc-500 border border-[#3e3e38]/30 hover:text-zinc-300 hover:border-[#3e3e38]/60'
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
