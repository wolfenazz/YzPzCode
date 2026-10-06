import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAppStore } from './appStore';
import type { TerminalSession } from '../types';

/**
 * The editor's bottom terminal panel (like VS Code's integrated terminal).
 *
 * Its shells are ordinary PTY sessions, but they are kept apart from the
 * terminal grid: they live here instead of `appStore.sessionsByWorkspace`, and
 * the backend files them under `<workspaceId>:editor-panel`, so the grid's
 * "recreate all workspace sessions" never kills them. The frontend copy keeps
 * the real workspace id so dev-server detection and links work as usual.
 */

export interface EditorTerminalPanelLayout {
  open: boolean;
  height: number;
  maximized: boolean;
}

export const PANEL_DEFAULT_HEIGHT = 280;
export const PANEL_MIN_HEIGHT = 120;
export const DEFAULT_PANEL_LAYOUT: EditorTerminalPanelLayout = { open: false, height: PANEL_DEFAULT_HEIGHT, maximized: false };
export const EMPTY_PANEL_SESSIONS: TerminalSession[] = [];

const backendWorkspaceId = (workspaceId: string): string => `${workspaceId}:editor-panel`;

interface EditorTerminalStore {
  layoutByWorkspace: Record<string, EditorTerminalPanelLayout>;
  sessionsByWorkspace: Record<string, TerminalSession[]>;
  activeByWorkspace: Record<string, string | null>;
  creatingByWorkspace: Record<string, boolean>;
  errorByWorkspace: Record<string, string | null>;
  setOpen: (workspaceId: string, open: boolean) => void;
  toggle: (workspaceId: string) => void;
  setHeight: (workspaceId: string, height: number) => void;
  setMaximized: (workspaceId: string, maximized: boolean) => void;
  setActive: (workspaceId: string, sessionId: string) => void;
  createTerminal: (workspace: { id: string; path: string }, shell?: string | null) => Promise<TerminalSession | null>;
  killTerminal: (workspaceId: string, sessionId: string) => Promise<void>;
  closeWorkspace: (workspaceId: string) => Promise<void>;
}

/** Drops per-session terminal state the app store keeps for a closed shell. */
function forgetSessionState(sessionIds: string[]): void {
  if (sessionIds.length === 0) return;
  const ids = new Set(sessionIds);
  useAppStore.setState((state) => ({
    terminalMouseModesBySession: Object.fromEntries(Object.entries(state.terminalMouseModesBySession).filter(([id]) => !ids.has(id))),
    manualAgentBySession: Object.fromEntries(Object.entries(state.manualAgentBySession).filter(([id]) => !ids.has(id))),
  }));
}

export const useEditorTerminalStore = create<EditorTerminalStore>()(
  persist(
    (set, get) => {
      const updateLayout = (workspaceId: string, patch: (layout: EditorTerminalPanelLayout) => Partial<EditorTerminalPanelLayout>): void => {
        set((state) => {
          const layout = state.layoutByWorkspace[workspaceId] ?? DEFAULT_PANEL_LAYOUT;
          return { layoutByWorkspace: { ...state.layoutByWorkspace, [workspaceId]: { ...layout, ...patch(layout) } } };
        });
      };
      return {
        layoutByWorkspace: {},
        sessionsByWorkspace: {},
        activeByWorkspace: {},
        creatingByWorkspace: {},
        errorByWorkspace: {},
        setOpen: (workspaceId, open) => updateLayout(workspaceId, () => ({ open })),
        toggle: (workspaceId) => updateLayout(workspaceId, (layout) => ({ open: !layout.open })),
        setHeight: (workspaceId, height) => updateLayout(workspaceId, () => ({ height: Math.max(PANEL_MIN_HEIGHT, Math.round(height)), maximized: false })),
        setMaximized: (workspaceId, maximized) => updateLayout(workspaceId, () => ({ maximized })),
        setActive: (workspaceId, sessionId) => set((state) => ({ activeByWorkspace: { ...state.activeByWorkspace, [workspaceId]: sessionId } })),
        createTerminal: async (workspace, shell = null) => {
          if (get().creatingByWorkspace[workspace.id]) return null;
          set((state) => ({
            creatingByWorkspace: { ...state.creatingByWorkspace, [workspace.id]: true },
            errorByWorkspace: { ...state.errorByWorkspace, [workspace.id]: null },
          }));
          try {
            const created = await invoke<TerminalSession>('create_single_terminal_session', {
              request: {
                workspaceId: backendWorkspaceId(workspace.id),
                workspacePath: workspace.path,
                index: get().sessionsByWorkspace[workspace.id]?.length ?? 0,
                agent: null,
                shell,
              },
            });
            const session: TerminalSession = { ...created, workspaceId: workspace.id };
            set((state) => ({
              sessionsByWorkspace: { ...state.sessionsByWorkspace, [workspace.id]: [...(state.sessionsByWorkspace[workspace.id] ?? []), session] },
              activeByWorkspace: { ...state.activeByWorkspace, [workspace.id]: session.id },
            }));
            return session;
          } catch (error) {
            set((state) => ({ errorByWorkspace: { ...state.errorByWorkspace, [workspace.id]: String(error) } }));
            return null;
          } finally {
            set((state) => ({ creatingByWorkspace: { ...state.creatingByWorkspace, [workspace.id]: false } }));
          }
        },
        killTerminal: async (workspaceId, sessionId) => {
          const sessions = get().sessionsByWorkspace[workspaceId] ?? [];
          const index = sessions.findIndex((session) => session.id === sessionId);
          if (index < 0) return;
          const remaining = sessions.filter((session) => session.id !== sessionId);
          const active = get().activeByWorkspace[workspaceId];
          set((state) => ({
            sessionsByWorkspace: { ...state.sessionsByWorkspace, [workspaceId]: remaining },
            // Like VS Code: focus moves to the neighbour of the closed tab.
            activeByWorkspace: { ...state.activeByWorkspace, [workspaceId]: active === sessionId ? remaining[Math.min(index, remaining.length - 1)]?.id ?? null : active ?? null },
          }));
          // Closing the last shell hides the panel.
          if (remaining.length === 0) updateLayout(workspaceId, () => ({ open: false, maximized: false }));
          forgetSessionState([sessionId]);
          await invoke('kill_session', { sessionId }).catch((error: unknown) => console.error('Failed to kill panel terminal:', error));
        },
        closeWorkspace: async (workspaceId) => {
          const sessions = get().sessionsByWorkspace[workspaceId] ?? [];
          set((state) => ({
            sessionsByWorkspace: Object.fromEntries(Object.entries(state.sessionsByWorkspace).filter(([id]) => id !== workspaceId)),
            activeByWorkspace: Object.fromEntries(Object.entries(state.activeByWorkspace).filter(([id]) => id !== workspaceId)),
            layoutByWorkspace: Object.fromEntries(Object.entries(state.layoutByWorkspace).filter(([id]) => id !== workspaceId)),
          }));
          forgetSessionState(sessions.map((session) => session.id));
          await invoke('kill_workspace_sessions', { workspaceId: backendWorkspaceId(workspaceId) })
            .catch((error: unknown) => console.error('Failed to close panel terminals:', error));
        },
      };
    },
    {
      name: 'yzpzcode-editor-terminal',
      // Shells don't survive a restart; only the panel layout is kept.
      partialize: (state) => ({ layoutByWorkspace: state.layoutByWorkspace }),
    },
  ),
);
