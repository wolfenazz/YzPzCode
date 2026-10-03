import type { ReactElement } from 'react';
import { SetupBackground } from '../../setup/SetupBackground';
import { SettingsSetupGalaxy } from './SettingsSetupGalaxy';
import { useAppStore } from '../../../stores/appStore';
import { SETUP_BACKGROUNDS } from '../../../utils/setupBackground';

export function SettingsSetupBackground(): ReactElement {
  const background = useAppStore((s) => s.setupBackground);
  const setBackground = useAppStore((s) => s.setSetupBackground);
  const selected = SETUP_BACKGROUNDS.find(({ value }) => value === background);
  return (
    <section className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 p-5 space-y-5" aria-labelledby="setup-background-heading">
      <div>
        <h3 id="setup-background-heading" className="text-sm font-semibold text-[var(--text-primary)]">Start screen background</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Choose a backdrop for the “Configure workspace” screen, then customize it.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Start screen background">
        {SETUP_BACKGROUNDS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={background === value}
            onClick={() => setBackground(value)}
            className={`rounded-md border px-4 py-2 text-xs cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${background === value
              ? 'border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--text-primary)]'
              : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >{label}</button>
        ))}
      </div>
      <figure>
        <div className="relative isolate h-40 overflow-hidden rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]" aria-hidden="true">
          <SetupBackground />
        </div>
        <figcaption className="mt-2 text-[11px] text-[var(--text-secondary)]">Live preview · {selected?.description}</figcaption>
      </figure>
      {background === 'galaxy' && <SettingsSetupGalaxy />}
      <p className="text-[11px] text-[var(--text-secondary)]">Shown behind the workspace setup form; content surfaces stay solid for readability.</p>
    </section>
  );
}
