/**
 * The user's taste, as opposed to the physics.
 *
 * `displacementMap.ts` derives what a piece of glass *would* do from its
 * profile, its width and a refractive index. This is the small set of numbers
 * Settings → Appearance → Liquid glass lets someone move on top of that, and
 * which every surface reads through `glassFilter`, so one control steers the
 * whole app rather than each surface keeping its own copy.
 *
 * Two knobs, deliberately:
 *   - `profile` — the cross-section of the bezel. This is the shape of the
 *     bend, and the most visible difference between the four surfaces the
 *     article derives. `null` means every look keeps the profile it was
 *     designed with, which is the default because the switch and the lens want
 *     the lip regardless of what the panels are doing.
 *   - `strength` — a multiplier on every traced shift. 1 means shift the
 *     backdrop by exactly what the profile traced, in px.
 */

import type { SurfaceId } from './surfaceEquations';

export interface GlassPreferences {
  /** Bezel cross-section for surfaces; `null` keeps each look's own. */
  profile: SurfaceId | null;
  /** Multiplier on every traced shift. 1 = the traced amount, in px. */
  strength: number;
}

export const GLASS_STRENGTH = { min: 0.3, max: 2, step: 0.05, default: 1 } as const;

export const DEFAULT_GLASS_PREFERENCES: GlassPreferences = {
  profile: null,
  strength: GLASS_STRENGTH.default,
};

let current: GlassPreferences = DEFAULT_GLASS_PREFERENCES;

/** The preferences in force right now. */
export const glassPreferences = (): GlassPreferences => current;

/** Replaces them and returns what is now in force. */
export const setGlassPreferences = (next: Partial<GlassPreferences>): GlassPreferences => {
  current = {
    profile: next.profile === undefined ? current.profile : next.profile,
    strength:
      next.strength === undefined || !Number.isFinite(next.strength)
        ? current.strength
        : Math.min(GLASS_STRENGTH.max, Math.max(GLASS_STRENGTH.min, next.strength)),
  };
  return current;
};
