import React, { useEffect, useId, useState } from 'react';
import type { AgentActivityState } from '../../utils/agentDoneNotifier';
import './AgentActivity.css';

/** How long the working ring keeps fading out after the run ends. */
const RING_FADE_MS = 700;

export const formatActivityDuration = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

/** Ticks once a second in its own component so the pane doesn't re-render. */
const Elapsed: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="term-activity__time">{formatActivityDuration(now - startedAt)}</span>;
};

/** The four-point star used by Gemini, filled with the working gradient. */
const Spark: React.FC = () => {
  const gradientId = useId();
  return (
    <svg className="term-activity__spark" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f8df7" />
          <stop offset="0.45" stopColor="#9b72cb" />
          <stop offset="0.75" stopColor="#d96570" />
          <stop offset="1" stopColor="#f5b11a" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5Z"
      />
    </svg>
  );
};

const DoneCheck: React.FC = () => (
  <svg className="term-activity__check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" pathLength={1} />
    <path d="m7.8 12.4 2.9 2.9 5.6-6.1" pathLength={1} />
  </svg>
);

/** Replaces the status pill while the agent works and right after it finishes. */
export const AgentActivityChip: React.FC<{ activity: AgentActivityState }> = ({ activity }) => {
  if (activity.phase === 'busy') {
    return (
      <span className="term-activity term-activity--busy" role="status" title="The agent is working on a task">
        <Spark />
        <span className="term-activity__label">Working</span>
        <Elapsed startedAt={activity.startedAt} />
      </span>
    );
  }
  if (activity.phase === 'done') {
    // Zero when the start of the run was missed; show no time rather than "0s".
    const duration = activity.durationMs > 0 ? formatActivityDuration(activity.durationMs) : null;
    return (
      <span
        key={activity.finishedAt}
        className="term-activity term-activity--done"
        role="status"
        title={duration ? `The agent finished its task in ${duration}` : 'The agent finished its task'}
      >
        <DoneCheck />
        <span className="term-activity__label">Done</span>
        {duration && <span className="term-activity__time">{duration}</span>}
      </span>
    );
  }
  return null;
};

/**
 * Light layer drawn over the pane edges: a rotating Gemini-colored ring with a
 * soft inner glow while the agent works, and an emerald sweep when it is done.
 * The rotating layers only exist while needed so idle panes cost nothing.
 */
export const AgentActivityAura: React.FC<{ activity: AgentActivityState }> = ({ activity }) => {
  const busy = activity.phase === 'busy';
  const [ringMounted, setRingMounted] = useState(busy);
  const [lastFinishedAt, setLastFinishedAt] = useState<number | null>(null);

  const finishedAt = activity.phase === 'done' ? activity.finishedAt : null;
  useEffect(() => {
    if (finishedAt !== null) setLastFinishedAt(finishedAt);
  }, [finishedAt]);

  useEffect(() => {
    if (activity.phase === 'busy') {
      setRingMounted(true);
      return;
    }
    // Let the layers fade out before removing them; a finished outline stays
    // until the done state itself is cleared.
    const idle = activity.phase === 'idle';
    const timer = setTimeout(() => {
      setRingMounted(false);
      if (idle) setLastFinishedAt(null);
    }, RING_FADE_MS);
    return () => clearTimeout(timer);
  }, [activity.phase]);

  if (!ringMounted && lastFinishedAt === null) return null;

  return (
    <div className="term-aura" data-phase={activity.phase} aria-hidden="true">
      {ringMounted && (
        <>
          <div className="term-aura__glow">
            <div className="term-aura__band term-aura__band--glow">
              <span className="term-aura__spin" />
            </div>
          </div>
          <div className="term-aura__band term-aura__band--ring">
            <span className="term-aura__spin" />
          </div>
        </>
      )}
      {lastFinishedAt !== null && (
        <React.Fragment key={lastFinishedAt}>
          <div className="term-aura__ripple" />
          <div className="term-aura__band term-aura__band--done">
            <span className="term-aura__sweep" />
          </div>
        </React.Fragment>
      )}
    </div>
  );
};
