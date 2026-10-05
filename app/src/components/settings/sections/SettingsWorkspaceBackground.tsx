import type { ReactElement } from 'react';
import { WorkspaceBackground } from '../../workspace/WorkspaceBackground';
import { SettingsWorkspaceAurora } from './SettingsWorkspaceAurora';
import { SettingsWorkspaceLightRays } from './SettingsWorkspaceLightRays';
import { useAppStore } from '../../../stores/appStore';
import { WORKSPACE_BACKGROUNDS } from '../../../utils/workspaceBackground';
import { Segmented, SettingsBlock, SettingsGroup, SettingsRow } from '../SettingsKit';

export function SettingsWorkspaceBackground(): ReactElement {
  const background = useAppStore((s) => s.workspaceBackground);
  const setBackground = useAppStore((s) => s.setWorkspaceBackground);
  const selected = WORKSPACE_BACKGROUNDS.find(({ value }) => value === background);
  return (
    <SettingsGroup
      description="Appears behind your terminal layout. Panel opacity is set in Terminal settings."
      title="Terminal workspace"
    >
      <SettingsRow label="Background" description={selected?.description}>
        <Segmented
          label="Workspace background"
          onChange={setBackground}
          options={WORKSPACE_BACKGROUNDS.map(({ value, label }) => ({ value, label }))}
          value={background}
        />
      </SettingsRow>
      {background !== 'none' && (
        <SettingsBlock>
          <div aria-hidden="true" className="st-preview">
            <WorkspaceBackground />
          </div>
        </SettingsBlock>
      )}
      {background === 'aurora' && <SettingsWorkspaceAurora />}
      {background === 'light-rays' && <SettingsWorkspaceLightRays />}
    </SettingsGroup>
  );
}
