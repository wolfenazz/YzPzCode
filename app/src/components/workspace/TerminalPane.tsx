import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { AgentType, TerminalSession, AgentCliInfo, CliLaunchState, AuthInfo } from '../../types';
import { useAgent } from '../../hooks/useAgent';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useCliLauncher } from '../../hooks/useCliLauncher';
import '@xterm/xterm/css/xterm.css';

import claudeLogo from '../../assets/claude.png';
import codexLogo from '../../assets/codex.png';
import geminiLogo from '../../assets/gemini-cli-logo.svg';
import opencodeLogo from '../../assets/opencode.png';
import cursorLogo from '../../assets/cursor-ai.png';

interface TerminalPaneProps {
  session: TerminalSession;
  onResize?: (cols: number, rows: number) => void;
  onClose?: () => void;
  theme?: 'dark' | 'light';
}

const AGENT_LOGOS: Record<AgentType, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  gemini: geminiLogo,
  opencode: opencodeLogo,
  cursor: cursorLogo,
};

const STATUS_COLORS = {
  idle: 'bg-zinc-600',
  running: 'bg-emerald-500',
  error: 'bg-rose-500',
};

const DARK_TERMINAL_THEME = {
  background: '#09090b',
  foreground: '#e4e4e7',
  cursor: '#a1a1aa',
  cursorAccent: '#09090b',
  selectionBackground: '#27272a',
  selectionForeground: '#e4e4e7',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
};

const LIGHT_TERMINAL_THEME = {
  background: '#f4f4f5',
  foreground: '#18181b',
  cursor: '#52525b',
  cursorAccent: '#f4f4f5',
  selectionBackground: '#bfdbfe',
  selectionForeground: '#18181b',
  black: '#18181b',
  red: '#b91c1c',
  green: '#15803d',
  yellow: '#a16207',
  blue: '#1d4ed8',
  magenta: '#9333ea',
  cyan: '#0e7490',
  white: '#f4f4f5',
  brightBlack: '#71717a',
  brightRed: '#dc2626',
  brightGreen: '#16a34a',
  brightYellow: '#ca8a04',
  brightBlue: '#2563eb',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
};

export const TerminalPane: React.FC<TerminalPaneProps> = ({ session, onResize, onClose, theme: themeProp }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cliLaunched, setCliLaunched] = useState(false);
  const terminalReadyRef = useRef(false);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = themeProp || 'dark';
  const isLight = theme === 'light';

  const { listenToTaskUpdates } = useAgent();
  const { cliStatuses, installCli, installProgress, detectCli } = useAgentCli();
  const { launchCli, checkAuth, getAuthInstructions, getLaunchState, getLaunchStateSync, getAuthInfoSync } = useCliLauncher();
  const [installing, setInstalling] = useState(false);

  const cliInfo: AgentCliInfo | null = session.agent ? cliStatuses[session.agent] : null;
  const launchState: CliLaunchState | undefined = session.agent ? getLaunchStateSync(session.id) : undefined;
  const authInfo: AuthInfo | undefined = session.agent ? getAuthInfoSync(session.agent) : undefined;

  const terminalTheme = isLight ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME;

  const handleFitAndResize = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;

    try {
      fitAddonRef.current.fit();
      const dims = xtermRef.current.rows !== undefined ? {
        cols: xtermRef.current.cols,
        rows: xtermRef.current.rows,
      } : null;

      if (dims) {
        const fontSize = xtermRef.current.options.fontSize || 13;
        const charWidth = Math.round(fontSize * 0.6);
        const charHeight = Math.round(fontSize * 1.2);

        invoke('resize_terminal', {
          sessionId: session.id,
          cols: dims.cols,
          rows: dims.rows,
          pixelWidth: Math.round(dims.cols * charWidth),
          pixelHeight: Math.round(dims.rows * charHeight)
        }).catch(console.error);

        onResize?.(dims.cols, dims.rows);
      }
    } catch (e) {
      console.error('Error fitting terminal:', e);
    }
  }, [session.id, onResize]);

  const handleSearch = useCallback((direction: 'next' | 'prev') => {
    if (!searchAddonRef.current || !searchQuery) return;

    const options = {
      regex: false,
      wholeWord: false,
      caseSensitive: false,
      decorations: {
        matchBackground: '#3b8eea',
        activeMatchBackground: '#f5f543',
        matchOverviewRuler: '#3b8eea',
        activeMatchColorOverviewRuler: '#f5f543',
      },
    };

    if (direction === 'next') {
      searchAddonRef.current.findNext(searchQuery, options);
    } else {
      searchAddonRef.current.findPrevious(searchQuery, options);
    }
  }, [searchQuery]);

  const handleClearSearch = useCallback(() => {
    if (searchAddonRef.current) {
      searchAddonRef.current.clearDecorations();
    }
    setSearchQuery('');
    setShowSearch(false);
  }, []);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerm({
      theme: terminalTheme,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const unicodeAddon = new Unicode11Addon();
    const webLinksAddon = new WebLinksAddon(async (event, uri) => {
      event.preventDefault();
      try {
        await invoke('open_url', { url: uri });
      } catch (e) {
        console.error('Failed to open URL:', e);
        window.open(uri, '_blank', 'noopener,noreferrer');
      }
    });

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(searchAddon);
    xterm.loadAddon(unicodeAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.unicode.activeVersion = '11';

    xterm.open(terminalRef.current);

    terminalRef.current.addEventListener('paste', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    terminalReadyRef.current = true;

    setTimeout(() => {
      handleFitAndResize();
    }, 50);

    xterm.onData(async (data) => {
      try {
        await invoke('write_to_terminal', { sessionId: session.id, input: data });
      } catch (error) {
        console.error('Failed to write to terminal:', error);
      }
    });

    xterm.attachCustomKeyEventHandler((event) => {
      const isCtrl = event.ctrlKey || event.metaKey;
      const isKeydown = event.type === 'keydown';

      if (isCtrl && event.key === 'c' && xterm.hasSelection() && isKeydown) {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(console.error);
        }
        return false;
      }

      if (isCtrl && event.key === 'v' && isKeydown) {
        navigator.clipboard.readText().then(async (text) => {
          if (!text) return;
          
          const CHUNK_SIZE = 512;
          const DELAY = 2;
          
          try {
            // Start bracketed paste
            await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[200~' });
            
            // Chunked paste
            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
              const chunk = text.slice(i, i + CHUNK_SIZE);
              await invoke('write_to_terminal', { sessionId: session.id, input: chunk });
              if (i + CHUNK_SIZE < text.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY));
              }
            }
            
            // End bracketed paste
            await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[201~' });
          } catch (error) {
            console.error('Failed to paste to terminal:', error);
          }
        }).catch(console.error);
        return false;
      }

      if (isCtrl && event.key === 'f' && isKeydown) {
        setShowSearch(prev => !prev);
        return false;
      }

      if (isCtrl && event.key === 'l' && isKeydown) {
        xterm.clear();
        return false;
      }

      if (isCtrl && event.shiftKey && event.key === 'C' && isKeydown) {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(console.error);
        }
        return false;
      }

      return true;
    });

    return () => {
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [session.id]);

  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.options.theme = terminalTheme;
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      const unlisten = await listen<string>(`terminal-output:${session.id}`, (event) => {
        if (!mounted) return;
        xtermRef.current?.write(event.payload);
      });
      return unlisten;
    };

    let unlistenFn: (() => void) | null = null;
    setupListener().then((fn) => {
      if (mounted) {
        unlistenFn = fn;
      } else {
        fn();
      }
    });

    return () => {
      mounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, [session.id]);

  useEffect(() => {
    setCliLaunched(false);
    terminalReadyRef.current = false;
  }, [session.id]);

  useEffect(() => {
    if (!session.agent) return;
    getLaunchState(session.id);
  }, [session.id, getLaunchState]);

  useEffect(() => {
    if (!session.agent || cliLaunched) return;

    const isAlreadyLaunched = launchState?.status === 'Starting' || launchState?.status === 'Running';
    if (isAlreadyLaunched) {
      setCliLaunched(true);
      return;
    }

    if (!terminalReadyRef.current) {
      const interval = setInterval(() => {
        if (terminalReadyRef.current && !cliLaunched) {
          clearInterval(interval);
          setCliLaunched(true);
          launchCli(session.id, session.agent!);
          checkAuth(session.agent!);
        }
      }, 200);

      const timeout = setTimeout(() => {
        clearInterval(interval);
      }, 10000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    setCliLaunched(true);
    launchCli(session.id, session.agent!);
    checkAuth(session.agent!);
  }, [session.id, session.agent, launchState, cliLaunched, launchCli, checkAuth]);

  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        handleFitAndResize();
      }, 100);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    const handleWindowResize = () => handleResize();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [handleFitAndResize]);

  useEffect(() => {
    if (!session.agent) return;

    let unlisten: UnlistenFn | null = null;
    listenToTaskUpdates(session.agent).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [session.agent, listenToTaskUpdates]);

  useEffect(() => {
    if (installProgress && installProgress.agent === session.agent) {
      if (installProgress.stage === 'Completed' || installProgress.stage === 'Failed') {
        setInstalling(false);
      }
    }
  }, [installProgress, session.agent]);

  const handleRetryInstall = async () => {
    if (!session.agent) return;
    setInstalling(true);
    await installCli(session.agent);
    if (session.agent) {
      await detectCli(session.agent);
    }
  };

  const handleAuthenticate = async () => {
    setShowAuthModal(true);
  };

  const getCliStatusBadge = () => {
    if (!session.agent) return null;

    if (!cliInfo || cliInfo.status === 'Checking') {
      if (launchState) {
        return (
          <div className="flex items-center gap-1">
            {getLaunchStatusBadge()}
            {getAuthStatusBadge()}
          </div>
        );
      }
      return null;
    }

    if (launchState?.status === 'Running' || launchState?.status === 'Starting') {
      return (
        <div className="flex items-center gap-1">
          {getLaunchStatusBadge()}
          {getAuthStatusBadge()}
        </div>
      );
    }

    switch (cliInfo.status) {
      case 'Installed':
        return (
          <div className="flex items-center gap-1">
            {getLaunchStatusBadge()}
            {getAuthStatusBadge()}
          </div>
        );
      case 'NotInstalled':
      case 'Error':
        return (
          <button
            onClick={handleRetryInstall}
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

  const getLaunchStatusBadge = () => {
    const badgeBase = `text-[10px] px-1.5 py-0.5 rounded-sm font-mono tracking-widest uppercase`;

    if (!launchState) {
      return (
        <span className={`${badgeBase} ${isLight ? 'bg-zinc-200 border border-zinc-300 text-zinc-500' : 'bg-zinc-900 border border-zinc-700 text-zinc-400'}`}>
          Ready
        </span>
      );
    }

    switch (launchState.status) {
      case 'Starting':
        return (
          <span className={`${badgeBase} flex items-center gap-1 ${isLight ? 'bg-zinc-200 border border-zinc-300 text-zinc-600' : 'bg-zinc-800 border border-zinc-700 text-zinc-300'}`}>
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
          <span className={`${badgeBase} ${isLight ? 'bg-zinc-200 border border-zinc-300 text-zinc-500' : 'bg-zinc-900 border border-zinc-700 text-zinc-400'}`}>
            Ready
          </span>
        );
    }
  };

  const getAuthStatusBadge = () => {
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
            onClick={handleAuthenticate}
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

  return (
    <div className={`h-full flex flex-col overflow-hidden transition-all duration-200 font-mono accent-pane ${
      isLight
        ? 'bg-zinc-100 border border-zinc-300/50'
        : 'bg-zinc-950 border border-zinc-800/50'
    }`}>
      <div className={`flex items-center justify-between px-2 py-1 select-none shrink-0 ${
        isLight
          ? 'bg-zinc-200/60 border-b border-zinc-300'
          : 'bg-zinc-900/50 border-b border-zinc-800'
      }`}>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${STATUS_COLORS[session.status]} ${session.status === 'running' ? 'shadow-[0_0_4px_currentColor]' : ''}`} />
          <span className={`text-[10px] font-bold tracking-widest uppercase shrink-0 ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
            TTY{session.index + 1}
          </span>

          {session.agent ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm shrink-0 ${
                isLight ? 'bg-zinc-100 border border-zinc-300' : 'bg-zinc-800 border border-zinc-700'
              }`}>
                <img
                  src={AGENT_LOGOS[session.agent]}
                  alt={session.agent}
                  className={`w-3 h-3 object-contain ${session.agent === 'opencode' || session.agent === 'cursor' || session.agent === 'codex'
                      ? isLight
                        ? 'brightness-[0.8]'
                        : 'invert brightness-[3.5] contrast-[1.5]'
                      : isLight
                        ? 'brightness-[0.9]'
                        : 'brightness-[2.2] contrast-[1.2]'
                    }`}
                />
                <span className={`text-[9px] uppercase font-bold tracking-widest truncate max-w-[60px] ${
                  isLight ? 'text-zinc-700' : 'text-zinc-300'
                }`}>{session.agent}</span>
              </div>
              {getCliStatusBadge()}
            </div>
          ) : (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm shrink-0 ${
              isLight ? 'bg-zinc-100 border border-zinc-300' : 'bg-zinc-800 border border-zinc-700'
            }`}>
              <svg className={`w-3 h-3 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>SHELL</span>
            </div>
          )}
        </div>

        <div className="flex items-center shrink-0 ml-1">
          {onClose && (
            <button
              onClick={onClose}
              className={`flex items-center justify-center w-6 h-6 rounded-sm transition-colors duration-150 cursor-pointer ${
                isLight
                  ? 'text-zinc-400 hover:text-rose-600 hover:bg-rose-100'
                  : 'text-zinc-600 hover:text-rose-400 hover:bg-rose-900/30'
              }`}
              title="Close terminal"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showSearch && (
        <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${
          isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-900 border-zinc-800'
        }`}>
          <svg className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(e.shiftKey ? 'prev' : 'next');
              } else if (e.key === 'Escape') {
                handleClearSearch();
              }
            }}
            placeholder="Search..."
            className={`flex-1 bg-transparent text-xs outline-none ${
              isLight ? 'text-zinc-800 placeholder-zinc-400' : 'text-zinc-300 placeholder-zinc-600'
            }`}
            autoFocus
          />
          <button
            onClick={() => handleSearch('prev')}
            className={`p-1 rounded transition-colors cursor-pointer ${isLight ? 'hover:bg-zinc-200 text-zinc-400' : 'hover:bg-zinc-800 text-zinc-500'}`}
            title="Previous match"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => handleSearch('next')}
            className={`p-1 rounded transition-colors cursor-pointer ${isLight ? 'hover:bg-zinc-200 text-zinc-400' : 'hover:bg-zinc-800 text-zinc-500'}`}
            title="Next match"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={handleClearSearch}
            className={`p-1 rounded transition-colors cursor-pointer ${isLight ? 'hover:bg-zinc-200 text-zinc-400' : 'hover:bg-zinc-800 text-zinc-500'}`}
            title="Close search"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div
        ref={terminalRef}
        className={`flex-1 overflow-hidden min-h-0 p-0.5 ${isLight ? 'bg-[#f4f4f5]' : 'bg-[#09090b]'}`}
      />

      {showAuthModal && session.agent && (
        <AuthModal
          agent={session.agent}
          onClose={() => setShowAuthModal(false)}
          getAuthInstructions={getAuthInstructions}
          theme={theme}
        />
      )}
    </div>
  );
};

interface AuthModalProps {
  agent: AgentType;
  onClose: () => void;
  getAuthInstructions: (agent: AgentType) => Promise<string[]>;
  theme: 'dark' | 'light';
}

const AuthModal: React.FC<AuthModalProps> = ({ agent, onClose, getAuthInstructions, theme }) => {
  const [instructions, setInstructions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const isLight = theme === 'light';

  useEffect(() => {
    getAuthInstructions(agent).then((instr) => {
      setInstructions(instr);
      setLoading(false);
    });
  }, [agent, getAuthInstructions]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 font-mono">
      <div className={`border rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl ${
        isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-950 border-zinc-800'
      }`}>
        <h3 className={`text-sm font-bold mb-4 tracking-widest uppercase border-b pb-2 ${
          isLight ? 'text-zinc-800 border-zinc-300' : 'text-zinc-100 border-zinc-800'
        }`}>
          &gt; Auth: {agent}
        </h3>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg className={`w-6 h-6 animate-spin ${isLight ? 'text-zinc-400' : 'text-zinc-600'}`} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <div className="space-y-4">
            <p className={`text-xs uppercase tracking-widest ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>Execute instructions:</p>
            <ul className={`space-y-2 p-4 border rounded-sm ${
              isLight ? 'bg-zinc-50 border-zinc-300' : 'bg-zinc-900/50 border-zinc-800'
            }`}>
              {instructions.map((instr, i) => (
                <li key={i} className={`text-xs flex gap-2 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                  <span className={`select-none ${isLight ? 'text-zinc-400' : 'text-zinc-600'}`}>{'$>'}</span>
                  <span>{instr}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-8 flex justify-end">
          <button
            onClick={onClose}
            className={`px-6 py-2 border transition-colors uppercase tracking-widest text-xs rounded-sm cursor-pointer ${
              isLight
                ? 'bg-zinc-200 text-zinc-700 border-zinc-300 hover:bg-zinc-300 hover:text-zinc-900'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-100'
            }`}
          >
            [ Close ]
          </button>
        </div>
      </div>
    </div>
  );
};
