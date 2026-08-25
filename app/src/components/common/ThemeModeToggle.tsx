import React, { useState } from 'react';
import { Desktop, Moon, Sun } from '@phosphor-icons/react';
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

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ElementType }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'claude', label: 'Claude', icon: ClaudeLogoIcon },
  { value: 'yzpz', label: 'YzPzCode', icon: YzPzLogoIcon },
  { value: 'system', label: 'System', icon: Desktop },
];

export const ThemeModeToggle: React.FC = () => {
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const setAccentColor = useAppStore((s) => s.setAccentColor);
  const [isChanging, setIsChanging] = useState(false);

  const current = THEME_OPTIONS.find((option) => option.value === themeMode) ?? THEME_OPTIONS[1];
  const CurrentIcon = current.icon;

  const cycleTheme = () => {
    const currentIndex = THEME_OPTIONS.findIndex((option) => option.value === themeMode);
    const nextTheme = THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length];
    setThemeMode(nextTheme.value);
    if (nextTheme.value === 'claude') {
      setAccentColor('default');
    } else if (nextTheme.value === 'yzpz') {
      setAccentColor('burple');
    }
    setIsChanging(true);
    window.setTimeout(() => setIsChanging(false), 300);
  };

  return (
    <button
      type="button"
      className="app-icon-button"
      title={`Theme: ${current.label} · Click for ${THEME_OPTIONS[(THEME_OPTIONS.findIndex((option) => option.value === themeMode) + 1) % THEME_OPTIONS.length]?.label ?? 'next theme'}`}
      onClick={cycleTheme}
    >
      <span key={current.value} className={isChanging ? 'theme-switch-icon' : undefined}>
        <CurrentIcon size={16} aria-hidden="true" />
      </span>
      <span className="sr-only">Change theme</span>
    </button>
  );
};
