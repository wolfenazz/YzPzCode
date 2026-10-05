import React, { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  CloudArrowDown,
  DownloadSimple,
  Flask,
  X,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { useUpdaterStore } from '../../../stores/updaterStore';
import {
  Badge,
  Button,
  Notice,
  Segmented,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  ToggleRow,
} from '../SettingsKit';

const CHANNELS = [
  { value: 'stable' as const, label: 'Stable' },
  { value: 'beta' as const, label: 'Beta' },
  { value: 'nightly' as const, label: 'Nightly' },
];

const CHANNEL_HELP: Record<(typeof CHANNELS)[number]['value'], string> = {
  stable: 'Well-tested releases. Best for everyday work.',
  beta: 'Early access to new features before they are final.',
  nightly: 'Latest changes every day. May be unstable.',
};

export const SettingsUpdates: React.FC = () => {
  const {
    autoCheckUpdates,
    setAutoCheckUpdates,
    autoDownloadUpdates,
    setAutoDownloadUpdates,
    updateChannel,
    setUpdateChannel,
  } = useAppStore();

  const {
    checking,
    downloading,
    downloadProgress,
    updateAvailable,
    upToDate,
    error,
    lastChecked,
    checkForUpdates,
    downloadAndInstall,
    clearError,
  } = useUpdaterStore();

  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then(setAppVersion);
      });
    } else {
      setAppVersion('dev');
    }
  }, []);

  const lastCheckedText = lastChecked > 0 ? `Last checked ${new Date(lastChecked).toLocaleString()}` : 'Not checked yet';

  return (
    <SettingsStack>
      <SettingsGroup title="Version">
        <SettingsRow
          badge={<Badge>{appVersion ? `v${appVersion}` : '…'}</Badge>}
          description={lastCheckedText}
          icon={<ArrowsClockwise size={16} aria-hidden="true" />}
          label="YzPzCode"
        >
          <Button
            disabled={downloading}
            icon={ArrowsClockwise}
            loading={checking}
            onClick={() => void checkForUpdates(true)}
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      {upToDate && !updateAvailable && <Notice tone="success">You are on the latest version.</Notice>}

      {updateAvailable && (
        <Notice
          action={
            <Button icon={DownloadSimple} loading={downloading} onClick={() => void downloadAndInstall()} variant="primary">
              {downloading ? `Downloading ${downloadProgress}%` : 'Install and restart'}
            </Button>
          }
          tone="info"
        >
          <strong>Version {updateAvailable.version}</strong> is available.
        </Notice>
      )}

      {error && (
        <Notice
          action={<Button aria-label="Dismiss" icon={X} iconOnly onClick={clearError} size="sm" variant="ghost" />}
          tone="danger"
        >
          {error}
        </Notice>
      )}

      <SettingsGroup title="Automatic updates">
        <ToggleRow
          checked={autoCheckUpdates}
          description="Look for a new version each time the app starts."
          icon={<ArrowsClockwise size={16} aria-hidden="true" />}
          label="Check on startup"
          onChange={setAutoCheckUpdates}
        />
        <ToggleRow
          checked={autoDownloadUpdates}
          description="Download new versions in the background so they are ready to install."
          icon={<CloudArrowDown size={16} aria-hidden="true" />}
          label="Download in the background"
          onChange={setAutoDownloadUpdates}
        />
      </SettingsGroup>

      <SettingsGroup footer={CHANNEL_HELP[updateChannel]} title="Release channel">
        <SettingsRow
          description="Choose how early you receive new versions."
          icon={<Flask size={16} aria-hidden="true" />}
          label="Channel"
        >
          <Segmented label="Release channel" onChange={setUpdateChannel} options={CHANNELS} value={updateChannel} />
        </SettingsRow>
      </SettingsGroup>
    </SettingsStack>
  );
};
