import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AgentType, AgentCliInfo, PrerequisiteStatus, InstallProgress, CliType } from '../types';
import { useAppStore } from '../stores/appStore';
import { useState } from 'react';

let installProgressListenerPromise: Promise<(() => void)> | null = null;
let installProgressListenerRefCount = 0;
const installProgressSubscribers = new Set<(progress: InstallProgress) => void>();

const ensureInstallProgressListener = (): Promise<(() => void)> => {
  if (!installProgressListenerPromise) {
    installProgressListenerPromise = listen<InstallProgress>('cli-install-progress', (event) => {
      installProgressSubscribers.forEach((subscriber) => subscriber(event.payload));
    });
  }

  return installProgressListenerPromise;
};

export function useAgentCli() {
  // Read cliStatuses from the global store so all components share the same state
  const cliStatuses = useAppStore(state => state.cliStatuses);
  const setCliStatus = useAppStore(state => state.setCliStatus);
  const setCliStatuses = useAppStore(state => state.setCliStatuses);

  const [prerequisites, setPrerequisites] = useState<PrerequisiteStatus[]>([]);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPrerequisites = useCallback(async () => {
    try {
      const result = await invoke<PrerequisiteStatus[]>('check_prerequisites');
      setPrerequisites(result);
      return result;
    } catch (e) {
      setError(String(e));
      return [];
    }
  }, []);

  const detectCli = useCallback(async (agent: AgentType) => {
    try {
      const result = await invoke<AgentCliInfo>('detect_agent_cli', { agent });
      setCliStatus(agent, result);
      return result;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [setCliStatus]);

  const detectAllClis = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<Record<AgentType, AgentCliInfo>>('detect_all_agent_clis');
      setCliStatuses(result as Record<CliType, AgentCliInfo>);
      return result;
    } catch (e) {
      setError(String(e));
      return {};
    } finally {
      setLoading(false);
    }
  }, [setCliStatuses]);

  const installCli = useCallback(async (agent: AgentType) => {
    try {
      await invoke('install_agent_cli', { agent });
      await detectCli(agent);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, [detectCli]);

  const getInstallCommand = useCallback(async (agent: AgentType) => {
    try {
      return await invoke<string>('get_install_command', { agent });
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, []);

  const openInstallTerminal = useCallback(async (agent: AgentType) => {
    try {
      await invoke('open_install_terminal', { agent });
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, []);

  useEffect(() => {
    const handleProgress = (progress: InstallProgress) => {
      setInstallProgress(progress);
      if (progress.stage === 'Completed' || progress.stage === 'Failed') {
        setTimeout(() => setInstallProgress(null), 3000);
      }
    };

    installProgressSubscribers.add(handleProgress);
    installProgressListenerRefCount += 1;
    void ensureInstallProgressListener();

    return () => {
      installProgressSubscribers.delete(handleProgress);
      installProgressListenerRefCount = Math.max(0, installProgressListenerRefCount - 1);
      if (installProgressListenerRefCount === 0 && installProgressListenerPromise) {
        void installProgressListenerPromise.then((unlisten) => unlisten()).catch(() => undefined);
        installProgressListenerPromise = null;
      }
    };
  }, []);

  const isPrereqMet = useCallback(() => {
    return prerequisites.every(p => p.installed && p.meetsMinimum);
  }, [prerequisites]);

  const isCliInstalled = useCallback((agent: AgentType) => {
    return cliStatuses[agent]?.status === 'Installed';
  }, [cliStatuses]);

  return {
    cliStatuses,
    prerequisites,
    installProgress,
    loading,
    error,
    checkPrerequisites,
    detectCli,
    detectAllClis,
    installCli,
    getInstallCommand,
    openInstallTerminal,
    isPrereqMet,
    isCliInstalled,
  };
}
