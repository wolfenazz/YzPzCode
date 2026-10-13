import { useActiveTheme } from './useCustomTheme';

/** Resolve app themes to the light/dark mode expected by editors and previews. */
export const useEffectiveTheme = (): 'light' | 'dark' => {
  const activeTheme = useActiveTheme();
  return activeTheme.base;
};
