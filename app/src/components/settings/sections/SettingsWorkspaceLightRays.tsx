import type { ReactElement } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { DEFAULT_LIGHT_RAYS, LIGHT_RAYS_RANGES } from '../../../utils/workspaceBackground';
import type { RaysOrigin } from '../../../types';
import {
  Button,
  ColorInput,
  Disclosure,
  SettingsRow,
  SliderRow,
  ToggleRow,
} from '../SettingsKit';

const ORIGINS: { value: RaysOrigin; label: string }[] = [
  { value: 'top-left', label: 'Top left' }, { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' }, { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' }, { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' }, { value: 'bottom-right', label: 'Bottom right' },
];

type RangeKey = keyof typeof LIGHT_RAYS_RANGES;
const PRIMARY: RangeKey[] = ['intensity'];
const FINE: RangeKey[] = ['raysSpeed', 'lightSpread', 'rayLength', 'fadeDistance', 'saturation', 'mouseInfluence', 'noiseAmount', 'distortion'];

/** Rows that customize the Light Rays background; rendered inside a settings card. */
export function SettingsWorkspaceLightRays(): ReactElement {
  const settings = useAppStore((s) => s.workspaceLightRays);
  const setSettings = useAppStore((s) => s.setWorkspaceLightRays);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);

  const slider = (key: RangeKey) => {
    const { label, min, max, step } = LIGHT_RAYS_RANGES[key];
    return (
      <SliderRow
        format={(value) => (key === 'intensity' ? `${value}%` : value.toFixed(2))}
        key={key}
        label={label}
        max={max}
        min={min}
        onChange={(value) => setSettings({ [key]: value })}
        step={step}
        value={settings[key]}
      />
    );
  };

  return (
    <>
      <SettingsRow label="Origin" description="Where the rays shine from.">
        <select
          aria-label="Ray origin"
          className="st-select st-control-w"
          onChange={(event) => setSettings({ raysOrigin: event.target.value as RaysOrigin })}
          value={settings.raysOrigin}
        >
          {ORIGINS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </SettingsRow>

      <SettingsRow label="Color">
        <ColorInput label="Ray color" onChange={(value) => setSettings({ raysColor: value })} value={settings.raysColor} />
      </SettingsRow>

      {PRIMARY.map(slider)}

      <ToggleRow
        checked={settings.motion}
        description={animationsEnabled ? 'Respects your reduced-motion preference.' : 'Paused while app animations are turned off.'}
        label="Animate rays"
        onChange={(value) => setSettings({ motion: value })}
      />

      <Disclosure label="Fine tuning" description="Spread, length, grain and pointer behavior">
        {FINE.map(slider)}
        <ToggleRow
          checked={settings.pulsating}
          description="Gently vary the brightness while animated."
          label="Pulsating"
          onChange={(value) => setSettings({ pulsating: value })}
        />
        <ToggleRow
          checked={settings.followMouse}
          description="Steer the rays toward the pointer while animated."
          label="Follow mouse"
          onChange={(value) => setSettings({ followMouse: value })}
        />
      </Disclosure>

      <SettingsRow label="Reset Light Rays" description="Restore the default look.">
        <Button icon={ArrowCounterClockwise} onClick={() => setSettings(DEFAULT_LIGHT_RAYS)} size="sm">Reset</Button>
      </SettingsRow>
    </>
  );
}
