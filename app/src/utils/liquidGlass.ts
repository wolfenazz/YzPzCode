/**
 * Liquid glass pointer light.
 *
 * Glass controls (see `liquid-glass.css`) draw a soft highlight at
 * `--lg-x` / `--lg-y` while hovered. One passive listener on the document
 * writes those two variables on the control under the pointer, so no control
 * needs its own handler.
 */

const CONTROLS = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary';

/** Starts tracking; returns the function that stops it. */
export const trackGlassPointer = (): (() => void) => {
  let frame = 0;
  let pending: { target: Element; x: number; y: number } | null = null;

  const flush = () => {
    frame = 0;
    if (!pending) return;
    const { target, x, y } = pending;
    pending = null;
    const control = target.closest<HTMLElement>(CONTROLS);
    if (!control) return;
    const rect = control.getBoundingClientRect();
    control.style.setProperty('--lg-x', `${Math.round(x - rect.left)}px`);
    control.style.setProperty('--lg-y', `${Math.round(y - rect.top)}px`);
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || !(event.target instanceof Element)) return;
    pending = { target: event.target, x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(flush);
  };

  document.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    document.removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
    pending = null;
  };
};
