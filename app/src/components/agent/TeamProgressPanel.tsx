import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import type { AgentSubAgentActivity, AgentSubAgentEvent, AgentTeamProgressSummary } from '../../types';

interface TeamProgressPanelProps {
  team: AgentTeamProgressSummary | null;
  subAgents: AgentSubAgentActivity[];
  layout?: 'sidebar' | 'inline';
}

const STATUS_META: Record<AgentSubAgentActivity['status'], { label: string; icon: string; tone: string; iconTone: string }> = {
  running: {
    label: 'Working',
    icon: 'material-symbols:progress-activity-rounded',
    tone: 'border-[var(--accent-border)] bg-[var(--accent-light)]/10',
    iconTone: 'text-[var(--accent)]',
  },
  done: {
    label: 'Complete',
    icon: 'material-symbols:task-alt-rounded',
    tone: 'border-emerald-500/20 bg-emerald-500/[0.035]',
    iconTone: 'text-emerald-400',
  },
  error: {
    label: 'Needs attention',
    icon: 'material-symbols:error-outline-rounded',
    tone: 'border-rose-500/25 bg-rose-500/[0.045]',
    iconTone: 'text-rose-400',
  },
};

const EVENT_META: Record<AgentSubAgentEvent['kind'], { label: string; icon: string; tone: string }> = {
  message: { label: 'Update', icon: 'material-symbols:chat-bubble-outline-rounded', tone: 'text-[var(--text-secondary)]' },
  reasoning: { label: 'Reviewing', icon: 'material-symbols:psychology-alt-rounded', tone: 'text-[var(--text-secondary)]/75' },
  tool: { label: 'Using tool', icon: 'material-symbols:build-rounded', tone: 'text-[var(--text-secondary)]/75' },
  result: { label: 'Result', icon: 'material-symbols:check-circle-outline-rounded', tone: 'text-emerald-400' },
  status: { label: 'Status', icon: 'material-symbols:flag-rounded', tone: 'text-[var(--text-secondary)]' },
};

const shortId = (id: string): string => (id.length > 26 ? `${id.slice(0, 18)}…${id.slice(-5)}` : id);

/**
 * A compact control surface for delegated work. It summarizes teammate
 * activity instead of replaying complete event streams inside the lead chat.
 */
export const TeamProgressPanel: React.FC<TeamProgressPanelProps> = ({
  team,
  subAgents,
  layout = 'sidebar',
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(layout === 'sidebar');
  const isSidebar = layout === 'sidebar';
  const sortedAgents = useMemo(
    () => [...subAgents].sort((a, b) => {
      const priority = (status: AgentSubAgentActivity['status']) =>
        status === 'error' ? 0 : status === 'running' ? 1 : 2;
      return priority(a.status) - priority(b.status) || b.ts - a.ts;
    }),
    [subAgents],
  );
  const selectedAgent = sortedAgents.find((agent) => agent.agentId === selectedAgentId) ?? null;
  const activeCount = sortedAgents.filter((agent) => agent.status === 'running').length;
  const doneCount = sortedAgents.filter((agent) => agent.status === 'done').length;
  const errorCount = sortedAgents.filter((agent) => agent.status === 'error').length;
  const teammateCount = Math.max(
    team?.members?.teammateCount ?? 0,
    sortedAgents.filter((agent) => agent.role === 'teammate').length,
  );
  const recentEvents = selectedAgent ? [...selectedAgent.events].slice(-5).reverse() : [];
  const teamLabel = team?.teamName || 'Coordinator';
  const stateLabel = errorCount > 0
    ? `${errorCount} needs attention`
    : activeCount > 0
      ? `${activeCount} working`
      : doneCount > 0
        ? 'Team finished'
        : 'Ready to delegate';

  useEffect(() => {
    if (selectedAgentId && sortedAgents.some((agent) => agent.agentId === selectedAgentId)) return;
    setSelectedAgentId(
      sortedAgents.find((agent) => agent.status === 'error')?.agentId
      ?? sortedAgents.find((agent) => agent.status === 'running')?.agentId
      ?? sortedAgents[0]?.agentId
      ?? null,
    );
  }, [selectedAgentId, sortedAgents]);

  useEffect(() => {
    if (isSidebar) setIsOpen(true);
  }, [isSidebar]);

  return (
    <aside
      className={isSidebar
        ? 'flex h-full w-[296px] shrink-0 flex-col border-l border-[var(--border-primary)] bg-[var(--bg-secondary)]/55'
        : 'shrink-0 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/45'}
      aria-label="Delegated work"
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className={`premium-lift flex w-full items-center gap-2.5 px-3 text-left cursor-pointer ${
          isSidebar ? 'min-h-12 border-b border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]/35' : 'min-h-10 hover:bg-[var(--bg-tertiary)]/30'
        }`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
          errorCount > 0
            ? 'border-rose-500/30 bg-rose-500/[0.08] text-rose-400'
            : activeCount > 0
              ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/15 text-[var(--accent)]'
              : 'border-[var(--border-primary)] bg-[var(--bg-main)]/45 text-[var(--text-secondary)]'
        }`}>
          <Icon icon="material-symbols:account-tree-rounded" className={`h-4 w-4 ${activeCount > 0 ? 'animate-pulse' : ''}`} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{teamLabel}</span>
          <span className={`mt-0.5 block font-mono text-[8.5px] ${errorCount > 0 ? 'text-rose-400' : 'text-[var(--text-secondary)]/65'}`}>
            {stateLabel}
          </span>
        </span>
        {teammateCount > 0 && (
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-[var(--text-secondary)]/65" title="Teammates">
            {teammateCount}
          </span>
        )}
        <Icon
          icon={isOpen ? 'material-symbols:keyboard-arrow-up-rounded' : 'material-symbols:keyboard-arrow-down-rounded'}
          className="h-4 w-4 shrink-0 text-[var(--text-secondary)]/60"
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className={`min-h-0 ${isSidebar ? 'flex flex-1 flex-col' : ''}`}>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 font-mono text-[8.5px] text-[var(--text-secondary)]/65">
            <span><b className="font-semibold text-[var(--text-primary)]">{activeCount}</b> working</span>
            <span><b className="font-semibold text-emerald-400">{doneCount}</b> complete</span>
            {errorCount > 0 && <span><b className="font-semibold text-rose-400">{errorCount}</b> attention</span>}
          </div>

          {sortedAgents.length === 0 ? (
            <div className="mx-3 mb-3 rounded-md border border-dashed border-[var(--border-primary)] bg-[var(--bg-main)]/30 px-3 py-3">
              <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]/70">
                The lead will add teammates here when it delegates work.
              </p>
            </div>
          ) : (
            <div className={`custom-scrollbar premium-scrollbar px-2 pb-2 ${isSidebar ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
              <div className="space-y-1">
                {sortedAgents.map((agent) => {
                  const status = STATUS_META[agent.status];
                  const selected = selectedAgent?.agentId === agent.agentId;
                  return (
                    <div
                      key={agent.agentId}
                      className={`premium-surface overflow-hidden rounded-lg transition-colors duration-150 ${
                        selected ? status.tone : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedAgentId(selected ? null : agent.agentId)}
                        aria-expanded={selected}
                        className="flex w-full items-center gap-2 px-2.5 py-2 text-left cursor-pointer"
                      >
                        <Icon icon={status.icon} className={`h-4 w-4 shrink-0 ${status.iconTone} ${agent.status === 'running' ? 'animate-pulse' : ''}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <span className="truncate font-mono text-[9.5px] font-semibold text-[var(--text-primary)]">{shortId(agent.agentId)}</span>
                            <span className="font-mono text-[8px] text-[var(--text-secondary)]/50">{status.label}</span>
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[8.5px] text-[var(--text-secondary)]/70">{agent.lastActivity}</span>
                        </span>
                        <Icon
                          icon={selected ? 'material-symbols:expand-less-rounded' : 'material-symbols:expand-more-rounded'}
                          className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]/50"
                          aria-hidden="true"
                        />
                      </button>

                      {selected && (
                        <div className="border-t border-[var(--border-primary)]/65 bg-[var(--bg-main)]/25 px-2.5 py-2.5">
                          <div className="flex items-center gap-1.5 text-[var(--text-secondary)]/55">
                            <Icon icon="material-symbols:assignment-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em]">Assignment</span>
                          </div>
                          <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-primary)]/85">{agent.task}</p>

                          {recentEvents.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]/55">Recent activity</span>
                              {recentEvents.map((event) => {
                                const meta = EVENT_META[event.kind];
                                return (
                                  <div key={event.id} className="flex items-start gap-1.5">
                                    <Icon icon={meta.icon} className={`mt-0.5 h-3 w-3 shrink-0 ${meta.tone}`} aria-hidden="true" />
                                    <p className="min-w-0 break-words font-mono text-[8.5px] leading-relaxed text-[var(--text-secondary)]">
                                      <span className="mr-1 text-[var(--text-secondary)]/50">{meta.label}</span>
                                      {event.summary}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
