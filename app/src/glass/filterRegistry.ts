/**
 * The `<filter>` a piece of glass refracts through, built once per shape and
 * shared by every element with that shape.
 *
 * Every call answers with a `url(#…)` you can put in `backdrop-filter`. The
 * filter graph is the reference implementation's, node for node
 * (`Filter.vue` of mkj0kjay/vue-web-liquid-glass, MIT), with three fixes:
 *
 *   - `preserveAspectRatio="none"` on both `feImage`s. The default
 *     (`xMidYMid meet`) letterboxes the map when the buffer is capped to a
 *     smaller size than the element, which puts the whole refraction in the
 *     wrong place on any bar or panel.
 *   - `scale` is derived from the map's real peak (`scaleFor`), so
 *     `scaleRatio: 1` means the shift the profile traced, in px, instead of a
 *     constant the filter has to compensate for.
 *   - the specular and blur stages are dropped when they would do nothing,
 *     because each one costs a full-size intermediate buffer.
 *
 * The graph, back to front:
 *   blur → displace through the rim map, or the lens map when the glass
 *   magnifies (once, or once per colour channel when it disperses) → saturate → clip to the specular rim → blend over
 *   the displaced backdrop → blend the faded rim on top.
 *
 * Filters are reference counted: two switches the same size share one, and the
 * filter is removed only once nothing uses it. A hard cap bounds the set, so a
 * window resized repeatedly cannot leak a filter per pixel width.
 */

import {
  bezelProfile,
  displacementMap,
  lensMap,
  scaleFor,
  specularMap,
  type GlassShape,
} from './displacementMap';
import { glassPreferences } from './glassOptions';
import { SURFACES, type SurfaceId } from './surfaceEquations';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Upper bound on live filters; least recently used are evicted past this. */
const MAX_FILTERS = 64;

export interface GlassOptics {
  /** Border box of the element, in CSS px. */
  width: number;
  height: number;
  /** Corner radius in CSS px; `pill` rounds the short axis instead. */
  radius?: number;
  shape?: GlassShape;
  /** How the rim is shaped. */
  profile?: SurfaceId;
  /** Width of the curved rim, in CSS px. Wide = a broader bend. */
  bezelWidth?: number;
  /** Glass under the rim, in px. Tall = a flatter, stronger pull. */
  glassThickness?: number;
  /** 1.5 is window glass. */
  refractiveIndex?: number;
  /** Ceiling on the traced shift, as a multiple of `bezelWidth`. */
  maxShift?: number;
  /** Softens the backdrop before it is bent. */
  blur?: number;
  /** Multiplier on the traced shift. 1 = the traced amount, in px. */
  scaleRatio?: number;
  /** How bright the rim light is (0 turns it off). */
  specularOpacity?: number;
  /** Blown-out colour travelling with the rim light. */
  specularSaturation?: number;
  /** Direction the light comes from, in radians (y up; default upper left). */
  specularAngle?: number;
  /** How far in from the edge the rim light reaches, in CSS px. */
  specularWidth?: number;
  /** Centre magnification, as a factor. 1 turns it off. */
  zoom?: number;
  /**
   * Chromatic dispersion: how much further blue bends than red, as a fraction
   * of the shift (0 turns it off; UI glass reads well at 0.05–0.12). The rim
   * then fringes colour the way a real lens does. Costs two more displacement
   * stages, so it is for small lenses.
   */
  dispersion?: number;
  /**
   * Keep this look's own profile even when Settings picks another one.
   *
   * The held thumbs and the magnifier set this: they are lenses, and a lens
   * with a concave rim would push its backdrop out past its own edge.
   */
  pinProfile?: boolean;
  /** Buffer px per CSS px for the displacement map. */
  quality?: number;
  /** Cap on the displacement buffer's long side, in px. */
  maxBuffer?: number;
  /** Cap on the specular buffer's long side, in px. */
  maxSpecularBuffer?: number;
}

const DEFAULTS = {
  radius: 0,
  shape: 'pill' as GlassShape,
  profile: 'convex_squircle' as SurfaceId,
  bezelWidth: 12,
  glassThickness: 30,
  refractiveIndex: 1.5,
  maxShift: 1,
  blur: 0,
  scaleRatio: 1,
  specularOpacity: 0.4,
  specularSaturation: 4,
  specularAngle: (3 * Math.PI) / 4,
  specularWidth: 2,
  zoom: 1,
  dispersion: 0,
  pinProfile: false,
  quality: 2,
  maxBuffer: 512,
  maxSpecularBuffer: 1024,
};

type Resolved = Required<GlassOptics>;

/**
 * Folds the user's preferences into a call's optics.
 *
 * Strength multiplies every look's own `scaleRatio`, so a look that asked for
 * a stronger bend than its neighbours stays stronger than them as the slider
 * moves — the slider is a master gain, not a replacement. Profile is replaced
 * outright unless the look pinned its own.
 */
const resolve = (optics: GlassOptics): Resolved => {
  const base: Resolved = { ...DEFAULTS, ...optics };
  const preferences = glassPreferences();
  const profile =
    base.pinProfile || preferences.profile === null ? base.profile : preferences.profile;
  return {
    ...base,
    profile,
    scaleRatio: base.scaleRatio * preferences.strength,
  };
};

const keyOf = (o: Resolved): string =>
  [
    Math.round(o.width * 100) / 100,
    Math.round(o.height * 100) / 100,
    Math.round(o.radius * 100) / 100,
    o.shape,
    o.profile,
    o.bezelWidth,
    o.glassThickness,
    o.refractiveIndex,
    o.maxShift,
    o.blur,
    o.scaleRatio,
    o.specularOpacity.toFixed(3),
    o.specularSaturation,
    o.specularAngle.toFixed(3),
    o.specularWidth,
    o.zoom,
    o.dispersion,
    o.quality,
    o.maxBuffer,
    o.maxSpecularBuffer,
  ].join('|');

interface Entry {
  id: string;
  refs: number;
  /** Bumped on every `glassFilter` call, for LRU eviction. */
  used: number;
}

const cache = new Map<string, Entry>();
let host: SVGSVGElement | null = null;
let defs: SVGDefsElement | null = null;
let seq = 0;

/** The hidden `<svg>` all filters live in. Never `display:none`. */
const ensureHost = (): SVGDefsElement | null => {
  if (defs && defs.isConnected) return defs;
  if (typeof document === 'undefined') return null;
  host = document.createElementNS(SVG_NS, 'svg');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('width', '0');
  host.setAttribute('height', '0');
  // `display:none` would make the browser skip the filters inside it.
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  defs = document.createElementNS(SVG_NS, 'defs');
  host.appendChild(defs);
  document.body.appendChild(host);
  return defs;
};

const add = (
  filter: SVGFilterElement,
  tag: string,
  attrs: Record<string, string | number>,
): void => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  filter.appendChild(node);
};

/** Drops the least recently used filters that nobody is holding. */
const evict = (): void => {
  if (cache.size <= MAX_FILTERS) return;
  const live = Array.from(cache.entries()).filter(([, entry]) => entry.refs === 0);
  live.sort((a, b) => a[1].used - b[1].used);
  for (const [key, entry] of live) {
    if (cache.size <= MAX_FILTERS) break;
    document.getElementById(entry.id)?.remove();
    cache.delete(key);
  }
};

const build = (o: Resolved, key: string): string | null => {
  const geometry = {
    width: o.width,
    height: o.height,
    radius: o.radius,
    bezelWidth: o.bezelWidth,
    shape: o.shape,
  };
  const bezel = bezelProfile({
    glassThickness: o.glassThickness,
    bezelWidth: o.bezelWidth,
    refractiveIndex: o.refractiveIndex,
    profile: o.profile,
    maxShift: o.maxShift,
    // Strength goes into the trace, not the filter scale, so the fold guard
    // sees it: a strong setting bends further but never mirrors the backdrop.
    gain: o.scaleRatio,
  });
  // A magnifying lens is one field (zoom eased into the rim); anything else
  // is the plain rim bend. Both are applied at 1:1: their peak is the scale.
  const displacement =
    o.zoom > 1
      ? lensMap({
          ...geometry,
          bezel,
          zoom: o.zoom,
          quality: o.quality,
          maxBuffer: o.maxBuffer,
        })
      : displacementMap({
          ...geometry,
          bezel,
          quality: o.quality,
          maxBuffer: o.maxBuffer,
        });
  if (!displacement) return null;

  const id = `yz-glass-${(seq += 1).toString(36)}-${Math.abs(
    key.split('').reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7),
  ).toString(36)}`;

  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('x', '0');
  filter.setAttribute('y', '0');
  filter.setAttribute('width', String(o.width));
  filter.setAttribute('height', String(o.height));
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const image = (href: string, result: string): void =>
    add(filter, 'feImage', {
      href,
      x: 0,
      y: 0,
      width: o.width,
      height: o.height,
      // Without this a capped buffer is letterboxed instead of stretched, and
      // the whole field lands in the wrong place.
      preserveAspectRatio: 'none',
      result,
    });

  let source = 'SourceGraphic';

  if (o.blur > 0) {
    // `duplicate`: the backdrop stops at the element's edge, and blurring in
    // the transparent past it would draw a dark seam round the rim.
    add(filter, 'feGaussianBlur', {
      in: source,
      stdDeviation: o.blur,
      edgeMode: 'duplicate',
      result: 'blurred_source',
    });
    source = 'blurred_source';
  }

  image(displacement.url, 'displacement_map');
  const bend = scaleFor(displacement.reach);
  const displace = (scale: number, result: string): void =>
    add(filter, 'feDisplacementMap', {
      in: source,
      in2: 'displacement_map',
      scale,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result,
    });

  if (o.dispersion > 0) {
    // One bend per channel, blue bent furthest, then the three put back
    // together. Each pass keeps only its own channel (and full alpha), so a
    // `screen` of the three is exactly (R, G, B): nothing is brightened.
    const channels: Array<[string, number, string]> = [
      ['r', 1 - o.dispersion, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
      ['g', 1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
      ['b', 1 + o.dispersion, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
    ];
    for (const [name, factor, matrix] of channels) {
      displace(bend * factor, `displaced_${name}_all`);
      add(filter, 'feColorMatrix', {
        in: `displaced_${name}_all`,
        type: 'matrix',
        values: matrix,
        result: `displaced_${name}`,
      });
    }
    add(filter, 'feBlend', { in: 'displaced_r', in2: 'displaced_g', mode: 'screen', result: 'displaced_rg' });
    add(filter, 'feBlend', { in: 'displaced_rg', in2: 'displaced_b', mode: 'screen', result: 'displaced' });
  } else {
    displace(bend, 'displaced');
  }

  if (o.specularOpacity > 0) {
    const specular = specularMap({
      ...geometry,
      angle: o.specularAngle,
      bandWidth: o.specularWidth,
      profile: o.profile,
      quality: o.quality,
      maxBuffer: o.maxSpecularBuffer,
    });
    if (specular) {
      // The blown-out colour that travels with the rim: the refracted backdrop
      // saturated, clipped to the rim's alpha.
      add(filter, 'feColorMatrix', {
        in: 'displaced',
        type: 'saturate',
        values: o.specularSaturation,
        result: 'displaced_saturated',
      });
      image(specular.url, 'specular_layer');
      add(filter, 'feComposite', {
        in: 'displaced_saturated',
        in2: 'specular_layer',
        operator: 'in',
        result: 'specular_saturated',
      });
      // The rim, faded to taste. `feFuncA slope` is how the reference dials the
      // highlight's brightness without rebuilding the map.
      const transfer = document.createElementNS(SVG_NS, 'feComponentTransfer');
      transfer.setAttribute('in', 'specular_layer');
      transfer.setAttribute('result', 'specular_faded');
      const fade = document.createElementNS(SVG_NS, 'feFuncA');
      fade.setAttribute('type', 'linear');
      fade.setAttribute('slope', String(o.specularOpacity));
      transfer.appendChild(fade);
      filter.appendChild(transfer);
      add(filter, 'feBlend', {
        in: 'specular_saturated',
        in2: 'displaced',
        mode: 'normal',
        result: 'with_saturation',
      });
      add(filter, 'feBlend', { in: 'specular_faded', in2: 'with_saturation', mode: 'normal' });
    }
  }

  const mount = ensureHost();
  if (!mount) return null;
  mount.appendChild(filter);
  return id;
};

export interface GlassFilter {
  id: string;
  /** Ready for `backdrop-filter`. */
  url: string;
}

/**
 * The shared filter for this shape, building it on first use.
 *
 * Returns `null` when the shape is too small to hold a bezel or the browser
 * has no canvas — callers should then leave the surface on its flat fallback
 * rather than showing an unrefracted pane.
 */
export const glassFilter = (optics: GlassOptics): GlassFilter | null => {
  if (typeof document === 'undefined') return null;
  const resolved = resolve(optics);
  // Too small to hold a bezel: the glass would be all rim.
  if (resolved.width < 10 || resolved.height < 8) return null;
  const key = keyOf(resolved);
  const hit = cache.get(key);
  if (hit) {
    hit.refs += 1;
    hit.used = ++seq;
    return { id: hit.id, url: `url(#${hit.id})` };
  }
  const id = build(resolved, key);
  if (!id) return null;
  cache.set(key, { id, refs: 1, used: ++seq });
  evict();
  return { id, url: `url(#${id})` };
};

/** Hands one reference back. The filter goes when the last one does. */
export const releaseGlassFilter = (filter: GlassFilter | null): void => {
  if (!filter) return;
  for (const [key, entry] of cache) {
    if (entry.id !== filter.id) continue;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0) cache.delete(key);
    return;
  }
};

/** Tears every filter down. Only for teardown or tests. */
export const resetGlassFilters = (): void => {
  cache.clear();
  if (host) host.remove();
  host = null;
  defs = null;
};

/** Presets for the app's glass, so every call site agrees on the look. */
export const GLASS_PRESETS = {
  /**
   * A held thumb (switch, slider, tab row): a small, thick convex lens. The
   * middle magnifies what it is over, the rim pulls the backdrop in around the
   * edge and fringes it with colour. Pinned, because a lens that stopped
   * magnifying when someone picked "Concave" for the panels would just be a
   * hole in the control.
   */
  thumb: {
    profile: 'convex_squircle',
    bezelWidth: 9,
    glassThickness: 26,
    refractiveIndex: 1.5,
    maxShift: 0.9,
    zoom: 1.22,
    dispersion: 0.09,
    specularWidth: 2.4,
    pinProfile: true,
  },
  /** Small capsule button. */
  button: { profile: 'convex_squircle', bezelWidth: 7, glassThickness: 18, refractiveIndex: 1.5, maxShift: 0.9 },
  /** Segmented control / tab thumb travelling inside its track. */
  segmented: { profile: 'convex_squircle', bezelWidth: 8, glassThickness: 22, refractiveIndex: 1.5, maxShift: 1 },
  /** Floating toolbar, nav rail: a tall capsule. */
  bar: { profile: 'convex_squircle', bezelWidth: 9, glassThickness: 26, refractiveIndex: 1.5, maxShift: 1 },
  /** Panel, card, dialog body. */
  panel: { profile: 'convex_squircle', bezelWidth: 16, glassThickness: 34, refractiveIndex: 1.4, maxShift: 1 },
  /** Drop list / popover. */
  menu: { profile: 'convex_squircle', bezelWidth: 12, glassThickness: 26, refractiveIndex: 1.4, maxShift: 1 },
  /** Text field. */
  field: { profile: 'convex_squircle', bezelWidth: 10, glassThickness: 30, refractiveIndex: 1.4, maxShift: 1 },
  /** A hand-held lens: a round bezel, a real centre zoom, visible dispersion. */
  lens: {
    profile: 'convex_circle',
    bezelWidth: 26,
    glassThickness: 64,
    refractiveIndex: 1.52,
    maxShift: 0.9,
    zoom: 1.6,
    dispersion: 0.025,
    specularWidth: 7,
    pinProfile: true,
  },
} satisfies Record<string, Partial<GlassOptics>>;

export type GlassPresetName = keyof typeof GLASS_PRESETS;

/** Reads a preset by name. */
export const preset = (name: GlassPresetName): Partial<GlassOptics> => GLASS_PRESETS[name];

/** Exposed for the settings UI: the profile catalogue. */
export const profileChoices = Object.values(SURFACES).map((profile) => ({
  id: profile.id,
  title: profile.title,
  note: profile.note,
}));
