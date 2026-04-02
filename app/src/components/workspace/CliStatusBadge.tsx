import React from 'react';
import { AgentCliInfo, CliLaunchState, AuthInfo } from '../../types';

interface CliStatusBadgeProps {
  cliInfo: AgentCliInfo | null;
  launchState: CliLaunchState | null | undefined;
  authInfo: AuthInfo | null | undefined;
  theme: 'dark' | 'light';
  onAuthenticate: () => void;
  onRetryInstall: () => void;
  installing: boolean;
}

const getLaunchStatusBadge = (launchState: CliLaunchState | null | undefined, isLight: boolean) => {
  const badgeBase = `text-[10px] px-1.5 py-0.5 rounded-sm font-mono tracking-widest uppercase`;

  if (!launchState) {
    return (
      <span className={`${badgeBase} ${isLight ? 'bg-gray-600 border border-gray-500 text-gray-300' : 'bg-zinc-900 border border-zinc-700 text-zinc-400'}`}>
        Ready
      </span>
    );
  }

  switch (launchState.status) {
    case 'Starting':
      return (
        <span className={`${badgeBase} flex items-center gap-1 ${isLight ? 'bg-gray-600 border border-gray-500 text-gray-200' : 'bg-zinc-800 border border-zinc-700 text-zinc-300'}`}>
          <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Init
        </span>
      );
    case 'Running':
      return (
        <span className={`${badgeBase} flex items-center gap-1 ${isLight ? 'bg-emerald-100 border border-emerald-300 text-emerald-700' : 'bg-emerald-950 border border-emerald-900 text-emerald-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-sm ${isLight ? 'bg-emerald-600' : 'bg-emerald-500'}`} />
          Active
        </span>
      );
    case 'Error':
      return (
        <span className={`${badgeBase} ${isLight ? 'bg-rose-100 border border-rose-300 text-rose-600' : 'bg-rose-950 opacity-80 border border-rose-900 text-rose-500'}`} title={launchState.error || 'Error'}>
          Error
        </span>
      );
    default:
      return (
        <span className={`${badgeBase} ${isLight ? 'bg-gray-600 border border-gray-500 text-gray-300' : 'bg-zinc-900 border border-zinc-700 text-zinc-400'}`}>
          Ready
        </span>
      );
  }
};

const getAuthStatusBadge = (authInfo: AuthInfo | null | undefined, isLight: boolean, onAuthenticate: () => void) => {
  if (!authInfo) return null;

  switch (authInfo.status) {
    case 'Authenticated':
      return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-mono tracking-widest uppercase ${
          isLight
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-600'
            : 'bg-emerald-950/50 border border-emerald-900 text-emerald-500/80'
        }`} title={authInfo.configPath || 'Authenticated'}>
          Auth OK
        </span>
      );
    case 'NotAuthenticated':
      return (
        <button
          onClick={onAuthenticate}
          className={`text-[10px] px-1.5 py-0.5 rounded-sm font-mono tracking-widest uppercase transition-colors cursor-pointer ${
            isLight
              ? 'bg-amber-100 border border-amber-300 text-amber-700 hover:bg-amber-200'
              : 'bg-amber-950 border border-amber-900 text-amber-500 hover:bg-amber-900 hover:text-amber-400'
          }`}
        >
          !Login
        </button>
      );
    default:
      return null;
  }
};

export const CliStatusBadge: React.FC<CliStatusBadgeProps> = ({
  cliInfo,
  launchState,
  authInfo,
  theme,
  onAuthenticate,
  onRetryInstall,
  installing,
}) => {
  const isLight = theme === 'light';

  if (!cliInfo || cliInfo.status === 'Checking') {
    if (launchState) {
      return (
        <div className="flex items-center gap-1">
          {getLaunchStatusBadge(launchState, isLight)}
          {getAuthStatusBadge(authInfo, isLight, onAuthenticate)}
        </div>
      );
    }
    return null;
  }

  if (launchState?.status === 'Running' || launchState?.status === 'Starting') {
    return (
      <div className="flex items-center gap-1">
        {getLaunchStatusBadge(launchState, isLight)}
        {getAuthStatusBadge(authInfo, isLight, onAuthenticate)}
      </div>
    );
  }

  switch (cliInfo.status) {
    case 'Installed':
      return (
        <div className="flex items-center gap-1">
          {getLaunchStatusBadge(launchState, isLight)}
          {getAuthStatusBadge(authInfo, isLight, onAuthenticate)}
        </div>
      );
    case 'NotInstalled':
    case 'Error':
      return (
        <button
          onClick={onRetryInstall}
          disabled={installing}
          className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 disabled:opacity-50 transition-colors cursor-pointer ${
            isLight
              ? 'bg-red-100 text-red-600 hover:bg-red-200'
              : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
          }`}
          title={cliInfo.error || 'CLI not installed'}
        >
          {installing ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {installing ? 'Installing...' : 'Install'}
        </button>
      );
    default:
      return null;
  }
};
