import type { ReactElement } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { DEFAULT_SETUP_GALAXY, SETUP_GALAXY_RANGES } from '../../../utils/setupBackground';
import {
  Button,
  Disclosure,
  SettingsRow,
  SliderRow,
  ToggleRow,
} from '../SettingsKit';

type RangeKey = keyof typeof SETUP_GALAXY_RANGES;
const PRIMARY: RangeKey[] = ['intensity', 'density', 'hueShift'];
const FINE: RangeKey[] = ['glowIntensity', 'saturation', 'starSpeed', 'speed', 'rotationSpeed', 'twinkleIntensity', 'repulsionStrength'];

/** Rows that customize the Galaxy background; rendered inside a settings card. */
export function SettingsSetupGalaxy(): ReactElement {
  const settings = useAppStore((s) => s.setupGalaxy);
  const setSettings = useAppStore((s) => s.setSetupGalaxy);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);

  const slider = (key: RangeKey) => {
    const { label, min, max, step } = SETUP_GALAXY_RANGES[key];
    return (
      <SliderRow
        format={(value) => (key === 'intensity' ? `${value}%` : key === 'hueShift' ? `${value}°` : value.toFixed(2))}
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
      {PRIMARY.map(slider)}

      <ToggleRow
        checked={settings.motion}
        description={animationsEnabled ? 'Respects your reduced-motion preference.' : 'Paused while app animations are turned off.'}
        label="Animate galaxy"
        onChange={(value) => setSettings({ motion: value })}
      />

      <Disclosure label="Fine tuning" description="Glow, speed, twinkle and pointer behavior">
        {FINE.map(slider)}
        <ToggleRow
          checked={settings.mouseInteraction}
          description="Let the galaxy respond to the pointer."
          label="Mouse interaction"
          onChange={(value) => setSettings({ mouseInteraction: value })}
        />
        <ToggleRow
          checked={settings.mouseRepulsion}
          description="Push stars away from the pointer instead of drifting with it."
          label="Mouse repulsion"
          onChange={(value) => setSettings({ mouseRepulsion: value })}
        />
      </Disclosure>

      <SettingsRow label="Reset Galaxy" description="Restore the default look.">
        <Button icon={ArrowCounterClockwise} onClick={() => setSettings(DEFAULT_SETUP_GALAXY)} size="sm">Reset</Button>
      </SettingsRow>
    </>
  );
}
