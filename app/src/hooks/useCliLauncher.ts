import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { CliType, CliLaunchState, AuthInfo } from '../types';
import { useAppStore } from '../stores/appStore';

let launchStateListenerPromise: Promise<UnlistenFn> | null = null;
let launchStateListenerRefCount = 0;

const ensureLaunchStateListener = (): Promise<UnlistenFn> => {
  if (!launchStateListenerPromise) {
    launchStateListenerPromise = listen<CliLaunchState>('cli-launch-state-changed', (event) => {
      useAppStore.getState().setLaunchState(event.payload.sessionId, event.payload);
    });
  }

  return launchStateListenerPromise;
};

export const useCliLauncher = () => {
  const launchStates = useAppStore(state => state.cliLaunchStates);
  const authInfos = useAppStore(state => state.authInfos);
  const setAuthInfo = useAppStore(state => state.setAuthInfo);

  useEffect(() => {
    launchStateListenerRefCount += 1;
    void ensureLaunchStateListener();

    return () => {
      launchStateListenerRefCount = Math.max(0, launchStateListenerRefCount - 1);
      if (launchStateListenerRefCount === 0 && launchStateListenerPromise) {
        void launchStateListenerPromise.then((unlisten) => unlisten()).catch(() => undefined);
        launchStateListenerPromise = null;
      }
    };
  }, []);

  const launchCli = useCallback(async (sessionId: string, agent: CliType) => {
    await invoke('launch_cli_in_terminal', { sessionId, agent });
  }, []);

  const stopCli = useCallback(async (sessionId: string) => {
    await invoke('stop_cli_in_terminal', { sessionId });
  }, []);

  const restartCli = useCallback(async (sessionId: string) => {
    await invoke('restart_cli_in_terminal', { sessionId });
  }, []);

  const getLaunchState = useCallback(async (sessionId: string): Promise<CliLaunchState | null> => {
    const state = await invoke<Option<CliLaunchState>>('get_cli_launch_state', { sessionId });
    if (state) useAppStore.getState().setLaunchState(sessionId, state);
    return state;
  }, []);

  const getAllLaunchStates = useCallback(async (): Promise<CliLaunchState[]> => {
    const states = await invoke<CliLaunchState[]>('get_all_cli_launch_states');
    const setLaunchState = useAppStore.getState().setLaunchState;
    states.forEach(s => setLaunchState(s.sessionId, s));
    return states;
  }, []);

  const checkAuth = useCallback(async (agent: CliType): Promise<AuthInfo> => {
    const info = await invoke<AuthInfo>('check_cli_auth', { agent });
    setAuthInfo(agent, info);
    return info;
  }, [setAuthInfo]);

  const checkAllAuth = useCallback(async (): Promise<AuthInfo[]> => {
    const infos = await invoke<AuthInfo[]>('check_all_cli_auth');
    infos.forEach(info => setAuthInfo(info.agent, info));
    return infos;
  }, [setAuthInfo]);

  const getAuthInstructions = useCallback(async (agent: CliType): Promise<string[]> => {
    return await invoke<string[]>('get_auth_instructions', { agent });
  }, []);

  const getBinaryName = useCallback(async (agent: CliType): Promise<string> => {
    return await invoke<string>('get_cli_binary_name', { agent });
  }, []);

  const getLaunchStateSync = (sessionId: string): CliLaunchState | null | undefined => {
    return launchStates[sessionId];
  };

  const getAuthInfoSync = (agent: CliType): AuthInfo | null | undefined => {
    return authInfos[agent];
  };

  return {
    launchStates,
    authInfos,
    launchCli,
    stopCli,
    restartCli,
    getLaunchState,
    getAllLaunchStates,
    checkAuth,
    checkAllAuth,
    getAuthInstructions,
    getBinaryName,
    getLaunchStateSync,
    getAuthInfoSync,
  };
};

type Option<T> = T | null;
