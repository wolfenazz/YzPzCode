import type { Terminal } from '@xterm/xterm';

const renderers = new Set<Terminal>();
let atlasFrame: number | null = null;

export function registerTerminalRenderer(terminal: Terminal): () => void {
  renderers.add(terminal);
  return () => {
    renderers.delete(terminal);
    if (renderers.size === 0 && atlasFrame !== null) {
      cancelAnimationFrame(atlasFrame);
      atlasFrame = null;
    }
  };
}

export function refreshTerminalAtlases(): void {
  if (atlasFrame !== null || renderers.size === 0) return;
  atlasFrame = requestAnimationFrame(() => {
    atlasFrame = null;
    // xterm 6 / addon-webgl 0.19 share atlases across matching terminals.
    // Clearing only one leaves the others' cached glyph coordinates stale
    // (xtermjs/xterm.js#6014). Invalidate EVERY model in the same JS task,
    // including hidden terminals, before any renderer can draw again.
    for (const terminal of renderers) terminal.clearTextureAtlas();
    for (const terminal of renderers) {
      if (terminal.rows > 0) terminal.refresh(0, terminal.rows - 1);
    }
  });
}

export function observeTerminalLayout(
  element: HTMLElement,
  fit: (forceRepaint: boolean) => void,
): () => void {
  let firstFrame: number | null = null;
  let secondFrame: number | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let settledTimer: ReturnType<typeof setTimeout> | null = null;
  let wasHidden = true;
  let needsRepaint = true;

  const isVisible = (): boolean => {
    const rect = element.getBoundingClientRect();
    return document.visibilityState !== 'hidden' && rect.width >= 2 && rect.height >= 2;
  };

  const fitVisible = (): void => {
    if (!isVisible()) {
      wasHidden = true;
      needsRepaint = true;
      return;
    }
    const repaint = needsRepaint || wasHidden;
    wasHidden = false;
    needsRepaint = false;
    fit(repaint);
  };

  const cancelFrames = (): void => {
    if (firstFrame !== null) cancelAnimationFrame(firstFrame);
    if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    firstFrame = null;
    secondFrame = null;
  };

  const scheduleVisibleFit = (): void => {
    needsRepaint = true;
    if (!isVisible()) {
      wasHidden = true;
      return;
    }
    cancelFrames();
    if (settledTimer !== null) clearTimeout(settledTimer);
    firstFrame = requestAnimationFrame(() => {
      firstFrame = null;
      secondFrame = requestAnimationFrame(() => {
        secondFrame = null;
        fitVisible();
      });
    });
    // Webviews can settle backing-store dimensions after the next paint.
    settledTimer = setTimeout(() => {
      settledTimer = null;
      needsRepaint = true;
      fitVisible();
    }, 160);
  };

  const handleResize = (): void => {
    const hidden = !isVisible();
    // Keep the visibility repaint latched through subsequent resize events;
    // debouncing must not erase it when the final cell count is unchanged.
    needsRepaint ||= wasHidden || hidden;
    wasHidden = hidden;
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      fitVisible();
    }, 100);
  };

  const handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      wasHidden = true;
      needsRepaint = true;
    } else {
      scheduleVisibleFit();
    }
  };

  const handleAncestorScroll = (event: Event): void => {
    if (!(event.target instanceof Node) || !event.target.contains(element)) return;
    // A scrolled grid can reveal a clipped canvas without changing its size.
    // Repaint once scrolling settles, leaving xterm's own scrollback alone.
    if (settledTimer !== null) clearTimeout(settledTimer);
    settledTimer = setTimeout(() => {
      settledTimer = null;
      needsRepaint = true;
      fitVisible();
    }, 160);
  };

  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(element);
  const visibilityObserver = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) scheduleVisibleFit();
      });
  visibilityObserver?.observe(element);
  window.addEventListener('resize', handleResize);
  window.addEventListener('focus', scheduleVisibleFit);
  document.addEventListener('visibilitychange', handleVisibility);
  document.addEventListener('scroll', handleAncestorScroll, { capture: true, passive: true });
  scheduleVisibleFit();

  return () => {
    cancelFrames();
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    if (settledTimer !== null) clearTimeout(settledTimer);
    resizeObserver.disconnect();
    visibilityObserver?.disconnect();
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('focus', scheduleVisibleFit);
    document.removeEventListener('visibilitychange', handleVisibility);
    document.removeEventListener('scroll', handleAncestorScroll, true);
  };
}
