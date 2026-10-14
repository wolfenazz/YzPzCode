import React from 'react';
import { Table } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { useSheetsSessionStore } from '../../stores/sheetsSessionStore';
import type { AgentFleet, WorkspaceConfig } from '../../types';
import { getStudioRoot } from '../../utils/studioRoot';

/** A studio workspace starts without terminals; the studio runs the AI CLIs headlessly. */
const zeroFleet = (template: AgentFleet): AgentFleet => ({
  totalSlots: 0,
  allocation: Object.fromEntries(Object.keys(template.allocation).map((key) => [key, 0])) as AgentFleet['allocation'],
});

/** Finds a sheets workspace to open the file in, creating one at the studio root when needed. */
async function sheetsWorkspaceFor(template: WorkspaceConfig): Promise<WorkspaceConfig> {
  const app = useAppStore.getState();
  const open = app.openWorkspaces.find((candidate) => candidate.kind === 'sheets');
  if (open) return open;
  const known = [...app.openWorkspaces, ...app.workspaceList].find((candidate) => candidate.kind === 'sheets');
  if (known) return known;
  const workspace: WorkspaceConfig = {
    id: crypto.randomUUID(),
    name: 'Sheets studio',
    path: await getStudioRoot(),
    layout: { type: 'grid', sessions: 0 },
    agentFleet: zeroFleet(template.agentFleet),
    createdAt: Date.now(),
    kind: 'sheets',
  };
  app.addToWorkspaceList(workspace);
  return workspace;
}

/**
 * Hands a spreadsheet file from the Files view to the Sheets studio. Outside
 * sheets workspaces the button switches to (or creates) a sheets workspace
 * instead of hiding. Hidden while read-only or with no workspace to act on.
 */
export const OpenInSheetsButton: React.FC<{ path: string; className?: string; readOnly?: boolean }> = ({ path, className, readOnly }) => {
  const workspace = useAppStore((state) => state.currentWorkspace);
  if (!workspace || readOnly) return null;
  const open = async (): Promise<void> => {
    const app = useAppStore.getState();
    const sheets = useSheetsSessionStore.getState();
    if (workspace.kind === 'sheets') {
      sheets.request(workspace.id, path);
      app.setActiveView('sheets');
      return;
    }
    const target = await sheetsWorkspaceFor(workspace);
    if (app.openWorkspaces.some((candidate) => candidate.id === target.id)) app.switchWorkspace(target.id);
    else app.openWorkspace(target);
    app.setView('workspace');
    sheets.request(target.id, path);
    app.setActiveView('sheets');
  };
  return (
    <button
      type="button"
      className={className ?? 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer'}
      onClick={() => void open().catch((error: unknown) => console.error('Could not open in Sheets studio:', error))}
    >
      <Table size={13} weight="fill" />
      Open in Sheets studio
    </button>
  );
};
