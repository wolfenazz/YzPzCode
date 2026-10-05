import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { useActiveCustomTheme } from './useCustomTheme';

/** Resolve app themes to the light/dark mode expected by editors and previews. */
export const useEffectiveTheme = (): 'light' | 'dark' => {
  const themeMode = useAppStore((s) => s.themeMode);
  const customBase = useActiveCustomTheme()?.base;
  const [systemDark, setSystemDark] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    if (themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeMode]);

  if (themeMode === 'system') return systemDark ? 'dark' : 'light';
  if (themeMode === 'claude') return 'light';
  if (themeMode === 'yzpz') return 'dark';
  if (themeMode === 'custom') return customBase ?? 'dark';
  return themeMode;
};
