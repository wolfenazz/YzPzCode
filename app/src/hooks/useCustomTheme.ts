import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import type { CustomTheme } from '../types';
import { buildThemeTokens, getThemeColorScheme, resolveActiveTheme } from '../utils/customTheme';

/** The active theme in use (built-in or custom), fully resolved into a CustomTheme object. */
export const useActiveTheme = (): CustomTheme => {
  const themeMode = useAppStore((s) => s.themeMode);
  const activeId = useAppStore((s) => s.activeCustomThemeId);
  const themes = useAppStore((s) => s.customThemes);
  const accentColor = useAppStore((s) => s.accentColor);
  const [systemDark, setSystemDark] = useState<boolean>(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    if (themeMode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeMode]);

  return useMemo(
    () =>
      resolveActiveTheme({
        themeMode,
        activeCustomThemeId: activeId,
        customThemes: themes,
        accentColor,
        systemDark,
      }),
    [themeMode, activeId, themes, accentColor, systemDark],
  );
};

/** The custom theme currently in use, or null when a built-in theme is active. */
export const useActiveCustomTheme = (): CustomTheme | null => {
  const themeMode = useAppStore((s) => s.themeMode);
  const activeId = useAppStore((s) => s.activeCustomThemeId);
  const themes = useAppStore((s) => s.customThemes);
  return useMemo(
    () => (themeMode === 'custom' ? (themes.find((theme) => theme.id === activeId) ?? null) : null),
    [themeMode, activeId, themes],
  );
};

/**
 * Writes the active theme's tokens onto `<html>` as inline custom
 * properties, which outrank every stylesheet rule and ensure terminals,
 * editor, cards, and chrome all synchronize to the theme.
 * Call once, from the app root.
 */
export const useApplyTheme = (): CustomTheme => {
  const theme = useActiveTheme();
  const themeMode = useAppStore((s) => s.themeMode);

  useEffect(() => {
    const root = document.documentElement;
    const tokens = buildThemeTokens(theme);
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
    root.style.setProperty('color-scheme', getThemeColorScheme(theme));

    root.classList.toggle('custom-theme', themeMode === 'custom');
    root.classList.toggle('light-theme', theme.base === 'light');
    root.classList.toggle('dark-theme', theme.base === 'dark');
    root.classList.toggle('claude-theme', themeMode === 'claude');
    root.classList.toggle('yzpz-theme', themeMode === 'yzpz');

    return () => {
      for (const name of Object.keys(tokens)) root.style.removeProperty(name);
      root.style.removeProperty('color-scheme');
      root.classList.remove('custom-theme', 'light-theme', 'dark-theme', 'claude-theme', 'yzpz-theme');
    };
  }, [theme, themeMode]);

  return theme;
};

/** Backward-compatible alias for useApplyTheme. */
export const useApplyCustomTheme = useApplyTheme;

