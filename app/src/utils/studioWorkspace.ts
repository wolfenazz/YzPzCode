// Hands a file to a studio (Writing, Presentation, Sheets) from anywhere: the studio's own
// workspace when one is open or known, else a new one at the shared studio folder.

import { useAppStore } from '../stores/appStore';
import type { AgentFleet, WorkspaceConfig, WorkspaceKind } from '../types';
import { getStudioRoot } from './studioRoot';
import { studioDefaultName } from './workspaceSetup';

export type StudioKind = Extract<WorkspaceKind, 'writing' | 'presentation' | 'sheets'>;

/** A studio workspace starts without terminals; the studio runs the AI CLIs headlessly. */
const zeroFleet = (template: AgentFleet): AgentFleet => ({
  totalSlots: 0,
  allocation: Object.fromEntries(Object.keys(template.allocation).map((key) => [key, 0])) as AgentFleet['allocation'],
});

async function studioWorkspaceFor(kind: StudioKind, template: WorkspaceConfig): Promise<WorkspaceConfig> {
  const app = useAppStore.getState();
  const known = app.openWorkspaces.find((candidate) => candidate.kind === kind)
    ?? app.workspaceList.find((candidate) => candidate.kind === kind);
  if (known) return known;
  const workspace: WorkspaceConfig = {
    id: crypto.randomUUID(),
    name: studioDefaultName(kind),
    path: await getStudioRoot(),
    layout: { type: 'grid', sessions: 0 },
    agentFleet: zeroFleet(template.agentFleet),
    createdAt: Date.now(),
    kind,
  };
  app.addToWorkspaceList(workspace);
  return workspace;
}

/**
 * Brings the studio of `kind` to the front and returns its workspace id, so the caller can
 * post its request. The current workspace is kept when it already is that studio.
 */
export async function focusStudio(kind: StudioKind, current: WorkspaceConfig): Promise<string> {
  const app = useAppStore.getState();
  if (current.kind === kind) return current.id;
  const target = await studioWorkspaceFor(kind, current);
  if (app.openWorkspaces.some((candidate) => candidate.id === target.id)) app.switchWorkspace(target.id);
  else app.openWorkspace(target);
  app.setView('workspace');
  return target.id;
}
