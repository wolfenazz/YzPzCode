/**
 * Real refraction for the app's existing glass, without touching a single
 * component.
 *
 * Everything under `html.liquid-glass` is already marked up with the classes
 * the stylesheet keys off (`.st-switch`, `.st-btn`, `.ws-panel`, `.ctx-menu`,
 * …). This layer watches for those elements, and for each one builds the SVG
 * filter its box needs and puts it in the element's `backdrop-filter`. The
 * classes keep meaning what they meant; the pane stops being a painted
 * imitation of glass and starts bending what is behind it.
 *
 * Why a DOM layer rather than props on every component:
 *   - a filter is per-*shape*, not per-component. Fifty identical switches
 *     share one filter, and the registry keeps it to a single entry.
 *   - geometry can only be measured after layout, and most of these elements
 *     are fluid (a settings row's switch, a dialog that opens at any size).
 *   - it stays out of React's render path, so a resizing window does not
 *     re-render a hundred components to move eight numbers.
 *
 * What refracts, and what deliberately does not:
 *   - Small, structured surfaces — switch tracks, the sliding thumb of every
 *     tab row, buttons, floating toolbars, menus, dialogs, fields. These sit
 *     over content with edges and text, which is exactly what refraction needs
 *     to be legible.
 *   - The window's own chrome (`.chrome`, `.statusbar`) keeps the stylesheet's
 *     frosted glass. They span the window over a flat background, so a bend
 *     would show nothing, while the frost is the whole point of the bar.
 *   - Anything past its kind's `maxArea` keeps the frosted glass too: a filter
 *     stage is a full-size intermediate, and a large pane is where that stops
 *     being worth paying.
 */

import {
  glassFilter,
  preset,
  releaseGlassFilter,
  type GlassFilter,
  type GlassOptics,
} from './filterRegistry';
import { glassPreferences, setGlassPreferences, type GlassPreferences } from './glassOptions';
import { isRefractable, measureGlassBox } from './measure';

/** Everything about a look except the geometry, which comes from the element. */
export type GlassLook = Omit<GlassOptics, 'width' | 'height' | 'radius' | 'shape'>;

export interface GlassTarget {
  /** Matches elements that should refract. */
  selector: string;
  /** The look they take. */
  look: GlassLook;
  /** Past this many px² the element keeps the sheet's frosted glass. */
  maxArea?: number;
  /**
   * A `backdrop-filter` suffix kept alongside the refraction — the frost a
   * menu or a panel needs so what is behind it stops being readable. Applied
   * after the bend, so the displacement survives as structure rather than
   * detail.
   */
  frost?: string;
  /**
   * For a *container*: past `maxArea`, give it the progressive edge blur
   * instead of the plain frost (see `modeFor`). This is the reference
   * implementation's container recipe — a large pane reads far better with a
   * soft ramp into its edges than with a uniform frost or a bend you cannot
   * see across half a metre of flat background.
   */
  edges?: boolean;
  /**
   * Tokens of a *part*: a thumb or pill the stylesheet draws inside another
   * glass element. Parts are matched before their containers so the two never
   * fight over the same box.
   */
  part?: boolean;
}

const DEFAULT_MAX_AREA = 430_000;
/** Parts are small, so they can afford to refract wherever they appear. */
const PART_AREA = 64_000;
/**
 * Above this, a container stops being a refracting surface and becomes a
 * ramp: the mask in `glass-refraction.css` fades a blur in from the edges, and
 * a 900px-wide pane past here would otherwise pay for a filter stage whose
 * bend nobody can see across that much flat background.
 */
const EDGE_AREA = 120_000;
/** Frost for surfaces that must hide what is behind them, not just bend it. */
const MENU_FROST = 'blur(18px) saturate(1.9)';
const PANEL_FROST = 'blur(22px) saturate(1.8)';
const BAR_FROST = 'blur(16px) saturate(1.9) brightness(1.05)';

/** The switch families, which all behave identically. */
const SWITCHES = '.st-switch, .ws-switch, .sx-switch';
/** Capsule buttons across the app. */
const BUTTONS =
  '.st-btn, .sx-btn, .dz-btn, .pr-btn, .pd-btn, .ws-btn, .dv-btn, .bx-btn, .pf-btn, .pr-icon-btn, .chrome-btn';
/** Floating menus and popovers. */
const MENUS =
  '.ctx-menu, .bx-popover, .dz-menu, .pr-popover, .pr-menu, .ws-popover, .sh-menu, .sh-listmenu, .tp-menu, .term-menu, .wr-popover, .premium-menu, .statusbar-popover, .spawn-shell-menu, .lg-menu';

const thumbLook: GlassLook = {
  ...preset('segmented'),
  scaleRatio: 1.15,
  specularOpacity: 0.55,
  specularSaturation: 6,
  blur: 0.4,
};

/**
 * What refracts, and how. The first match wins, so the most specific entries
 * come first and parts come before their containers.
 */
export const GLASS_TARGETS: GlassTarget[] = [
  // ── Sliding thumbs: the selected item of every tab row and switcher ──────
  { selector: '.view-switch__pill', part: true, look: thumbLook },
  { selector: '.ws-steps__pill', part: true, look: thumbLook },
  { selector: '.st-segmented__item[aria-pressed="true"]', part: true, look: { ...thumbLook, scaleRatio: 1.05 } },
  { selector: '.gs__item[aria-checked="true"]', part: true, look: { ...thumbLook, scaleRatio: 1.05 } },
  { selector: '.dz-segmented > button[aria-checked="true"]', part: true, look: { ...thumbLook, scaleRatio: 1.05 } },
  { selector: '.pd-segmented > button[aria-checked="true"]', part: true, look: { ...thumbLook, scaleRatio: 1.05 } },
  { selector: '.pd-scope > button[aria-checked="true"]', part: true, look: { ...thumbLook, scaleRatio: 1.05 } },
  { selector: '.st-tab[aria-selected="true"]', part: true, look: { ...thumbLook, scaleRatio: 1.05 } },
  { selector: '.ws-tab[aria-selected="true"]', part: true, look: { ...thumbLook, scaleRatio: 1.05 } },
  { selector: '.dz-kind[aria-checked="true"]', part: true, look: { ...thumbLook, scaleRatio: 1.05 } },

  // ── Switch tracks: a glass groove; the lens takes over on press ──────────
  {
    selector: SWITCHES,
    part: true,
    look: {
      ...preset('segmented'),
      // The lip belongs to the switch: the track must open out at the edges and
      // pinch through the middle as the thumb crosses it.
      profile: 'lip',
      pinProfile: true,
      bezelWidth: 7,
      glassThickness: 18,
      scaleRatio: 0.85,
      specularOpacity: 0.6,
      specularSaturation: 5,
      blur: 1.2,
    },
  },

  // ── Held glass injected by utils/glassPress.ts ───────────────────────────
  // (`.lg-lens` is *not* here: utils/glassSwitch.ts sizes its own filter for
  // the exact box the lens swells to and attaches it before the element is in
  // the document, so there is no frame where it is un-refracted.)
  { selector: '.glass-thumb', part: true, look: { ...thumbLook, scaleRatio: 1.3, specularOpacity: 0.6, specularSaturation: 7 } },

  // ── Buttons ────────────────────────────────────────────────────────────
  {
    selector: BUTTONS,
    look: { ...preset('button'), scaleRatio: 1, specularOpacity: 0.5, specularSaturation: 5, blur: 0.6 },
    maxArea: PART_AREA,
  },

  // ── Floating surfaces ──────────────────────────────────────────────────
  {
    selector: MENUS,
    look: { ...preset('menu'), scaleRatio: 1, specularOpacity: 0.5, specularSaturation: 5, blur: 0.2 },
    maxArea: 300_000,
    frost: MENU_FROST,
  },
  {
    selector: '.dz-modal__panel, .pr-modal__panel, .wr-modal__panel, .sh-dialog__panel, .ws-dialog, .term-dialog',
    look: { ...preset('panel'), scaleRatio: 1, specularOpacity: 0.45, specularSaturation: 5, blur: 0.2 },
    frost: PANEL_FROST,
    edges: true,
  },
  {
    selector: '.sh-toast, .wr-toast, .dv-toast',
    look: { ...preset('bar'), scaleRatio: 1, specularOpacity: 0.5, blur: 0.4 },
    maxArea: 200_000,
    frost: BAR_FROST,
  },

  // ── Floating toolbars: over canvas, terminal and list content ───────────
  {
    selector: '.lg-float, .dz-topbar, .workspace-dev-server',
    look: { ...preset('bar'), scaleRatio: 1, specularOpacity: 0.55, specularSaturation: 6, blur: 2 },
    maxArea: 260_000,
    frost: BAR_FROST,
  },
  {
    selector: '.ws-panel',
    look: { ...preset('panel'), scaleRatio: 1, specularOpacity: 0.45, specularSaturation: 5, blur: 0.2 },
    frost: PANEL_FROST,
    edges: true,
  },

  // ── Fields ─────────────────────────────────────────────────────────────
  {
    selector: '.st-input, .st-select, .st-textarea, .sx-input, .sx-select select, .sx-textarea, .ws-input',
    look: { ...preset('field'), scaleRatio: 0.85, specularOpacity: 0.45, blur: 1.2 },
    maxArea: 140_000,
  },
];

/** Every selector above, joined once so a scan is a single traversal. */
const ALL_SELECTORS = GLASS_TARGETS.map((target) => target.selector).join(',');

interface Attached {
  /** The selector that matched, so a state change can be detected cheaply. */
  selector: string;
  look: GlassLook;
  maxArea: number;
  /** Kept after the refraction so what is behind stays unreadable. */
  frost: string;
  /** This container falls back to a progressive edge blur, not plain frost. */
  edges: boolean;
  /** Whatever inline backdrop-filter the element already carried. */
  prior: { backdrop: string; webkitBackdrop: string };
  filter: GlassFilter | null;
  /** Last measured box, so a resize that does not change the shape is free. */
  key: string;
}

/**
 * How a surface is reading right now:
 *   `refraction` — the SVG filter is live and bending the backdrop;
 *   `frost`      — the stylesheet's frosted glass (inline override cleared);
 *   `glass-edge` — no filter of its own, because the progressive edge blur in
 *                  `glass-refraction.css` needs the element to *not* be a
 *                  backdrop root — a `backdrop-filter` on an element turns it
 *                  into one, and every descendant filter below it goes blind.
 */
type GlassMode = 'refraction' | 'frost' | 'glass-edge';

const attached = new Map<HTMLElement, Attached>();
const resize = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const el = entry.target;
    if (el instanceof HTMLElement) queueRefresh(el);
  }
});
const pending = new Set<HTMLElement>();
let frame = 0;

/** Draws on the element itself, so layout is never touched. */
const paint = (el: HTMLElement, entry: Attached, mode: GlassMode): void => {
  const value =
    mode === 'glass-edge'
      ? 'none'
      : mode === 'refraction' && entry.filter
        ? entry.frost
          ? `${entry.filter.url} ${entry.frost}`
          : entry.filter.url
        : '';
  if (el.style.getPropertyValue('backdrop-filter') !== value) {
    el.style.setProperty('backdrop-filter', value);
    el.style.setProperty('-webkit-backdrop-filter', value);
  }
  if (mode === 'refraction') el.setAttribute('data-glass-refracting', '');
  else el.removeAttribute('data-glass-refracting');
  if (mode === 'glass-edge') el.setAttribute('data-glass-edge', '');
  else el.removeAttribute('data-glass-edge');
};

const modeFor = (entry: Attached, box: { width: number; height: number }): GlassMode => {
  if (entry.filter) return 'refraction';
  return entry.edges && box.width * box.height > EDGE_AREA ? 'glass-edge' : 'frost';
};

const measure = (el: Element): { key: string; box: ReturnType<typeof measureGlassBox> } => {
  const box = measureGlassBox(el);
  const key = `${Math.round(box.width)}x${Math.round(box.height)}r${Math.round(box.radius)}${box.shape}`;
  return { key, box };
};

const refresh = (el: HTMLElement, entry: Attached): void => {
  const { key, box } = measure(el);
  // A resize that does not change the shape needs no new map: the filters are
  // keyed on the box, so an element scrolled or nudged by a pixel reuses one.
  if (key === entry.key) return;
  entry.key = key;
  const next =
    box.width * box.height <= entry.maxArea && isRefractable(box)
      ? glassFilter({ ...entry.look, ...box })
      : null;
  const previous = entry.filter;
  entry.filter = next;
  // The old one goes back only once the new one exists, so the element never
  // passes through having no backdrop-filter at all.
  if (previous && previous.id !== next?.id) releaseGlassFilter(previous);
  paint(el, entry, modeFor(entry, box));
};

const detach = (el: HTMLElement): void => {
  const entry = attached.get(el);
  if (!entry) return;
  releaseGlassFilter(entry.filter);
  attached.delete(el);
  resize.unobserve(el);
  restore(el, 'backdrop-filter', entry.prior.backdrop);
  restore(el, '-webkit-backdrop-filter', entry.prior.webkitBackdrop);
  el.removeAttribute('data-glass-refracting');
  el.removeAttribute('data-glass-edge');
};

/** Puts back whatever inline value the element carried before we painted it. */
const restore = (el: HTMLElement, property: string, value: string): void => {
  if (value) el.style.setProperty(property, value);
  else el.style.removeProperty(property);
};

const attach = (el: HTMLElement, target: GlassTarget): void => {
  const entry: Attached = {
    selector: target.selector,
    look: target.look,
    maxArea: target.maxArea ?? (target.part ? PART_AREA : DEFAULT_MAX_AREA),
    frost: target.frost ?? '',
    edges: target.edges ?? false,
    prior: {
      backdrop: el.style.getPropertyValue('backdrop-filter'),
      webkitBackdrop: el.style.getPropertyValue('-webkit-backdrop-filter'),
    },
    filter: null,
    key: '',
  };
  attached.set(el, entry);
  refresh(el, entry);
  resize.observe(el);
};

/** Rebuilds every attached surface from scratch. */
const rebuildAll = (): void => {
  for (const [el, entry] of attached) {
    if (!el.isConnected) {
      detach(el);
      continue;
    }
    entry.key = '';
    refresh(el, entry);
  }
};

/**
 * Takes new preferences (Settings → Appearance → Liquid glass) and re-cuts
 * every surface through them. Filters are cached per shape *and* per look, so
 * the ones built for the old settings are released as the new ones arrive.
 */
export const applyGlassPreferences = (next: Partial<GlassPreferences>): void => {
  const previous = glassPreferences();
  const applied = setGlassPreferences(next);
  if (applied.profile === previous.profile && applied.strength === previous.strength) return;
  rebuildAll();
};

const queueRefresh = (el: HTMLElement) => {
  pending.add(el);
  if (!frame) frame = requestAnimationFrame(flush);
};

/** Which target this element matches right now, if any. */
const targetFor = (el: HTMLElement): GlassTarget | null => {
  if (el.closest('[data-no-glass-refraction]')) return null;
  for (const target of GLASS_TARGETS) {
    if (el.matches(target.selector)) return target;
  }
  return null;
};

/**
 * Re-decides an element. Some entries are state dependent (`.st-tab
 * [aria-selected="true"]` is glass only while it is the chosen tab), so a
 * change in that state has to move it between targets, not just re-measure it.
 */
const reevaluate = (el: HTMLElement): void => {
  const entry = attached.get(el);
  const target = targetFor(el);
  if (entry && target?.selector === entry.selector) {
    refresh(el, entry);
    return;
  }
  if (entry) detach(el);
  if (target) attach(el, target);
};

const enabled = (): boolean => document.documentElement.classList.contains('liquid-glass');
let wasEnabled = false;

/**
 * Chromium is the only engine that runs an SVG filter as a `backdrop-filter`
 * — it is not in the CSS spec. Everywhere else this whole layer stands down
 * and the app keeps its painted glass, which is why nothing here is allowed to
 * be load-bearing for layout or state.
 */
const supported = (): boolean =>
  typeof CSS !== 'undefined' &&
  (CSS.supports('backdrop-filter', 'url(#a)') || CSS.supports('-webkit-backdrop-filter', 'url(#a)'));

const flush = (): void => {
  frame = 0;
  const list = Array.from(pending);
  pending.clear();
  if (!enabled()) {
    for (const el of list) detach(el);
    return;
  }
  for (const el of list) {
    if (!el.isConnected) {
      detach(el);
      continue;
    }
    const entry = attached.get(el);
    if (entry) refresh(el, entry);
    else {
      const target = targetFor(el);
      if (target) attach(el, target);
    }
  }
};

const collect = (root: Element, touches: (el: HTMLElement) => void): void => {
  if (root.matches(ALL_SELECTORS)) touches(root as HTMLElement);
  for (const el of root.querySelectorAll<HTMLElement>(ALL_SELECTORS)) touches(el);
};

/**
 * Watches the document. Returns the function that tears it down.
 *
 * Called once from App.tsx, beside `trackGlassPointer` and friends.
 */
export const trackGlassRefraction = (): (() => void) => {
  // Nothing to do on an engine that cannot run the filter; the painted glass
  // in `liquid-glass.css` is the whole look there.
  if (!supported()) return () => {};

  const observer = new MutationObserver((records) => {
    if (!enabled()) return;
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target instanceof HTMLElement) reevaluate(record.target);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) collect(node, queueRefresh);
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (attached.has(node)) detach(node);
        for (const el of node.querySelectorAll<HTMLElement>(ALL_SELECTORS)) detach(el);
      }
    }
  });

  const watchRoot = (): void => {
    observer.disconnect();
    if (!enabled()) {
      for (const el of Array.from(attached.keys())) detach(el);
      return;
    }
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      // Only the attributes that decide whether a *part* is glass. Watching
      // `class` too would re-decide the whole tree on every hover.
      attributeFilter: ['aria-selected', 'aria-checked', 'aria-pressed'],
    });
    collect(document.documentElement, queueRefresh);
  };

  const rootObserver = new MutationObserver(() => {
    // The app toggles several classes on <html> (theme, density, motion). Only
    // crossing the feature's own switch is worth rebuilding for.
    if (enabled() === wasEnabled) return;
    wasEnabled = enabled();
    watchRoot();
  });

  const onResize = () => {
    for (const el of Array.from(attached.keys())) queueRefresh(el);
  };

  wasEnabled = enabled();
  if (wasEnabled) watchRoot();
  else observer.disconnect();

  rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
    rootObserver.disconnect();
    observer.disconnect();
    resize.disconnect();
    if (frame) cancelAnimationFrame(frame);
    // `frame` has to go back to 0 with the cancelled callback, or the next
    // `queueRefresh` would think a flush is already scheduled and never ask
    // for another one — the layer would sit idle from then on.
    frame = 0;
    pending.clear();
    for (const el of Array.from(attached.keys())) detach(el);
    attached.clear();
  };
};
