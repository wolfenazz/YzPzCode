import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  DownloadSimple,
  Package,
  Warning,
  XCircle,
} from '@phosphor-icons/react';
import { PrerequisiteStatus, PrerequisiteType } from '../../../types';
import {
  Badge,
  Button,
  Notice,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
} from '../SettingsKit';

type Health = 'ok' | 'outdated' | 'missing';

const healthOf = (item: PrerequisiteStatus): Health => {
  if (!item.installed) return 'missing';
  return item.meetsMinimum ? 'ok' : 'outdated';
};

const HEALTH_ICON = {
  ok: <CheckCircle size={18} weight="fill" color="var(--st-success)" aria-hidden="true" />,
  outdated: <Warning size={18} weight="fill" color="var(--st-warning)" aria-hidden="true" />,
  missing: <XCircle size={18} weight="fill" color="var(--st-danger)" aria-hidden="true" />,
} as const;

export const SettingsEnvironment: React.FC = () => {
  const [prerequisites, setPrerequisites] = useState<PrerequisiteStatus[]>([]);
  const [checking, setChecking] = useState(false);
  const [nodejsStatus, setNodejsStatus] = useState<PrerequisiteStatus | null>(null);
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [tooltips, setTooltips] = useState<Record<string, string>>({});

  const checkAll = useCallback(async () => {
    setChecking(true);
    try {
      const [prereqs, nodejs] = await Promise.all([
        invoke<PrerequisiteStatus[]>('check_prerequisites'),
        invoke<PrerequisiteStatus>('check_nodejs'),
      ]);
      setPrerequisites(prereqs);
      setNodejsStatus(nodejs);
    } catch (err) {
      console.error('Failed to check environment:', err);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  const loadTooltip = async (key: string, prereqType: PrerequisiteType) => {
    if (tooltips[key]) return;
    try {
      const cmd = await invoke<string>('get_prerequisite_install_command', { prereqType });
      if (cmd) setTooltips((prev) => ({ ...prev, [key]: cmd }));
    } catch (err) {
      console.error('Failed to get install command:', err);
    }
  };

  const handleInstall = async (key: string, prereqType: PrerequisiteType) => {
    setInstalling((prev) => ({ ...prev, [key]: true }));
    try {
      await invoke('open_prerequisite_install_terminal', { prereqType });
    } catch (err) {
      console.error('Failed to open install terminal:', err);
    } finally {
      setInstalling((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleOpenNodejsDownload = async () => {
    try {
      await invoke('open_url', { url: 'https://nodejs.org/en/download/current' });
    } catch (err) {
      console.error('Failed to open URL:', err);
    }
  };

  const allMet = prerequisites.length > 0 && prerequisites.every((p) => p.installed && p.meetsMinimum);
  const missingCount = prerequisites.filter((p) => !(p.installed && p.meetsMinimum)).length;

  const versionLabel = (item: PrerequisiteStatus) => {
    if (!item.version) return <Badge tone="danger">Not installed</Badge>;
    if (!item.meetsMinimum) return <Badge tone="warning">v{item.version} · needs {item.minimumVersion}+</Badge>;
    return <Badge>v{item.version}</Badge>;
  };

  const recheck = (
    <Button icon={ArrowsClockwise} loading={checking} onClick={() => void checkAll()} size="sm">
      {checking ? 'Checking…' : 'Check again'}
    </Button>
  );

  return (
    <SettingsStack>
      {allMet && <Notice tone="success">Everything the app needs is installed.</Notice>}
      {!allMet && prerequisites.length > 0 && (
        <Notice tone="warning">
          {missingCount} {missingCount === 1 ? 'item needs' : 'items need'} attention. AI agent CLIs may not work until
          they are installed.
        </Notice>
      )}

      {nodejsStatus && (
        <SettingsGroup action={recheck} title="Node.js">
          <SettingsRow
            description="Required to run the agent CLIs (Claude, Codex, OpenCode, Kilo and others). Version 18 or newer."
            icon={HEALTH_ICON[healthOf(nodejsStatus)]}
            iconBare
            label="Node.js"
          >
            {versionLabel(nodejsStatus)}
          </SettingsRow>
          {!nodejsStatus.installed && (
            <SettingsRow description="Install it from a terminal, or download the installer." label="Get Node.js">
              <Button
                icon={DownloadSimple}
                loading={installing.nodejs}
                onClick={() => void handleInstall('nodejs', 'NodeJs')}
                onMouseEnter={() => void loadTooltip('nodejs', 'NodeJs')}
                title={tooltips.nodejs || 'Install via terminal'}
                variant="primary"
              >
                Install in terminal
              </Button>
              <Button icon={ArrowSquareOut} onClick={() => void handleOpenNodejsDownload()}>Download page</Button>
            </SettingsRow>
          )}
        </SettingsGroup>
      )}

      <SettingsGroup
        action={nodejsStatus ? undefined : recheck}
        description="Tools used by workspaces, agents and extensions."
        title="Developer tools"
      >
        {prerequisites.length === 0 ? (
          <SettingsEmpty icon={Package} title={checking ? "Checking your system…" : "Nothing to show yet"}>{checking ? undefined : "Press Check again to scan this computer."}</SettingsEmpty>
        ) : (
          prerequisites.map((prereq) => {
            const key = prereq.prerequisiteType;
            const health = healthOf(prereq);
            return (
              <SettingsRow icon={HEALTH_ICON[health]} iconBare key={key} label={prereq.name}>
                {health !== 'ok' && (
                  <Button
                    icon={DownloadSimple}
                    loading={installing[key]}
                    onClick={() => void handleInstall(key, key as PrerequisiteType)}
                    onMouseEnter={() => void loadTooltip(key, key as PrerequisiteType)}
                    size="sm"
                    title={tooltips[key] || 'Install via terminal'}
                  >
                    {health === 'outdated' ? 'Update' : 'Install'}
                  </Button>
                )}
                {versionLabel(prereq)}
              </SettingsRow>
            );
          })
        )}
      </SettingsGroup>
    </SettingsStack>
  );
};
