import type { ReactElement } from 'react';
import { SettingsToggle } from '../../common/SettingsToggle';
import { useAppStore } from '../../../stores/appStore';
import { DEFAULT_LIGHT_RAYS, LIGHT_RAYS_RANGES } from '../../../utils/workspaceBackground';
import type { RaysOrigin } from '../../../types';

const ORIGINS: { value: RaysOrigin; label: string }[] = [
  { value: 'top-left', label: 'Top left' }, { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' }, { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' }, { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' }, { value: 'bottom-right', label: 'Bottom right' },
];
const SLIDERS = Object.entries(LIGHT_RAYS_RANGES) as [keyof typeof LIGHT_RAYS_RANGES, typeof LIGHT_RAYS_RANGES[keyof typeof LIGHT_RAYS_RANGES]][];

export function SettingsWorkspaceLightRays(): ReactElement {
  const settings = useAppStore((s) => s.workspaceLightRays);
  const setSettings = useAppStore((s) => s.setWorkspaceLightRays);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  return (
    <fieldset className="space-y-5">
      <legend className="sr-only">Light Rays appearance</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-2 text-xs text-[var(--text-primary)]">
          Origin
          <select value={settings.raysOrigin} onChange={(event) => setSettings({ raysOrigin: event.target.value as RaysOrigin })} className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-2 text-xs">
            {ORIGINS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs text-[var(--text-primary)]">
          Ray color
          <span className="flex items-center gap-3 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-2">
            <input type="color" aria-label="Ray color" value={settings.raysColor} onChange={(event) => setSettings({ raysColor: event.target.value })} className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0" />
            <output className="font-mono">{settings.raysColor.toUpperCase()}</output>
          </span>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        {SLIDERS.map(([key, { label, min, max, step }]) => (
          <div key={key}>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <label htmlFor={`light-rays-${key}`} className="text-[var(--text-primary)]">{label}</label>
              <output htmlFor={`light-rays-${key}`} className="tabular-nums text-[var(--text-secondary)]">
                {key === 'intensity' ? `${settings[key]}%` : settings[key].toFixed(2)}
              </output>
            </div>
            <input id={`light-rays-${key}`} type="range" min={min} max={max} step={step} value={settings[key]}
              onChange={(event) => setSettings({ [key]: Number(event.target.value) })}
              className="w-full accent-[var(--accent)] cursor-pointer" />
          </div>
        ))}
      </div>
      <SettingsToggle enabled={settings.motion} onToggle={() => setSettings({ motion: !settings.motion })} label="Animate rays"
        description={animationsEnabled ? 'Respects your system reduced-motion preference' : 'Paused while app animations are disabled'} />
      <SettingsToggle enabled={settings.pulsating} onToggle={() => setSettings({ pulsating: !settings.pulsating })} label="Pulsating" description="Gently vary the brightness while animated" />
      <SettingsToggle enabled={settings.followMouse} onToggle={() => setSettings({ followMouse: !settings.followMouse })} label="Follow mouse" description="Steer rays toward the pointer while animated" />
      <button type="button" onClick={() => setSettings(DEFAULT_LIGHT_RAYS)} className="rounded-md border border-[var(--border-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]">Reset Light Rays</button>
    </fieldset>
  );
}
