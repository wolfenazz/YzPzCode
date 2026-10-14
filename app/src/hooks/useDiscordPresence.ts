import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getIconForFilePath } from 'vscode-material-icons';
import { useAppStore } from '../stores/appStore';
import { EMPTY_EXTENSION_PANELS, useExtensionStore } from '../stores/extensionStore';
import type { WorkspaceExtensionPanel, WorkspaceView } from '../types';
import { agentPresenceIcon, extensionPresenceIcon, materialIconPresenceIcon } from '../utils/presenceIcons';

const PRESENCE_UPDATE_DELAY_MS = 500;
const PRESENCE_RETRY_INTERVAL_MS = 30_000;
const DISCORD_TEXT_LIMIT = 128;

interface DiscordActivityPayload {
  workspaceName: string | null;
  details: string;
  stateText: string;
  smallImage: string | null;
  smallImageText: string | null;
}

/** The badge drawn on the corner of the large logo: the thing the user is focused on. */
interface SmallImage {
  path: string;
  text: string;
}

interface SmallImageInput {
  activeView: WorkspaceView;
  focusedAgent: string | null;
  focusedPanel: WorkspaceExtensionPanel | null;
  dockOpen: boolean;
  filePath: string | null;
}

const VIEW_DETAILS: Record<WorkspaceView, string> = {
  terminal: 'Working in the terminal',
  extensions: 'Working with AI extensions',
  editor: 'Browsing project files',
  browser: 'Previewing a web project',
  writing: 'Writing a report',
  presentation: 'Building a presentation',
  sheets: 'Building a spreadsheet',
};

function getFileName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

function limitDiscordText(value: string): string {
  return Array.from(value).slice(0, DISCORD_TEXT_LIMIT).join('');
}

function getPresenceFilePath(
  activeView: WorkspaceView,
  activeFilePath: string | null,
  gitDiffFileName: string | null,
  imageEditorPath: string | null,
): string | null {
  if (activeView !== 'editor') return null;
  return gitDiffFileName ?? imageEditorPath ?? activeFilePath;
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

function getFileBadge(filePath: string): SmallImage {
  let iconName: string;
  try {
    iconName = getIconForFilePath(filePath);
  } catch {
    iconName = 'file';
  }
  return { path: materialIconPresenceIcon(iconName), text: `File: ${getFileName(filePath)}` };
}

function getAgentBadge(agent: string | null): SmallImage | null {
  const icon = agent ? agentPresenceIcon(agent) : null;
  return icon ? { path: icon.path, text: `Agent: ${icon.label}` } : null;
}

function getExtensionBadge(panel: WorkspaceExtensionPanel): SmallImage | null {
  const path = extensionPresenceIcon(panel.extensionId);
  return path ? { path, text: `Extension: ${panel.name}` } : null;
}

/**
 * The badge follows the focused surface of the current view: the agent of the
 * focused terminal, the focused extension, or the open file in the editor.
 * A focused extension in the editor's side panel takes the badge over the file.
 */
function getSmallImage({ activeView, focusedAgent, focusedPanel, dockOpen, filePath }: SmallImageInput): SmallImage | null {
  if (activeView === 'terminal') return getAgentBadge(focusedAgent);
  if (activeView === 'extensions') return focusedPanel ? getExtensionBadge(focusedPanel) : null;
  if (activeView === 'editor') {
    if (dockOpen && focusedPanel?.dock === 'side') return getExtensionBadge(focusedPanel);
    return filePath ? getFileBadge(filePath) : null;
  }
  return null;
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
  // The terminal the user is in: its fleet agent, or the agent typed into it.
  const focusedAgent = useAppStore((state) => {
    const workspaceId = state.currentWorkspace?.id;
    const sessionId = state.activeSessionId;
    if (!workspaceId || !sessionId) return null;
    const session = state.sessionsByWorkspace[workspaceId]?.find((entry) => entry.id === sessionId);
    return state.manualAgentBySession[sessionId] ?? session?.agent ?? null;
  });
  const focusedPanelId = useExtensionStore((state) => state.focusedPanelId);
  const extensionPanels = useExtensionStore((state) => (
    workspace ? state.panelsByWorkspace[workspace.id] ?? EMPTY_EXTENSION_PANELS : EMPTY_EXTENSION_PANELS
  ));
  const dockOpen = useExtensionStore((state) => (workspace ? state.dockByWorkspace[workspace.id]?.open ?? false : false));

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
      const focusedPanel = extensionPanels.find((panel) => panel.id === focusedPanelId) ?? null;
      const smallImage = getSmallImage({
        activeView,
        focusedAgent,
        focusedPanel,
        dockOpen,
        filePath: getPresenceFilePath(activeView, activeFilePath, gitDiffFileName, imageEditorPath),
      });
      payload = {
        workspaceName: limitDiscordText(workspace.name),
        details: limitDiscordText(
          buildWorkspaceDetails(activeView, activeFilePath, gitDiffFileName, imageEditorPath),
        ),
        stateText: limitDiscordText(`Workspace: ${workspace.name}`),
        smallImage: smallImage?.path ?? null,
        smallImageText: smallImage ? limitDiscordText(smallImage.text) : null,
      };
    } else if (appView === 'docs') {
      payload = {
        workspaceName: null,
        details: 'Reading the documentation',
        stateText: 'Learning YzPzCode',
        smallImage: null,
        smallImageText: null,
      };
    } else if (appView === 'settings') {
      payload = {
        workspaceName: null,
        details: 'Customizing the app',
        stateText: 'YzPzCode settings',
        smallImage: null,
        smallImageText: null,
      };
    } else {
      payload = {
        workspaceName: null,
        details: 'Choosing a workspace',
        stateText: 'Getting ready to code',
        smallImage: null,
        smallImageText: null,
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
          smallImage: payload.smallImage,
          smallImageText: payload.smallImageText,
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
    dockOpen,
    enabled,
    extensionPanels,
    focusedAgent,
    focusedPanelId,
    gitDiffFileName,
    imageEditorPath,
    workspace,
  ]);
}
