import React from 'react';
import { ArrowClockwise, CircleNotch, ShieldCheck, SignIn, WarningCircle } from '@phosphor-icons/react';
import { AgentCliInfo, CliLaunchState, AuthInfo } from '../../types';

interface CliStatusBadgeProps {
  cliInfo: AgentCliInfo | null;
  launchState: CliLaunchState | null | undefined;
  authInfo: AuthInfo | null | undefined;
  onAuthenticate: () => void;
  onRetryInstall: () => void;
  installing: boolean;
}

const stopDrag = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
};

const LaunchStatus: React.FC<{ launchState: CliLaunchState | null | undefined; authInfo: AuthInfo | null | undefined }> = ({
  launchState,
  authInfo,
}) => {
  const authenticated = authInfo?.status === 'Authenticated';
  const authTitle = authenticated ? ` · Authenticated${authInfo?.configPath ? ` (${authInfo.configPath})` : ''}` : '';

  switch (launchState?.status) {
    case 'Starting':
      return (
        <span className="term-pill" title={`Starting CLI${authTitle}`}>
          <CircleNotch size={10} weight="bold" className="term-spin" aria-hidden="true" />
          Starting
        </span>
      );
    case 'Running':
      return (
        <span className="term-pill term-pill--ok" title={`CLI running${authTitle}`}>
          <span className="term-dot term-dot--live" aria-hidden="true" />
          Active
          {authenticated && <ShieldCheck size={11} weight="fill" aria-label="Authenticated" />}
        </span>
      );
    case 'Error':
      return (
        <span className="term-pill term-pill--danger" title={launchState.error || 'CLI error'}>
          <WarningCircle size={11} weight="fill" aria-hidden="true" />
          Error
        </span>
      );
    default:
      return (
        <span className="term-pill" title={`Ready${authTitle}`}>
          <span className="term-dot" aria-hidden="true" />
          Ready
          {authenticated && <ShieldCheck size={11} weight="fill" aria-label="Authenticated" />}
        </span>
      );
  }
};

const AuthAction: React.FC<{ authInfo: AuthInfo | null | undefined; onAuthenticate: () => void }> = ({
  authInfo,
  onAuthenticate,
}) => {
  if (authInfo?.status !== 'NotAuthenticated') return null;
  return (
    <button
      type="button"
      {...stopDrag}
      onClick={(e) => {
        e.stopPropagation();
        onAuthenticate();
      }}
      className="term-pill term-pill--warn"
      title="This CLI is not signed in"
    >
      <SignIn size={11} weight="bold" aria-hidden="true" />
      Sign in
    </button>
  );
};

export const CliStatusBadge: React.FC<CliStatusBadgeProps> = ({
  cliInfo,
  launchState,
  authInfo,
  onAuthenticate,
  onRetryInstall,
  installing,
}) => {
  const isLive = launchState?.status === 'Running' || launchState?.status === 'Starting';

  if ((!cliInfo || cliInfo.status === 'Checking') && !launchState) return null;

  if (!isLive && (cliInfo?.status === 'NotInstalled' || cliInfo?.status === 'Error')) {
    return (
      <button
        type="button"
        {...stopDrag}
        onClick={(e) => {
          e.stopPropagation();
          onRetryInstall();
        }}
        disabled={installing}
        className="term-pill term-pill--danger"
        title={cliInfo.error || 'CLI not installed'}
      >
        {installing ? (
          <CircleNotch size={10} weight="bold" className="term-spin" aria-hidden="true" />
        ) : (
          <ArrowClockwise size={11} weight="bold" aria-hidden="true" />
        )}
        {installing ? 'Installing…' : 'Install'}
      </button>
    );
  }

  if (cliInfo && !isLive && cliInfo.status !== 'Installed' && cliInfo.status !== 'Checking') return null;

  return (
    <>
      <LaunchStatus launchState={launchState} authInfo={authInfo} />
      <AuthAction authInfo={authInfo} onAuthenticate={onAuthenticate} />
    </>
  );
};
