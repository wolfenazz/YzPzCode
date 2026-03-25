import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TerminalSession, AgentFleet } from '../types';
import { useAppStore } from '../stores/appStore';

interface CreateSessionsParams {
  workspaceId: string;
  workspacePath: string;
  count: number;
  agentFleet: AgentFleet;
}

export const useTerminal = () => {
  const sessions = useAppStore((state) => state.sessions);
  const isLoading = useAppStore((state) => state.isLoadingTerminals);
  const error = useAppStore((state) => state.terminalError);
  const setSessions = useAppStore((state) => state.setSessions);
  const setIsLoading = useAppStore((state) => state.setIsLoadingTerminals);
  const setTerminalError = useAppStore((state) => state.setTerminalError);

  const createSessions = useCallback(async (params: CreateSessionsParams) => {
    setIsLoading(true);
    setTerminalError(null);
    setSessions([]); // Clear old sessions immediately

    try {
      const newSessions = await invoke<TerminalSession[]>('create_terminal_sessions', {
        request: {
          workspaceId: params.workspaceId,
          workspacePath: params.workspacePath,
          count: params.count,
          agentFleet: {
            totalSlots: params.agentFleet.totalSlots,
            allocation: params.agentFleet.allocation,
          },
        },
      });

      setSessions(newSessions);
      return newSessions;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Failed to create terminal sessions:', err);
      setTerminalError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setSessions, setIsLoading]);

  const writeToTerminal = useCallback(async (sessionId: string, input: string) => {
    try {
      await invoke('write_to_terminal', {
        sessionId,
        input,
      });
    } catch (err) {
      console.error('Failed to write to terminal:', err);
      throw err;
    }
  }, []);

  const resizeTerminal = useCallback(async (sessionId: string, cols: number, rows: number) => {
    try {
      await invoke('resize_terminal', {
        sessionId,
        cols,
        rows,
      });
    } catch (err) {
      console.error('Failed to resize terminal:', err);
      throw err;
    }
  }, []);

  const killSession = useCallback(async (sessionId: string) => {
    try {
      await invoke('kill_session', { sessionId });
      setSessions(sessions.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to kill session:', err);
      setSessions(sessions.filter((s) => s.id !== sessionId));
    }
  }, [sessions, setSessions]);

  const killAllSessions = useCallback(async () => {
    try {
      const currentSessions = sessions;
      await Promise.allSettled(
        currentSessions.map((s) => invoke('kill_session', { sessionId: s.id }))
      );
      setSessions([]);
    } catch (err) {
      console.error('Failed to kill all sessions:', err);
      setSessions([]);
    }
  }, [sessions, setSessions]);

  const killWorkspaceSessions = useCallback(async (workspaceId: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      await invoke('kill_workspace_sessions', { workspaceId });
      clearTimeout(timeoutId);
    } catch (err) {
      console.error('Failed to kill workspace sessions:', err);
    }
  }, []);

  const getAllSessions = useCallback(async () => {
    try {
      const allSessions = await invoke<TerminalSession[]>('get_all_sessions');
      setSessions(allSessions);
      return allSessions;
    } catch (err) {
      console.error('Failed to get all sessions:', err);
      throw err;
    }
  }, [setSessions]);

  return {
    sessions,
    isLoading,
    error,
    createSessions,
    writeToTerminal,
    resizeTerminal,
    killSession,
    killAllSessions,
    killWorkspaceSessions,
    getAllSessions,
  };
};
