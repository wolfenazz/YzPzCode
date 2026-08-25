import { useEffect, useRef } from 'react';

type CursorMode = 'default' | 'interactive' | 'text';

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
  'button:not(:disabled)',
  'input:not(:disabled)',
  'label',
  'select:not(:disabled)',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[data-cursor="pointer"]',
].join(',');

const getCursorMode = (target: EventTarget | null): CursorMode => {
  if (!(target instanceof Element)) return 'default';
  if (target.closest(TEXT_TARGET_SELECTOR)) return 'text';
  if (target.closest(INTERACTIVE_TARGET_SELECTOR)) return 'interactive';
  return 'default';
};

export const CustomCursor: React.FC = () => {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    let animationFrameId: number | null = null;
    let pointerX = -64;
    let pointerY = -64;
    let cursorMode: CursorMode = 'default';

    const renderPosition = (): void => {
      cursor.style.transform = `translate3d(${pointerX - 16}px, ${pointerY - 16}px, 0)`;
      cursor.classList.add('is-visible');
      animationFrameId = null;
    };

    const hideCursor = (): void => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      cursor.classList.remove('is-visible', 'is-pressed');
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') {
        hideCursor();
        return;
      }

      pointerX = event.clientX;
      pointerY = event.clientY;

      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(renderPosition);
      }
    };

    const handlePointerOver = (event: PointerEvent): void => {
      const nextMode = getCursorMode(event.target);
      if (nextMode === cursorMode) return;

      cursorMode = nextMode;
      cursor.dataset.mode = nextMode;
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse') {
        cursor.classList.add('is-pressed');
      }
    };

    const handlePointerUp = (): void => {
      cursor.classList.remove('is-pressed');
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

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerover', handlePointerOver);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('blur', hideCursor);

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div ref={cursorRef} className="custom-cursor-layer" data-mode="default" aria-hidden="true">
      <span className="custom-cursor-reticle">
        <svg viewBox="0 0 32 32" focusable="false">
          <path
            className="custom-cursor-brackets"
            d="M11 4H4v7 M21 4h7v7 M28 21v7h-7 M11 28H4v-7"
          />
          <path
            className="custom-cursor-ticks"
            d="M16 1v7 M16 24v7 M1 16h7 M24 16h7"
          />
          <circle className="custom-cursor-core" cx="16" cy="16" r="2" />
        </svg>
      </span>
      <span className="custom-cursor-pulse" />
      <span className="custom-cursor-caret" />
    </div>
  );
};
