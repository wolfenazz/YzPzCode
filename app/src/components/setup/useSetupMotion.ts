import { useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../stores/appStore';

/** Setup motion honours both the app "animations" preference and the OS reduced-motion setting. */
export function useSetupMotion(): boolean {
  const animationsEnabled = useAppStore((state) => state.animationsEnabled);
  const reduceMotion = useReducedMotion();
  return animationsEnabled && !reduceMotion;
}

/** The single easing curve used across setup transitions. */
export const SETUP_EASE = [0.22, 1, 0.36, 1] as const;

/** Label for the platform's shortcut modifier in keyboard hints. */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl';
