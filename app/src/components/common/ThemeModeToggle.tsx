import React, { useMemo, useState } from 'react';
import { Desktop, Moon, Palette, Sun } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import type { ThemeMode } from '../../types';
import claudeLogo from '../../assets/claude.png';
import yzpzLogo from '../../assets/YzPzCodeLogo.png';

const ClaudeLogoIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <img src={claudeLogo} alt="" style={{ width: size, height: size }} className="object-contain opacity-85" />
);

const YzPzLogoIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <img src={yzpzLogo} alt="" style={{ width: size, height: size }} className="object-contain opacity-85" />
);

const THEME_OPTIONS: Array<{ value: Exclude<ThemeMode, 'custom'>; label: string; icon: React.ElementType }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'claude', label: 'Claude', icon: ClaudeLogoIcon },
  { value: 'yzpz', label: 'YzPzCode', icon: YzPzLogoIcon },
  { value: 'system', label: 'System', icon: Desktop },
];

export interface ThemeChoice {
  key: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  /** One of the user's own themes rather than a built-in. */
  custom: boolean;
  select: () => void;
}

/** Every theme the user can switch to, with the store wiring for selecting it. */
export const useThemeChoices = (): ThemeChoice[] => {
  const themeMode = useAppStore((s) => s.themeMode);
  const customThemes = useAppStore((s) => s.customThemes);
  const activeCustomThemeId = useAppStore((s) => s.activeCustomThemeId);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const applyCustomTheme = useAppStore((s) => s.applyCustomTheme);
  const setAccentColor = useAppStore((s) => s.setAccentColor);

  // Built-in themes first, then the user's own, in the order they appear in Settings.
  return useMemo<ThemeChoice[]>(
    () => [
      ...THEME_OPTIONS.map((option) => ({
        key: option.value,
        label: option.label,
        icon: option.icon,
        active: themeMode === option.value,
        custom: false,
        select: () => {
          setThemeMode(option.value);
          if (option.value === 'claude') {
            setAccentColor('default');
          } else if (option.value === 'yzpz') {
            setAccentColor('burple');
          }
        },
      })),
      ...customThemes.map((theme) => ({
        key: `custom:${theme.id}`,
        label: theme.name,
        icon: Palette,
        active: themeMode === 'custom' && activeCustomThemeId === theme.id,
        custom: true,
        select: () => applyCustomTheme(theme.id),
      })),
    ],
    [themeMode, customThemes, activeCustomThemeId, setThemeMode, setAccentColor, applyCustomTheme],
  );
};

export const ThemeModeToggle: React.FC = () => {
  const choices = useThemeChoices();
  const [isChanging, setIsChanging] = useState(false);

  const currentIndex = Math.max(0, choices.findIndex((choice) => choice.active));
  const current = choices[currentIndex];
  const next = choices[(currentIndex + 1) % choices.length];
  const CurrentIcon = current.icon;

  const cycleTheme = () => {
    next.select();
    setIsChanging(true);
    window.setTimeout(() => setIsChanging(false), 300);
  };

  return (
    <button
      type="button"
      className="chrome-btn"
      title={`Theme: ${current.label} · Click for ${next.label}`}
      aria-label={`Theme: ${current.label}. Switch theme`}
      onClick={cycleTheme}
    >
      <span key={current.key} className={isChanging ? 'theme-switch-icon' : undefined}>
        <CurrentIcon size={16} aria-hidden="true" />
      </span>
    </button>
  );
};
