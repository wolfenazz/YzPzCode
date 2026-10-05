import React, { useEffect } from 'react';
import { ArrowsClockwise, Lightning, MonitorPlay } from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { useIde } from '../../../hooks/useIde';
import { IdeInfo, IdeType } from '../../../types';
import { IDE_DISPLAY_NAMES, IDE_ICONS, IDE_ORDER } from '../../setup/ideConstants';
import {
  Badge,
  Button,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  Switch,
  ToggleRow,
} from '../SettingsKit';

export const SettingsIde: React.FC = () => {
  const { ideStatuses, detectAllIdes, loading } = useIde();
  const { selectedIdes, setSelectedIdes, launchIdeOnWorkspaceCreation, setLaunchIdeOnWorkspaceCreation } = useAppStore();

  useEffect(() => {
    detectAllIdes();
  }, [detectAllIdes]);

  const ideList = IDE_ORDER.map((ide) => ideStatuses[ide]).filter((ide): ide is IdeInfo => ide !== null);
  const installed = ideList.filter((ide) => ide.installed);
  const missing = ideList.filter((ide) => !ide.installed);

  const handleToggleIde = (ide: IdeType) => {
    if (selectedIdes.includes(ide)) {
      setSelectedIdes(selectedIdes.filter((i) => i !== ide));
    } else {
      setSelectedIdes([...selectedIdes, ide]);
    }
  };

  const iconOf = (ide: IdeInfo) => (
    <img alt="" src={IDE_ICONS[ide.ide as IdeType]} />
  );
  const nameOf = (ide: IdeInfo) => IDE_DISPLAY_NAMES[ide.ide as IdeType] || ide.name;

  return (
    <SettingsStack>
      <SettingsGroup title="When creating a workspace">
        <ToggleRow
          checked={launchIdeOnWorkspaceCreation}
          description="Open the editors selected below together with every new workspace."
          icon={<Lightning size={16} aria-hidden="true" />}
          label="Launch editors automatically"
          onChange={setLaunchIdeOnWorkspaceCreation}
        />
      </SettingsGroup>

      <SettingsGroup
        action={
          <Button icon={ArrowsClockwise} loading={loading} onClick={() => void detectAllIdes()} size="sm">
            {loading ? 'Detecting…' : 'Detect again'}
          </Button>
        }
        description={launchIdeOnWorkspaceCreation ? 'Switch on the editors to open with new workspaces.' : 'Turn on automatic launch above to use these.'}
        title={`Installed editors${installed.length ? ` (${installed.length})` : ''}`}
      >
        {installed.length === 0 ? (
          <SettingsEmpty icon={MonitorPlay} title={loading ? 'Looking for editors…' : 'No editors found'}>
            {loading ? undefined : 'Install an editor such as VS Code or Cursor, then detect again.'}
          </SettingsEmpty>
        ) : (
          installed.map((ide) => (
            <SettingsRow
              description={ide.path ? <span className="st-truncate st-mono" title={ide.path} style={{ display: 'block', maxWidth: '24rem' }}>{ide.path}</span> : undefined}
              icon={iconOf(ide)}
              key={ide.ide}
              label={nameOf(ide)}
            >
              <Switch
                checked={selectedIdes.includes(ide.ide)}
                disabled={!launchIdeOnWorkspaceCreation}
                label={`Open ${nameOf(ide)} with new workspaces`}
                onChange={() => handleToggleIde(ide.ide)}
              />
            </SettingsRow>
          ))
        )}
      </SettingsGroup>

      {missing.length > 0 && (
        <SettingsGroup description="Detected from your system. Not found on this computer." title="Not installed">
          {missing.map((ide) => (
            <SettingsRow icon={iconOf(ide)} key={ide.ide} label={nameOf(ide)}>
              <Badge>Not found</Badge>
            </SettingsRow>
          ))}
        </SettingsGroup>
      )}
    </SettingsStack>
  );
};
