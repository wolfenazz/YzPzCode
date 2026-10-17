/**
 * The iOS 26 switch lens.
 *
 * At rest a switch draws its own white capsule thumb (`liquid-glass.css`).
 * Pressing it hides that thumb (`[data-sw-lifted]`) and puts a real glass lens
 * in its place: a fixed element in <body> (`.lg-lens`), so it is drawn above
 * everything, is never clipped, and its backdrop is the page itself — the
 * track's ends, the row behind.
 *
 * The lens refracts its backdrop for real: `glass/` builds a displacement-map
 * SVG filter for the lens's box (a thick convex lens: the middle magnifies the
 * track, the rim pulls it in round the edge with a faint colour fringe) and it
 * becomes the lens's `backdrop-filter`. An earlier version had to draw a
 * magnified copy of the track inside the lens instead, because an SVG filter
 * in `backdrop-filter` was unreliable then; the browser ships it now, and
 * bending the page needs no copy of it.
 *
 * On top of that the lens:
 *   - swells from the thumb's size to GROW times it with a springy overshoot,
 *     fading from white into clear glass;
 *   - follows the pointer when dragged, stretching with its speed (jelly) and
 *     wobbling back when it stops; the track changes colour as it passes the
 *     middle (`[data-sw-preview]`);
 *   - on release travels to its side still swollen, then shrinks back into the
 *     white thumb, which takes over when it has settled.
 * A tap toggles through the browser's own click; a drag swallows that click
 * and clicks the switch only when it ends on the other side.
 */

import { glassFilter, preset, releaseGlassFilter, type GlassFilter } from '../glass/filterRegistry';

const SWITCHES = '.st-switch, .ws-switch, .sx-switch';

type Axis = { x: number; v: number };
type Spring = { k: number; zeta: number };

const GROW = 1.5;
const DRAG_THRESHOLD = 3;
const PRESS: Spring = { k: 380, zeta: 0.46 };
const TRAVEL: Spring = { k: 300, zeta: 0.64 };
const FOLLOW: Spring = { k: 1500, zeta: 0.92 };
const STRETCH: Spring = { k: 460, zeta: 0.34 };
const MAX_STRETCH = 0.28;
const STRETCH_SPEED = 1400; // px/s at which the lens is fully stretched
const TAP_SWELL_MS = 190; // a tap keeps the lens swollen while it travels
/** What the swollen thumb is made of, shared by the press and the prebuild. */
const LENS_LOOK = { scaleRatio: 0.5, specularOpacity: 0.75, specularSaturation: 4, blur: 0.2 };

interface Lens {
  sw: HTMLElement;
  el: HTMLElement;
  /** The filter the lens is refracting through; `null` if it could not build. */
  filter: GlassFilter | null;
  on: boolean | null;
  pointerId: number;
  travel: number;
  startX: number;
  startP: number;
  checked: boolean;
  held: boolean;
  dragging: boolean;
  swellUntil: number;
  p: Axis;
  targetP: number;
  press: Axis;
  stretch: Axis;
  speed: number;
  lastX: number;
  lastT: number;
  frameT: number;
  raf: number;
}

let lens: Lens | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const step = (axis: Axis, target: number, { k, zeta }: Spring, dt: number) => {
  axis.v += (-k * (axis.x - target) - 2 * zeta * Math.sqrt(k) * axis.v) * dt;
  axis.x += axis.v * dt;
};

const reducedMotion = () =>
  document.documentElement.classList.contains('animations-disabled') ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const isOn = (el: HTMLElement) =>
  el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true';

const swallowNextClick = () => {
  const handler = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    window.removeEventListener('click', handler, true);
  };
  window.addEventListener('click', handler, true);
  window.setTimeout(() => window.removeEventListener('click', handler, true), 80);
};

const paint = (l: Lens) => {
  const press = clamp(l.press.x, -0.25, 1.3);
  const base = 1 / GROW + (1 - 1 / GROW) * press;
  const st = clamp(l.stretch.x, -0.08, MAX_STRETCH);
  l.el.style.translate = `${(l.p.x * l.travel).toFixed(2)}px 0px`;
  l.el.style.scale = `${(base * (1 + st)).toFixed(4)} ${(base * (1 - st * 0.42)).toFixed(4)}`;
  // The track's colour changes only when the lens crosses the middle; nothing
  // is read back from the page while animating.
  const on = l.p.x > 0.5;
  if (on !== l.on) {
    l.on = on;
    l.sw.setAttribute('data-sw-preview', on ? 'on' : 'off');
  }
};

const remove = (l: Lens) => {
  if (l.raf) cancelAnimationFrame(l.raf);
  releaseGlassFilter(l.filter);
  l.filter = null;
  l.el.remove();
  l.sw.removeAttribute('data-sw-lifted');
  l.sw.removeAttribute('data-sw-preview');
  if (lens === l) lens = null;
};

const frame = (now: number) => {
  const l = lens;
  if (!l) return;
  const dt = clamp((now - l.frameT) / 1000, 0, 1 / 30);
  l.frameT = now;
  if (!l.sw.isConnected) {
    remove(l);
    return;
  }
  const pressTarget = l.held || now < l.swellUntil ? 1 : 0;
  l.el.toggleAttribute('data-glass-lit', pressTarget === 1);
  // No move lately: the pointer has stopped, so the jelly settles.
  if (l.held && now - l.lastT > 40) l.speed *= 0.75;
  const substeps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / substeps;
  for (let i = 0; i < substeps; i += 1) {
    step(l.press, pressTarget, PRESS, h);
    step(l.p, l.targetP, l.held ? FOLLOW : TRAVEL, h);
    const speed = l.held ? l.speed : l.p.v * l.travel;
    const pinned = l.held && (l.targetP <= 0 || l.targetP >= 1);
    step(l.stretch, pinned ? 0 : clamp(Math.abs(speed) / STRETCH_SPEED, 0, 1) * MAX_STRETCH, STRETCH, h);
  }
  const settled =
    !l.held &&
    pressTarget === 0 &&
    Math.abs(l.press.x) < 2e-3 &&
    Math.abs(l.press.v) < 2e-2 &&
    Math.abs(l.p.x - l.targetP) < 1e-3 &&
    Math.abs(l.p.v) < 1e-2 &&
    Math.abs(l.stretch.x) < 2e-3 &&
    Math.abs(l.stretch.v) < 2e-2;
  if (settled) {
    remove(l);
    return;
  }
  paint(l);
  l.raf = requestAnimationFrame(frame);
};

/**
 * The lens, swollen over the thumb that was pressed.
 *
 * Its box is the thumb's size times GROW, so the optics are built for exactly
 * the box the lens reaches at full press — the only moment the refraction is
 * visible.
 */
const lift = (sw: HTMLElement, event: PointerEvent): Lens | null => {
  const rect = sw.getBoundingClientRect();
  const thumb = getComputedStyle(sw, '::after');
  const tw = parseFloat(thumb.width);
  const th = parseFloat(thumb.height);
  const inset = parseFloat(thumb.left);
  const top = parseFloat(thumb.top);
  if (!(tw > 0 && th > 0)) return null;
  const w = tw * GROW;
  const h = th * GROW;
  const left = rect.left + inset + tw / 2 - w / 2;
  const topEdge = rect.top + top + th / 2 - h / 2;
  const el = document.createElement('div');
  el.className = 'lg-lens';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `left:${left}px;top:${topEdge}px;width:${w}px;height:${h}px`;
  const filter = glassFilter({
    ...preset('thumb'),
    width: w,
    height: h,
    radius: h / 2,
    shape: 'pill',
    // Fully swollen is the only state that shows the optics, so bend at the
    // strength the lens actually reaches.
    ...LENS_LOOK,
  });
  if (filter) {
    el.style.setProperty('backdrop-filter', filter.url);
    el.style.setProperty('-webkit-backdrop-filter', filter.url);
    el.setAttribute('data-glass-refracting', '');
  }
  document.body.appendChild(el);
  sw.setAttribute('data-sw-lifted', '');
  const checked = isOn(sw);
  const p = checked ? 1 : 0;
  const now = performance.now();
  return {
    sw,
    el,
    filter,
    on: null,
    pointerId: event.pointerId,
    travel: Math.max(rect.width - tw - inset * 2, 1),
    startX: event.clientX,
    startP: p,
    checked,
    held: true,
    dragging: false,
    swellUntil: 0,
    p: { x: p, v: 0 },
    targetP: p,
    press: { x: 0, v: 0 },
    stretch: { x: 0, v: 0 },
    speed: 0,
    lastX: event.clientX,
    lastT: now,
    frameT: now,
    raf: 0,
  };
};

/** Builds the filter for the standard switch size ahead of the first press. */
const prebuild = () => {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const tw = 1.9375 * rem; // --sw-tw
  const th = 1.375 * rem - 4; // --sw-h minus the insets
  glassFilter({
    ...preset('thumb'),
    width: tw * GROW,
    height: th * GROW,
    radius: (th * GROW) / 2,
    shape: 'pill',
    ...LENS_LOOK,
  });
};

/** Starts tracking; returns the function that stops it. */
export const trackGlassSwitch = (): (() => void) => {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(prebuild);
  else window.setTimeout(prebuild, 300);

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    const sw = event.target.closest<HTMLElement>(SWITCHES);
    if (!sw || sw.hasAttribute('disabled') || sw.getAttribute('aria-disabled') === 'true') return;
    if (reducedMotion()) return;
    if (lens) remove(lens);
    const next = lift(sw, event);
    if (!next) return;
    lens = next;
    paint(next);
    next.raf = requestAnimationFrame(frame);
  };

  const onMove = (event: PointerEvent) => {
    const l = lens;
    if (!l || !l.held || event.pointerId !== l.pointerId) return;
    const dx = event.clientX - l.startX;
    if (!l.dragging && Math.abs(dx) < DRAG_THRESHOLD) return;
    l.dragging = true;
    const now = performance.now();
    const dt = Math.max(now - l.lastT, 1) / 1000;
    l.speed = l.speed * 0.35 + ((event.clientX - l.lastX) / dt) * 0.65;
    l.lastX = event.clientX;
    l.lastT = now;
    l.targetP = clamp(l.startP + dx / l.travel, 0, 1);
  };

  const onUp = (event: PointerEvent) => {
    const l = lens;
    if (!l || !l.held || event.pointerId !== l.pointerId) return;
    l.held = false;
    const released = event.type === 'pointerup';
    if (l.dragging) {
      const on = l.targetP > 0.5;
      l.targetP = on ? 1 : 0;
      if (released && on !== l.checked) l.sw.click();
      swallowNextClick();
      return;
    }
    // A tap: the browser's click toggles the switch; the lens travels with it.
    const tapped = released && event.target instanceof Node && l.sw.contains(event.target);
    if (tapped) {
      l.targetP = l.checked ? 0 : 1;
      l.swellUntil = performance.now() + TAP_SWELL_MS;
    }
  };

  const onBlur = () => {
    const l = lens;
    if (!l || !l.held) return;
    l.held = false;
    l.targetP = l.startP;
  };

  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  window.addEventListener('blur', onBlur);
  return () => {
    document.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    window.removeEventListener('blur', onBlur);
    if (lens) remove(lens);
  };
};
