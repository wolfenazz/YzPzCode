import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AgentType, WorkspaceConfig, TerminalSession, AgentCliInfo, PrerequisiteStatus, IdeType, IdeInfo } from '../types';

interface AppState {
  currentWorkspace: WorkspaceConfig | null;
  workspaceList: WorkspaceConfig[];
  openWorkspaces: WorkspaceConfig[];
  activeWorkspaceId: string | null;
  sessions: TerminalSession[];
  sessionsByWorkspace: Record<string, TerminalSession[]>;
  activeSessionId: string | null;
  activeSessionByWorkspace: Record<string, string | null>;
  isLoadingTerminals: boolean;
  view: "setup" | "workspace" | "docs";
  previousView: "setup" | "workspace" | null;
  lastOpenedWorkspaceId: string | null;
  terminalError: string | null;

  cliStatuses: Record<AgentType, AgentCliInfo | null>;
  prerequisites: PrerequisiteStatus[];
  installInProgress: AgentType | null;
  cliLaunchStates: Record<string, any>;
  authInfos: Record<AgentType, any>;
  theme: "dark" | "light";
  selectedIdes: IdeType[];
  ideStatuses: Record<IdeType, IdeInfo | null>;

  setView: (view: "setup" | "workspace" | "docs") => void;
  setViewWithPrevious: (view: "docs") => void;
  setCurrentWorkspace: (workspace: WorkspaceConfig | null) => void;
  setSessions: (sessions: TerminalSession[]) => void;
  setIsLoadingTerminals: (loading: boolean) => void;
  updateWorkspaceList: (workspaces: WorkspaceConfig[]) => void;
  addToWorkspaceList: (workspace: WorkspaceConfig) => void;
  setActiveSession: (sessionId: string | null) => void;
  updateAgentAllocation: (agent: AgentType, count: number) => void;
  markWorkspaceOpened: (workspaceId: string) => void;
  clearCurrentWorkspace: () => void;
  toggleTheme: () => void;

  openWorkspace: (workspace: WorkspaceConfig) => void;
  closeWorkspace: (workspaceId: string) => void;
  switchWorkspace: (workspaceId: string) => void;
  setSessionsForWorkspace: (workspaceId: string, sessions: TerminalSession[]) => void;
  setActiveSessionForWorkspace: (workspaceId: string, sessionId: string | null) => void;
  closeAllWorkspaces: () => void;
  setTerminalError: (error: string | null) => void;

  setCliStatus: (agent: AgentType, info: AgentCliInfo) => void;
  setCliStatuses: (statuses: Record<AgentType, AgentCliInfo>) => void;
  setPrerequisites: (prereqs: PrerequisiteStatus[]) => void;
  setInstallInProgress: (agent: AgentType | null) => void;
  setLaunchState: (sessionId: string, state: any) => void;
  setAuthInfo: (agent: AgentType, info: any) => void;
  toggleIde: (ide: IdeType) => void;
  setSelectedIdes: (ides: IdeType[]) => void;
  setIdeStatuses: (statuses: Record<IdeType, IdeInfo | null>) => void;
}

const initialCliStatuses: Record<AgentType, AgentCliInfo | null> = {
  claude: null,
  codex: null,
  gemini: null,
  opencode: null,
  cursor: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentWorkspace: null,
      workspaceList: [],
      openWorkspaces: [],
      activeWorkspaceId: null,
      sessions: [],
      sessionsByWorkspace: {} as Record<string, TerminalSession[]>,
      activeSessionId: null,
      activeSessionByWorkspace: {} as Record<string, string | null>,
      isLoadingTerminals: false,
      view: "setup",
      previousView: null,
      lastOpenedWorkspaceId: null,
      terminalError: null,
      cliStatuses: initialCliStatuses,
      prerequisites: [],
      installInProgress: null,
      cliLaunchStates: {} as Record<string, any>,
      authInfos: {} as Record<AgentType, any>,
      theme: "dark",
      selectedIdes: [],
      ideStatuses: {
        vsCode: null,
        visualStudio: null,
        cursor: null,
        zed: null,
        webStorm: null,
        intelliJ: null,
        sublimeText: null,
        windsurf: null,
        perplexity: null,
        antigravity: null,
      },

      setView: (view) => set({ view }),
      setViewWithPrevious: (view) => set((state) => ({ 
        previousView: state.view === "docs" ? state.previousView : state.view as "setup" | "workspace",
        view 
      })),
      setCurrentWorkspace: (workspace) => set({
        currentWorkspace: workspace,
        lastOpenedWorkspaceId: workspace?.id ?? null,
      }),
      setSessions: (sessions) => set({ sessions }),
      setIsLoadingTerminals: (loading) => set({ isLoadingTerminals: loading }),
      setTerminalError: (error) => set({ terminalError: error }),
      updateWorkspaceList: (workspaces) => set({ workspaceList: workspaces }),
      addToWorkspaceList: (workspace) =>
        set((state) => ({
          workspaceList: [...state.workspaceList, workspace],
        })),
      setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
      updateAgentAllocation: (agent, count) =>
        set((state) => {
          if (!state.currentWorkspace) return state;
          return {
            currentWorkspace: {
              ...state.currentWorkspace,
              agentFleet: {
                ...state.currentWorkspace.agentFleet,
                allocation: {
                  ...state.currentWorkspace.agentFleet.allocation,
                  [agent]: count,
                },
              },
            },
          };
        }),
      markWorkspaceOpened: (workspaceId) =>
        set((state) => ({
          workspaceList: state.workspaceList.map((w) =>
            w.id === workspaceId
              ? { ...w, lastOpened: Date.now() }
              : w
          ),
        })),
      clearCurrentWorkspace: () =>
        set({
          currentWorkspace: null,
          view: "setup",
          sessions: [],
          isLoadingTerminals: false,
          activeSessionId: null,
          cliLaunchStates: {},
        }),

      toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),

      openWorkspace: (workspace) =>
        set((state) => {
          const existingIndex = state.openWorkspaces.findIndex(w => w.id === workspace.id);
          let newOpenWorkspaces;
          if (existingIndex >= 0) {
            newOpenWorkspaces = state.openWorkspaces;
          } else {
            newOpenWorkspaces = [...state.openWorkspaces, workspace];
          }
          return {
            openWorkspaces: newOpenWorkspaces,
            currentWorkspace: workspace,
            activeWorkspaceId: workspace.id,
            sessions: state.sessionsByWorkspace[workspace.id] || [],
            activeSessionId: state.activeSessionByWorkspace[workspace.id] ?? null,
          };
        }),

      closeWorkspace: (workspaceId) =>
        set((state) => {
          const remainingWorkspaces = state.openWorkspaces.filter(w => w.id !== workspaceId);
          const nextWorkspace = remainingWorkspaces.length > 0 ? remainingWorkspaces[0] : null;
          return {
            openWorkspaces: remainingWorkspaces,
            activeWorkspaceId: nextWorkspace?.id ?? null,
            currentWorkspace: nextWorkspace,
            sessions: nextWorkspace ? (state.sessionsByWorkspace[nextWorkspace.id] || []) : [],
            activeSessionId: nextWorkspace ? (state.activeSessionByWorkspace[nextWorkspace.id] ?? null) : null,
            view: remainingWorkspaces.length > 0 ? state.view : "setup",
          };
        }),

      switchWorkspace: (workspaceId) =>
        set((state) => {
          const workspace = state.openWorkspaces.find(w => w.id === workspaceId);
          if (!workspace) return state;
          return {
            activeWorkspaceId: workspaceId,
            currentWorkspace: workspace,
            sessions: state.sessionsByWorkspace[workspaceId] || [],
            activeSessionId: state.activeSessionByWorkspace[workspaceId] ?? null,
          };
        }),

      setSessionsForWorkspace: (workspaceId, sessions) =>
        set((state) => {
          const currentWorkspaceId = state.currentWorkspace?.id;
          return {
            sessionsByWorkspace: {
              ...state.sessionsByWorkspace,
              [workspaceId]: sessions,
            },
            sessions: currentWorkspaceId === workspaceId ? sessions : state.sessions,
          };
        }),

      setActiveSessionForWorkspace: (workspaceId, sessionId) =>
        set((state) => {
          const currentWorkspaceId = state.currentWorkspace?.id;
          return {
            activeSessionByWorkspace: {
              ...state.activeSessionByWorkspace,
              [workspaceId]: sessionId,
            },
            activeSessionId: currentWorkspaceId === workspaceId ? sessionId : state.activeSessionId,
          };
        }),

      closeAllWorkspaces: () =>
        set({
          openWorkspaces: [],
          activeWorkspaceId: null,
          currentWorkspace: null,
          sessions: [],
          sessionsByWorkspace: {},
          activeSessionByWorkspace: {},
          activeSessionId: null,
          view: "setup",
        }),

      setCliStatus: (agent, info) =>
        set((state) => ({
          cliStatuses: {
            ...state.cliStatuses,
            [agent]: info,
          },
        })),
      setCliStatuses: (statuses) => set({ cliStatuses: statuses }),
      setPrerequisites: (prereqs) => set({ prerequisites: prereqs }),
      setInstallInProgress: (agent) => set({ installInProgress: agent }),
      setLaunchState: (sessionId, state) =>
        set((prev) => ({
          cliLaunchStates: {
            ...prev.cliLaunchStates,
            [sessionId]: state,
          },
        })),
      setAuthInfo: (agent, info) =>
        set((prev) => ({
          authInfos: {
            ...prev.authInfos,
            [agent]: info,
          },
        })),
      toggleIde: (ide) =>
        set((state) => ({
          selectedIdes: state.selectedIdes.includes(ide)
            ? state.selectedIdes.filter((i) => i !== ide)
            : [...state.selectedIdes, ide],
        })),
      setSelectedIdes: (ides) => set({ selectedIdes: ides }),
      setIdeStatuses: (statuses) => set({ ideStatuses: statuses }),
    }),
    {
      name: 'yzpzcode-storage',
      partialize: (state) => ({
        cliStatuses: state.cliStatuses,
        theme: state.theme,
        selectedIdes: state.selectedIdes,
      }),
    }
  )
);
