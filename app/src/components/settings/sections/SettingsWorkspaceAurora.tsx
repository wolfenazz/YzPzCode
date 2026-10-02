import type { ReactElement } from 'react';
import { SettingsToggle } from '../../common/SettingsToggle';
import { WorkspaceAurora } from '../../workspace/WorkspaceAurora';
import { useAppStore } from '../../../stores/appStore';
import type { WorkspaceAuroraPalette } from '../../../types';

const PALETTES: { value: WorkspaceAuroraPalette; label: string; colors: string }[] = [
  { value: 'gemini', label: 'Gemini', colors: '#fb19da, #00b6f2, #2b27ff' },
  { value: 'sage', label: 'Sage', colors: '#7baca3, #92aab9, #c0b49a' },
  { value: 'accent', label: 'App accent', colors: 'var(--accent), var(--bg-secondary)' },
  { value: 'custom', label: 'Custom', colors: '#fb19da, #00b6f2, #2b27ff' },
];
const COLOR_STOPS = [
  { index: 0 as const, label: 'First color' },
  { index: 1 as const, label: 'Middle color' },
  { index: 2 as const, label: 'Last color' },
];

export function SettingsWorkspaceAurora(): ReactElement {
  const enabled = useAppStore((s) => s.workspaceAuroraEnabled);
  const palette = useAppStore((s) => s.workspaceAuroraPalette);
  const colors = useAppStore((s) => s.workspaceAuroraColors);
  const intensity = useAppStore((s) => s.workspaceAuroraIntensity);
  const blend = useAppStore((s) => s.workspaceAuroraBlend);
  const amplitude = useAppStore((s) => s.workspaceAuroraAmplitude);
  const speed = useAppStore((s) => s.workspaceAuroraSpeed);
  const motion = useAppStore((s) => s.workspaceAuroraMotion);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const setEnabled = useAppStore((s) => s.setWorkspaceAuroraEnabled);
  const setPalette = useAppStore((s) => s.setWorkspaceAuroraPalette);
  const setColor = useAppStore((s) => s.setWorkspaceAuroraColor);
  const setIntensity = useAppStore((s) => s.setWorkspaceAuroraIntensity);
  const setBlend = useAppStore((s) => s.setWorkspaceAuroraBlend);
  const setAmplitude = useAppStore((s) => s.setWorkspaceAuroraAmplitude);
  const setSpeed = useAppStore((s) => s.setWorkspaceAuroraSpeed);
  const setMotion = useAppStore((s) => s.setWorkspaceAuroraMotion);

  return (
    <section className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 p-5 space-y-5" aria-labelledby="workspace-aurora-heading">
      <div>
        <h3 id="workspace-aurora-heading" className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">Workspace Aurora</h3>
        <p className="mt-1 text-[10px] text-[var(--text-secondary)] font-mono">A quiet wash of light behind your terminal layout.</p>
      </div>

      <SettingsToggle enabled={enabled} onToggle={() => setEnabled(!enabled)} label="Aurora background" description="Keep terminal surfaces solid and easy to read" />

      <div className="relative isolate h-32 overflow-hidden rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]" aria-hidden="true">
        <WorkspaceAurora />
        <div className="absolute inset-x-4 bottom-3 top-9 flex gap-3">
          {[0, 1].map((panel) => (
            <div key={panel} className="flex-1 rounded-sm border border-[var(--border-primary)] bg-[var(--bg-terminal)]">
              <div className="h-5 border-b border-[var(--border-primary)]" />
              <div className="mx-3 mt-3 h-px w-1/3 bg-[var(--text-secondary)]/30" />
            </div>
          ))}
        </div>
      </div>

      <fieldset disabled={!enabled} className="space-y-5 disabled:opacity-40">
        <legend className="sr-only">Aurora appearance</legend>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <label htmlFor="workspace-aurora-blend" className="text-[var(--text-primary)]">Edge softness</label>
            <output htmlFor="workspace-aurora-blend" className="tabular-nums text-[var(--text-secondary)]">{Math.round(blend * 100)}%</output>
          </div>
          <input
            id="workspace-aurora-blend"
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(blend * 100)}
            onChange={(event) => setBlend(Number(event.target.value) / 100)}
            className="w-full accent-[var(--accent)] cursor-pointer disabled:cursor-default"
          />
          <div className="mt-1 flex justify-between text-[10px] text-[var(--text-secondary)]"><span>Defined</span><span>Diffused</span></div>
        </div>

        <div>
          <p className="mb-2 text-[11px] text-[var(--text-secondary)]">Palette</p>
          <div className="flex flex-wrap gap-2">
            {PALETTES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={palette === option.value}
                onClick={() => setPalette(option.value)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] transition-colors cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${palette === option.value
                  ? 'border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--text-primary)]'
                  : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                <span className="h-3 w-5 rounded-sm" style={{ background: `linear-gradient(110deg, ${option.value === 'custom' ? colors.join(', ') : option.colors})` }} aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] text-[var(--text-secondary)]">Aurora colors</p>
          <div className="grid grid-cols-3 gap-2">
            {COLOR_STOPS.map(({ label, index }) => (
              <label key={label} className="flex min-w-0 flex-col gap-1.5 text-[10px] text-[var(--text-secondary)]">
                <span>{label}</span>
                <span className="flex items-center gap-2 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                  <input
                    type="color"
                    aria-label={label}
                    value={colors[index]}
                    onChange={(event) => setColor(index, event.target.value)}
                    className="h-5 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <output className="truncate font-mono tabular-nums text-[var(--text-primary)]">{colors[index].toUpperCase()}</output>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--text-secondary)]">Choose any color; editing a stop saves a Custom palette.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <label htmlFor="workspace-aurora-amplitude" className="text-[var(--text-primary)]">Amplitude</label>
              <output htmlFor="workspace-aurora-amplitude" className="tabular-nums text-[var(--text-secondary)]">{amplitude.toFixed(1)}</output>
            </div>
            <input
              id="workspace-aurora-amplitude"
              type="range"
              min={0.1}
              max={2}
              step={0.1}
              value={amplitude}
              onChange={(event) => setAmplitude(Number(event.target.value))}
              className="w-full accent-[var(--accent)] cursor-pointer disabled:cursor-default"
            />
            <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Wave height</p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <label htmlFor="workspace-aurora-speed" className="text-[var(--text-primary)]">Speed</label>
              <output htmlFor="workspace-aurora-speed" className="tabular-nums text-[var(--text-secondary)]">{speed.toFixed(1)}</output>
            </div>
            <input
              id="workspace-aurora-speed"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
              className="w-full accent-[var(--accent)] cursor-pointer disabled:cursor-default"
            />
            <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Motion pace</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <label htmlFor="workspace-aurora-intensity" className="text-[var(--text-primary)]">Intensity</label>
            <output htmlFor="workspace-aurora-intensity" className="tabular-nums text-[var(--text-secondary)]">{intensity}%</output>
          </div>
          <input
            id="workspace-aurora-intensity"
            type="range"
            min={0}
            max={100}
            step={5}
            value={intensity}
            onChange={(event) => setIntensity(Number(event.target.value))}
            className="w-full accent-[var(--accent)] cursor-pointer disabled:cursor-default"
          />
          <div className="mt-1 flex justify-between text-[10px] text-[var(--text-secondary)]"><span>Subtle</span><span>Rich</span></div>
        </div>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span>
            <span className="block text-xs text-[var(--text-primary)]">Slow movement</span>
            <span className="mt-0.5 block text-[10px] text-[var(--text-secondary)]">{animationsEnabled ? 'Gentle drift; follows your reduced motion preference' : 'Paused while app animations are disabled'}</span>
          </span>
          <input type="checkbox" checked={motion} onChange={(event) => setMotion(event.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
        </label>
      </fieldset>
    </section>
  );
}
