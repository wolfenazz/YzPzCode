import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../stores/appStore';
import { CURSOR_SIZE_SCALE, CursorGlyph, getCursorStyle } from './cursor/cursorStyles';

type CursorMode = 'default' | 'interactive' | 'text' | 'resize-x' | 'resize-y' | 'disabled';

const TEXT_TARGET_SELECTOR = [
  'textarea',
  '[contenteditable="true"]',
  'input:not([type])',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="text"]',
  'input[type="url"]',
  '.xterm',
].join(',');

const INTERACTIVE_TARGET_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'label',
  'select',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[data-cursor="pointer"]',
  '.term-header',
].join(',');

const DISABLED_TARGET_SELECTOR = ':disabled, [aria-disabled="true"]';

/** How many ancestors to search for an explicit `cursor-*` utility class. */
const CURSOR_CLASS_DEPTH = 8;

/** Maps a CSS `cursor` value to a mode, or null when it carries no information. */
const modeFromCursorValue = (value: string): CursorMode | null => {
  switch (value) {
    case 'col-resize':
    case 'ew-resize':
    case 'e-resize':
    case 'w-resize':
      return 'resize-x';
    case 'row-resize':
    case 'ns-resize':
    case 'n-resize':
    case 's-resize':
      return 'resize-y';
    case 'not-allowed':
    case 'no-drop':
      return 'disabled';
    case 'pointer':
    case 'grab':
    case 'grabbing':
    case 'move':
      return 'interactive';
    case 'text':
    case 'vertical-text':
      return 'text';
    default:
      return null;
  }
};

/** The nearest explicit Tailwind `cursor-*` class, e.g. `cursor-col-resize` on a splitter. */
const modeFromCursorClass = (target: Element): CursorMode | null => {
  let element: Element | null = target;
  for (let depth = 0; element && depth < CURSOR_CLASS_DEPTH; depth += 1) {
    for (const token of element.classList) {
      if (token.startsWith('cursor-')) return modeFromCursorValue(token.slice('cursor-'.length));
    }
    element = element.parentElement;
  }
  return null;
};

const getCursorMode = (target: EventTarget | null): CursorMode => {
  if (!(target instanceof Element)) return 'default';
  if (target.closest(DISABLED_TARGET_SELECTOR)) return 'disabled';
  if (target.closest(TEXT_TARGET_SELECTOR)) return 'text';
  const fromClass = modeFromCursorClass(target);
  if (fromClass) return fromClass;
  if (target.closest(INTERACTIVE_TARGET_SELECTOR)) return 'interactive';
  return 'default';
};

/** While dragging a splitter the app sets `document.body.style.cursor`; honour it. */
const getForcedMode = (): CursorMode | null => {
  const value = document.body.style.cursor;
  return value ? modeFromCursorValue(value) : null;
};

interface Follower {
  element: HTMLElement;
  /** Fraction of the remaining distance covered per 60 Hz frame. */
  ease: number;
  x: number;
  y: number;
}

const FRAME_MS = 1000 / 60;
const SETTLED_DISTANCE = 0.15;
/** Anything off-screen; keeps the layer out of sight until the first pointer move. */
const OFFSCREEN = -64;

export const CustomCursor: React.FC = () => {
  const cursorStyle = useAppStore((state) => state.cursorStyle);
  const cursorSize = useAppStore((state) => state.cursorSize);
  const layerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: OFFSCREEN, y: OFFSCREEN, visible: false });

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const pointer = pointerRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const followers: Follower[] = Array.from(layer.querySelectorAll<HTMLElement>('.cc-follower')).map(
      (element) => ({
        element,
        ease: Number(element.dataset.k) || 0.2,
        x: pointer.x,
        y: pointer.y,
      }),
    );

    let frameId: number | null = null;
    let lastFrameTime = 0;
    let targetMode: CursorMode = 'default';
    let appliedMode: CursorMode = 'default';

    const syncMode = (): void => {
      const mode = getForcedMode() ?? targetMode;
      if (mode === appliedMode) return;
      appliedMode = mode;
      layer.dataset.mode = mode;
    };

    const snapFollowers = (): void => {
      for (const follower of followers) {
        follower.x = pointer.x;
        follower.y = pointer.y;
      }
    };

    const renderFrame = (now: number): void => {
      frameId = null;
      const elapsed = Math.min(48, lastFrameTime ? now - lastFrameTime : FRAME_MS);
      lastFrameTime = now;

      layer.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      layer.classList.add('is-visible');
      syncMode();

      const snap = reducedMotion.matches || document.documentElement.classList.contains('animations-disabled');
      let settling = false;
      for (const follower of followers) {
        // Frame-rate independent easing so the lag feels the same at 60 and 144 Hz.
        const step = snap ? 1 : 1 - Math.pow(1 - follower.ease, elapsed / FRAME_MS);
        follower.x += (pointer.x - follower.x) * step;
        follower.y += (pointer.y - follower.y) * step;
        if (Math.abs(pointer.x - follower.x) > SETTLED_DISTANCE || Math.abs(pointer.y - follower.y) > SETTLED_DISTANCE) {
          settling = true;
        } else {
          follower.x = pointer.x;
          follower.y = pointer.y;
        }
        follower.element.style.transform = `translate3d(${follower.x - pointer.x}px, ${follower.y - pointer.y}px, 0)`;
      }

      if (settling) {
        frameId = window.requestAnimationFrame(renderFrame);
      } else {
        lastFrameTime = 0;
      }
    };

    const scheduleFrame = (): void => {
      if (frameId === null) frameId = window.requestAnimationFrame(renderFrame);
    };

    const hideCursor = (): void => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      lastFrameTime = 0;
      pointer.visible = false;
      layer.classList.remove('is-visible', 'is-pressed');
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') {
        hideCursor();
        return;
      }

      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!pointer.visible) {
        // Reappearing: start the trail at the pointer instead of flying in from the old spot.
        pointer.visible = true;
        snapFollowers();
      }
      scheduleFrame();
    };

    const handlePointerOver = (event: PointerEvent): void => {
      targetMode = getCursorMode(event.target);
      syncMode();
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse') {
        layer.classList.add('is-pressed');
      }
    };

    const handlePointerUp = (): void => {
      layer.classList.remove('is-pressed');
    };

    const handlePointerOut = (event: PointerEvent): void => {
      if (event.relatedTarget === null) {
        hideCursor();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerover', handlePointerOver, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('pointercancel', handlePointerUp, { passive: true });
    window.addEventListener('pointerout', handlePointerOut, { passive: true });
    window.addEventListener('blur', hideCursor);

    // A style switch re-runs this effect with the pointer already on screen.
    if (pointer.visible) {
      snapFollowers();
      scheduleFrame();
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerover', handlePointerOver);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('blur', hideCursor);

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [cursorStyle]);

  // The native cursor is hidden app-wide, so this layer must stay above every overlay.
  // z-index cannot do that: the app shell is an isolated stacking context, so body-level
  // portals (spawn palette) paint over it, and a modal <dialog> sits in the top layer.
  // Promote the layer into the top layer, and re-promote it whenever a dialog opens.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof layer.showPopover !== 'function') return;

    const promote = (): void => {
      try {
        if (layer.matches(':popover-open')) layer.hidePopover();
        layer.showPopover();
      } catch {
        // Not connected yet; the z-index fallback still applies.
      }
    };
    promote();

    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.target instanceof HTMLDialogElement && record.target.open)) promote();
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

    return () => {
      observer.disconnect();
      try {
        if (layer.matches(':popover-open')) layer.hidePopover();
      } catch {
        // Already detached.
      }
    };
  }, []);

  const definition = getCursorStyle(cursorStyle);

  return createPortal(
    <div
      ref={layerRef}
      className="custom-cursor-layer"
      popover="manual"
      data-mode="default"
      data-style={definition.id}
      style={{ '--cc-scale': CURSOR_SIZE_SCALE[cursorSize] } as CSSProperties}
      aria-hidden="true"
    >
      <CursorGlyph id={definition.id} key={definition.id} />
    </div>,
    document.body,
  );
};
