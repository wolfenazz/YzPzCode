// Which view a workspace opens on. Dependency-free so it can be tested without
// Tauri (`npm run test:workspace-view`); the store and `App.tsx` call it.

import type { WorkspaceConfig, WorkspaceView } from '../types';

type KindOnly = Pick<WorkspaceConfig, 'kind'> | null | undefined;

const isStudio = (workspace: KindOnly): boolean => workspace?.kind === 'writing' || workspace?.kind === 'presentation' || workspace?.kind === 'sheets';

/** The view a workspace falls back to when it has nothing else to show. */
export const homeViewFor = (workspace: KindOnly): WorkspaceView =>
  workspace?.kind === 'writing' ? 'writing' : workspace?.kind === 'presentation' ? 'presentation' : workspace?.kind === 'sheets' ? 'sheets' : 'terminal';

/**
 * The view a workspace reopens on: the one it was left on, when that view still
 * exists for it. A studio has no terminal until one is opened in it and no
 * extensions, so a saved `terminal` there (stored by an older start-up that put
 * every workspace on the terminal grid) falls back to the studio itself.
 */
export const resolveWorkspaceView = (saved: WorkspaceView | undefined, workspace: KindOnly, sessionCount: number): WorkspaceView => {
  const home = homeViewFor(workspace);
  if (!saved) return home;
  if (!isStudio(workspace)) return saved;
  const allowed: WorkspaceView[] = [home, 'editor', 'browser'];
  if (sessionCount > 0) allowed.push('terminal');
  return allowed.includes(saved) ? saved : home;
};
