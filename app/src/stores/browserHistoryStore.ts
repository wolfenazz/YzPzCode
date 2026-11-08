import { create } from 'zustand';
import { EMPTY_WORKSPACE_HISTORY, type WorkspaceHistory } from '../components/workspace/browser/browserHistory';

interface BrowserHistoryState {
  /** Not persisted: the native session history ends with the webview. */
  byWorkspace: Record<string, WorkspaceHistory>;
  updateHistory: (workspaceId: string, change: (history: WorkspaceHistory) => WorkspaceHistory) => void;
}

export const useBrowserHistoryStore = create<BrowserHistoryState>((set) => ({
  byWorkspace: {},
  updateHistory: (workspaceId, change) => set((state) => ({
    byWorkspace: {
      ...state.byWorkspace,
      [workspaceId]: change(state.byWorkspace[workspaceId] ?? EMPTY_WORKSPACE_HISTORY),
    },
  })),
}));
