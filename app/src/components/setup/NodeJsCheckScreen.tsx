import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PrerequisiteStatus } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { minimizeWindow, maximizeWindow, closeWindow, initWindowPlatform } from '../../utils/window';
import { AppChrome } from '../common/AppChrome';
import { AppFooter } from '../common/AppFooter';
import logo from '../../assets/YzPzCodeLogo.png';

interface NodeJsCheckScreenProps {
  onReady: () => void;
}

type CheckState = 'checking' | 'not-installed' | 'rechecking' | 'install-failed' | 'installed';

export const NodeJsCheckScreen: React.FC<NodeJsCheckScreenProps> = ({ onReady }) => {
  const { setNodeJsCheckPassed } = useAppStore();
  const [checkState, setCheckState] = useState<CheckState>('checking');
  const [nodejsInfo, setNodejsInfo] = useState<PrerequisiteStatus | null>(null);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    initWindowPlatform().then(setIsWindows).catch(() => {});
  }, []);

  const checkNodeJs = useCallback(async (): Promise<boolean> => {
    try {
      const result = await invoke<PrerequisiteStatus>('check_nodejs');
      setNodejsInfo(result);
      return result.installed && result.meetsMinimum;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const installed = await checkNodeJs();
      if (installed) {
        setCheckState('installed');
        setNodeJsCheckPassed(true);
        onReady();
      } else {
        setCheckState('not-installed');
      }
    })();
  }, [checkNodeJs, onReady, setNodeJsCheckPassed]);

  const handleInstall = async () => {
    try {
      await invoke('open_url', { url: 'https://nodejs.org/en/download/current' });
    } catch (err) {
      console.error('Failed to open URL:', err);
    }
  };

  const handleRecheck = async () => {
    setCheckState('rechecking');
    const installed = await checkNodeJs();
    if (installed) {
      setCheckState('installed');
      setNodeJsCheckPassed(true);
      onReady();
    } else {
      setCheckState('install-failed');
    }
  };

  const handleSkip = () => {
    setNodeJsCheckPassed(true);
    onReady();
  };

  return (
    <div className="h-screen bg-theme-main text-theme-main font-mono flex flex-col overflow-hidden">
      <AppChrome
        crumbs={['System check']}
        isWindows={isWindows}
        onClose={closeWindow}
        onMaximize={maximizeWindow}
        onMinimize={minimizeWindow}
      />

      <main className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-lg mx-auto px-8">
          {checkState === 'checking' || checkState === 'rechecking' ? (
            <div className="flex flex-col items-center gap-6">
              <div className="relative mb-2">
                <div className="absolute inset-0 bg-white/[0.03] rounded-2xl blur-2xl scale-150" />
                <img src={logo} alt="YzPzCode" className="relative h-16 w-auto opacity-80" />
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-theme-secondary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-mono text-theme-secondary">
                  {checkState === 'checking' ? 'Checking system requirements...' : 'Re-checking Node.js...'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <div className="relative mb-2">
                <div className="absolute inset-0 bg-white/[0.03] rounded-2xl blur-2xl scale-150" />
                <img src={logo} alt="YzPzCode" className="relative h-16 w-auto opacity-80" />
              </div>

              <div className="text-center">
                <h1 className="text-lg font-mono font-bold tracking-tight text-theme-main/90 mb-2">Node.js Required</h1>
                <p className="text-[var(--text-secondary)] text-xs font-mono leading-relaxed max-w-sm">
                  YzPzCode CLI agents (Claude Code, Codex, Antigravity CLI, OpenCode, Kilo) require{' '}
                  <span className="text-theme-main">Node.js v18+</span> to run.
                </p>
              </div>

              <div className="w-full bg-theme-card rounded-lg border border-theme p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-mono text-theme-main">Node.js</span>
                  </div>
                  {nodejsInfo?.version ? (
                    <span className="text-xs text-theme-secondary">v{nodejsInfo.version}</span>
                  ) : (
                    <span className="text-xs text-red-400/80">Not found</span>
                  )}
                </div>
                <div className="text-[10px] text-theme-secondary font-mono">
                  Minimum version: v18.0.0
                </div>
              </div>

              {checkState === 'install-failed' && (
                <div className="w-full flex items-start gap-3 px-4 py-3 bg-rose-500/[0.06] border border-rose-500/20 rounded-md">
                  <svg className="w-4 h-4 text-rose-500/80 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-xs font-mono space-y-1">
                    <span className="text-rose-400/80 block">Node.js is still not detected.</span>
                    <span className="text-[var(--text-secondary)] block">CLI agents will not work properly without Node.js. Please restart YzPzCode after installing.</span>                  </div>
                </div>
              )}

              <div className="w-full space-y-3">
                <button
                  onClick={handleInstall}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600/80 hover:bg-green-600 text-white rounded-md text-xs font-mono tracking-wide transition-colors duration-150 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Install Node.js
                </button>

                <button
                  onClick={handleRecheck}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-theme-card hover:bg-theme-hover border border-theme rounded-md text-xs font-mono tracking-wide text-theme-main transition-colors duration-150 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  I've installed Node.js
                </button>
              </div>

              <button
                onClick={handleSkip}
                className="text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 cursor-pointer tracking-wide"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      </main>

      <AppFooter />
    </div>
  );
};
