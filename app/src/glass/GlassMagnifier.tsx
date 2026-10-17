/**
 * A lens you can drag around the window.
 *
 * This is the reference implementation's `MagnifyingGlass` as a component: a
 * round piece of glass whose backdrop is bent by a displacement filter, with a
 * centre zoom on top of it, thick enough at the rim to read as a real lens.
 *
 * Two things make it feel like glass rather than a picture of glass:
 *   - the filter is built for the *element's* box (`glassFilter`), with the
 *     round bezel profile and `maxShift` wide enough that the rim is a wide
 *     band rather than a hairline — that band is where the bend is visible;
 *   - the centre `zoom` pass enlarges the backdrop about the middle, on top of
 *     the bezel's own pull, which is what an actual lens does. Without it the
 *     middle of a big lens looks like a window;
 *   - the rim disperses: blue bends a little further than red, so edges seen
 *     through the bezel pick up the faint colour fringe of real glass.
 *
 * The lens trails the pointer on a spring rather than snapping to it, so
 * dragging has some weight; releasing lets it settle. It is `position: fixed`
 * at the top of the stacking order and `pointer-events: none` except while
 * grabbed, so the rest of the app stays usable underneath it.
 *
 * Off by default. Settings → Appearance → Liquid glass turns it on, and the
 * whole thing is inert unless the feature itself is on.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { glassFilter, preset, releaseGlassFilter, type GlassFilter } from './filterRegistry';
import './glass-magnifier.css';

type Axis = { x: number; v: number };

/** Critically-damped-ish spring: position chases the pointer, no bounce. */
const FOLLOW = { k: 320, zeta: 0.86 };
const DRAG_THRESHOLD = 2;

const step = (axis: Axis, target: number, { k, zeta }: typeof FOLLOW, dt: number): void => {
  const accel = -k * (axis.x - target) - 2 * zeta * Math.sqrt(k) * axis.v;
  axis.v += accel * dt;
  axis.x += axis.v * dt;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface GlassMagnifierProps {
  /** Diameter in CSS px. */
  size?: number;
  /** Magnification at the centre, as a factor. */
  zoom?: number;
  /** Where it starts, as a fraction of the viewport. */
  initialPosition?: { x: number; y: number };
}

export const GlassMagnifier = ({
  size = 176,
  zoom = 1.6,
  initialPosition = { x: 0.72, y: 0.32 },
}: GlassMagnifierProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const held = useRef<GlassFilter | null>(null);
  const position = useRef<Axis>({ x: 0, v: 0 });
  const target = useRef({ x: 0, y: 0 });
  const y = useRef<Axis>({ x: 0, v: 0 });
  const frame = useRef(0);
  const lastTime = useRef(0);
  const pointerId = useRef<number | null>(null);
  const grab = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const [draggingState, setDraggingState] = useState(false);

  /**
   * Builds the lens filter and writes it onto the element. Kept as one
   * function so the box, the profile and the zoom can never drift apart: the
   * displacement map is indexed by distance from the edge, so a filter built
   * for another size would put the rim in the wrong place.
   */
  const cut = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const previous = held.current;
    const filter = glassFilter({
      ...preset('lens'),
      width: size,
      height: size,
      radius: size / 2,
      shape: 'pill',
      zoom,
      // Fringing only at the rim: any more and the text on the face grows colour edges.
      dispersion: 0.012,
      // A hand lens is thick: a wide, strongly-bending rim is the point.
      bezelWidth: Math.round(size * 0.15),
      glassThickness: Math.round(size * 0.38),
      scaleRatio: 0.4,
      specularOpacity: 0.9,
      specularSaturation: 4,
      specularWidth: Math.max(4, size * 0.04),
    });
    held.current = filter;
    if (previous && previous.id !== filter?.id) releaseGlassFilter(previous);
    if (filter) {
      el.style.setProperty('backdrop-filter', filter.url);
      el.style.setProperty('-webkit-backdrop-filter', filter.url);
      el.setAttribute('data-glass-refracting', '');
    } else {
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
      el.removeAttribute('data-glass-refracting');
    }
  }, [size, zoom]);

  useEffect(() => {
    cut();
    return () => {
      releaseGlassFilter(held.current);
      held.current = null;
    };
  }, [cut]);

  // Settle into place, then follow the pointer only when it is grabbed: a lens
  // that chased the cursor around would make the app impossible to use.
  useEffect(() => {
    const start = {
      x: window.innerWidth * initialPosition.x - size / 2,
      y: window.innerHeight * initialPosition.y - size / 2,
    };
    position.current.x = start.x;
    y.current.x = start.y;
    target.current = { x: start.x, y: start.y };

    const paintNow = () => {
      const el = ref.current;
      if (!el) return;
      el.style.translate = `${position.current.x.toFixed(2)}px ${y.current.x.toFixed(2)}px`;
      el.toggleAttribute('data-glass-zoom-active', dragging.current);
    };
    paintNow();

    const tick = (now: number) => {
      frame.current = 0;
      const dt = clamp((now - lastTime.current) / 1000, 0, 1 / 30);
      lastTime.current = now;
      const substeps = Math.max(1, Math.ceil(dt * 240));
      const h = dt / substeps;
      for (let i = 0; i < substeps; i += 1) {
        step(position.current, target.current.x, FOLLOW, h);
        step(y.current, target.current.y, FOLLOW, h);
      }
      paintNow();
      const settled =
        Math.abs(position.current.x - target.current.x) < 0.1 &&
        Math.abs(y.current.x - target.current.y) < 0.1 &&
        Math.abs(position.current.v) < 0.5 &&
        Math.abs(y.current.v) < 0.5;
      if (!settled) frame.current = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (frame.current) return;
      lastTime.current = performance.now();
      frame.current = requestAnimationFrame(tick);
    };

    const half = size / 2;
    const onDown = (event: PointerEvent) => {
      const el = ref.current;
      if (!el || event.button !== 0 || pointerId.current !== null) return;
      const box = el.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (!inside) return;
      pointerId.current = event.pointerId;
      dragging.current = false;
      grab.current = {
        x: event.clientX - box.left - half,
        y: event.clientY - box.top - half,
      };
    };
    const onMove = (event: PointerEvent) => {
      if (pointerId.current === null || event.pointerId !== pointerId.current) return;
      if (!dragging.current) {
        if (Math.abs(grab.current.x) + Math.abs(grab.current.y) < DRAG_THRESHOLD) return;
        dragging.current = true;
        setDraggingState(true);
      }
      target.current = {
        x: clamp(event.clientX - half - grab.current.x, -half * 0.4, window.innerWidth - half * 0.6),
        y: clamp(event.clientY - half - grab.current.y, -half * 0.4, window.innerHeight - half * 0.6),
      };
      wake();
    };
    const onUp = (event: PointerEvent) => {
      if (pointerId.current === null || event.pointerId !== pointerId.current) return;
      pointerId.current = null;
      dragging.current = false;
      setDraggingState(false);
      // Keep it on screen after a drag that ended off the edge.
      target.current = {
        x: clamp(target.current.x, 4, Math.max(4, window.innerWidth - size - 4)),
        y: clamp(target.current.y, 4, Math.max(4, window.innerHeight - size - 4)),
      };
      wake();
    };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [size, initialPosition.x, initialPosition.y]);

  return (
    <div
      ref={ref}
      className="lg-magnifier"
      data-glass-zoom={draggingState ? 'held' : undefined}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Magnifier"
      title="Drag to move the magnifier"
    />
  );
};
