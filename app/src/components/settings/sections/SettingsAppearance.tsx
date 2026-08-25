import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Desktop, Minus, Moon, Plus, Sun } from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { SettingsToggle } from '../../common/SettingsToggle';
import type { ThemeMode } from '../../../types';
import claudeLogo from '../../../assets/claude.png';
import yzpzLogo from '../../../assets/YzPzCodeLogo.png';

const ACCENT_COLORS = [
  { name: 'Claude', value: 'default', color: '#c15f3c' },
  { name: 'YzPz Burple', value: 'burple', color: '#8c4edd' },
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

const APP_ZOOM_MIN = 80;
const APP_ZOOM_MAX = 140;
const APP_ZOOM_STEP = 10;

const ClaudeLogoIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <img src={claudeLogo} alt="" style={{ width: size, height: size }} className="object-contain opacity-85" />
);

const YzPzLogoIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <img src={yzpzLogo} alt="" style={{ width: size, height: size }} className="object-contain opacity-85" />
);

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  description: string;
  icon: React.ElementType;
  swatches: string[];
}> = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright neutral interface',
    icon: Sun,
    swatches: ['#f6f6f4', '#fbfbfa', '#4f5358'],
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Deep neutral interface',
    icon: Moon,
    swatches: ['#0b0b0b', '#1a1a1a', '#d0d0d0'],
  },
  {
    value: 'claude',
    label: 'Claude',
    description: 'Warm Crail and Pampas interface',
    icon: ClaudeLogoIcon,
    swatches: ['#c15f3c', '#b1ada1', '#f4f3ee', '#ffffff'],
  },
  {
    value: 'yzpz',
    label: 'YzPzCode',
    description: 'Textured Burple brand interface',
    icon: YzPzLogoIcon,
    swatches: ['#8c4edd', '#2e1b9c', '#546bf3', '#c7b8f5'],
  },
  {
    value: 'system',
    label: 'System',
    description: 'Follows your OS theme',
    icon: Desktop,
    swatches: ['#0b0b0b', '#f6f6f4'],
  },
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
    appZoom,
    setAppZoom,
    animationsEnabled,
    setAnimationsEnabled,
    themeMode,
    setThemeMode,
    setupViewMode,
    setSetupViewMode,
    discordRichPresence,
    setDiscordRichPresence,
  } = useAppStore();

  const [discordError, setDiscordError] = useState<string | null>(null);

  const changeAppZoom = (delta: number): void => {
    setAppZoom(Math.min(APP_ZOOM_MAX, Math.max(APP_ZOOM_MIN, appZoom + delta)));
  };

  const changeTheme = (mode: ThemeMode): void => {
    setThemeMode(mode);
    if (mode === 'claude') {
      setAccentColor('default');
    } else if (mode === 'yzpz') {
      setAccentColor('burple');
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
        <p className="text-[10px] text-[var(--text-secondary)] font-mono">Customize the look and feel of YzPzCode</p>
      </div>

      <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          Accent Color
        </h3>
        <p className="text-[10px] text-[var(--text-secondary)] font-mono">Select a primary accent for UI highlights</p>

        <div className="flex items-center gap-3 flex-wrap">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => setAccentColor(color.value)}
              className={`group relative w-8 h-8 rounded-full transition-all duration-200 cursor-pointer ${
                accentColor === color.value
                  ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-secondary)] scale-110'
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

      <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          Theme
        </h3>
        <p className="text-[10px] text-[var(--text-secondary)] font-mono">Choose a light, dark, Claude, YzPzCode, or system-following interface</p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {THEME_OPTIONS.map(({ value, label, description, icon: IconComponent, swatches }) => (
            <button
              key={value}
              onClick={() => changeTheme(value)}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-md px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                themeMode === value
                  ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                  : 'bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border border-[var(--border-primary)]/70 hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]'
              }`}
              title={description}
            >
              <IconComponent size={16} weight="duotone" aria-hidden="true" />
              <span>{label}</span>
              <span className="mt-0.5 flex h-1.5 w-12 items-center overflow-hidden rounded-full ring-1 ring-[var(--border-primary)]" aria-hidden="true">
                {swatches.map((swatch) => (
                  <span key={swatch} className="h-full flex-1" style={{ backgroundColor: swatch }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
          UI Density
        </h3>
        <p className="text-[10px] text-[var(--text-secondary)] font-mono">Adjust spacing and sizing across the interface</p>

        <div className="flex items-center gap-2">
          {UI_DENSITIES.map((density) => (
            <button
              key={density.value}
              onClick={() => setUiDensity(density.value)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                uiDensity === density.value
                  ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                  : 'bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border border-[var(--border-primary)]/70 hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]'
              }`}
            >
              {density.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
        <div>
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            App Zoom
          </h3>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)] font-mono">
            Scale the entire interface without changing terminal or editor font preferences
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--border-primary)]/70 bg-[var(--bg-primary)]/50 px-3 py-2.5">
          <div>
            <p className="text-xs text-[var(--text-primary)] font-mono">Interface scale</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-secondary)] font-mono">Default is 100%</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => changeAppZoom(-APP_ZOOM_STEP)}
              disabled={appZoom <= APP_ZOOM_MIN}
              aria-label="Decrease app zoom"
              title="Decrease app zoom"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            >
              <Minus size={14} weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setAppZoom(100)}
              aria-label={`Reset app zoom to 100%, currently ${appZoom}%`}
              title="Reset to 100%"
              className="min-w-16 rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)] px-2.5 py-1.5 text-center font-mono text-[11px] font-bold tabular-nums text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-light)] hover:text-[var(--accent)] cursor-pointer"
            >
              {appZoom}%
            </button>
            <button
              type="button"
              onClick={() => changeAppZoom(APP_ZOOM_STEP)}
              disabled={appZoom >= APP_ZOOM_MAX}
              aria-label="Increase app zoom"
              title="Increase app zoom"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
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
                className="ml-auto text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
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
              <p className="text-xs text-[var(--text-primary)] font-mono">Setup View Mode</p>
              <p className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">Choose between page layout or guided stepper</p>
            </div>
            <div className="flex items-center gap-2">
              {(['page', 'stepper'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSetupViewMode(mode)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                    setupViewMode === mode
                      ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                      : 'bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border border-[var(--border-primary)]/70 hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]'
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
