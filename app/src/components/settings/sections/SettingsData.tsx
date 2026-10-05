import React, { useState } from 'react';
import {
  ArrowCounterClockwise,
  Broom,
  ClockCounterClockwise,
  DownloadSimple,
  HardDrives,
  SquaresFour,
  UploadSimple,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import {
  Button,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from '../SettingsKit';

/** Two-step button so a destructive action can't be triggered by a single stray click. */
const ConfirmButton = ({
  label,
  confirmLabel = 'Confirm',
  onConfirm,
  disabled,
  solid,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  solid?: boolean;
}) => {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button disabled={disabled} onClick={() => setAsking(true)} size="sm" variant="danger">
        {label}
      </Button>
    );
  }
  return (
    <>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Are you sure?</span>
      <Button onClick={() => setAsking(false)} size="sm" variant="ghost">Cancel</Button>
      <Button onClick={onConfirm} size="sm" variant={solid ? 'danger-solid' : 'danger'}>{confirmLabel}</Button>
    </>
  );
};

export const SettingsData: React.FC = () => {
  const {
    recentDirectories,
    clearRecentDirectories,
    workspaceList,
    openWorkspaces,
  } = useAppStore();

  const getStorageUsage = () => {
    let total = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        total += localStorage[key].length * 2;
      }
    }
    const kb = total / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(1)} KB`;
  };

  const handleExportSettings = () => {
    const settings: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('yzpzcode-')) {
        settings[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yzpzcode-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const settings = JSON.parse(event.target?.result as string);
          for (const [key, value] of Object.entries(settings)) {
            if (typeof value === 'string') {
              localStorage.setItem(key, value);
            }
          }
          window.location.reload();
        } catch (err) {
          console.error('Failed to import settings:', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleResetAll = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleClearWorkspaces = () => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('workspace')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  };

  return (
    <SettingsStack>
      <SettingsGroup title="Stored on this device">
        <SettingsRow
          description="Settings and workspace data kept by the app."
          icon={<HardDrives size={16} aria-hidden="true" />}
          label="Local storage"
        >
          <span className="st-slider__value" style={{ minWidth: 0 }}>{getStorageUsage()}</span>
        </SettingsRow>
        <SettingsRow
          description={`${openWorkspaces.length} open right now`}
          icon={<SquaresFour size={16} aria-hidden="true" />}
          label="Saved workspaces"
        >
          <span className="st-slider__value" style={{ minWidth: 0 }}>{workspaceList.length}</span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        description="Move your preferences to another computer, or keep a copy."
        title="Backup"
      >
        <SettingsRow
          description="Save your preferences to a JSON file."
          icon={<DownloadSimple size={16} aria-hidden="true" />}
          label="Export settings"
        >
          <Button icon={DownloadSimple} onClick={handleExportSettings}>Export</Button>
        </SettingsRow>
        <SettingsRow
          description="Load a file you exported earlier. The app restarts to apply it."
          icon={<UploadSimple size={16} aria-hidden="true" />}
          label="Import settings"
        >
          <Button icon={UploadSimple} onClick={handleImportSettings}>Import…</Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Clear data">
        <SettingsRow
          description={`${recentDirectories.length} folder${recentDirectories.length === 1 ? '' : 's'} in the list`}
          icon={<ClockCounterClockwise size={16} aria-hidden="true" />}
          label="Recent folders"
        >
          <Button disabled={recentDirectories.length === 0} icon={Broom} onClick={clearRecentDirectories} size="sm">
            Clear
          </Button>
        </SettingsRow>
        <SettingsRow
          description={`${workspaceList.length} saved workspace${workspaceList.length === 1 ? '' : 's'}. The app reloads afterwards.`}
          icon={<SquaresFour size={16} aria-hidden="true" />}
          label="Workspace history"
        >
          <ConfirmButton disabled={workspaceList.length === 0} label="Clear…" onConfirm={handleClearWorkspaces} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsRow
          description="Erase every setting and all saved data, then reload the app. This cannot be undone."
          icon={<ArrowCounterClockwise size={16} aria-hidden="true" />}
          label="Reset everything"
        >
          <ConfirmButton confirmLabel="Reset" label="Reset…" onConfirm={handleResetAll} solid />
        </SettingsRow>
      </SettingsGroup>
    </SettingsStack>
  );
};
