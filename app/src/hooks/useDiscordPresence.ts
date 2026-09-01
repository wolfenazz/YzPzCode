import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import type { WorkspaceView } from '../types';

const PRESENCE_UPDATE_DELAY_MS = 500;
const PRESENCE_RETRY_INTERVAL_MS = 30_000;
const DISCORD_TEXT_LIMIT = 128;

interface DiscordActivityPayload {
  workspaceName: string | null;
  details: string;
  stateText: string;
}

const VIEW_DETAILS: Record<WorkspaceView, string> = {
  terminal: 'Working in the terminal',
  agent: 'Building with AI agents',
  editor: 'Browsing project files',
  browser: 'Previewing a web project',
};

function getFileName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

function limitDiscordText(value: string): string {
  return Array.from(value).slice(0, DISCORD_TEXT_LIMIT).join('');
}

function buildWorkspaceDetails(
  activeView: WorkspaceView,
  activeFilePath: string | null,
  gitDiffFileName: string | null,
  imageEditorPath: string | null,
): string {
  if (activeView !== 'editor') {
    return VIEW_DETAILS[activeView];
  }

  if (gitDiffFileName) {
    return `Reviewing changes in ${gitDiffFileName}`;
  }

  if (imageEditorPath) {
    return `Editing image ${getFileName(imageEditorPath)}`;
  }

  if (activeFilePath) {
    return `Editing ${getFileName(activeFilePath)}`;
  }

  return VIEW_DETAILS.editor;
}

/** Keeps Discord Rich Presence synchronized with the active app/workspace state. */
export function useDiscordPresence(): void {
  const enabled = useAppStore((state) => state.discordRichPresence);
  const appView = useAppStore((state) => state.view);
  const workspace = useAppStore((state) => state.currentWorkspace);
  const activeView = useAppStore((state) => state.activeView);
  const activeFilePath = useAppStore((state) => state.activeFilePath);
  const gitDiffFileName = useAppStore((state) => state.gitDiffFile?.name ?? null);
  const imageEditorPath = useAppStore((state) => {
    const workspaceId = state.currentWorkspace?.id;
    return workspaceId ? state.imageEditorByWorkspace[workspaceId]?.path ?? null : null;
  });

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    let cancelled = false;
    let retryIntervalId: number | null = null;

    if (!enabled) {
      void invoke('disable_discord_presence').catch((error: unknown) => {
        console.warn('Failed to disable Discord Rich Presence:', error);
      });
      return;
    }

    let payload: DiscordActivityPayload;
    if (appView === 'workspace' && workspace) {
      payload = {
        workspaceName: limitDiscordText(workspace.name),
        details: limitDiscordText(
          buildWorkspaceDetails(activeView, activeFilePath, gitDiffFileName, imageEditorPath),
        ),
        stateText: limitDiscordText(`Workspace: ${workspace.name}`),
      };
    } else if (appView === 'docs') {
      payload = {
        workspaceName: null,
        details: 'Reading the documentation',
        stateText: 'Learning YzPzCode',
      };
    } else if (appView === 'settings') {
      payload = {
        workspaceName: null,
        details: 'Customizing the app',
        stateText: 'YzPzCode settings',
      };
    } else {
      payload = {
        workspaceName: null,
        details: 'Choosing a workspace',
        stateText: 'Getting ready to code',
      };
    }

    const syncPresence = async (): Promise<void> => {
      try {
        await invoke('enable_discord_presence');
        if (cancelled) return;
        await invoke('update_discord_activity', {
          workspaceName: payload.workspaceName,
          details: payload.details,
          stateText: payload.stateText,
        });
      } catch (error: unknown) {
        if (!cancelled) {
          console.warn('Failed to update Discord Rich Presence:', error);
        }
      }
    };

    const updateTimeoutId = window.setTimeout(() => {
      void syncPresence();
      retryIntervalId = window.setInterval(() => {
        void syncPresence();
      }, PRESENCE_RETRY_INTERVAL_MS);
    }, PRESENCE_UPDATE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(updateTimeoutId);
      if (retryIntervalId !== null) {
        window.clearInterval(retryIntervalId);
      }
    };
  }, [
    activeFilePath,
    activeView,
    appView,
    enabled,
    gitDiffFileName,
    imageEditorPath,
    workspace,
  ]);
}
