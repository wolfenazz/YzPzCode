import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ToolCliType, ToolCliInfo, ToolAuthInfo, CliStatus } from '../types';
import { useAppStore } from '../stores/appStore';
import { useState } from 'react';

interface RustCliInfo {
  agent: string;
  binaryName: string;
  displayName: string;
  description: string;
  provider: string;
  status: CliStatus;
  version: string | null;
  path: string | null;
  error: string | null;
  docsUrl: string;
  iconPath: string;
}

export function useToolCli() {
  const toolCliStatuses = useAppStore(state => state.toolCliStatuses);
  const setToolCliStatuses = useAppStore(state => state.setToolCliStatuses);
  const toolAuthInfos = useAppStore(state => state.toolAuthInfos);
  const setToolAuthInfos = useAppStore(state => state.setToolAuthInfos);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectAllToolClis = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await invoke<Record<string, RustCliInfo>>('detect_all_tool_clis');
      const mapped: Record<ToolCliType, ToolCliInfo> = {} as Record<ToolCliType, ToolCliInfo>;
      for (const [key, val] of Object.entries(raw)) {
        mapped[key as ToolCliType] = {
          tool: key as ToolCliType,
          binaryName: val.binaryName,
          displayName: val.displayName,
          description: val.description,
          provider: val.provider,
          status: val.status,
          version: val.version,
          path: val.path,
          error: val.error,
          docsUrl: val.docsUrl,
          iconPath: val.iconPath,
        };
      }
      setToolCliStatuses(mapped);
      return mapped;
    } catch (e) {
      setError(String(e));
      return {};
    } finally {
      setLoading(false);
    }
  }, [setToolCliStatuses]);

  const checkAllToolAuths = useCallback(async () => {
    try {
      const raw = await invoke<Array<{ agent: string; status: string; error: string | null; configPath: string | null }>>('check_all_tool_auths');
      const mapped: Record<ToolCliType, ToolAuthInfo> = {} as Record<ToolCliType, ToolAuthInfo>;
      for (const item of raw) {
        mapped[item.agent as ToolCliType] = {
          tool: item.agent as ToolCliType,
          status: item.status as ToolAuthInfo['status'],
          error: item.error,
          configPath: item.configPath,
        };
      }
      setToolAuthInfos(mapped);
      return mapped;
    } catch (e) {
      setError(String(e));
      return {};
    }
  }, [setToolAuthInfos]);

  const openToolInstallTerminal = useCallback(async (tool: ToolCliType) => {
    try {
      await invoke('open_tool_install_terminal', { agent: tool });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const getToolInstallCommand = useCallback(async (tool: ToolCliType) => {
    try {
      return await invoke<string>('get_tool_install_command', { agent: tool });
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, []);

  return {
    toolCliStatuses,
    toolAuthInfos,
    detectAllToolClis,
    checkAllToolAuths,
    openToolInstallTerminal,
    getToolInstallCommand,
    loading,
    error,
  };
}
