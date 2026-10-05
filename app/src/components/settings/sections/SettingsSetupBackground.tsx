import type { ReactElement } from 'react';
import { SetupBackground } from '../../setup/SetupBackground';
import { SettingsSetupGalaxy } from './SettingsSetupGalaxy';
import { useAppStore } from '../../../stores/appStore';
import { SETUP_BACKGROUNDS } from '../../../utils/setupBackground';
import { Segmented, SettingsBlock, SettingsGroup, SettingsRow } from '../SettingsKit';

export function SettingsSetupBackground(): ReactElement {
  const background = useAppStore((s) => s.setupBackground);
  const setBackground = useAppStore((s) => s.setSetupBackground);
  const selected = SETUP_BACKGROUNDS.find(({ value }) => value === background);
  return (
    <SettingsGroup
      description="Shown behind the “Configure workspace” screen. Form surfaces stay solid for readability."
      title="Start screen"
    >
      <SettingsRow label="Background" description={selected?.description}>
        <Segmented
          label="Start screen background"
          onChange={setBackground}
          options={SETUP_BACKGROUNDS.map(({ value, label }) => ({ value, label }))}
          value={background}
        />
      </SettingsRow>
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
