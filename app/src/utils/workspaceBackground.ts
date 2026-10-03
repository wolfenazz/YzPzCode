import type { WorkspaceBackground, WorkspaceLightRaysSettings } from '../types';

export const WORKSPACE_BACKGROUNDS: { value: WorkspaceBackground; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'Plain workspace background.' },
  { value: 'aurora', label: 'Aurora', description: 'A soft wash of color behind your terminal layout.' },
  { value: 'light-rays', label: 'Light Rays', description: 'Directional beams of light behind your terminal layout.' },
];

export const DEFAULT_LIGHT_RAYS: WorkspaceLightRaysSettings = {
  raysOrigin: 'top-center', raysColor: '#00ffff', raysSpeed: 1.5,
  lightSpread: 0.8, rayLength: 1.2, pulsating: false, fadeDistance: 1,
  saturation: 1, followMouse: true, mouseInfluence: 0.1,
  noiseAmount: 0.1, distortion: 0.05, intensity: 35, motion: true,
};

export const LIGHT_RAYS_RANGES = {
  intensity: { label: 'Intensity', min: 0, max: 100, step: 1 },
  raysSpeed: { label: 'Speed', min: 0, max: 3, step: 0.1 },
  lightSpread: { label: 'Spread', min: 0.1, max: 3, step: 0.05 },
  rayLength: { label: 'Ray length', min: 0.1, max: 5, step: 0.1 },
  fadeDistance: { label: 'Fade distance', min: 0.1, max: 3, step: 0.1 },
  saturation: { label: 'Saturation', min: 0, max: 1, step: 0.05 },
  mouseInfluence: { label: 'Mouse influence', min: 0, max: 1, step: 0.01 },
  noiseAmount: { label: 'Grain', min: 0, max: 1, step: 0.01 },
  distortion: { label: 'Distortion', min: 0, max: 1, step: 0.01 },
} as const;

/** Normalize imported/persisted settings as well as slider changes. */
export function normalizeLightRays(settings: Partial<WorkspaceLightRaysSettings>): WorkspaceLightRaysSettings {
  const result = { ...DEFAULT_LIGHT_RAYS, ...settings };
  for (const key of Object.keys(LIGHT_RAYS_RANGES) as (keyof typeof LIGHT_RAYS_RANGES)[]) {
    const { min, max } = LIGHT_RAYS_RANGES[key];
    result[key] = Number.isFinite(result[key]) ? Math.min(max, Math.max(min, result[key])) : DEFAULT_LIGHT_RAYS[key];
  }
  if (!/^#[a-f\d]{6}$/i.test(result.raysColor)) result.raysColor = DEFAULT_LIGHT_RAYS.raysColor;
  if (!['top-center', 'top-left', 'top-right', 'left', 'right', 'bottom-center', 'bottom-left', 'bottom-right'].includes(result.raysOrigin)) {
    result.raysOrigin = DEFAULT_LIGHT_RAYS.raysOrigin;
  }
  for (const key of ['pulsating', 'followMouse', 'motion'] as const) {
    if (typeof result[key] !== 'boolean') result[key] = DEFAULT_LIGHT_RAYS[key];
  }
  return result;
}

export function migrateWorkspaceBackground(state: { workspaceBackground?: WorkspaceBackground; workspaceAuroraEnabled?: boolean }): WorkspaceBackground {
  const selected = WORKSPACE_BACKGROUNDS.find(({ value }) => value === state.workspaceBackground);
  return selected?.value ?? (state.workspaceAuroraEnabled === false ? 'none' : 'aurora');
}
