import React from 'react';
import type { AgentAccumulatedUsage } from '../../types';

interface UsageMeterProps {
  usage: AgentAccumulatedUsage | null;
  aggregateUsage?: AgentAccumulatedUsage | null;
  contextWindow?: number | null;
}

export const formatTokens = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
};

const formatCost = (c: number): string => {
  if (!Number.isFinite(c) || c <= 0) return '$0.00';
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
};

export const usageTotals = (u: AgentAccumulatedUsage | null | undefined): number => {
  if (!u) return 0;
  return (u.inputTokens ?? 0) + (u.outputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0);
};

export const contextPercent = (usage: AgentAccumulatedUsage | null | undefined, contextWindow: number | null | undefined): number => {
  const ctx = contextWindow && contextWindow > 0 ? contextWindow : 200_000;
  const total = usageTotals(usage);
  return Math.min(100, (total / ctx) * 100);
};

const Stat: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <span className={`flex items-baseline gap-1 ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
    <span className="font-mono text-[8px] uppercase tracking-widest opacity-70">{label}</span>
    <span className="font-mono text-[10px] font-bold tabular-nums">{value}</span>
  </span>
);

export const UsageMeter: React.FC<UsageMeterProps> = ({ usage, aggregateUsage, contextWindow }) => {
  const primary = usage ?? aggregateUsage ?? null;
  const showAggregate = !!aggregateUsage && !!usage;
  const ctx = contextWindow && contextWindow > 0 ? contextWindow : 200_000;
  const total = usageTotals(primary);
  const pct = Math.min(100, (total / ctx) * 100);
  const warn = pct >= 90;
  const danger = pct >= 100;

  if (!primary && !aggregateUsage) {
    return (
      <div className="flex items-center gap-2 px-2 py-0.5 rounded-sm bg-[var(--bg-tertiary)]/40">
        <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/50">usage</span>
        <span className="font-mono text-[9px] text-[var(--text-secondary)]/40">—</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1 rounded-sm bg-[var(--bg-tertiary)]/40 min-w-0"
      title={`Context window: ${formatTokens(ctx)} tokens — ${formatTokens(total)} / ${formatTokens(ctx)} (${pct.toFixed(1)}%)`}
    >
      <Stat label="in" value={formatTokens(primary?.inputTokens ?? 0)} />
      <Stat label="out" value={formatTokens(primary?.outputTokens ?? 0)} />
      <Stat label="cache" value={formatTokens((primary?.cacheReadTokens ?? 0) + (primary?.cacheWriteTokens ?? 0))} accent />
      <Stat label="cost" value={formatCost(primary?.totalCost ?? 0)} />
      {showAggregate && <Stat label="team" value={formatTokens(aggregateUsage?.inputTokens ?? 0)} />}
      <div className="flex items-center gap-1 flex-shrink-0">
        <div className="w-12 h-1 rounded-full bg-[var(--border-primary)] overflow-hidden" title="Context window usage">
          <div
            className={`h-full rounded-full transition-all duration-300 ${danger ? 'bg-rose-500' : warn ? 'bg-amber-400' : 'bg-[var(--accent)]'}`}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <span
          className={`font-mono text-[9px] font-bold tabular-nums ${danger ? 'text-rose-500' : warn ? 'text-amber-400' : 'text-[var(--text-secondary)]'}`}
          title={`${formatTokens(total)} / ${formatTokens(ctx)} tokens`}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
};
