import React from 'react';
import type { AgentAccumulatedUsage } from '../../types';
import { formatTokens } from './UsageMeter';

interface ContextGaugeProps {
  usage: AgentAccumulatedUsage | null;
  aggregateUsage?: AgentAccumulatedUsage | null;
  contextWindow?: number | null;
  contextTokens?: number | null;
  /** Slim one-line readout (used when the pane is short). */
  slim?: boolean;
}

const formatCost = (c: number): string => {
  if (!Number.isFinite(c) || c <= 0) return '$0.00';
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
};

/**
 * Full-width context-window gauge shown under the agent header: tokens used,
 * capacity, a color-coded percentage bar, and total cost (plus team aggregate).
 */
export const ContextGauge: React.FC<ContextGaugeProps> = ({ usage, aggregateUsage, contextWindow, contextTokens, slim = false }) => {
  const ctx = contextWindow && contextWindow > 0 ? contextWindow : 200_000;
  const hasCurrentContext = typeof contextTokens === 'number';
  const total = contextTokens ?? 0;
  const pct = Math.min(100, (total / ctx) * 100);
  const warn = pct >= 90;
  const danger = pct >= 100;
  const hasAggregate = !!aggregateUsage;
  const aggregateCost = aggregateUsage?.totalCost ?? 0;

  return (
    <div className={`shrink-0 px-2.5 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/30 select-none ${slim ? 'py-1' : 'py-1.5'}`}>
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]/60 shrink-0">
          Context
        </span>
        <div
          className={`premium-track flex-1 min-w-0 ${slim ? 'h-1' : 'h-1.5'}`}
          title={hasCurrentContext
            ? `Current provider request: ${formatTokens(total)} / ${formatTokens(ctx)} tokens (${pct.toFixed(1)}%). This resets after compaction.`
            : 'Current provider context will appear after the next model request.'}
        >
          <div
            className={`premium-track-fill ${danger ? 'bg-rose-500' : warn ? 'bg-amber-400' : 'bg-[var(--accent)]'}`}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <span className={`font-mono font-bold tabular-nums shrink-0 ${slim ? 'text-[8px]' : 'text-[9px]'} ${danger ? 'text-rose-500' : warn ? 'text-amber-400' : 'text-[var(--text-primary)]'}`}>
          {hasCurrentContext ? `${formatTokens(total)} / ${formatTokens(ctx)}` : '—'}
        </span>
        <span className={`font-mono font-bold tabular-nums shrink-0 ${slim ? 'text-[8px]' : 'text-[9px]'} ${danger ? 'text-rose-500' : warn ? 'text-amber-400' : 'text-[var(--accent)]'}`}>
          {hasCurrentContext ? `${pct.toFixed(1)}%` : '—'}
        </span>
        {!slim && (
          <span className="font-mono text-[9px] tabular-nums text-[var(--text-secondary)] shrink-0" title="Total cost">
            {formatCost(usage?.totalCost ?? 0)}
          </span>
        )}
        {!slim && hasAggregate && aggregateCost > 0 && (
          <span className="font-mono text-[9px] tabular-nums text-[var(--text-secondary)]/60 shrink-0" title="Including team/aggregate cost">
            · team {formatCost(aggregateCost)}
          </span>
        )}
      </div>
    </div>
  );
};
