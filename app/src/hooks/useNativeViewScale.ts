import { useSyncExternalStore } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from '../stores/appStore';

// Native child webviews (in-app browser, extension panels) are positioned in
// the window's logical pixels, while DOM rects are CSS pixels of the main
// webview. The two differ by more than the in-app zoom: WebView2 folds the
// Windows "Text size" accessibility setting into its rasterization scale, so
// on such machines every CSS pixel is larger than a logical pixel and the
// child views come out shrunk toward the top-left. devicePixelRatio carries
// monitor scale × text scale × page zoom, so dividing by the window's monitor
// scale gives the real CSS → logical factor.

let windowScale: number | null = null;
let factor: number | null = null;
let started = false;
let dprQuery: MediaQueryList | null = null;
const listeners = new Set<() => void>();

const recompute = (): void => {
  const next = windowScale && windowScale > 0
    ? Math.round((window.devicePixelRatio / windowScale) * 10000) / 10000
    : null;
  if (next === factor) return;
  factor = next;
  listeners.forEach((listener) => listener());
};

const refreshWindowScale = async (): Promise<void> => {
  try {
    windowScale = await getCurrentWindow().scaleFactor();
  } catch {
    windowScale = null;
  }
  recompute();
};

const onDevicePixelRatioChange = (): void => {
  watchDevicePixelRatio();
  void refreshWindowScale();
};

// A resolution query matches only the current ratio, so re-arm it on change.
const watchDevicePixelRatio = (): void => {
  dprQuery?.removeEventListener('change', onDevicePixelRatioChange);
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  dprQuery.addEventListener('change', onDevicePixelRatioChange);
};

const start = (): void => {
  if (started || !('__TAURI_INTERNALS__' in window)) return;
  started = true;
  watchDevicePixelRatio();
  window.addEventListener('resize', recompute);
  void refreshWindowScale();
  void getCurrentWindow()
    .onScaleChanged(({ payload }) => {
      windowScale = payload.scaleFactor;
      recompute();
    })
    .catch(() => undefined);
};

const subscribe = (listener: () => void): (() => void) => {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getSnapshot = (): number | null => factor;

/** Multiplier from main-webview CSS pixels to window logical pixels. */
export function useNativeViewScale(): number {
  const appZoom = useAppStore((state) => state.appZoom);
  const measured = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Until the window scale is known, the in-app zoom is the best estimate.
  return measured ?? appZoom / 100;
}
