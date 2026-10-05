import { useEffect, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import type { CustomTheme } from '../types';
import { buildThemeTokens, getThemeColorScheme } from '../utils/customTheme';

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
 * Writes the active custom theme's tokens onto `<html>` as inline custom
 * properties, which outrank every `.light-theme` / `.claude-theme` class rule.
 * Everything it sets is removed again when the theme changes or is switched off.
 * Call once, from the app root.
 */
export const useApplyCustomTheme = (): CustomTheme | null => {
  const theme = useActiveCustomTheme();

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const tokens = buildThemeTokens(theme);
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
    root.style.setProperty('color-scheme', getThemeColorScheme(theme));
    root.classList.add('custom-theme');
    return () => {
      for (const name of Object.keys(tokens)) root.style.removeProperty(name);
      root.style.removeProperty('color-scheme');
      root.classList.remove('custom-theme');
    };
  }, [theme]);

  return theme;
};
