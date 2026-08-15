import React from 'react';
import type { AgentMcpServer } from '../../types';

interface McpStatusStripProps {
  servers: AgentMcpServer[];
  onRefresh: () => void;
  loading?: boolean;
  /** Slim one-line readout (used when the pane is narrow/short). */
  slim?: boolean;
}

const statusMeta = (s: AgentMcpServer): { dot: string; label: string; cls: string } => {
  if (s.disabled) return { dot: 'bg-[var(--text-secondary)]/30', label: 'disabled', cls: 'text-[var(--text-secondary)]/40' };
  if (s.status === 'connected') return { dot: 'bg-emerald-500', label: 'connected', cls: 'text-emerald-500' };
  if (s.status === 'connecting') return { dot: 'bg-[var(--accent)] mcp-dot-connecting', label: 'connecting', cls: 'text-[var(--accent)]' };
  if (s.lastError) return { dot: 'bg-rose-500', label: 'error', cls: 'text-rose-500' };
  return { dot: 'bg-rose-500', label: 'offline', cls: 'text-rose-500' };
};

/**
 * Slim strip of linked MCP servers shown on the agent pane: one chip per server
 * with a status dot — green = connected, red = error/needs auth, amber =
 * connecting, gray = disabled — plus the tool count.
 */
export const McpStatusStrip: React.FC<McpStatusStripProps> = ({ servers, onRefresh, loading, slim = false }) => {
  const connected = servers.filter((s) => s.status === 'connected' && !s.disabled).length;
  const errored = servers.filter((s) => !s.disabled && s.status !== 'connected' && s.lastError).length;

  // Slim mode: a single compact chip with the connected/errored counts.
  if (slim) {
    return (
      <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/20 select-none">
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]/50 shrink-0">
          MCP
        </span>
        {loading ? (
          <span className="font-mono text-[9px] text-[var(--text-secondary)]/50 animate-pulse">checking…</span>
        ) : servers.length === 0 ? (
          <span className="font-mono text-[9px] text-[var(--text-secondary)]/40">none</span>
        ) : (
          <span
            className="premium-chip px-2 h-5"
            title={servers.map((s) => `${s.name} - ${s.status}`).join('\n')}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${errored > 0 ? 'bg-rose-500' : connected > 0 ? 'bg-emerald-500' : 'bg-[var(--text-secondary)]/30'}`} />
            <span className="font-mono text-[9px] text-[var(--text-primary)]/90">
              {servers.length} server{servers.length !== 1 ? 's' : ''}
            </span>
            {connected > 0 && <span className="font-mono text-[8px] tabular-nums text-emerald-500">{connected}✓</span>}
            {errored > 0 && <span className="font-mono text-[8px] tabular-nums text-rose-500">{errored}✕</span>}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh MCP server status"
          className="ml-auto flex items-center justify-center w-4.5 h-4.5 p-0.5 rounded-sm text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors duration-100 cursor-pointer shrink-0"
        >
          <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/20 select-none overflow-x-auto custom-scrollbar premium-scrollbar">
      <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]/50 shrink-0">
        MCP
      </span>
      {loading ? (
        <span className="font-mono text-[9px] text-[var(--text-secondary)]/50 animate-pulse">checking…</span>
      ) : servers.length === 0 ? (
        <span className="font-mono text-[9px] text-[var(--text-secondary)]/40">
          No MCP servers linked — add them in Settings → YZPZ Agent.
        </span>
      ) : (
        servers.map((s) => {
          const meta = statusMeta(s);
          return (
            <span
              key={s.name}
              title={`${s.name} — ${meta.label}${s.lastError ? ` (${s.lastError})` : ''}${s.toolCount ? ` · ${s.toolCount} tool(s)` : ''}`}
              className="premium-chip px-2 h-5 shrink-0"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
              <span className="font-mono text-[9px] text-[var(--text-primary)]/90 truncate max-w-[120px]">{s.name}</span>
              {s.toolCount > 0 && (
                <span className="font-mono text-[8px] tabular-nums text-[var(--text-secondary)]/50">{s.toolCount}⚙</span>
              )}
            </span>
          );
        })
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        title="Refresh MCP server status"
        className="ml-auto flex items-center justify-center w-4.5 h-4.5 p-0.5 rounded-sm text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors duration-100 cursor-pointer shrink-0"
      >
        <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
};
