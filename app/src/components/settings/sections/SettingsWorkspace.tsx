import React from 'react';
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  FolderOpen,
  FolderSimple,
  SignOut,
  Trash,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { SEED_TEMPLATES } from '../../../hooks/useWorkspace';
import {
  Button,
  OptionCard,
  SettingsBlock,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  ToggleRow,
} from '../SettingsKit';

export const SettingsWorkspace: React.FC = () => {
  const {
    confirmBeforeClose,
    setConfirmBeforeClose,
    saveWorkspaceState,
    setSaveWorkspaceState,
    defaultLayoutTemplate,
    setDefaultLayoutTemplate,
    defaultWorkspaceDirectory,
    setDefaultWorkspaceDirectory,
    recentDirectories,
    clearRecentDirectories,
  } = useAppStore();

  const handleSelectDirectory = async () => {
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: 'Select Default Workspace Directory',
      });
      if (typeof path === 'string') {
        setDefaultWorkspaceDirectory(path);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  return (
    <SettingsStack>
      <SettingsGroup title="Opening and closing">
        <ToggleRow
          checked={saveWorkspaceState}
          description="Reopen your workspaces and their files the next time you start the app."
          icon={<ArrowCounterClockwise size={16} aria-hidden="true" />}
          label="Restore workspaces on launch"
          onChange={setSaveWorkspaceState}
        />
        <ToggleRow
          checked={confirmBeforeClose}
          description="Ask before a workspace is closed."
          icon={<SignOut size={16} aria-hidden="true" />}
          label="Confirm before closing"
          onChange={setConfirmBeforeClose}
        />
      </SettingsGroup>

      <SettingsGroup
        description="Used when you create a new workspace."
        title="Default layout"
      >
        <SettingsBlock>
          <div className="st-options st-options--wide" role="group" aria-label="Default layout template">
            {SEED_TEMPLATES.map((template) => (
              <OptionCard
                icon={
                  <span
                    aria-hidden="true"
                    style={{ width: '0.5rem', height: '0.5rem', flex: '0 0 auto', borderRadius: '50%', background: template.iconColor }}
                  />
                }
                key={template.id}
                onSelect={() => setDefaultLayoutTemplate(template.id)}
                selected={defaultLayoutTemplate === template.id}
                subtitle={template.description}
                title={template.name}
              />
            ))}
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title="Default folder">
        <SettingsRow
          description="New workspaces start here. Leave empty to choose each time."
          icon={<FolderOpen size={16} aria-hidden="true" />}
          label="Starting folder"
        />
        <SettingsBlock>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              aria-label="Default workspace folder"
              className="st-input"
              onChange={(event) => setDefaultWorkspaceDirectory(event.target.value)}
              placeholder="No default folder set"
              type="text"
              value={defaultWorkspaceDirectory}
            />
            <Button icon={FolderOpen} onClick={() => void handleSelectDirectory()}>Browse…</Button>
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup
        action={
          recentDirectories.length > 0 ? (
            <Button icon={Trash} onClick={clearRecentDirectories} size="sm" variant="ghost">Clear list</Button>
          ) : undefined
        }
        title="Recent folders"
      >
        {recentDirectories.length > 0 ? (
          <div className="st-list custom-scrollbar" style={{ maxHeight: '15rem', overflowY: 'auto' }}>
            {recentDirectories.map((path) => (
              <SettingsRow
                icon={<FolderSimple size={16} aria-hidden="true" />}
                key={path}
                label={<span className="st-truncate st-mono" title={path}>{path}</span>}
              />
            ))}
          </div>
        ) : (
          <SettingsEmpty icon={ClockCounterClockwise} title="No recent folders">
            Folders you open will show up here.
          </SettingsEmpty>
        )}
      </SettingsGroup>
    </SettingsStack>
  );
};
