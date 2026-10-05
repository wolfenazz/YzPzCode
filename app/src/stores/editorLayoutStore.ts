import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type EditorGroup = 'primary' | 'secondary';
export type EditorLayout = 'single' | 'columns' | 'rows';
export interface EditorGroupState {
  primary: string | null;
  secondary: string | null;
  focused: EditorGroup;
  layout: EditorLayout;
  ratio: number;
}

export const createEditorGroups = (path: string | null = null): EditorGroupState => ({
  primary: path, secondary: null, focused: 'primary', layout: 'single', ratio: 50,
});

/** Keep panes valid after tab closure or workspace restoration. */
export function reconcileEditorGroups(groups: EditorGroupState, paths: string[], activePath: string | null): EditorGroupState {
  const available = new Set(paths);
  const fallback = activePath && available.has(activePath) ? activePath : paths[0] ?? null;
  const primary = groups.primary && available.has(groups.primary) ? groups.primary : fallback;
  const secondary = groups.secondary && available.has(groups.secondary)
    ? groups.secondary : paths.find((path) => path !== primary) ?? primary;
  return { ...groups, primary, secondary: groups.layout === 'single' ? null : secondary };
}

interface EditorLayoutStore {
  workspaces: Record<string, EditorGroupState>;
  updateGroups: (workspaceId: string, update: Partial<EditorGroupState>) => void;
}

export const useEditorLayoutStore = create<EditorLayoutStore>()(persist((set) => ({
  workspaces: {},
  updateGroups: (workspaceId, update) => set((state) => ({
    workspaces: { ...state.workspaces, [workspaceId]: { ...(state.workspaces[workspaceId] ?? createEditorGroups()), ...update } },
  })),
}), { name: 'yzpzcode-editor-layout', partialize: (state) => ({ workspaces: state.workspaces }) }));
