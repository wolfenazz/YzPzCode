import type { ReactElement } from 'react';
import { SetupBackground } from '../../setup/SetupBackground';
import { SettingsSetupGalaxy } from './SettingsSetupGalaxy';
import { useAppStore } from '../../../stores/appStore';
import { SETUP_BACKGROUNDS } from '../../../utils/setupBackground';
import { OptionCard, SettingsBlock, SettingsGroup } from '../SettingsKit';

export function SettingsSetupBackground(): ReactElement {
  const background = useAppStore((s) => s.setupBackground);
  const setBackground = useAppStore((s) => s.setSetupBackground);
  const selected = SETUP_BACKGROUNDS.find(({ value }) => value === background);
  return (
    <SettingsGroup
      description="The setup page starts without a background. Choose an optional React Bits effect for a little atmosphere."
      title="Start screen"
    >
      <SettingsBlock>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" role="group" aria-label="Start screen background">
          {SETUP_BACKGROUNDS.map(({ value, label, description }) => (
            <OptionCard
              key={value}
              title={label}
              hint={description}
              selected={background === value}
              onSelect={() => setBackground(value)}
              trailing={value === 'none' ? 'Default' : undefined}
              preview={<span className="setup-backdrop-swatch" data-effect={value} aria-hidden="true" />}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--text-secondary)]" aria-live="polite">{selected?.description}</p>
      </SettingsBlock>
      {background !== 'none' && (
        <SettingsBlock>
          <div aria-hidden="true" className="st-preview">
            <SetupBackground />
          </div>
        </SettingsBlock>
      )}
      {background === 'galaxy' && <SettingsSetupGalaxy />}
    </SettingsGroup>
  );
}
