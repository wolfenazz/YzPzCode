import { invoke } from '@tauri-apps/api/core';
import type { GitRemoteInfo } from '../types';

export interface GitRemoteState {
  remote: GitRemoteInfo | null;
  busy: 'fetch' | 'push' | 'pull' | null;
  error: string | null;
  notice: string | null;
}

export const initialGitRemoteState: GitRemoteState = {
  remote: null,
  busy: null,
  error: null,
  notice: null,
};

/** Fetch the resolved sync destination and divergence from its last fetched state. */
export async function loadGitRemote(workspacePath: string): Promise<GitRemoteInfo | null> {
  const remote = await invoke<GitRemoteInfo | null>('git_remote_info', { workspacePath });
  return remote;
}

/** Fetch remote-tracking refs without merging. */
export async function gitFetch(workspacePath: string): Promise<void> {
  await invoke('git_fetch', { workspacePath });
}

/** Push the current branch to its upstream. */
export async function gitPush(workspacePath: string, expectedBranch: string, remote: GitRemoteInfo): Promise<void> {
  await invoke('git_push', { workspacePath, expectedBranch, expectedRemote: remote.name, expectedRemoteBranch: remote.remoteBranch });
}

/** Pull the current branch from its upstream (fetch + fast-forward merge). */
export async function gitPull(workspacePath: string, expectedBranch: string, remote: GitRemoteInfo): Promise<void> {
  await invoke('git_pull', { workspacePath, expectedBranch, expectedRemote: remote.name, expectedRemoteBranch: remote.remoteBranch });
}
