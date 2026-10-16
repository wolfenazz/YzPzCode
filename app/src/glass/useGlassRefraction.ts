/**
 * `useGlassRefraction` — gives an element a real refracting backdrop.
 *
 * Attach the returned `ref` to the element that should read as glass, spread
 * `style` over its existing one, and the hook keeps an SVG filter sized to the
 * element's measured box and hands back the `backdrop-filter` that uses it.
 *
 * The filter is built off the render path (after layout, once the resize
 * notifications settle) because generating a displacement map is a per-pixel
 * loop: doing it inline would drop frames while a window is dragged. Until it
 * is ready the element keeps the fallback blur, so the glass upgrades in place
 * rather than flashing through an unblurred state.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

import {
  glassFilter,
  releaseGlassFilter,
  type GlassFilter,
  type GlassOptics,
} from './filterRegistry';
import { measureGlassBox } from './measure';

export interface GlassRefractionOptions extends GlassOptics {
  /** Skip the whole thing (e.g. the feature is off, or motion is reduced). */
  enabled?: boolean;
  /**
   * Above this many px² the element keeps the plain blur instead of
   * refracting. Each filter stage costs a full-size intermediate, and a large
   * pane over a flat app background has nothing behind it worth bending.
   */
  maxArea?: number;
  /** The `backdrop-filter` used before the filter is ready, and for big elements. */
  fallback?: string;
}

export type GlassMode = 'refraction' | 'blur' | 'none';

export interface GlassRefraction {
  ref: RefObject<HTMLDivElement | null>;
  /** Spread over the element's style. */
  style: CSSProperties;
  /** `refraction` once the filter is live; `blur` while it builds or if it won't fit. */
  mode: GlassMode;
}

const DEFAULT_MAX_AREA = 430_000; // ~900 x 470
const DEFAULT_FALLBACK = 'blur(24px) saturate(1.8)';

export const useGlassRefraction = (options: GlassRefractionOptions): GlassRefraction => {
  const { enabled = true, maxArea = DEFAULT_MAX_AREA, fallback = DEFAULT_FALLBACK, ...optics } =
    options;
  const ref = useRef<HTMLDivElement | null>(null);
  const held = useRef<GlassFilter | null>(null);
  const debounce = useRef<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  // Kept in a ref so an inline options object does not re-subscribe the observer.
  const latest = useRef(optics);
  latest.current = optics;

  const apply = useCallback(() => {
    const el = ref.current;
    const previous = held.current;
    const clear = () => {
      held.current = null;
      releaseGlassFilter(previous);
      setUrl(null);
    };
    if (!el || !enabled) {
      clear();
      return;
    }
    const geometry = measureGlassBox(el);
    if (geometry.width * geometry.height > maxArea) {
      clear();
      return;
    }
    const built = glassFilter({ ...latest.current, ...geometry });
    if (!built) {
      clear();
      return;
    }
    held.current = built;
    // Hand the old one back only once the new one exists, so the element never
    // passes through having no backdrop-filter at all.
    if (previous && previous.id !== built.id) releaseGlassFilter(previous);
    setUrl(built.url);
  }, [enabled, maxArea]);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      apply();
      return;
    }
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    let pending = 0;
    const observer = new ResizeObserver(() => {
      if (debounce.current !== null) window.clearTimeout(debounce.current);
      // Coalesce a burst of resize notifications into one build.
      debounce.current = window.setTimeout(() => {
        debounce.current = null;
        pending = window.setTimeout(apply, 0);
      }, 16);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (debounce.current !== null) window.clearTimeout(debounce.current);
      if (pending) window.clearTimeout(pending);
    };
  }, [apply]);

  useEffect(
    () => () => {
      releaseGlassFilter(held.current);
      held.current = null;
    },
    [],
  );

  const mode: GlassMode = url ? 'refraction' : fallback ? 'blur' : 'none';
  const value = url ?? (fallback || undefined);
  return {
    ref,
    mode,
    style: value ? { backdropFilter: value, WebkitBackdropFilter: value } : {},
  };
};
