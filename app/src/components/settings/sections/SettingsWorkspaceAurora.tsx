import type { ReactElement } from 'react';
import { useAppStore } from '../../../stores/appStore';
import type { WorkspaceAuroraPalette } from '../../../types';
import {
  ColorInput,
  Disclosure,
  SettingsRow,
  SliderRow,
  ToggleRow,
} from '../SettingsKit';

const PALETTES: { value: WorkspaceAuroraPalette; label: string; colors: string }[] = [
  { value: 'gemini', label: 'Gemini', colors: '#fb19da, #00b6f2, #2b27ff' },
  { value: 'sage', label: 'Sage', colors: '#7baca3, #92aab9, #c0b49a' },
  { value: 'accent', label: 'App accent', colors: 'var(--accent), var(--bg-secondary)' },
  { value: 'custom', label: 'Custom', colors: '#fb19da, #00b6f2, #2b27ff' },
];
const COLOR_STOPS = [
  { index: 0 as const, label: 'Start' },
  { index: 1 as const, label: 'Middle' },
  { index: 2 as const, label: 'End' },
];

/** Rows that customize the Aurora background; rendered inside a settings card. */
export function SettingsWorkspaceAurora(): ReactElement {
  const palette = useAppStore((s) => s.workspaceAuroraPalette);
  const colors = useAppStore((s) => s.workspaceAuroraColors);
  const intensity = useAppStore((s) => s.workspaceAuroraIntensity);
  const blend = useAppStore((s) => s.workspaceAuroraBlend);
  const amplitude = useAppStore((s) => s.workspaceAuroraAmplitude);
  const speed = useAppStore((s) => s.workspaceAuroraSpeed);
  const motion = useAppStore((s) => s.workspaceAuroraMotion);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const setPalette = useAppStore((s) => s.setWorkspaceAuroraPalette);
  const setColor = useAppStore((s) => s.setWorkspaceAuroraColor);
  const setIntensity = useAppStore((s) => s.setWorkspaceAuroraIntensity);
  const setBlend = useAppStore((s) => s.setWorkspaceAuroraBlend);
  const setAmplitude = useAppStore((s) => s.setWorkspaceAuroraAmplitude);
  const setSpeed = useAppStore((s) => s.setWorkspaceAuroraSpeed);
  const setMotion = useAppStore((s) => s.setWorkspaceAuroraMotion);

  return (
    <>
      <SettingsRow label="Palette" description="Pick a color set to start from.">
        <div className="st-swatches" role="group" aria-label="Aurora palette">
          {PALETTES.map((option) => (
            <button
              aria-pressed={palette === option.value}
              className="st-option"
              key={option.value}
              onClick={() => setPalette(option.value)}
              style={{ flexDirection: 'row', alignItems: 'center', padding: '0.25rem 0.625rem 0.25rem 0.375rem' }}
              type="button"
            >
              <span
                aria-hidden="true"
                style={{
                  width: '1.25rem',
                  height: '0.875rem',
                  borderRadius: '0.1875rem',
                  background: `linear-gradient(110deg, ${option.value === 'custom' ? colors.join(', ') : option.colors})`,
                }}
              />
              <span className="st-option__name" style={{ padding: 0 }}>{option.label}</span>
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow label="Colors" description="Editing a color switches to the Custom palette.">
        <div className="st-row__control" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {COLOR_STOPS.map(({ index, label }) => (
            <ColorInput
              key={label}
              label={`${label} color`}
              onChange={(value) => setColor(index, value)}
              value={colors[index]}
            />
          ))}
        </div>
      </SettingsRow>

      <SliderRow
        description="How strong the glow is."
        format={(value) => `${value}%`}
        label="Intensity"
        max={100}
        min={0}
        onChange={setIntensity}
        step={5}
        value={intensity}
      />

      <ToggleRow
        checked={motion}
        description={animationsEnabled ? 'A gentle drift. Follows your reduced-motion preference.' : 'Paused while app animations are turned off.'}
        label="Slow movement"
        onChange={setMotion}
      />

      <Disclosure label="Fine tuning" description="Edge softness, wave height and speed">
        <SliderRow
          description="From crisp edges to a diffused glow."
          format={(value) => `${Math.round(value * 100)}%`}
          label="Edge softness"
          max={100}
          min={10}
          onChange={(value) => setBlend(value / 100)}
          step={5}
          value={Math.round(blend * 100)}
        />
        <SliderRow
          description="Height of the waves."
          format={(value) => value.toFixed(1)}
          label="Amplitude"
          max={2}
          min={0.1}
          onChange={setAmplitude}
          step={0.1}
          value={amplitude}
        />
        <SliderRow
          description="How fast the aurora moves."
          format={(value) => value.toFixed(1)}
          label="Speed"
          max={2}
          min={0}
          onChange={setSpeed}
          step={0.1}
          value={speed}
        />
      </Disclosure>
    </>
  );
}
