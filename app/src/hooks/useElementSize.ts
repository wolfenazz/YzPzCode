import { useEffect, useRef, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Observes an element's size via ResizeObserver and returns its live
 * dimensions. Used by the agent pane to collapse chrome when the pane
 * gets small (mirrors how TTY sessions re-fit to their grid cell).
 * Updates are coalesced on a rAF so resize storms don't spam re-renders.
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>(): {
  ref: React.RefObject<T | null>;
  width: number;
  height: number;
} {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let rafId = 0;

    const update = () => {
      rafId = 0;
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      );
    };

    const observer = new ResizeObserver(() => {
      if (rafId) return;
      rafId = requestAnimationFrame(update);
    });
    observer.observe(el);
    update();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  return { ref, width: size.width, height: size.height };
}
