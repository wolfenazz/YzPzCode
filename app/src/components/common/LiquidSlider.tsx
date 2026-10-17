import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { glassFilter, releaseGlassFilter, preset } from '../../glass/filterRegistry';
import './LiquidSlider.css';

/**
 * The iOS 26 "Liquid Glass" slider.
 *
 * At rest the thumb is a white pill on a thin track. Pressing it springs it up
 * into a clear glass lens that bends the track seen through it; dragging
 * stretches the lens along the motion and it wobbles back when it stops;
 * releasing springs it back into the white pill.
 *
 * A real, invisible `<input type="range">` sits on top and takes every pointer
 * and keyboard event, so props, events, forms and accessibility are those of a
 * native range input. `className` and `style` go to the outer element (width,
 * flex, `--lq-fill` for the tint); everything else goes to the input.
 */

type LiquidSliderSize = 'sm' | 'md';

export type LiquidSliderProps = Omit<React.ComponentPropsWithRef<'input'>, 'type' | 'size'> & {
  size?: LiquidSliderSize;
};

/** Thumb at rest (r) and pressed (p), track height, in CSS px. */
const DIMS: Record<LiquidSliderSize, { rw: number; rh: number; pw: number; ph: number; track: number }> = {
  sm: { rw: 24, rh: 15, pw: 36, ph: 23, track: 4 },
  md: { rw: 32, rh: 20, pw: 48, ph: 30, track: 6 },
};

/** Spring constants (stiffness, damping ratio). */
const POSITION = { k: 1500, zeta: 1 };
const PRESS = { k: 520, zeta: 0.52 };
const STRETCH = { k: 560, zeta: 0.4 };
const MAX_STRETCH = 0.3;
const STRETCH_SPEED = 2400; // px/s at which the lens is fully stretched

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const reducedMotion = () =>
  document.documentElement.classList.contains('animations-disabled') ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Advances a damped spring by `dt` seconds; returns [position, velocity]. */
const spring = (x: number, v: number, target: number, { k, zeta }: { k: number; zeta: number }, dt: number): [number, number] => {
  const accel = -k * (x - target) - 2 * zeta * Math.sqrt(k) * v;
  const nv = v + accel * dt;
  return [x + nv * dt, nv];
};

export const LiquidSlider = ({ size = 'md', className, style, ref, ...input }: LiquidSliderProps) => {
  const rootRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dims = DIMS[size];
  const motion = useRef({
    pos: -1,
    posV: 0,
    press: 0,
    pressV: 0,
    stretch: 0,
    stretchV: 0,
    active: false,
    rtl: 1,
    raf: 0,
    last: 0,
  });

  const setInput = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') return ref(node);
      if (ref) ref.current = node;
      return undefined;
    },
    [ref],
  );

  /** Where the value sits along the track, 0 → 1. */
  const readTarget = useCallback(() => {
    const el = inputRef.current;
    if (!el) return 0;
    const min = el.min === '' ? 0 : Number(el.min);
    const max = el.max === '' ? 100 : Number(el.max);
    const value = Number(el.value);
    return max > min && Number.isFinite(value) ? clamp((value - min) / (max - min), 0, 1) : 0;
  }, []);

  const paint = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const m = motion.current;
    const press = clamp(m.press, -0.2, 1.25);
    const growX = dims.rw / dims.pw + (1 - dims.rw / dims.pw) * press;
    const growY = dims.rh / dims.ph + (1 - dims.rh / dims.ph) * press;
    // The lens trails a little behind the way it is moving.
    const trail = -Math.sign(m.posV) * m.stretch * dims.rw * 0.22 * m.rtl;
    root.style.setProperty('--lq-pos', m.pos.toFixed(5));
    root.style.setProperty('--lq-sx', (growX * (1 + m.stretch)).toFixed(4));
    root.style.setProperty('--lq-sy', (growY * (1 - m.stretch * 0.42)).toFixed(4));
    root.style.setProperty('--lq-tx', `${trail.toFixed(2)}px`);
    root.style.setProperty('--lq-glass', clamp(press * 1.7, 0, 1).toFixed(3));
    root.style.setProperty('--lq-cap', (1 - clamp(press * 1.35, 0, 1)).toFixed(3));
  }, [dims]);

  const frame = useCallback(
    (now: number) => {
      const m = motion.current;
      const root = rootRef.current;
      if (!root) {
        m.raf = 0;
        return;
      }
      const target = readTarget();
      const pressTarget = m.active ? 1 : 0;
      const dt = clamp((now - m.last) / 1000, 0, 1 / 30);
      m.last = now;

      if (reducedMotion()) {
        Object.assign(m, { pos: target, posV: 0, press: pressTarget, pressV: 0, stretch: 0, stretchV: 0 });
      } else {
        const travel = Math.max(root.clientWidth - dims.rw, 1);
        // Small fixed steps keep the stiff springs stable at any frame rate.
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let s = 0; s < steps; s += 1) {
          [m.pos, m.posV] = spring(m.pos, m.posV, target, POSITION, h);
          [m.press, m.pressV] = spring(m.press, m.pressV, pressTarget, PRESS, h);
          const speed = Math.abs(m.posV) * travel;
          const stretchTarget = clamp(speed / STRETCH_SPEED, 0, 1) * MAX_STRETCH * (m.active ? 1 : 0.55);
          [m.stretch, m.stretchV] = spring(m.stretch, m.stretchV, stretchTarget, STRETCH, h);
        }
      }

      const settled =
        Math.abs(m.pos - target) < 1e-4 &&
        Math.abs(m.posV) < 1e-3 &&
        Math.abs(m.press - pressTarget) < 1e-3 &&
        Math.abs(m.pressV) < 1e-2 &&
        Math.abs(m.stretch) < 1e-3 &&
        Math.abs(m.stretchV) < 1e-2;
      if (settled) {
        Object.assign(m, { pos: target, posV: 0, press: pressTarget, pressV: 0, stretch: 0, stretchV: 0 });
      }
      paint();
      m.raf = settled ? 0 : requestAnimationFrame(frame);
    },
    [dims, paint, readTarget],
  );

  const kick = useCallback(() => {
    const m = motion.current;
    if (m.pos < 0) {
      // First paint: no animation into place.
      m.pos = readTarget();
      paint();
      return;
    }
    if (m.raf) return;
    if (!m.active && m.press === 0 && m.stretch === 0 && Math.abs(readTarget() - m.pos) < 1e-4) return;
    if (rootRef.current) m.rtl = getComputedStyle(rootRef.current).direction === 'rtl' ? -1 : 1;
    m.last = performance.now();
    m.raf = requestAnimationFrame(frame);
  }, [frame, paint, readTarget]);

  // Controlled values change on render; follow them (animated, like iOS).
  useLayoutEffect(() => {
    kick();
  });

  useEffect(() => {
    const el = inputRef.current;
    const root = rootRef.current;
    if (!el || !root) return undefined;
    // A real lens for the thumb: a displacement-map filter for exactly the box
    // the glass layer swells to. The track seen through it is magnified (it
    // reads thicker inside the lens than outside, as on iOS) and curls in at
    // the rim. `--lq-lens` is the first entry of the layer's backdrop-filter;
    // the sheet appends its saturation and brightness after it.
    const lens = glassFilter({
      ...preset('thumb'),
      width: dims.pw,
      height: dims.ph,
      radius: dims.ph / 2,
      shape: 'pill',
      zoom: 1.32,
      scaleRatio: 0.5,
      specularOpacity: 0.75,
      specularSaturation: 4,
      blur: 0.2,
    });
    if (lens) root.style.setProperty('--lq-lens', lens.url);

    const release = () => {
      if (!motion.current.active) return;
      motion.current.active = false;
      root.removeAttribute('data-active');
      kick();
    };
    const press = (event: PointerEvent) => {
      if (el.disabled || event.button !== 0) return;
      motion.current.active = true;
      root.setAttribute('data-active', '');
      kick();
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('input', kick);
    el.addEventListener('lostpointercapture', release);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      el.removeEventListener('pointerdown', press);
      el.removeEventListener('input', kick);
      el.removeEventListener('lostpointercapture', release);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      cancelAnimationFrame(motion.current.raf);
      motion.current.raf = 0;
      releaseGlassFilter(lens);
    };
  }, [dims, kick]);

  const sizeVars = {
    '--lq-rw': `${dims.rw}px`,
    '--lq-rh': `${dims.rh}px`,
    '--lq-pw': `${dims.pw}px`,
    '--lq-ph': `${dims.ph}px`,
    '--lq-track': `${dims.track}px`,
  } as React.CSSProperties;

  return (
    <span ref={rootRef} className={`lq-slider${className ? ` ${className}` : ''}`} style={{ ...sizeVars, ...style }}>
      <span className="lq-slider__track" aria-hidden="true">
        <span className="lq-slider__fill" />
      </span>
      <span className="lq-slider__thumb" aria-hidden="true">
        <span className="lq-slider__glass" />
        <span className="lq-slider__cap" />
      </span>
      <input {...input} ref={setInput} type="range" className="lq-slider__input" />
    </span>
  );
};

export default LiquidSlider;
