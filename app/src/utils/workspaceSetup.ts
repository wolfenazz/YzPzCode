import type { AgentFleet, LayoutConfig } from '../types';

export function workspaceNameFromPath(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'Workspace';
}

export function fitFleetToLayout(fleet: AgentFleet, layout: LayoutConfig): AgentFleet {
  let remaining = layout.sessions;
  const allocation = { ...fleet.allocation };
  for (const cli of Object.keys(allocation) as Array<keyof typeof allocation>) {
    const count = Math.min(Math.max(0, allocation[cli] || 0), remaining);
    allocation[cli] = count;
    remaining -= count;
  }
  return { totalSlots: layout.sessions, allocation };
}
