import { AgentCliInfo } from '../../types';

interface AgentCliStatusBadgeProps {
  cliInfo: AgentCliInfo | null;
  onInstall?: () => void;
  installing?: boolean;
  compact?: boolean;
}

export function AgentCliStatusBadge({ cliInfo, onInstall, installing, compact = false }: AgentCliStatusBadgeProps) {
  const getStatusDisplay = () => {
    if (!cliInfo) {
      return {
        icon: (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ),
        text: 'Checking...',
        bgClass: 'bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase',
        canInstall: true,
      };
    }

    switch (cliInfo.status) {
      case 'Installed':
        return {
          icon: (
            <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ),
          text: cliInfo.version ? `v${cliInfo.version}` : 'Installed',
          bgClass: 'cli-status-badge--installed bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 font-mono text-[10px] uppercase',
          canInstall: false,
        };
      case 'NotInstalled':
        return {
          icon: (
            <svg className="w-3 h-3 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          ),
          text: 'Not installed',
          bgClass: 'bg-rose-950/30 border border-rose-900/50 text-rose-400 font-mono text-[10px] uppercase',
          canInstall: true,
        };
      case 'Checking':
        return {
          icon: (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ),
          text: 'Checking...',
          bgClass: 'bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase',
          canInstall: true,
        };
      case 'Error':
        return {
          icon: (
            <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ),
          text: cliInfo.error || 'Error',
          bgClass: 'bg-amber-950/30 border border-amber-900/50 text-amber-400 font-mono text-[10px] uppercase',
          canInstall: true,
        };
      default:
        return {
          icon: null,
          text: 'Unknown',
          bgClass: 'bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase',
          canInstall: true,
        };
    }
  };

  const status = getStatusDisplay();

  if (status.canInstall && onInstall) {
    return (
      <div className="flex items-center gap-2">
        {!compact && cliInfo && cliInfo.status === 'Checking' && (
          <span className="text-[10px] text-[var(--text-secondary)] font-mono italic">Still checking...</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onInstall();
          }}
          disabled={installing}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-[10px] uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50 border border-zinc-700"
          title={`Install ${cliInfo?.displayName || 'CLI'}`}
        >
          {installing ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
          {installing ? 'Running...' : 'Install'}
        </button>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm ${status.bgClass}`}
      title={cliInfo?.error || cliInfo?.path || undefined}
    >
      {status.icon}
      {!compact && status.text}
    </span>
  );
}
