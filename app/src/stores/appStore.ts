import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AgentType, WorkspaceConfig, TerminalSession, AgentCliInfo, PrerequisiteStatus, IdeType, IdeInfo, FileTab, GitFileStatus, GitDiffStat, CliLaunchState, AuthInfo } from '../types';

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
  cliLaunchStates: Record<string, CliLaunchState | null>;
  authInfos: Record<AgentType, AuthInfo | null>;
  theme: "dark" | "light";
  selectedIdes: IdeType[];
  ideStatuses: Record<IdeType, IdeInfo | null>;
  autoSave: boolean;
  showMinimap: boolean;
  independentResize: boolean;

  setView: (view: "setup" | "workspace" | "docs") => void;
  setViewWithPrevious: (view: "docs") => void;
  setCurrentWorkspace: (workspace: WorkspaceConfig | null) => void;
  setSessions: (sessions: TerminalSession[]) => void;
  addSession: (session: TerminalSession) => void;
  removeSession: (sessionId: string) => void;
  setIsLoadingTerminals: (loading: boolean) => void;
  updateWorkspaceList: (workspaces: WorkspaceConfig[]) => void;
  addToWorkspaceList: (workspace: WorkspaceConfig) => void;
  setActiveSession: (sessionId: string | null) => void;
  updateAgentAllocation: (agent: AgentType, count: number) => void;
  markWorkspaceOpened: (workspaceId: string) => void;
  reorderSessions: (fromIndex: number, toIndex: number) => void;
  clearCurrentWorkspace: () => void;
  toggleTheme: () => void;
  setAutoSave: (enabled: boolean) => void;
  setShowMinimap: (show: boolean) => void;
  toggleIndependentResize: () => void;

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
  setLaunchState: (sessionId: string, state: CliLaunchState | null) => void;
  setAuthInfo: (agent: AgentType, info: AuthInfo | null) => void;
  toggleIde: (ide: IdeType) => void;
  setSelectedIdes: (ides: IdeType[]) => void;
  setIdeStatuses: (statuses: Record<IdeType, IdeInfo | null>) => void;

  explorerOpen: boolean;
  activeView: "terminal" | "editor";
  openFiles: FileTab[];
  activeFilePath: string | null;
  gitStatuses: GitFileStatus[];
  gitDiffStats: GitDiffStat[];
  filesByWorkspace: Record<string, FileTab[]>;
  activeFileByWorkspace: Record<string, string | null>;
  activeViewByWorkspace: Record<string, "terminal" | "editor">;
  explorerClipboard: { operation: 'copy' | 'cut'; path: string; name: string; isDir: boolean } | null;
  recentDirectories: string[];
  addRecentDirectory: (path: string) => void;
  clearRecentDirectories: () => void;
  toggleExplorer: () => void;
  setExplorerClipboard: (entry: { operation: 'copy' | 'cut'; path: string; name: string; isDir: boolean } | null) => void;
  setActiveView: (view: "terminal" | "editor") => void;
  openFileTab: (tab: FileTab) => void;
  closeFileTab: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileSaved: (path: string) => void;
  setGitStatuses: (statuses: GitFileStatus[]) => void;
  setGitDiffStats: (stats: GitDiffStat[]) => void;
  closeAllFiles: () => void;
  closeOtherFiles: (exceptPath: string) => void;
  closeFilesToRight: (path: string) => void;
  closeSavedFiles: () => void;
  reorderOpenFiles: (fromIndex: number, toIndex: number) => void;
}

const initialCliStatuses: Record<AgentType, AgentCliInfo | null> = {
  claude: null,
  codex: null,
  gemini: null,
  opencode: null,
  cursor: null,
  kilo: null,
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
      cliLaunchStates: {} as Record<string, CliLaunchState | null>,
      authInfos: {} as Record<AgentType, AuthInfo | null>,
      theme: "dark",
      selectedIdes: [],
      autoSave: true,
      showMinimap: true,
      independentResize: false,
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
      addSession: (session) =>
        set((state) => {
          const wsId = state.activeWorkspaceId;
          const currentWs = wsId ? (state.sessionsByWorkspace[wsId] || []) : [];
          const newWsSessions = [...currentWs, session];
          return {
            sessions: [...state.sessions, session],
            sessionsByWorkspace: wsId
              ? { ...state.sessionsByWorkspace, [wsId]: newWsSessions }
              : state.sessionsByWorkspace,
          };
        }),
      removeSession: (sessionId) =>
        set((state) => {
          const wsId = state.activeWorkspaceId;
          const filteredSessions = state.sessions.filter((s) => s.id !== sessionId);
          
          let updatedByWorkspace = state.sessionsByWorkspace;
          let finalSessions = filteredSessions;

          if (wsId) {
            const currentWs = state.sessionsByWorkspace[wsId] || [];
            const workspaceFiltered = currentWs.filter((s) => s.id !== sessionId)
              .sort((a, b) => a.index - b.index)
              .map((s, idx) => ({ ...s, index: idx }));
            
            updatedByWorkspace = {
              ...state.sessionsByWorkspace,
              [wsId]: workspaceFiltered,
            };

            // Sync global sessions list with re-indexed workspace sessions
            finalSessions = filteredSessions.map(s => {
              const updated = workspaceFiltered.find(u => u.id === s.id);
              return updated || s;
            });
          }

          return {
            sessions: finalSessions,
            sessionsByWorkspace: updatedByWorkspace,
            activeSessionId:
              state.activeSessionId === sessionId ? null : state.activeSessionId,
          };
        }),
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
      reorderSessions: (fromIndex, toIndex) =>
        set((state) => {
          const wsId = state.activeWorkspaceId;
          const sessions = wsId ? (state.sessionsByWorkspace[wsId] || []) : state.sessions;
          const sorted = [...sessions].sort((a, b) => a.index - b.index);
          if (fromIndex < 0 || fromIndex >= sorted.length || toIndex < 0 || toIndex >= sorted.length) return state;
          [sorted[fromIndex], sorted[toIndex]] = [sorted[toIndex], sorted[fromIndex]];
          const reindexed = sorted.map((s, idx) => ({ ...s, index: idx }));
          const updatedByWorkspace = wsId
            ? { ...state.sessionsByWorkspace, [wsId]: reindexed }
            : state.sessionsByWorkspace;
          return {
            sessions: reindexed,
            sessionsByWorkspace: updatedByWorkspace,
          };
        }),

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
      setAutoSave: (enabled) => set({ autoSave: enabled }),
      setShowMinimap: (show) => set({ showMinimap: show }),
      toggleIndependentResize: () => set((state) => ({ independentResize: !state.independentResize })),

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
            openFiles: state.filesByWorkspace[workspace.id] || [],
            activeFilePath: state.activeFileByWorkspace[workspace.id] ?? null,
            activeView: state.activeViewByWorkspace[workspace.id] || "terminal",
          };
        }),

      closeWorkspace: (workspaceId) =>
        set((state) => {
          const remainingWorkspaces = state.openWorkspaces.filter(w => w.id !== workspaceId);
          const nextWorkspace = remainingWorkspaces.length > 0 ? remainingWorkspaces[0] : null;
          const nextId = nextWorkspace?.id ?? null;
          return {
            openWorkspaces: remainingWorkspaces,
            activeWorkspaceId: nextId,
            currentWorkspace: nextWorkspace,
            sessions: nextWorkspace ? (state.sessionsByWorkspace[nextWorkspace.id] || []) : [],
            activeSessionId: nextWorkspace ? (state.activeSessionByWorkspace[nextWorkspace.id] ?? null) : null,
            view: remainingWorkspaces.length > 0 ? state.view : "setup",
            openFiles: nextId ? (state.filesByWorkspace[nextId] || []) : [],
            activeFilePath: nextId ? (state.activeFileByWorkspace[nextId] ?? null) : null,
            activeView: nextId ? (state.activeViewByWorkspace[nextId] || "terminal") : "terminal",
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
            openFiles: state.filesByWorkspace[workspaceId] || [],
            activeFilePath: state.activeFileByWorkspace[workspaceId] ?? null,
            activeView: state.activeViewByWorkspace[workspaceId] || "terminal",
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
          openFiles: [],
          activeFilePath: null,
          activeView: "terminal",
          filesByWorkspace: {},
          activeFileByWorkspace: {},
          activeViewByWorkspace: {},
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

      explorerOpen: true,
      activeView: "terminal",
      openFiles: [],
      activeFilePath: null,
      gitStatuses: [],
      gitDiffStats: [],
      filesByWorkspace: {} as Record<string, FileTab[]>,
      activeFileByWorkspace: {} as Record<string, string | null>,
      activeViewByWorkspace: {} as Record<string, "terminal" | "editor">,
      explorerClipboard: null,
      recentDirectories: [],

      toggleExplorer: () => set((state) => ({ explorerOpen: !state.explorerOpen })),
      setExplorerClipboard: (entry) => set({ explorerClipboard: entry }),

      addRecentDirectory: (path) =>
        set((state) => {
          const filtered = state.recentDirectories.filter((p) => p !== path);
          return { recentDirectories: [path, ...filtered].slice(0, 10) };
        }),

      clearRecentDirectories: () => set({ recentDirectories: [] }),

      setActiveView: (view) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return { activeView: view };
          return {
            activeView: view,
            activeViewByWorkspace: {
              ...state.activeViewByWorkspace,
              [wsId]: view,
            },
          };
        }),

      openFileTab: (tab) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return state;
          const currentFiles = state.filesByWorkspace[wsId] || [];
          const existing = currentFiles.find((f) => f.path === tab.path);
          const newFiles = existing ? currentFiles : [...currentFiles, tab];
          return {
            openFiles: newFiles,
            activeFilePath: tab.path,
            activeView: "editor" as const,
            activeWorkspaceId: state.activeWorkspaceId ?? wsId,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: newFiles,
            },
            activeFileByWorkspace: {
              ...state.activeFileByWorkspace,
              [wsId]: tab.path,
            },
            activeViewByWorkspace: {
              ...state.activeViewByWorkspace,
              [wsId]: "editor" as const,
            },
          };
        }),

      closeFileTab: (path) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return state;
          const currentFiles = state.filesByWorkspace[wsId] || [];
          const idx = currentFiles.findIndex((f) => f.path === path);
          const newFiles = currentFiles.filter((f) => f.path !== path);
          let newActive: string | null = state.activeFileByWorkspace[wsId] ?? null;
          if (newActive === path) {
            if (newFiles.length === 0) {
              newActive = null;
            } else if (idx > 0) {
              newActive = newFiles[idx - 1].path;
            } else {
              newActive = newFiles[0].path;
            }
          }
          const newView = newFiles.length === 0 ? "terminal" as const : (state.activeViewByWorkspace[wsId] || "editor") as "terminal" | "editor";
          return {
            openFiles: newFiles,
            activeFilePath: newActive,
            activeView: newView,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: newFiles,
            },
            activeFileByWorkspace: {
              ...state.activeFileByWorkspace,
              [wsId]: newActive,
            },
            activeViewByWorkspace: {
              ...state.activeViewByWorkspace,
              [wsId]: newView,
            },
          };
        }),

      setActiveFile: (path) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return { activeFilePath: path };
          return {
            activeFilePath: path,
            activeFileByWorkspace: {
              ...state.activeFileByWorkspace,
              [wsId]: path,
            },
          };
        }),

      updateFileContent: (path, content) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return state;
          const currentFiles = state.filesByWorkspace[wsId] || [];
          const newFiles = currentFiles.map((f) =>
            f.path === path
              ? { ...f, content, isDirty: f.originalContent !== content }
              : f
          );
          return {
            openFiles: newFiles,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: newFiles,
            },
          };
        }),

      markFileSaved: (path) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return state;
          const currentFiles = state.filesByWorkspace[wsId] || [];
          const newFiles = currentFiles.map((f) =>
            f.path === path
              ? { ...f, originalContent: f.content, isDirty: false }
              : f
          );
          return {
            openFiles: newFiles,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: newFiles,
            },
          };
        }),

      setGitStatuses: (statuses) => set({ gitStatuses: statuses }),
      setGitDiffStats: (stats: GitDiffStat[]) => set({ gitDiffStats: stats }),

      closeAllFiles: () =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return { openFiles: [], activeFilePath: null };
          return {
            openFiles: [],
            activeFilePath: null,
            activeView: "terminal" as const,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: [],
            },
            activeFileByWorkspace: {
              ...state.activeFileByWorkspace,
              [wsId]: null,
            },
            activeViewByWorkspace: {
              ...state.activeViewByWorkspace,
              [wsId]: "terminal" as const,
            },
          };
        }),

      closeOtherFiles: (exceptPath) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return state;
          const currentFiles = state.filesByWorkspace[wsId] || [];
          const newFiles = currentFiles.filter((f) => f.path === exceptPath);
          return {
            openFiles: newFiles,
            activeFilePath: exceptPath,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: newFiles,
            },
            activeFileByWorkspace: {
              ...state.activeFileByWorkspace,
              [wsId]: exceptPath,
            },
          };
        }),

      closeFilesToRight: (path) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return state;
          const currentFiles = state.filesByWorkspace[wsId] || [];
          const idx = currentFiles.findIndex((f) => f.path === path);
          if (idx < 0) return state;
          const newFiles = currentFiles.slice(0, idx + 1);
          const currentActive = state.activeFileByWorkspace[wsId];
          let newActive = currentActive ?? null;
          if (currentActive && !newFiles.find((f) => f.path === currentActive)) {
            newActive = newFiles[newFiles.length - 1]?.path ?? null;
          }
          return {
            openFiles: newFiles,
            activeFilePath: newActive,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: newFiles,
            },
            activeFileByWorkspace: {
              ...state.activeFileByWorkspace,
              [wsId]: newActive,
            },
          };
        }),

      closeSavedFiles: () =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return state;
          const currentFiles = state.filesByWorkspace[wsId] || [];
          const newFiles = currentFiles.filter((f) => f.isDirty);
          const currentActive = state.activeFileByWorkspace[wsId];
          let newActive = currentActive ?? null;
          if (currentActive && !newFiles.find((f) => f.path === currentActive)) {
            newActive = newFiles[newFiles.length - 1]?.path ?? null;
          }
          return {
            openFiles: newFiles,
            activeFilePath: newActive,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: newFiles,
            },
            activeFileByWorkspace: {
              ...state.activeFileByWorkspace,
              [wsId]: newActive,
            },
          };
        }),

      reorderOpenFiles: (fromIndex, toIndex) =>
        set((state) => {
          const wsId = state.activeWorkspaceId ?? state.currentWorkspace?.id ?? null;
          if (!wsId) return state;
          const currentFiles = state.filesByWorkspace[wsId] || [];
          if (fromIndex < 0 || fromIndex >= currentFiles.length || toIndex < 0 || toIndex >= currentFiles.length) return state;
          const newFiles = [...currentFiles];
          const [moved] = newFiles.splice(fromIndex, 1);
          newFiles.splice(toIndex, 0, moved);
          return {
            openFiles: newFiles,
            filesByWorkspace: {
              ...state.filesByWorkspace,
              [wsId]: newFiles,
            },
          };
        }),
    }),
    {
      name: 'yzpzcode-storage',
      partialize: (state) => ({
        cliStatuses: state.cliStatuses,
        theme: state.theme,
        selectedIdes: state.selectedIdes,
        autoSave: state.autoSave,
        showMinimap: state.showMinimap,
        independentResize: state.independentResize,
        recentDirectories: state.recentDirectories,
      }),
    }
  )
);
