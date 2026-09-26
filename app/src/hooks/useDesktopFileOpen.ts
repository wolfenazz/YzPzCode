import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { useAppStore } from '../stores/appStore';
import { useFileEditor } from './useFileEditor';
import type { AgentFleet, CliType, FileEntry, WorkspaceConfig } from '../types';
import { ADDITIONAL_AGENT_ZEROS } from '../data/additionalAgents';

const EMPTY_ALLOCATION: Record<CliType, number> = {
  claude: 0,
  codex: 0,
  gemini: 0,
  opencode: 0,
  cursor: 0,
  kilo: 0,
  hermes: 0,
  pi: 0,
  commandcode: 0,
  cline: 0,
  grok: 0,
  ...ADDITIONAL_AGENT_ZEROS,
  gh: 0,
  stripe: 0,
  supabase: 0,
  valyu: 0,
  posthog: 0,
  elevenlabs: 0,
  ramp: 0,
  gws: 0,
  agentmail: 0,
  vercel: 0,
};

const QUICK_EDIT_FLEET: AgentFleet = {
  totalSlots: 1,
  allocation: EMPTY_ALLOCATION,
};

const IS_WINDOWS = navigator.userAgent.toLowerCase().includes('windows');

function normalizePath(value: string): string {
  let normalized = value.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && !/^[a-zA-Z]:\/$/.test(normalized)) {
    normalized = normalized.replace(/\/$/, '');
  }
  return IS_WINDOWS ? normalized.toLowerCase() : normalized;
}

function workspaceContainsFile(workspacePath: string, filePath: string): boolean {
  const workspace = normalizePath(workspacePath);
  const file = normalizePath(filePath);
  const workspacePrefix = workspace.endsWith('/') ? workspace : `${workspace}/`;
  return file === workspace || file.startsWith(workspacePrefix);
}

function parentPath(filePath: string): string {
  const lastSeparator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSeparator < 0) return '.';
  if (lastSeparator === 0) return filePath.slice(0, 1);
  if (/^[a-zA-Z]:/.test(filePath) && lastSeparator === 2) return filePath.slice(0, 3);
  return filePath.slice(0, lastSeparator);
}

function workspaceName(directoryPath: string): string {
  const withoutTrailingSeparator = directoryPath.replace(/[\\/]$/, '');
  const name = withoutTrailingSeparator.split(/[\\/]/).pop();
  return name || directoryPath;
}

function findWorkspaceForFile(filePath: string): WorkspaceConfig | null {
  const state = useAppStore.getState();
  const byId = new Map<string, WorkspaceConfig>();

  for (const workspace of [...state.openWorkspaces, ...state.workspaceList]) {
    byId.set(workspace.id, workspace);
  }

  return [...byId.values()]
    .filter((workspace) => workspaceContainsFile(workspace.path, filePath))
    .sort((left, right) => normalizePath(right.path).length - normalizePath(left.path).length)[0] ?? null;
}

function activateWorkspaceForFile(filePath: string): WorkspaceConfig {
  const state = useAppStore.getState();
  let workspace = findWorkspaceForFile(filePath);

  if (!workspace) {
    const directoryPath = parentPath(filePath);
    workspace = {
      id: crypto.randomUUID(),
      name: workspaceName(directoryPath),
      path: directoryPath,
      layout: { type: 'grid', sessions: 1 },
      agentFleet: {
        ...QUICK_EDIT_FLEET,
        allocation: { ...QUICK_EDIT_FLEET.allocation },
      },
      createdAt: Date.now(),
    };
    state.addToWorkspaceList(workspace);
  }

  const latestState = useAppStore.getState();
  if (latestState.openWorkspaces.some((candidate) => candidate.id === workspace.id)) {
    latestState.switchWorkspace(workspace.id);
  } else {
    latestState.openWorkspace(workspace);
  }
  latestState.setView('workspace');
  latestState.setActiveView('editor');

  return workspace;
}

/**
 * Opens files received from the desktop shell after normal app restoration has
 * completed. Rust owns the durable queue, so neither cold starts nor quick
 * successive "Open with" requests depend on webview event timing.
 */
export function useDesktopFileOpen(startupReady: boolean): void {
  const { openFile } = useFileEditor();
  const drainingRef = useRef(false);
  const drainAgainRef = useRef(false);

  const drainPendingFiles = useCallback(async (): Promise<void> => {
    if (!startupReady) return;
    if (drainingRef.current) {
      drainAgainRef.current = true;
      return;
    }

    drainingRef.current = true;
    try {
      do {
        drainAgainRef.current = false;
        const entries = await invoke<FileEntry[]>('take_pending_open_files');

        for (const entry of entries) {
          activateWorkspaceForFile(entry.path);
          await openFile(entry);
        }
      } while (drainAgainRef.current);
    } catch (error) {
      console.error('Failed to handle desktop file-open request:', error);
    } finally {
      drainingRef.current = false;
    }
  }, [openFile, startupReady]);

  useEffect(() => {
    if (!startupReady || !('__TAURI_INTERNALS__' in window)) return;

    let disposed = false;
    let stopListening: (() => void) | undefined;

    void listen('open-files-requested', () => {
      void drainPendingFiles();
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      stopListening = unlisten;
      void drainPendingFiles();
    }).catch((error: unknown) => {
      console.error('Failed to listen for desktop file-open requests:', error);
    });

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [drainPendingFiles, startupReady]);
}
