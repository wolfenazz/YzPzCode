import type { SetupBackground, SetupGalaxySettings } from '../types';

export const SETUP_BACKGROUNDS: { value: SetupBackground; label: string; description: string }[] = [
  { value: 'none', label: 'No background', description: 'A clean, plain setup page. Default.' },
  { value: 'aurora', label: 'Aurora', description: 'Soft sage light drifting across the page.' },
  { value: 'threads', label: 'Threads', description: 'Fine silver strands with a slow, flowing motion.' },
  { value: 'iridescence', label: 'Iridescence', description: 'A soft pearlescent wash in muted tones.' },
  { value: 'waves', label: 'Waves', description: 'Delicate contour lines with gentle movement.' },
  { value: 'particles', label: 'Particles', description: 'Sparse, softly lit particles floating in the distance.' },
  { value: 'dark-veil', label: 'Dark Veil', description: 'A quiet veil of smoky blue light.' },
  { value: 'gradient-blinds', label: 'Gradient Blinds', description: 'Subtle vertical folds in sage and slate.' },
  { value: 'liquid-chrome', label: 'Liquid Chrome', description: 'Slow ripples with a brushed metal finish.' },
  { value: 'plasma', label: 'Plasma', description: 'A restrained ribbon of warm, diffused light.' },
  { value: 'shape-grid', label: 'Shape Grid', description: 'A fine architectural grid, slowly drifting.' },
  { value: 'galaxy', label: 'Galaxy', description: 'A drifting field of stars behind the workspace setup.' },
];

export function normalizeSetupBackground(value: unknown): SetupBackground {
  return SETUP_BACKGROUNDS.find((option) => option.value === value)?.value ?? 'none';
}

/** Clear the former Galaxy default once; later selections remain persisted. */
export function migrateSetupBackground(value: unknown): SetupBackground {
  return value === 'galaxy' ? 'none' : normalizeSetupBackground(value);
}

export const DEFAULT_SETUP_GALAXY: SetupGalaxySettings = {
  intensity: 70,
  density: 1.3,
  hueShift: 240,
  glowIntensity: 0.45,
  saturation: 0.6,
  starSpeed: 0.5,
  speed: 1,
  rotationSpeed: 0.1,
  twinkleIntensity: 0.3,
  repulsionStrength: 2,
  mouseInteraction: true,
  mouseRepulsion: true,
  motion: true,
};

export const SETUP_GALAXY_RANGES = {
  intensity: { label: 'Visibility', min: 0, max: 100, step: 5 },
  density: { label: 'Star density', min: 0.1, max: 3, step: 0.1 },
  hueShift: { label: 'Hue shift', min: 0, max: 360, step: 5 },
  glowIntensity: { label: 'Glow', min: 0, max: 1, step: 0.05 },
  saturation: { label: 'Saturation', min: 0, max: 1, step: 0.05 },
  starSpeed: { label: 'Star speed', min: 0, max: 2, step: 0.05 },
  speed: { label: 'Animation speed', min: 0, max: 2, step: 0.05 },
  rotationSpeed: { label: 'Rotation speed', min: 0, max: 0.5, step: 0.01 },
  twinkleIntensity: { label: 'Twinkle', min: 0, max: 1, step: 0.05 },
  repulsionStrength: { label: 'Repulsion strength', min: 0, max: 5, step: 0.1 },
} as const;

/** Normalize imported/persisted settings as well as slider changes. */
export function normalizeSetupGalaxy(settings: Partial<SetupGalaxySettings>): SetupGalaxySettings {
  const result = { ...DEFAULT_SETUP_GALAXY, ...settings };
  for (const key of Object.keys(SETUP_GALAXY_RANGES) as (keyof typeof SETUP_GALAXY_RANGES)[]) {
    const { min, max } = SETUP_GALAXY_RANGES[key];
    result[key] = Number.isFinite(result[key]) ? Math.min(max, Math.max(min, result[key])) : DEFAULT_SETUP_GALAXY[key];
  }
  for (const key of ['mouseInteraction', 'mouseRepulsion', 'motion'] as const) {
    if (typeof result[key] !== 'boolean') result[key] = DEFAULT_SETUP_GALAXY[key];
  }
  return result;
}
