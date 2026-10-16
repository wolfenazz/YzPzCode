import { invoke } from '@tauri-apps/api/core';
import type { CliType, TerminalSession } from '../types';

/** One terminal to open. A launch can carry several of these at once. */
export interface LaunchSpec {
  agent: CliType | null;
  shell: string | null;
}

interface CreateSessionBatchResult {
  sessions: TerminalSession[];
  errors: string[];
}

/**
 * Opens every spec as its own PTY session, leaving terminals that are already
 * running in the workspace alone. Sessions the backend could not start are
 * reported but do not cancel the rest of the batch.
 */
export const launchTerminals = async (
  workspaceId: string,
  workspacePath: string,
  startIndex: number,
  specs: LaunchSpec[],
): Promise<TerminalSession[]> => {
  if (specs.length === 0) return [];

  const result = await invoke<CreateSessionBatchResult>('create_terminal_session_batch', {
    request: {
      workspaceId,
      workspacePath,
      startIndex,
      specs,
    },
  });

  if (result.errors.length > 0) {
    console.error('Some terminals could not be opened:', result.errors);
  }

  return result.sessions;
};
