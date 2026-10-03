import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';

export function useBackgroundMotion(enabled: boolean): boolean {
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent): void => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return enabled && animationsEnabled && !reducedMotion;
}
