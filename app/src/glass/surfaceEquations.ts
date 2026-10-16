/**
 * The cross-section of a piece of glass: how thick it is, from the outer edge
 * of the bezel (`x = 0`) to where the flat face begins (`x = 1`).
 *
 * Every other number in the glass engine is derived from one of these. A ray
 * entering the bezel is bent by the surface's slope, so the profile is what
 * decides whether the glass pulls the backdrop inward (convex), pushes it out
 * (concave), or does both (lip) — and how wide the bending band looks.
 *
 * Ported from `src/lib/surfaceEquations.ts` of mkj0kjay/vue-web-liquid-glass
 * (MIT), which follows https://kube.io/blog/liquid-glass-css-svg/.
 */

/** A named cross-section: `fn(x)` is the glass height at `x` (both 0…1). */
export interface SurfaceProfile {
  id: SurfaceId;
  /** Short label, for the settings UI. */
  title: string;
  /** What the profile does to the backdrop, in one line. */
  note: string;
  fn: (x: number) => number;
}

export type SurfaceId = 'convex_circle' | 'convex_squircle' | 'concave' | 'lip';

/**
 * A spherical arc. The simplest dome, but the junction with the flat face is
 * sharp, which shows as a hard line when the shape is stretched into a pill.
 */
const convexCircle = (x: number): number => Math.sqrt(1 - (1 - x) ** 2);

/**
 * Apple's squircle: the same dome, flattened near both ends so the gradient
 * into the flat face stays smooth however far the shape is stretched. The
 * bezel also reads optically thinner than it measures, because the flat outer
 * zone bends little.
 */
const convexSquircle = (x: number): number => (1 - (1 - x) ** 4) ** 0.25;

/** The complement: a bowl. Rays diverge, pushing the backdrop outwards. */
const concave = (x: number): number => 1 - convexCircle(x);

/**
 * Convex at the rim, concave in the middle: a raised lip around a shallow dip.
 * This is what iOS 26 uses for the switch, and it is why the track seen
 * through a held thumb opens out at the edges and pinches in the centre.
 */
const lip = (x: number): number => {
  const dome = convexSquircle(x * 2);
  const bowl = concave(x) + 0.1;
  const blend = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3; // smootherstep
  return dome * (1 - blend) + bowl * blend;
};

export const SURFACES: Record<SurfaceId, SurfaceProfile> = {
  convex_circle: {
    id: 'convex_circle',
    title: 'Convex circle',
    note: 'Round dome. Strong bend, hard edge where it meets the flat face.',
    fn: convexCircle,
  },
  convex_squircle: {
    id: 'convex_squircle',
    title: 'Convex squircle',
    note: 'The default. Smooth bend that survives being stretched into a bar.',
    fn: convexSquircle,
  },
  concave: {
    id: 'concave',
    title: 'Concave',
    note: 'Bowl. Pushes the backdrop outwards, past the glass edge.',
    fn: concave,
  },
  lip: {
    id: 'lip',
    title: 'Lip',
    note: 'Raised rim, shallow dip. Thumbs and switches: edges open, centre pinches.',
    fn: lip,
  },
};

/** Reads a profile by id, defaulting to the squircle. */
export const surfaceFn = (id: SurfaceId | undefined): ((x: number) => number) =>
  (id && SURFACES[id]?.fn) || SURFACES.convex_squircle.fn;
