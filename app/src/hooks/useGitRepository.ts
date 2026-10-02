import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { GitBranchInfo, GitCommitInfo, GitFileStatus, GitRemoteInfo } from '../types';

interface RepositoryState {
  path: string;
  branches: GitBranchInfo | null;
  remote: GitRemoteInfo | null;
  commits: GitCommitInfo[];
  error: string | null;
}

/** Keep branch metadata current even when Git changes outside the app. */
export function useGitRepository(workspacePath: string, statuses: GitFileStatus[], loadHistory: boolean): RepositoryState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<RepositoryState>({ path: workspacePath, branches: null, remote: null, commits: [], error: null });
  const requestRef = useRef(0);
  const refresh = useCallback(async (): Promise<void> => {
    const request = ++requestRef.current;
    const [branchResult, remoteResult, logResult] = await Promise.allSettled([
      invoke<GitBranchInfo>('git_branches', { workspacePath }),
      invoke<GitRemoteInfo | null>('git_remote_info', { workspacePath }),
      loadHistory ? invoke<GitCommitInfo[]>('git_log', { workspacePath, limit: 20 }) : Promise.resolve([] as GitCommitInfo[]),
    ]);
    if (request !== requestRef.current) return;
    const failure = [branchResult, remoteResult, logResult].find((result) => result.status === 'rejected');
    const branches = branchResult.status === 'fulfilled' ? branchResult.value : null;
    const remote = remoteResult.status === 'fulfilled' ? remoteResult.value : null;
    const mismatch = remote && branches && remote.currentBranch !== branches.current;
    setState({
      path: workspacePath,
      branches: mismatch ? null : branches,
      remote: mismatch ? null : remote,
      commits: logResult.status === 'fulfilled' ? logResult.value : [],
      error: mismatch ? 'The branch changed while refreshing. Refresh source control and try again.' :
        failure?.status === 'rejected' ? String(failure.reason) : null,
    });
  }, [workspacePath, loadHistory]);

  useEffect(() => {
    void refresh();
    // .git changes (including worktree HEAD) need not emit filesystem events.
    const timer = window.setInterval(() => void refresh(), 5000);
    const onFocus = (): void => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      ++requestRef.current;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, statuses]);

  const visible = state.path === workspacePath ? state : { path: workspacePath, branches: null, remote: null, commits: [], error: null };
  return { ...visible, refresh };
}
