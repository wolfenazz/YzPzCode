import React from 'react';
import type { AgentSubAgentActivity, AgentTeamProgressSummary } from '../../types';

interface TeamProgressPanelProps {
  team: AgentTeamProgressSummary | null;
  subAgents: AgentSubAgentActivity[];
}

const SubAgentStatusColor: Record<AgentSubAgentActivity['status'], string> = {
  running: 'text-[var(--accent)] animate-pulse',
  done: 'text-emerald-500',
  error: 'text-rose-500',
};

export const TeamProgressPanel: React.FC<TeamProgressPanelProps> = ({ team, subAgents }) => {
  if (!team) return null;

  const members = team.members ?? { total: 0, leadCount: 0, teammateCount: 0, byStatus: {} };
  const tasks = team.tasks ?? { total: 0, completionPct: 0, byStatus: {} };
  const runs = team.runs ?? { total: 0, activeRunIds: [], byStatus: {} };
  const completion = Math.round(tasks.completionPct ?? 0);

  return (
    <div className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/60 px-3 py-2 space-y-2">
      {/* Header + completion */}
      <div className="flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
          Team · {team.teamName}
        </span>
        <span className="ml-auto font-mono text-[9px] font-bold tabular-nums text-[var(--accent)]">
          {completion}%
        </span>
      </div>
      <div className="h-1 rounded-full bg-[var(--border-primary)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(2, completion))}%` }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2 py-1.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/60">Members</div>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--text-primary)] tabular-nums">
            {members.teammateCount ?? 0} <span className="text-[var(--text-secondary)]/50">team</span>
            <span className="text-[var(--text-secondary)]/30"> · </span>
            {members.leadCount ?? 0} <span className="text-[var(--text-secondary)]/50">lead</span>
          </div>
        </div>
        <div className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2 py-1.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/60">Tasks</div>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--text-primary)] tabular-nums">
            {tasks.total ?? 0}
            {tasks.byStatus?.in_progress ? (
              <span className="text-[var(--accent)]"> · {tasks.byStatus.in_progress} run</span>
            ) : null}
          </div>
        </div>
        <div className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2 py-1.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/60">Runs</div>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--text-primary)] tabular-nums">
            {runs.activeRunIds?.length ?? 0}
            <span className="text-[var(--text-secondary)]/50"> active</span>
          </div>
        </div>
      </div>

      {/* Sub-agent activity */}
      {subAgents.length > 0 && (
        <div className="space-y-1">
          <div className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/60">
            Sub-agents
          </div>
          {subAgents.slice(0, 6).map((a) => (
            <div key={`${a.agentId}-${a.ts}`} className="flex items-center gap-2 rounded-md bg-[var(--bg-main)] px-2 py-1 border border-[var(--border-primary)]/60">
              <span className={`font-mono text-[9px] ${SubAgentStatusColor[a.status]}`}>●</span>
              <span className="font-mono text-[9px] font-bold text-[var(--text-primary)] truncate max-w-[90px]">
                {a.agentId.slice(0, 8)}
              </span>
              <span
                className={`font-mono text-[8px] uppercase tracking-widest rounded-sm px-1 py-px flex-shrink-0 ${
                  a.role === 'lead' ? 'bg-[var(--accent-light)]/30 text-[var(--accent)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/70'
                }`}
              >
                {a.role}
              </span>
              <span className="font-mono text-[9px] text-[var(--text-secondary)] truncate">{a.task}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
