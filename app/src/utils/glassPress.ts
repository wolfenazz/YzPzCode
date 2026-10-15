/**
 * Liquid glass press and drag (iOS 26).
 *
 * Holding a glass control lifts it: it grows a little and turns into a glass
 * lens (`[data-glass-hold]`, styled at the end of `liquid-glass.css`). While
 * the pointer is held and moves, the control is pulled along with a springy
 * lag, stretches in the direction of travel and wobbles back on release.
 *
 * Two kinds of navigation get a real drag:
 *   - a segmented / view switcher (`.view-switch`, `.st-segmented`,
 *     `.sx-segmented`): the selected thumb follows the pointer left and right
 *     inside its track; on release the nearest item is selected;
 *   - a tab strip marked `data-glass-reorder="<name>"` (workspace tabs): the
 *     held tab slides, its neighbours make room, and on release the strip emits
 *     `glass-reorder` ({ group, from, to }) and the tab settles into its slot.
 *
 * Everything is driven through the individual `translate` / `scale`
 * properties, so a control's own `transform` is never touched, and a plain
 * click works as before (a drag swallows the click that would follow it).
 * One delegated listener serves the whole document.
 */

const PRESSABLE = [
  '.st-btn', '.sx-btn', '.dz-btn', '.pr-btn', '.pd-btn', '.ws-btn', '.dv-btn',
  '.bx-btn', '.pf-btn', '.pr-icon-btn', '.chrome-btn',
  '.chrome-tab:not(.chrome-tab--static)',
  '.st-segmented__item', '.sx-segmented > button', '.view-switch__item',
].join(',');

const GROUPS = '[data-glass-reorder], .view-switch, .st-segmented, .sx-segmented';
const SELECTED = '.is-active, [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"]';

type Spring = { k: number; zeta: number };
const PRESS_SPRING: Spring = { k: 520, zeta: 0.5 };
const MOVE_SPRING: Spring = { k: 380, zeta: 0.74 };
const FOLLOW_SPRING: Spring = { k: 900, zeta: 0.9 };
const STRETCH_SPRING: Spring = { k: 560, zeta: 0.42 };
const TRAVEL_SPRING: Spring = { k: 360, zeta: 0.8 };
const TAP_SWELL_MS = 200; // a tapped thumb stays swollen while it travels
const DRAG_THRESHOLD = 4;
const MAX_PULL = 12; // px a free control can be pulled from where it sits
const STRETCH_SPEED = 2600; // px/s at which the stretch is at its largest
const MAX_STRETCH = 0.17;

type Axis = { x: number; v: number };

interface Body {
  el: HTMLElement;
  press: Axis; // 0 → 1 lift
  px: Axis;
  py: Axis;
  sx: Axis; // stretch along x / y
  sy: Axis;
  lift: number; // scale at full press
  target: { press: number; x: number; y: number };
  spring: Spring;
  restoredPosition: string | null;
  held: boolean;
  /** Runs when the body has settled and is released. */
  onDrop?: () => void;
  /**
   * A switcher thumb also takes the width of the item it is over, so it
   * flows from "Block" to "Underline" instead of snapping at the end. Its
   * centre is `px` from where it started; it widens about that centre.
   */
  width?: { axis: Axis; base: number; target: number };
}

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  pressed: HTMLElement;
  group: HTMLElement | null;
  mode: 'free' | 'select' | 'reorder';
  dragging: boolean;
  body: Body;
  /** Items of the group with their rects measured when the drag began. */
  items: Array<{ el: HTMLElement; left: number; right: number; body: Body | null }>;
  bodyIndex: number;
  bounds: { min: number; max: number };
  targetIndex: number;
  /** Switcher: where the pointer sits relative to the thumb's centre at press. */
  grab: number;
}

const bodies = new Map<HTMLElement, Body>();
let gesture: Gesture | null = null;
let frame = 0;
let lastTime = 0;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const reducedMotion = () =>
  document.documentElement.classList.contains('animations-disabled') ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const step = (axis: Axis, target: number, { k, zeta }: Spring, dt: number) => {
  const accel = -k * (axis.x - target) - 2 * zeta * Math.sqrt(k) * axis.v;
  axis.v += accel * dt;
  axis.x += axis.v * dt;
};

/** Soft limit: moves freely at first, then resists. */
const rubber = (distance: number, limit: number) => limit * Math.tanh(distance / (limit * 2));

const ensureBody = (el: HTMLElement): Body => {
  const known = bodies.get(el);
  if (known) return known;
  const rect = el.getBoundingClientRect();
  const lift = 1 + clamp(8 / Math.max(rect.width, rect.height, 1), 0.035, 0.1);
  const body: Body = {
    el,
    press: { x: 0, v: 0 },
    px: { x: 0, v: 0 },
    py: { x: 0, v: 0 },
    sx: { x: 0, v: 0 },
    sy: { x: 0, v: 0 },
    lift,
    target: { press: 0, x: 0, y: 0 },
    spring: MOVE_SPRING,
    restoredPosition: null,
    held: false,
  };
  bodies.set(el, body);
  return body;
};

const hold = (body: Body) => {
  if (body.held) return;
  body.held = true;
  const { el } = body;
  if (getComputedStyle(el).position === 'static') {
    body.restoredPosition = el.style.position;
    el.style.position = 'relative';
  }
  el.style.zIndex = '40';
  el.setAttribute('data-glass-hold', '');
};

const drop = (body: Body) => {
  const { el } = body;
  el.removeAttribute('data-glass-hold');
  el.removeAttribute('data-glass-lit');
  el.removeAttribute('data-glass-target');
  el.style.translate = '';
  el.style.scale = '';
  el.style.zIndex = '';
  if (body.restoredPosition !== null) el.style.position = body.restoredPosition;
  body.restoredPosition = null;
  body.held = false;
  bodies.delete(el);
  body.onDrop?.();
};

const paint = (body: Body) => {
  const { el } = body;
  const press = clamp(body.press.x, -0.15, 1.3);
  const grow = 1 + (body.lift - 1) * press;
  const ax = clamp(body.sx.x, 0, MAX_STRETCH);
  const ay = clamp(body.sy.x, 0, MAX_STRETCH);
  let x = body.px.x;
  if (body.width) {
    const w = Math.max(body.width.axis.x, 4);
    el.style.width = `${w.toFixed(2)}px`;
    x -= (w - body.width.base) / 2;
  }
  el.style.translate = `${x.toFixed(2)}px ${body.py.x.toFixed(2)}px`;
  el.style.scale = `${(grow * (1 + ax - ay * 0.5)).toFixed(4)} ${(grow * (1 + ay - ax * 0.5)).toFixed(4)}`;
  // The glass look switches once (CSS transitions), not every frame.
  el.toggleAttribute('data-glass-lit', body.held && body.target.press > 0);
};

const settled = (body: Body) =>
  Math.abs(body.press.x - body.target.press) < 1e-3 &&
  Math.abs(body.press.v) < 1e-2 &&
  Math.abs(body.px.x - body.target.x) < 0.05 &&
  Math.abs(body.px.v) < 0.5 &&
  Math.abs(body.py.x - body.target.y) < 0.05 &&
  Math.abs(body.py.v) < 0.5 &&
  body.sx.x < 1e-3 &&
  body.sy.x < 1e-3 &&
  Math.abs(body.sx.v) < 1e-2 &&
  Math.abs(body.sy.v) < 1e-2 &&
  (!body.width || (Math.abs(body.width.axis.x - body.width.target) < 0.05 && Math.abs(body.width.axis.v) < 0.5));

const tick = (now: number) => {
  frame = 0;
  const dt = clamp((now - lastTime) / 1000, 0, 1 / 30);
  lastTime = now;
  const substeps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / substeps;

  for (const body of Array.from(bodies.values())) {
    if (!body.el.isConnected) {
      bodies.delete(body.el);
      continue;
    }
    for (let s = 0; s < substeps; s += 1) {
      step(body.press, body.target.press, PRESS_SPRING, h);
      step(body.px, body.target.x, body.spring, h);
      step(body.py, body.target.y, body.spring, h);
      if (body.width) step(body.width.axis, body.width.target, body.spring, h);
      const stretchX = clamp(Math.abs(body.px.v) / STRETCH_SPEED, 0, 1) * MAX_STRETCH;
      const stretchY = clamp(Math.abs(body.py.v) / STRETCH_SPEED, 0, 1) * MAX_STRETCH;
      step(body.sx, stretchX, STRETCH_SPRING, h);
      step(body.sy, stretchY, STRETCH_SPRING, h);
    }
    const idle = !gesture || (gesture.body !== body && !gesture.items.some((item) => item.body === body));
    if (idle && body.target.press === 0 && settled(body)) {
      drop(body);
    } else {
      paint(body);
    }
  }
  if (bodies.size > 0) frame = requestAnimationFrame(tick);
};

const wake = () => {
  if (frame || bodies.size === 0) return;
  lastTime = performance.now();
  frame = requestAnimationFrame(tick);
};

const groupItems = (group: HTMLElement): HTMLElement[] =>
  Array.from(group.querySelectorAll<HTMLElement>(PRESSABLE)).filter(
    (item) => item.closest(GROUPS) === group && !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true',
  );

/** A click right after a drag is not a tap. */
const swallowNextClick = () => {
  const handler = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    window.removeEventListener('click', handler, true);
  };
  window.addEventListener('click', handler, true);
  window.setTimeout(() => window.removeEventListener('click', handler, true), 80);
};

/**
 * The selection thumb of a switcher, as iOS 26 draws it: pressed, it swells
 * into glass, slides (dragged, or to a tapped item) and shrinks back into
 * place. It is a stand-in drawn inside the group under the labels, looking
 * exactly like the real thumb unlit and like glass when lit
 * (`data-glass-lit`), so it never fades: it shrinks into the real thumb's place and is
 * swapped for it when it has settled. The real thumb is hidden meanwhile
 * (`data-glass-sliding` on the group).
 */
const makeThumb = (group: HTMLElement, active: HTMLElement, items: HTMLElement[]): Body => {
  const source = active.querySelector<HTMLElement>('.view-switch__pill') ?? active;
  const rect = active.getBoundingClientRect();
  const box = group.getBoundingClientRect();
  const restorePosition = group.style.position;
  if (getComputedStyle(group).position === 'static') group.style.position = 'relative';
  const ghost = document.createElement('div');
  ghost.className = 'glass-thumb lg-lens-layers';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText = `left:${rect.left - box.left - group.clientLeft}px;top:${rect.top - box.top - group.clientTop}px;width:${rect.width}px;height:${rect.height}px;border-radius:${getComputedStyle(source).borderRadius}`;
  group.appendChild(ghost);
  group.setAttribute('data-glass-sliding', '');
  const body = ensureBody(ghost);
  body.lift = 1 + clamp(12 / rect.height, 0.18, 0.32);
  body.width = { axis: { x: rect.width, v: 0 }, base: rect.width, target: rect.width };
  body.spring = FOLLOW_SPRING;
  hold(body);
  ghost.style.zIndex = '0';
  body.onDrop = () => {
    // Hand-off in one frame: the real thumb must appear exactly as the stand-in
    // goes. Its own fill and shadow transitions (and the labels' colour) would
    // otherwise fade in from the hidden state and blink, so transitions are
    // off in the group until the swap has painted.
    group.setAttribute('data-glass-handoff', '');
    group.removeAttribute('data-glass-sliding');
    for (const item of items) item.removeAttribute('data-glass-target');
    ghost.remove();
    group.style.position = restorePosition;
    requestAnimationFrame(() => requestAnimationFrame(() => group.removeAttribute('data-glass-handoff')));
  };
  return body;
};

/**
 * A held tab is drawn as a floating copy in <body>: the strip clips its
 * children (overflow), and a lifted, enlarged tab is as tall as the bar, so
 * in place it would be cut off. The real tab stays in the flow, invisible
 * (still hit-testable, so a tap still clicks it).
 */
const makeClone = (el: HTMLElement): Body => {
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add('glass-clone');
  for (const name of ['tabindex', 'role', 'title', 'id']) ghost.removeAttribute(name);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;max-width:none;margin:0;pointer-events:none;border-radius:${getComputedStyle(el).borderRadius}`;
  document.body.appendChild(ghost);
  const previous = el.style.opacity;
  el.style.opacity = '0';
  const body = ensureBody(ghost);
  body.lift = 1.07;
  body.spring = FOLLOW_SPRING;
  hold(body);
  ghost.style.zIndex = '9500';
  body.onDrop = () => {
    ghost.remove();
    el.style.opacity = previous;
  };
  return body;
};

/** A tab strip: measure every tab once, the held one and its neighbours move. */
const beginDrag = (g: Gesture) => {
  g.dragging = true;
  if (!g.group || g.mode !== 'reorder') return;
  const els = groupItems(g.group);
  const moving = els.indexOf(g.pressed);
  if (moving < 0) {
    g.mode = 'free';
    return;
  }
  g.items = els.map((el) => {
    const rect = el.getBoundingClientRect();
    // The held tab is moved by its floating copy; only neighbours get bodies.
    return { el, left: rect.left, right: rect.right, body: el === g.pressed ? null : ensureBody(el) };
  });
  g.bodyIndex = moving;
  g.targetIndex = moving;
  const first = g.items[0];
  const last = g.items[g.items.length - 1];
  g.bounds = { min: first.left - g.items[moving].left, max: last.right - g.items[moving].right };
  for (const item of g.items) {
    if (item.body) item.body.spring = item.el === g.body.el ? FOLLOW_SPRING : MOVE_SPRING;
  }
};

/** The width a thumb centred at `center` takes: blended between the two items it is between. */
const widthAt = (g: Gesture, center: number): number => {
  const items = g.items;
  const mid = (i: number) => (items[i].left + items[i].right) / 2;
  const size = (i: number) => items[i].right - items[i].left;
  if (center <= mid(0)) return size(0);
  for (let i = 0; i < items.length - 1; i += 1) {
    if (center <= mid(i + 1)) {
      const t = (center - mid(i)) / Math.max(mid(i + 1) - mid(i), 1);
      return size(i) + (size(i + 1) - size(i)) * t;
    }
  }
  return size(items.length - 1);
};

const moveDrag = (g: Gesture, dx: number, dy: number) => {
  if (g.mode === 'free') {
    g.body.spring = MOVE_SPRING;
    g.body.target.x = rubber(dx, MAX_PULL);
    g.body.target.y = rubber(dy, MAX_PULL);
    return;
  }
  const moving = g.items[g.bodyIndex];
  const x = clamp(dx + g.grab, g.bounds.min, g.bounds.max);
  g.body.target.x = x;
  g.body.target.y = rubber(dy, 4);
  const center = (moving.left + moving.right) / 2 + x;

  if (g.mode === 'select') {
    if (g.body.width) g.body.width.target = widthAt(g, center);
    let nearest = g.bodyIndex;
    let best = Infinity;
    g.items.forEach((item, index) => {
      const distance = Math.abs((item.left + item.right) / 2 - center);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    if (nearest !== g.targetIndex) {
      g.items[g.targetIndex]?.el.removeAttribute('data-glass-target');
      g.targetIndex = nearest;
      g.items[nearest].el.setAttribute('data-glass-target', '');
    }
    return;
  }

  // Reorder: neighbours slide aside to leave a gap where the tab would land.
  let index = 0;
  g.items.forEach((item, i) => {
    if (i !== g.bodyIndex && (item.left + item.right) / 2 < center) index += 1;
  });
  g.targetIndex = index;
  const gap = g.items.length > 1 ? Math.abs(g.items[1].left - g.items[0].right) : 0;
  const shift = moving.right - moving.left + gap;
  g.items.forEach((item, i) => {
    if (i === g.bodyIndex) return;
    let offset = 0;
    if (g.bodyIndex < index && i > g.bodyIndex && i <= index) offset = -shift;
    if (g.bodyIndex > index && i < g.bodyIndex && i >= index) offset = shift;
    if (item.body) item.body.target.x = offset;
  });
};

const finish = (g: Gesture, commit: boolean, releasedOn: EventTarget | null = null) => {
  const { body } = g;
  body.target.press = 0;
  body.spring = MOVE_SPRING;

  if (g.mode === 'select') {
    // Dragged: the thumb shrinks back onto the item nearest to where it was
    // let go. Tapped on another item: it travels there still swollen (the
    // browser's click selects it), then shrinks into place.
    const pressedIndex = g.items.findIndex((item) => item.el === g.pressed);
    const tapped =
      commit &&
      !g.dragging &&
      pressedIndex >= 0 &&
      pressedIndex !== g.bodyIndex &&
      releasedOn instanceof Node &&
      g.pressed.contains(releasedOn);
    let landing = g.bodyIndex;
    if (commit && g.dragging && g.targetIndex >= 0) landing = g.targetIndex;
    else if (tapped) landing = pressedIndex;
    const from = g.items[g.bodyIndex];
    const to = g.items[landing];
    for (const item of g.items) item.el.toggleAttribute('data-glass-target', item === to);
    body.spring = TRAVEL_SPRING;
    body.target.x = (to.left + to.right) / 2 - (from.left + from.right) / 2;
    if (body.width) body.width.target = to.right - to.left;
    body.target.y = 0;
    if (g.dragging && landing !== g.bodyIndex) to.el.click();
    if (tapped) {
      body.target.press = 1;
      window.setTimeout(() => {
        body.target.press = 0;
        wake();
      }, TAP_SWELL_MS);
    }
  } else if (commit && g.dragging && g.group && g.mode === 'reorder' && g.targetIndex !== g.bodyIndex) {
    const group = g.group;
    const from = g.bodyIndex;
    const to = g.targetIndex;
    const original = g.pressed;
    const startLeft = g.items[from].left;
    const others = g.items.filter((item) => item.el !== body.el);
    group.dispatchEvent(new CustomEvent('glass-reorder', { bubbles: true, detail: { group: group.dataset.glassReorder, from, to } }));
    // After the new order has rendered: neighbours are already where their
    // offsets put them, so they snap; the floating tab springs from where it
    // was dropped to the slot its real tab now has.
    requestAnimationFrame(() => {
      for (const item of others) {
        if (!item.body) continue;
        item.body.px = { x: 0, v: 0 };
        item.body.target.x = 0;
      }
      body.target.x = original.isConnected ? original.getBoundingClientRect().left - startLeft : 0;
      body.target.y = 0;
      wake();
    });
  } else {
    for (const item of g.items) item.el.removeAttribute('data-glass-target');
    body.target.x = 0;
    body.target.y = 0;
    for (const item of g.items) {
      if (!item.body) continue;
      item.body.target.x = 0;
      item.body.target.press = 0;
    }
  }
  // After the select branch's own click, so that one is not swallowed.
  if (g.dragging) swallowNextClick();
  wake();
};

/** Starts tracking; returns the function that stops it. */
export const trackGlassPress = (): (() => void) => {
  const onDown = (event: PointerEvent) => {
    if (gesture || event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    if (reducedMotion()) return;
    const el = event.target.closest<HTMLElement>(PRESSABLE);
    if (!el || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
    if (el.closest('[data-no-glass-press]')) return;
    // A button inside the control (a tab's close ×) keeps its own press.
    const inner = event.target.closest('button, a, input, select, textarea');
    if (inner && inner !== el) return;

    const group = el.closest<HTMLElement>(GROUPS);
    let mode: Gesture['mode'] = !group ? 'free' : group.hasAttribute('data-glass-reorder') ? 'reorder' : 'select';
    let body: Body;
    let items: Gesture['items'] = [];
    let bodyIndex = -1;
    let bounds = { min: 0, max: 0 };
    let targetIndex = -1;
    let grab = 0;

    if (mode === 'select' && group) {
      const els = groupItems(group);
      const index = els.findIndex((item) => item.matches(SELECTED));
      if (index >= 0 && els.includes(el)) {
        // Any press lifts the selected thumb into glass: held on it, it can be
        // dragged; on another item, it slides there when the tap ends.
        items = els.map((item) => {
          const rect = item.getBoundingClientRect();
          return { el: item, left: rect.left, right: rect.right, body: null };
        });
        bodyIndex = index;
        targetIndex = index;
        // The thumb's centre travels from the first item's centre to the last's
        // (its width follows the item it is over).
        const mid = (i: number) => (items[i].left + items[i].right) / 2;
        bounds = { min: mid(0) - mid(index), max: mid(items.length - 1) - mid(index) };
        grab = el === els[index] ? 0 : event.clientX - (items[index].left + items[index].right) / 2;
        body = makeThumb(group, els[index], els);
        els[index].setAttribute('data-glass-target', '');
      } else {
        mode = 'free';
        body = ensureBody(el);
        hold(body);
      }
    } else if (mode === 'reorder') {
      body = makeClone(el);
    } else {
      body = ensureBody(el);
      hold(body);
    }
    body.target.press = 1;
    if (mode !== 'select') body.spring = MOVE_SPRING;
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pressed: el,
      group,
      mode,
      dragging: false,
      body,
      items,
      bodyIndex,
      bounds,
      targetIndex,
      grab,
    };
    wake();
  };

  const onMove = (event: PointerEvent) => {
    const g = gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      beginDrag(g);
    }
    moveDrag(g, dx, dy);
    wake();
  };

  const onUp = (event: PointerEvent) => {
    const g = gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    gesture = null;
    finish(g, event.type === 'pointerup', event.target);
  };

  const onBlur = () => {
    const g = gesture;
    if (!g) return;
    gesture = null;
    finish(g, false);
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
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    gesture = null;
    for (const body of Array.from(bodies.values())) drop(body);
  };
};
