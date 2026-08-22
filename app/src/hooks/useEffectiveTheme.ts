import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';

/** Resolve the user's theme mode to the effective 'light' | 'dark' applied to the app. */
export const useEffectiveTheme = (): 'light' | 'dark' => {
  const themeMode = useAppStore((s) => s.themeMode);
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
  return themeMode;
};