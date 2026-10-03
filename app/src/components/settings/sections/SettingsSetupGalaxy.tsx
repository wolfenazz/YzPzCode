import type { ReactElement } from 'react';
import { SettingsToggle } from '../../common/SettingsToggle';
import { useAppStore } from '../../../stores/appStore';
import { DEFAULT_SETUP_GALAXY, SETUP_GALAXY_RANGES } from '../../../utils/setupBackground';

const SLIDERS = Object.entries(SETUP_GALAXY_RANGES) as [keyof typeof SETUP_GALAXY_RANGES, typeof SETUP_GALAXY_RANGES[keyof typeof SETUP_GALAXY_RANGES]][];

export function SettingsSetupGalaxy(): ReactElement {
  const settings = useAppStore((s) => s.setupGalaxy);
  const setSettings = useAppStore((s) => s.setSetupGalaxy);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  return (
    <fieldset className="space-y-5">
      <legend className="sr-only">Galaxy appearance</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        {SLIDERS.map(([key, { label, min, max, step }]) => (
          <div key={key}>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <label htmlFor={`setup-galaxy-${key}`} className="text-[var(--text-primary)]">{label}</label>
              <output htmlFor={`setup-galaxy-${key}`} className="tabular-nums text-[var(--text-secondary)]">
                {key === 'intensity' ? `${settings[key]}%` : key === 'hueShift' ? `${settings[key]}°` : settings[key].toFixed(2)}
              </output>
            </div>
            <input id={`setup-galaxy-${key}`} type="range" min={min} max={max} step={step} value={settings[key]}
              onChange={(event) => setSettings({ [key]: Number(event.target.value) })}
              className="w-full accent-[var(--accent)] cursor-pointer" />
          </div>
        ))}
      </div>
      <SettingsToggle enabled={settings.mouseInteraction} onToggle={() => setSettings({ mouseInteraction: !settings.mouseInteraction })} label="Mouse interaction"
        description="Let the galaxy respond to the pointer over the start screen" />
      <SettingsToggle enabled={settings.mouseRepulsion} onToggle={() => setSettings({ mouseRepulsion: !settings.mouseRepulsion })} label="Mouse repulsion"
        description="Push stars away from the pointer instead of drifting with it" />
      <SettingsToggle enabled={settings.motion} onToggle={() => setSettings({ motion: !settings.motion })} label="Animate galaxy"
        description={animationsEnabled ? 'Respects your system reduced-motion preference' : 'Paused while app animations are disabled'} />
      <button type="button" onClick={() => setSettings(DEFAULT_SETUP_GALAXY)} className="rounded-md border border-[var(--border-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]">Reset Galaxy</button>
    </fieldset>
  );
}
