import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import type { AgentSubAgentActivity, AgentSubAgentEvent, AgentTeamProgressSummary } from '../../types';

interface TeamProgressPanelProps {
  team: AgentTeamProgressSummary | null;
  subAgents: AgentSubAgentActivity[];
}

const STATUS_META: Record<AgentSubAgentActivity['status'], { label: string; icon: string; className: string; surfaceClassName: string }> = {
  running: {
    label: 'Working',
    icon: 'material-symbols:progress-activity-rounded',
    className: 'text-[var(--accent)]',
    surfaceClassName: 'border-[var(--accent-border)] bg-[var(--accent-light)]/20',
  },
  done: {
    label: 'Done',
    icon: 'material-symbols:check-circle-rounded',
    className: 'text-emerald-500',
    surfaceClassName: 'border-emerald-900/50 bg-emerald-950/20',
  },
  error: {
    label: 'Needs attention',
    icon: 'material-symbols:error-rounded',
    className: 'text-rose-500',
    surfaceClassName: 'border-rose-900/50 bg-rose-950/20',
  },
};

const EVENT_META: Record<AgentSubAgentEvent['kind'], { label: string; icon: string; className: string }> = {
  message: { label: 'Update', icon: 'material-symbols:chat-rounded', className: 'text-sky-400' },
  reasoning: { label: 'Thinking', icon: 'material-symbols:psychology-rounded', className: 'text-violet-400' },
  tool: { label: 'Tool', icon: 'material-symbols:build-rounded', className: 'text-amber-400' },
  result: { label: 'Result', icon: 'material-symbols:task-alt-rounded', className: 'text-emerald-400' },
  status: { label: 'Status', icon: 'material-symbols:flag-rounded', className: 'text-[var(--accent)]' },
};

const shortId = (id: string): string => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

/**
 * Transparent orchestration control room. It remains present before the first
 * team event, then progressively reveals the work log of each teammate.
 */
export const TeamProgressPanel: React.FC<TeamProgressPanelProps> = ({ team, subAgents }) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const sortedAgents = useMemo(
    () => [...subAgents].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.ts - a.ts),
    [subAgents],
  );
  const selectedAgent = sortedAgents.find((agent) => agent.agentId === selectedAgentId) ?? null;
  const activeCount = sortedAgents.filter((agent) => agent.status === 'running').length;
  const doneCount = sortedAgents.filter((agent) => agent.status === 'done').length;
  const teammateCount = Math.max(team?.members?.teammateCount ?? 0, sortedAgents.filter((agent) => agent.role === 'teammate').length);
  const completion = team ? Math.round(team.tasks?.completionPct ?? 0) : sortedAgents.length > 0 ? Math.round((doneCount / sortedAgents.length) * 100) : 0;

  useEffect(() => {
    if (selectedAgentId && sortedAgents.some((agent) => agent.agentId === selectedAgentId)) return;
    setSelectedAgentId(sortedAgents.find((agent) => agent.status === 'running')?.agentId ?? sortedAgents[0]?.agentId ?? null);
  }, [selectedAgentId, sortedAgents]);

  return (
    <section className="border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/75 px-3 py-2.5" aria-label="Orchestration activity">
      <div className="flex items-center gap-2">
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)]/20 text-[var(--accent)]">
          <Icon icon="material-symbols:account-tree-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
          {activeCount > 0 && <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg-secondary)] animate-pulse" />}
        </span>
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Orchestration</div>
          <div className="font-mono text-[8px] text-[var(--text-secondary)]/65 truncate">
            {team?.teamName ?? 'Coordinator'} · {activeCount > 0 ? `${activeCount} teammate${activeCount === 1 ? '' : 's'} working` : 'Preparing team activity'}
          </div>
        </div>
        <span className="ml-auto font-mono text-[9px] font-bold tabular-nums text-[var(--accent)]">{completion}%</span>
      </div>

      <div className="mt-2 h-1 rounded-full bg-[var(--border-primary)] overflow-hidden" aria-label={`${completion}% complete`}>
        <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${Math.min(100, Math.max(2, completion))}%` }} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <div className="rounded-md bg-[var(--bg-main)]/65 px-2 py-1.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/55">Teammates</div>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--text-primary)] tabular-nums">{teammateCount}</div>
        </div>
        <div className="rounded-md bg-[var(--bg-main)]/65 px-2 py-1.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/55">Active</div>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--accent)] tabular-nums">{activeCount}</div>
        </div>
        <div className="rounded-md bg-[var(--bg-main)]/65 px-2 py-1.5">
          <div className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/55">Complete</div>
          <div className="mt-0.5 font-mono text-[10px] text-emerald-500 tabular-nums">{doneCount}</div>
        </div>
      </div>

      {sortedAgents.length === 0 ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-[var(--bg-main)]/60 px-2.5 py-2 text-[10px] text-[var(--text-secondary)]">
          <Icon icon="material-symbols:radar-rounded" className="h-3.5 w-3.5 shrink-0 text-[var(--accent)] animate-pulse" aria-hidden="true" />
          The coordinator will show each teammate here as soon as work is delegated.
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/60">Teammate activity</span>
            <span className="font-mono text-[8px] text-[var(--text-secondary)]/50">Select to inspect</span>
          </div>
          {sortedAgents.map((agent) => {
            const status = STATUS_META[agent.status];
            const selected = selectedAgent?.agentId === agent.agentId;
            return (
              <div key={agent.agentId} className={`rounded-md border transition-colors duration-150 ${selected ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/10' : 'border-[var(--border-primary)]/60 bg-[var(--bg-main)]/60 hover:bg-[var(--bg-tertiary)]/50'}`}>
                <button
                  type="button"
                  onClick={() => setSelectedAgentId(selected ? null : agent.agentId)}
                  aria-expanded={selected}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left cursor-pointer"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${status.surfaceClassName}`}>
                    <Icon icon={status.icon} className={`h-3 w-3 ${status.className} ${agent.status === 'running' ? 'animate-pulse' : ''}`} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[9px] font-bold text-[var(--text-primary)] truncate">{shortId(agent.agentId)}</span>
                      <span className="rounded-sm bg-[var(--bg-tertiary)] px-1 py-px font-mono text-[7px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/70">{agent.role}</span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[8.5px] leading-snug text-[var(--text-secondary)] truncate">{agent.lastActivity}</span>
                  </span>
                  <Icon icon={selected ? 'material-symbols:expand-less-rounded' : 'material-symbols:expand-more-rounded'} className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]/60" aria-hidden="true" />
                </button>

                {selected && (
                  <div className="border-t border-[var(--border-primary)]/60 px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <Icon icon="material-symbols:assignment-rounded" className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                      <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/60">Current work</span>
                    </div>
                    <p className="mt-1 font-mono text-[9px] leading-relaxed text-[var(--text-primary)]/85 break-words">{agent.task}</p>
                    <div className="mt-2 space-y-1.5" aria-label={`${agent.agentId} activity log`}>
                      {[...agent.events].reverse().map((event) => {
                        const meta = EVENT_META[event.kind];
                        return (
                          <div key={event.id} className="flex items-start gap-1.5">
                            <Icon icon={meta.icon} className={`mt-0.5 h-3 w-3 shrink-0 ${meta.className}`} aria-hidden="true" />
                            <div className="min-w-0">
                              <span className="font-mono text-[7.5px] uppercase tracking-widest text-[var(--text-secondary)]/50">{meta.label}</span>
                              <p className="font-mono text-[8.5px] leading-relaxed text-[var(--text-secondary)] break-words">{event.summary}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
