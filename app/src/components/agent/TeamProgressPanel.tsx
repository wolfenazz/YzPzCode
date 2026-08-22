import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowsIn,
  ArrowsOut,
  Brain,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ChatCircle,
  CheckCircle,
  CircleNotch,
  ClipboardText,
  DotsSixVertical,
  Flag,
  ShareNetwork,
  WarningCircle,
  Wrench,
} from '@phosphor-icons/react';
import type { AgentSubAgentActivity, AgentSubAgentEvent, AgentTeamProgressSummary } from '../../types';

interface TeamProgressPanelProps {
  team: AgentTeamProgressSummary | null;
  subAgents: AgentSubAgentActivity[];
  containerWidth: number;
  visible: boolean;
}

const DEFAULT_PANEL_WIDTH = 340;
const MIN_PANEL_WIDTH = 280;
const PANEL_EDGE_TAB_WIDTH = 40;

const STATUS_META: Record<AgentSubAgentActivity['status'], { label: string; icon: React.ReactNode; tone: string; iconTone: string }> = {
  running: {
    label: 'Working',
    icon: <CircleNotch size={16} weight="bold" />,
    tone: 'border-[var(--accent-border)] bg-[var(--accent-light)]/10',
    iconTone: 'text-[var(--accent)]',
  },
  done: {
    label: 'Complete',
    icon: <CheckCircle size={16} />,
    tone: 'border-emerald-500/20 bg-emerald-500/[0.035]',
    iconTone: 'text-emerald-400',
  },
  error: {
    label: 'Needs attention',
    icon: <WarningCircle size={16} />,
    tone: 'border-rose-500/25 bg-rose-500/[0.045]',
    iconTone: 'text-rose-400',
  },
};

const EVENT_META: Record<AgentSubAgentEvent['kind'], { label: string; icon: React.ReactNode; tone: string }> = {
  message: { label: 'Update', icon: <ChatCircle size={12} />, tone: 'text-[var(--text-secondary)]' },
  reasoning: { label: 'Reviewing', icon: <Brain size={12} />, tone: 'text-[var(--text-secondary)]/75' },
  tool: { label: 'Using tool', icon: <Wrench size={12} />, tone: 'text-[var(--text-secondary)]/75' },
  result: { label: 'Result', icon: <CheckCircle size={12} />, tone: 'text-emerald-400' },
  status: { label: 'Status', icon: <Flag size={12} />, tone: 'text-[var(--text-secondary)]' },
};

const shortId = (id: string): string => (id.length > 26 ? `${id.slice(0, 18)}…${id.slice(-5)}` : id);

/**
 * A compact control surface for delegated work. It summarizes teammate
 * activity instead of replaying complete event streams inside the lead chat.
 */
export const TeamProgressPanel: React.FC<TeamProgressPanelProps> = ({
  team,
  subAgents,
  containerWidth,
  visible,
}) => {
  const panelId = useId();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(subAgents.length > 0);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const restoreWidthRef = useRef(DEFAULT_PANEL_WIDTH);
  const hasAutoOpenedRef = useRef(subAgents.length > 0);
  const maxPanelWidth = containerWidth > 0
    ? Math.max(220, Math.floor(containerWidth - PANEL_EDGE_TAB_WIDTH))
    : 560;
  const minPanelWidth = Math.min(MIN_PANEL_WIDTH, maxPanelWidth);
  const resolvedWidth = isMaximized
    ? maxPanelWidth
    : Math.min(Math.max(panelWidth, minPanelWidth), maxPanelWidth);
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
    if (subAgents.length === 0 || hasAutoOpenedRef.current) return;
    hasAutoOpenedRef.current = true;
    setIsOpen(true);
  }, [subAgents.length]);

  useEffect(() => {
    if (isMaximized) return;
    setPanelWidth((current) => Math.min(Math.max(current, minPanelWidth), maxPanelWidth));
  }, [isMaximized, maxPanelWidth, minPanelWidth]);

  useEffect(() => {
    if (!isResizing) return undefined;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizing]);

  const toggleMaximized = useCallback(() => {
    if (isMaximized) {
      setPanelWidth(Math.min(Math.max(restoreWidthRef.current, minPanelWidth), maxPanelWidth));
      setIsMaximized(false);
      return;
    }
    restoreWidthRef.current = resolvedWidth;
    setIsMaximized(true);
    setIsOpen(true);
  }, [isMaximized, maxPanelWidth, minPanelWidth, resolvedWidth]);

  const minimizePanel = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => toggleButtonRef.current?.focus());
  }, []);

  const handlePanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    minimizePanel();
  }, [minimizePanel]);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: resolvedWidth,
    };
    setIsMaximized(false);
    setIsResizing(true);
  }, [resolvedWidth]);

  const handleResizeMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    const nextWidth = resizeState.startWidth + (resizeState.startX - event.clientX);
    setPanelWidth(Math.min(Math.max(nextWidth, minPanelWidth), maxPanelWidth));
  }, [maxPanelWidth, minPanelWidth]);

  const handleResizeEnd = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (resizeStateRef.current?.pointerId !== event.pointerId) return;
    resizeStateRef.current = null;
    setIsResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 48 : 16;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setIsMaximized(false);
      setPanelWidth((current) => Math.min(current + step, maxPanelWidth));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setIsMaximized(false);
      setPanelWidth((current) => Math.max(current - step, minPanelWidth));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setIsMaximized(false);
      setPanelWidth(minPanelWidth);
    } else if (event.key === 'End') {
      event.preventDefault();
      restoreWidthRef.current = resolvedWidth;
      setIsMaximized(true);
    }
  }, [maxPanelWidth, minPanelWidth, resolvedWidth]);

  if (!visible) return null;

  return (
    <aside
      className={`absolute inset-y-2 right-0 z-30 flex flex-col overflow-visible ${
        isResizing ? 'transition-none' : 'transition-[transform,width] duration-300 ease-out motion-reduce:transition-none'
      } ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ width: resolvedWidth }}
      aria-label="Delegated work"
      onKeyDown={handlePanelKeyDown}
    >
      <button
        ref={toggleButtonRef}
        type="button"
        onClick={() => (isOpen ? minimizePanel() : setIsOpen(true))}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={`absolute left-[-36px] top-5 flex h-[76px] w-9 flex-col items-center justify-center gap-1.5 rounded-l-lg border border-r-0 bg-[var(--bg-secondary)] shadow-[-8px_0_24px_rgba(0,0,0,0.2)] transition-colors cursor-pointer ${
          errorCount > 0
            ? 'border-rose-500/35 text-rose-400 hover:bg-rose-500/[0.08]'
            : activeCount > 0
              ? 'border-[var(--accent-border)] text-[var(--accent)] hover:bg-[var(--accent-light)]/12'
              : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
        }`}
        title={isOpen ? 'Minimize coordinator' : 'Open coordinator'}
      >
        <ShareNetwork size={16} className={activeCount > 0 ? 'animate-pulse' : ''} aria-hidden="true" />
        {teammateCount > 0 && <span className="font-mono text-[8px] font-semibold tabular-nums">{teammateCount}</span>}
        {isOpen ? <CaretRight size={13} aria-hidden="true" /> : <CaretLeft size={13} aria-hidden="true" />}
        <span className="sr-only">{isOpen ? 'Minimize coordinator' : 'Open coordinator'}</span>
      </button>

      {isOpen && (
        <button
          type="button"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onDoubleClick={toggleMaximized}
          onKeyDown={handleResizeKeyDown}
          className={`group absolute inset-y-0 left-[-5px] z-10 flex w-[10px] touch-none items-center justify-center cursor-col-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
            isResizing ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/35 hover:text-[var(--accent)]'
          }`}
          role="separator"
          aria-label="Resize coordinator panel"
          aria-orientation="vertical"
          aria-valuemin={minPanelWidth}
          aria-valuemax={maxPanelWidth}
          aria-valuenow={Math.round(resolvedWidth)}
          title="Drag to resize · Double-click to maximize"
        >
          <span className="flex h-10 w-2 items-center justify-center rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-sm transition-colors group-hover:border-[var(--accent-border)]">
            <DotsSixVertical size={10} aria-hidden="true" />
          </span>
        </button>
      )}

      <div
        id={panelId}
        inert={!isOpen}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-l-xl border border-r-0 border-[var(--border-primary)] bg-[var(--bg-main)]/96 shadow-[-16px_0_40px_rgba(0,0,0,0.3)] backdrop-blur-md"
      >
        <header className="flex min-h-12 shrink-0 items-center gap-2.5 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/88 px-3">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
            errorCount > 0
              ? 'border-rose-500/30 bg-rose-500/[0.08] text-rose-400'
              : activeCount > 0
                ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/15 text-[var(--accent)]'
                : 'border-[var(--border-primary)] bg-[var(--bg-main)]/45 text-[var(--text-secondary)]'
          }`}>
            <ShareNetwork size={15} className={activeCount > 0 ? 'animate-pulse' : ''} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{teamLabel}</span>
            <span className={`mt-0.5 block truncate font-mono text-[8.5px] ${errorCount > 0 ? 'text-rose-400' : 'text-[var(--text-secondary)]/65'}`}>
              {stateLabel}
            </span>
          </span>
          <button
            type="button"
            onClick={toggleMaximized}
            className="app-icon-button h-7 w-7"
            title={isMaximized ? 'Restore coordinator width' : 'Maximize coordinator'}
            aria-label={isMaximized ? 'Restore coordinator width' : 'Maximize coordinator'}
          >
            {isMaximized ? <ArrowsIn size={14} aria-hidden="true" /> : <ArrowsOut size={14} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={minimizePanel}
            className="app-icon-button h-7 w-7"
            title="Minimize coordinator"
            aria-label="Minimize coordinator"
          >
            <CaretRight size={14} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex flex-1 flex-col">
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
            <div className="custom-scrollbar premium-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
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
                        <span className={`flex shrink-0 ${status.iconTone} ${agent.status === 'running' ? 'animate-pulse' : ''}`}>{status.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <span className="truncate font-mono text-[9.5px] font-semibold text-[var(--text-primary)]">{shortId(agent.agentId)}</span>
                            <span className="font-mono text-[8px] text-[var(--text-secondary)]/50">{status.label}</span>
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[8.5px] text-[var(--text-secondary)]/70">{agent.lastActivity}</span>
                        </span>
                        {selected ? <CaretUp size={14} /> : <CaretDown size={14} />}
                      </button>

                      {selected && (
                        <div className="border-t border-[var(--border-primary)]/65 bg-[var(--bg-main)]/25 px-2.5 py-2.5">
                          <div className="flex items-center gap-1.5 text-[var(--text-secondary)]/55">
                            <ClipboardText size={14} aria-hidden="true" />
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
                                    <span className={`mt-0.5 flex shrink-0 ${meta.tone}`}>{meta.icon}</span>
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
      </div>
    </aside>
  );
};
