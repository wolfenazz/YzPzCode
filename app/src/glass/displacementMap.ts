/**
 * The refraction engine: turns a piece of glass into an SVG displacement map.
 *
 * How it works, from the top:
 *   1. `bezelDisplacements` traces rays through the bezel's cross-section
 *      (a `SurfaceProfile`) and returns, for 128 steps from the outer edge to
 *      the flat face, how far a ray that entered there lands from where it
 *      would have landed through no glass. Snell's law, one refraction, and
 *      the ray then travels the rest of the way down to the bottom face — so
 *      the shift is that ray's x direction times the remaining height over its
 *      y direction (`refracted[0] * remainingHeight / refracted[1]`).
 *   2. `displacementMap` sprays that one profile around the whole shape: every
 *      pixel of the element finds its distance from the nearest edge and its
 *      outward normal (a rectangle is two rounded ends joined by straight
 *      runs), and writes the profile's displacement along `-normal`, so glass
 *      pulls the backdrop towards itself.
 *   3. Channels: R is the x shift, G is the y shift, both stored the way
 *      `feDisplacementMap` reads them (`128` = no displacement). `reach` is
 *      the largest shift in the map, in CSS px, and becomes the filter's
 *      `scale` — see `scaleFor`.
 *
 * Two things here are deliberate departures from the reference implementation
 * we ported (`src/lib/displacementMap.ts` of mkj0kjay/vue-web-liquid-glass):
 *   - the profile is normalised by its own maximum, so `scale = reach` is
 *     physically exact instead of depending on the magic constant `100` (see
 *     `SCALE_TO_PIXELS`);
 *   - the buffer is capped (`maxBuffer`), so a 900px-wide bar does not build a
 *     3.6M pixel map twice over. The maps are smooth gradients and upscale
 *     cleanly; the specular rim is the one that must not be squashed.
 */

import { surfaceFn, type SurfaceId } from './surfaceEquations';

/** `feDisplacementMap` reads a channel as `-0.5…0.5`; we store `128 ± 127`. */
const SCALE_TO_PIXELS = 255 / 127;

/** Sets the filter `scale` that applies a map of this `reach` at 1:1. */
export const scaleFor = (reach: number, ratio = 1): number => reach * SCALE_TO_PIXELS * ratio;

export interface BezelOptions {
  /** Thickness of the glass under the bezel, in px. Tall = more shift. */
  glassThickness: number;
  /** Width of the curved rim, in px. Wide = a broader bend. */
  bezelWidth: number;
  /** 1.5 is window glass; higher bends more. */
  refractiveIndex: number;
  /** Which cross-section to trace. */
  profile: SurfaceId;
  /** Steps across the bezel. 128 is what an 8-bit map can hold. */
  samples?: number;
  /**
   * Ceiling on the shift, as a multiple of `bezelWidth` (default 1).
   *
   * The trace below lets a ray graze the outer edge and then travel the whole
   * glass thickness sideways, which for a thick slab reports shifts far wider
   * than the rim itself — 120px on an 8px bezel. In real glass that ray hits
   * the side wall or goes past the critical angle at the bottom face and never
   * comes out, so the honest answer is "no further than the bezel is wide".
   * The ceiling is reached softly (see `saturate`), so a thick slab does not
   * flatten into a plateau with a cliff at its inner edge.
   */
  maxShift?: number;
  /**
   * Steepest the shift may change across the rim, in px of shift per px of
   * rim (default 0.82).
   *
   * Past 1 the map folds: two neighbouring pixels sample the backdrop in the
   * wrong order and the text under the rim is drawn twice, mirrored. A thick
   * real lens can do that past its focal point, but a piece of UI glass never
   * does, and it is what made a held thumb look broken rather than bent.
   */
  maxSlope?: number;
  /**
   * Multiplier on the traced shift (Settings → Refraction strength), applied
   * before the ceiling and the fold guard so a strong setting bends more but
   * can never fold the map.
   */
  gain?: number;
}

/**
 * Soft ceiling: linear for small shifts, easing into `cap` instead of hitting
 * it. A hard clamp turns most of a thick rim into one flat band and puts the
 * whole bend into the last few pixels, which reads as a seam, not glass.
 */
const saturate = (value: number, cap: number): number => {
  if (cap <= 0) return value;
  const x = value / cap;
  return (cap * x) / (1 + x ** 4) ** 0.25;
};

export interface BezelProfile {
  /** Normalised to -1…1, indexed from the outer edge (0) to the flat face. */
  samples: Float64Array;
  /** Peak shift the profile was normalised from, in CSS px. */
  reach: number;
}

/**
 * Traces the bezel's cross-section once and returns both the normalised
 * profile the map stores and the peak shift it was normalised from — the
 * caller feeds `reach` straight to the filter's `scale`.
 *
 * Rays arriving past the critical angle are total internal reflections: no
 * light gets through there, so the profile reports `0` and the backdrop shows
 * through unbent.
 */
export const bezelProfile = ({
  glassThickness,
  bezelWidth,
  refractiveIndex,
  profile,
  samples = 128,
  maxShift = 1,
  maxSlope = 0.82,
  gain = 1,
}: BezelOptions): BezelProfile => {
  const fn = surfaceFn(profile);
  const eta = 1 / refractiveIndex;
  const cap = Math.max(bezelWidth * maxShift, 0);
  const out = new Float64Array(samples);
  let peak = 0;

  for (let i = 0; i < samples; i += 1) {
    const x = i / samples;
    const y = fn(x);

    // One-sided derivative, taken to the right (or left at the far end so the
    // last sample never reads past the flat face).
    const delta = x < 1 ? 0.0001 : -0.0001;
    const derivative = (fn(x + delta) - y) / delta;
    const magnitude = Math.sqrt(derivative * derivative + 1);
    // Surface normal, flipped to face the incoming ray.
    const nx = -derivative / magnitude;
    const ny = -1 / magnitude;

    // Snell's law for a ray arriving straight down onto that normal.
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) continue; // total internal reflection
    const kSqrt = Math.sqrt(k);
    const refractedX = -(eta * dot + kSqrt) * nx;
    const refractedY = eta - (eta * dot + kSqrt) * ny;
    if (refractedY === 0) continue;

    const remainingHeight = y * bezelWidth + glassThickness;
    const shift = refractedX * (remainingHeight / refractedY);
    out[i] = saturate(shift * gain, cap);
  }

  // Keep the map from folding. A pixel `u` px in from the edge reads the
  // backdrop at `u + shift(u)`, which must keep moving inward as `u` does, so
  // walking out from the flat face the shift may grow by at most `maxSlope`
  // px per px (shrinking is always safe). An outward (concave) shift may also
  // never reach past the outer edge, where the backdrop ends.
  const stepPx = bezelWidth / samples;
  for (let i = samples - 2; i >= 0; i -= 1) {
    out[i] = Math.min(out[i], out[i + 1] + maxSlope * stepPx);
    if (out[i] < 0) out[i] = Math.max(out[i], -0.9 * i * stepPx);
  }
  for (let i = 0; i < samples; i += 1) peak = Math.max(peak, Math.abs(out[i]));

  if (peak > 0) for (let i = 0; i < samples; i += 1) out[i] /= peak;
  return { samples: out, reach: peak };
};

/** How the element's outline is built from its corner radius. */
export type GlassShape = 'pill' | 'rect' | 'squircle';

export interface GlassGeometry {
  /** Border box in CSS px. */
  width: number;
  height: number;
  /** Corner radius in CSS px. `pill` ignores it and rounds the short axis. */
  radius: number;
  /** Width of the curved rim, in CSS px. */
  bezelWidth: number;
  shape: GlassShape;
  /** Corner exponent for `squircle` (2 = ellipse, 4 = iOS-ish). */
  squircleExponent?: number;
}

/** Where a buffer pixel sits relative to the outline. */
interface EdgeSample {
  /** px inside the outline; negative just outside it. */
  distance: number;
  /** Outward unit normal. */
  nx: number;
  ny: number;
}

const superellipseDistance = (x: number, y: number, r: number, n: number): number => {
  if (r <= 0) return Math.hypot(x, y);
  return ((Math.abs(x) / r) ** n + (Math.abs(y) / r) ** n) ** (1 / n) * r;
};

/**
 * Classifies one point of the outline.
 *
 * A rounded rectangle is four corner arcs joined by four straight runs. Inside
 * a corner the normal points away from the corner's centre; along a run it is
 * axis aligned. Both point outward, and the caller negates them so the
 * backdrop is pulled in — the direction real glass bends it.
 */
const edgeAt = (
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  shape: GlassShape,
  exponent: number,
): EdgeSample | null => {
  const left = x < radius;
  const right = x >= width - radius;
  const top = y < radius;
  const bottom = y >= height - radius;
  const inCorner = (left || right) && (top || bottom);

  if (inCorner && radius > 0) {
    const cx = left ? x - radius : x - (width - radius);
    const cy = top ? y - radius : y - (height - radius);
    const distance = shape === 'squircle' ? superellipseDistance(cx, cy, radius, exponent) : Math.hypot(cx, cy);
    // A corner arc alone would leave a seam against the straight runs when the
    // squircle pulls its asymptotes outward, so a point far outside its own
    // corner still measures from the edges underneath.
    if (distance <= radius) {
      const magnitude = Math.hypot(cx, cy) || 1;
      return { distance: radius - distance, nx: cx / magnitude, ny: cy / magnitude };
    }
  }

  // Straight runs: rail by rail, take the closest.
  const fromLeft = x;
  const fromRight = width - x;
  const fromTop = y;
  const fromBottom = height - y;
  const horizontal = Math.min(fromLeft, fromRight);
  const vertical = Math.min(fromTop, fromBottom);
  if (horizontal <= vertical) {
    return { distance: horizontal, nx: fromLeft <= fromRight ? -1 : 1, ny: 0 };
  }
  return { distance: vertical, nx: 0, ny: fromTop <= fromBottom ? -1 : 1 };
};

export interface GlassMap {
  /** A `data:` PNG ready for `feImage href`. */
  url: string;
  /** Largest shift in the map, in CSS px. */
  reach: number;
}

export interface MapOptions extends GlassGeometry {
  /** The traced bezel from `bezelProfile`. */
  bezel: BezelProfile;
  /** Buffer pixels per CSS px (2 covers retina). */
  quality?: number;
  /** Cap on the long side of the buffer, in px. */
  maxBuffer?: number;
}

/** Buffer scale that honours `quality` without exceeding `maxBuffer`. */
const bufferScale = (width: number, height: number, quality: number, maxBuffer: number): number => {
  const longest = Math.max(width, height, 1);
  return Math.max(Math.min(quality, maxBuffer / longest), 0.05);
};

const toDataUrl = (image: ImageData): string | null => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
};

/**
 * The displacement map for one glass shape: a PNG whose R/G channels shift the
 * backdrop by `profile` times `reach`.
 */
export const displacementMap = ({
  width,
  height,
  radius,
  bezelWidth,
  shape,
  squircleExponent = 4,
  bezel,
  quality = 2,
  maxBuffer = 512,
}: MapOptions): GlassMap | null => {
  const reach = bezel.reach;
  if (!(width > 0) || !(height > 0) || !(bezelWidth > 0) || reach <= 0) return null;
  const scale = bufferScale(width, height, quality, maxBuffer);
  const w = Math.max(Math.round(width * scale), 4);
  const h = Math.max(Math.round(height * scale), 4);

  const effectiveRadius =
    shape === 'pill' ? Math.min(w, h) / 2 : Math.min(radius * scale, Math.min(w, h) / 2);
  const bezelPx = bezelWidth * scale;
  const steps = bezel.samples.length;
  const image = new ImageData(w, h);
  const pixels = image.data;
  const feather = Math.max(scale, 0.75);
  // Neutral: R = G = 128 shifts nothing.
  for (let k = 0; k < w * h; k += 1) {
    pixels[k * 4] = 128;
    pixels[k * 4 + 1] = 128;
    pixels[k * 4 + 2] = 0;
    pixels[k * 4 + 3] = 255;
  }

  for (let j = 0; j < h; j += 1) {
    const py = j + 0.5;
    for (let i = 0; i < w; i += 1) {
      const edge = edgeAt(i + 0.5, py, w, h, effectiveRadius, shape, squircleExponent);
      if (!edge || edge.distance < -feather) continue;
      // Outside the outline the map must be neutral, so the ring just past the
      // border fades in rather than stepping.
      const alpha = edge.distance >= 0 ? 1 : (edge.distance + feather) / feather;
      // Read the profile between its samples, not at the nearest one: on a wide
      // rim the steps would otherwise show as rings in the bend.
      if (edge.distance >= bezelPx) continue; // the flat face bends nothing
      const at = (Math.max(edge.distance, 0) / bezelPx) * (steps - 1);
      const lo = Math.floor(at);
      const hi = Math.min(lo + 1, steps - 1);
      const shift = bezel.samples[lo] + (bezel.samples[hi] - bezel.samples[lo]) * (at - lo);
      if (shift === 0) continue;
      // Negative normal: pull the backdrop inwards, as convex glass does.
      const dx = -edge.nx * shift * alpha;
      const dy = -edge.ny * shift * alpha;
      const k = (j * w + i) * 4;
      pixels[k] = 128 + dx * 127;
      pixels[k + 1] = 128 + dy * 127;
    }
  }

  const url = toDataUrl(image);
  return url ? { url, reach } : null;
};

export interface SpecularOptions extends GlassGeometry {
  /**
   * Direction the light comes from, in radians, measured on screen with y up
   * (0 = from the right, π/2 = from above). Default: upper left.
   */
  angle?: number;
  /** How far in from the edge the highlight reaches, in CSS px. */
  bandWidth?: number;
  /** The rim's cross-section; the highlight follows its slope. */
  profile?: SurfaceId;
  /** Strength of the bounce on the far side, 0…1 (default 0.5). */
  bounce?: number;
  quality?: number;
  maxBuffer?: number;
}

/**
 * The specular rim: where the bezel tilts towards the light, the glass throws
 * a highlight back at the eye.
 *
 * Per pixel: how steep the rim is there (read from the same cross-section the
 * refraction traced, so a round bezel glints over a broad band and a squircle
 * only along its very edge), times how squarely the rim faces the light. The
 * far side gets a weaker copy — light that entered on the lit side, bounced
 * off the inside of the glass and leaves through the opposite rim — which is
 * the pair of highlights, upper left and lower right, that makes Apple's
 * glass read as a solid thing rather than an outline.
 *
 * Written as white with the intensity in alpha; the filter lays it over the
 * refracted backdrop. A hairline, so it is never downscaled.
 */
export const specularMap = ({
  width,
  height,
  radius,
  bezelWidth,
  shape,
  squircleExponent = 4,
  angle = (3 * Math.PI) / 4,
  bandWidth = 2,
  profile = 'convex_squircle',
  bounce = 0.5,
  quality = 2,
  maxBuffer = 1024,
}: SpecularOptions): GlassMap | null => {
  if (!(width > 0) || !(height > 0)) return null;
  const scale = bufferScale(width, height, quality, maxBuffer);
  const w = Math.max(Math.round(width * scale), 4);
  const h = Math.max(Math.round(height * scale), 4);
  const effectiveRadius =
    shape === 'pill' ? Math.min(w, h) / 2 : Math.min(radius * scale, Math.min(w, h) / 2);
  const rim = Math.max(bezelWidth * scale, 1);
  // The light cannot reach further in than the rim it is lighting.
  const band = Math.max(Math.min(bandWidth, bezelWidth) * scale, 0.75);
  const fn = surfaceFn(profile);

  // Slope of the rim, 0 (flat) … 1 (vertical), tabulated once.
  const STEPS = 64;
  const slope = new Float64Array(STEPS + 1);
  for (let s = 0; s <= STEPS; s += 1) {
    const x = Math.min(s / STEPS, 0.9999);
    const d = (fn(Math.min(x + 0.0005, 1)) - fn(x)) / 0.0005;
    slope[s] = Math.abs(d) / Math.sqrt(d * d + 1);
  }

  // Screen space has y pointing down.
  const lightX = Math.cos(angle);
  const lightY = -Math.sin(angle);
  const image = new ImageData(w, h);
  const pixels = image.data;

  for (let j = 0; j < h; j += 1) {
    const py = j + 0.5;
    for (let i = 0; i < w; i += 1) {
      const edge = edgeAt(i + 0.5, py, w, h, effectiveRadius, shape, squircleExponent);
      if (!edge || edge.distance < -0.5 || edge.distance > rim) continue;
      const u = Math.max(edge.distance, 0);
      const facing = edge.nx * lightX + edge.ny * lightY;
      const lit = facing > 0 ? facing ** 1.6 : bounce * (-facing) ** 2.2;
      if (lit <= 0.002) continue;
      const tilt = slope[Math.min(STEPS, Math.round((u / rim) * STEPS))];
      // Sharpest at the very edge, fading in over `band`.
      const falloff = Math.exp(-u / band);
      // Anti-alias the outer half pixel.
      const cover = edge.distance < 0.5 ? edge.distance + 0.5 : 1;
      const coefficient = Math.min(1, lit * tilt ** 1.5 * falloff * cover);
      if (coefficient <= 0.004) continue;
      const k = (j * w + i) * 4;
      pixels[k] = 255;
      pixels[k + 1] = 255;
      pixels[k + 2] = 255;
      pixels[k + 3] = 255 * coefficient;
    }
  }

  const url = toDataUrl(image);
  return url ? { url, reach: 0 } : null;
};

export interface LensOptions extends GlassGeometry {
  /** The traced bezel from `bezelProfile`. */
  bezel: BezelProfile;
  /** Magnification across the flat face, as a factor (> 1). */
  zoom: number;
  quality?: number;
  maxBuffer?: number;
}

/**
 * The map for a magnifying lens: one field that does the zoom and the rim
 * together, because a real lens is one piece of glass and they are not
 * separable.
 *
 * Across the flat face every pixel reads the backdrop from nearer the centre,
 * so it is enlarged by `zoom`. Over the rim the zoom eases off along the same
 * traced bezel profile, back to 1:1 at the very edge, so whatever the face
 * enlarged is squeezed back into the rim: the compressed, curved band you see
 * round the edge of a real lens. The traced inward bend rides on top.
 *
 * Stacking a separate zoom pass and the rim map instead stretched the rim:
 * both pulled inward, so a few pixels of backdrop were smeared across the
 * whole bezel. Along any line out from the centre the field here only ever
 * moves outward, so nothing folds or smears.
 */
export const lensMap = ({
  width,
  height,
  radius,
  bezelWidth,
  shape,
  squircleExponent = 4,
  bezel,
  zoom,
  quality = 2,
  maxBuffer = 512,
}: LensOptions): GlassMap | null => {
  if (!(width > 0) || !(height > 0) || !(bezelWidth > 0) || !(zoom > 1)) return null;
  const scale = bufferScale(width, height, quality, maxBuffer);
  const w = Math.max(Math.round(width * scale), 4);
  const h = Math.max(Math.round(height * scale), 4);
  const effectiveRadius =
    shape === 'pill' ? Math.min(w, h) / 2 : Math.min(radius * scale, Math.min(w, h) / 2);
  const bezelPx = bezelWidth * scale;
  const pull = 1 - 1 / zoom;
  const reachPx = bezel.reach * scale;
  const steps = bezel.samples.length;
  const cx = w / 2;
  const cy = h / 2;
  const feather = Math.max(scale, 0.75);
  const offsets = new Float32Array(w * h * 2);
  let peak = 0;

  for (let j = 0; j < h; j += 1) {
    const py = j + 0.5;
    for (let i = 0; i < w; i += 1) {
      const px = i + 0.5;
      const edge = edgeAt(px, py, w, h, effectiveRadius, shape, squircleExponent);
      if (!edge || edge.distance < -feather) continue;
      const alpha = edge.distance >= 0 ? 1 : (edge.distance + feather) / feather;
      // How much of the rim this pixel is in: 1 at the edge, 0 on the face.
      let rim = 0;
      let shift = 0;
      if (edge.distance < bezelPx) {
        const at = (Math.max(edge.distance, 0) / bezelPx) * (steps - 1);
        const lo = Math.floor(at);
        const hi = Math.min(lo + 1, steps - 1);
        shift = bezel.samples[lo] + (bezel.samples[hi] - bezel.samples[lo]) * (at - lo);
        rim = Math.min(1, Math.abs(shift));
      }
      const keep = pull * (1 - rim);
      const dx = (-(px - cx) * keep - edge.nx * shift * reachPx) * alpha;
      const dy = (-(py - cy) * keep - edge.ny * shift * reachPx) * alpha;
      const k = (j * w + i) * 2;
      offsets[k] = dx;
      offsets[k + 1] = dy;
      peak = Math.max(peak, Math.abs(dx), Math.abs(dy));
    }
  }
  if (peak <= 0) return null;

  const image = new ImageData(w, h);
  const pixels = image.data;
  for (let p = 0; p < w * h; p += 1) {
    pixels[p * 4] = 128 + (offsets[p * 2] / peak) * 127;
    pixels[p * 4 + 1] = 128 + (offsets[p * 2 + 1] / peak) * 127;
    pixels[p * 4 + 2] = 0;
    pixels[p * 4 + 3] = 255;
  }
  const url = toDataUrl(image);
  // `reach` back in CSS px, for `scaleFor`.
  return url ? { url, reach: peak / scale } : null;
};
