import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { TerminalSession, AgentCliInfo, CliLaunchState, AuthInfo, AgentType, ManagedTerminalCommandState } from '../../types';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useCliLauncher } from '../../hooks/useCliLauncher';
import { useAppStore } from '../../stores/appStore';
import '@xterm/xterm/css/xterm.css';

import { TerminalHeader } from './TerminalHeader';
import { CliStatusBadge } from './CliStatusBadge';
import { AuthModal } from './AuthModal';

interface TerminalPaneProps {
  session: TerminalSession;
  onResize?: (cols: number, rows: number) => void;
  onClose?: () => void;
  theme?: 'dark' | 'light';
  dragListeners?: Record<string, unknown>;
}

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
  blue: '#52525b', /* Neutralized */
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#71717a', /* Neutralized */
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
};

const LIGHT_TERMINAL_THEME = {
  background: '#18181b', /* zinc-900 */
  foreground: '#f4f4f5', /* zinc-100 */
  cursor: '#a1a1aa',
  cursorAccent: '#18181b',
  selectionBackground: '#3f3f46',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#71717a',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#a1a1aa',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

const SUPPORTED_MOUSE_MODE_CODES = [1000, 1002, 1003, 1005, 1006, 1015] as const;
const DEFAULT_MOUSE_TRACKING_MODES = [1000, 1002, 1006] as const;
const EMPTY_MOUSE_MODES: number[] = [];
const MANAGED_COMMAND_PREFIXES = [
  'npm run dev',
  'npm run build',
  'npm run tauri dev',
  'npm run tauri build',
  'npx tauri dev',
  'npx tauri build',
  'pnpm dev',
  'pnpm build',
  'pnpm tauri dev',
  'pnpm tauri build',
  'yarn dev',
  'yarn build',
  'yarn tauri dev',
  'yarn tauri build',
  'bun run dev',
  'bun run build',
  'cargo tauri dev',
  'cargo tauri build',
  'next dev',
  'next build',
  'vite',
  'vite build',
] as const;

const normalizeMouseModes = (modes: Iterable<number>): number[] =>
  Array.from(new Set(modes))
    .filter((mode) => SUPPORTED_MOUSE_MODE_CODES.includes(mode as typeof SUPPORTED_MOUSE_MODE_CODES[number]))
    .sort((a, b) => a - b);

const buildMouseModeSequence = (modes: Iterable<number>, operation: 'h' | 'l'): string =>
  normalizeMouseModes(modes)
    .map((mode) => `\x1b[?${mode}${operation}`)
    .join('');

const normalizeManagedCommandCandidate = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const shouldInterceptManagedCommand = (value: string): boolean => {
  const normalized = normalizeManagedCommandCandidate(value);
  return MANAGED_COMMAND_PREFIXES.some((prefix) =>
    normalized === prefix || normalized.startsWith(`${prefix} `)
  );
};

const getTerminalCellPixels = (term: XTerm): { width: number; height: number } => {
  const fallbackFont = typeof term.options.fontSize === 'number' ? term.options.fontSize : 13;
  const fallback = {
    width: Math.max(1, Math.round(fallbackFont * 0.6)),
    height: Math.max(1, Math.round(fallbackFont * 1.2)),
  };

  try {
    const core = term as unknown as {
      _core?: {
        _renderService?: {
          dimensions?: {
            css?: {
              cell?: { width?: number; height?: number };
            };
          };
        };
      };
    };
    const cell = core._core?._renderService?.dimensions?.css?.cell;
    const width = cell?.width ? Math.round(cell.width) : 0;
    const height = cell?.height ? Math.round(cell.height) : 0;

    if (width > 0 && height > 0) {
      return { width, height };
    }
  } catch {
    // Ignore and use fallback.
  }

  return fallback;
};

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  session,
  onResize,
  onClose,
  theme: themeProp,
  dragListeners,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cliLaunched, setCliLaunched] = useState(false);
  const terminalReadyRef = useRef(false);
  const firstOutputFitDoneRef = useRef(false);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const launchAttemptsRef = useRef(0);
  const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPasteConfirm, setShowPasteConfirm] = useState(false);
  const [pendingPasteText, setPendingPasteText] = useState('');
  const [mouseTrackingEnabled, setMouseTrackingEnabled] = useState(false);
  const [managedCommandState, setManagedCommandState] = useState<ManagedTerminalCommandState | null>(null);
  const mouseModesRef = useRef<Set<number>>(new Set());
  const lineBufferRef = useRef('');
  const lineTrackingReliableRef = useRef(true);
  const savedMouseModes = useAppStore((state) => state.terminalMouseModesBySession[session.id] ?? EMPTY_MOUSE_MODES);
  const setTerminalMouseModes = useAppStore((state) => state.setTerminalMouseModes);

  const theme = themeProp || 'dark';
  const isLight = theme === 'light';
  const isWindowsHost = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

  const { cliStatuses, installCli, installProgress, detectCli } = useAgentCli();
  const { launchCli, stopCli, checkAuth, getAuthInstructions, getLaunchState, getLaunchStateSync, getAuthInfoSync } = useCliLauncher();
  const [installing, setInstalling] = useState(false);

  const cliInfo: AgentCliInfo | null = session.agent ? cliStatuses[session.agent] : null;
  const launchState: CliLaunchState | null | undefined = session.agent ? getLaunchStateSync(session.id) : undefined;
  const authInfo: AuthInfo | null | undefined = session.agent ? getAuthInfoSync(session.agent) : undefined;

  const terminalTheme = isLight ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME;
  const managedCommandActive =
    managedCommandState?.status === 'Starting' ||
    managedCommandState?.status === 'Running' ||
    managedCommandState?.status === 'Stopping';

  const handleFitAndResize = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;

    try {
      fitAddonRef.current.fit();
      const dims = xtermRef.current.rows !== undefined ? {
        cols: xtermRef.current.cols,
        rows: xtermRef.current.rows,
      } : null;

      if (dims) {
        const cell = getTerminalCellPixels(xtermRef.current);

        invoke('resize_terminal', {
          sessionId: session.id,
          cols: dims.cols,
          rows: dims.rows,
          pixelWidth: Math.round(dims.cols * cell.width),
          pixelHeight: Math.round(dims.rows * cell.height)
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

  const syncMouseModes = useCallback((modes: Iterable<number>) => {
    const normalizedModes = normalizeMouseModes(modes);
    const currentModes = normalizeMouseModes(mouseModesRef.current);
    const changed =
      normalizedModes.length !== currentModes.length ||
      normalizedModes.some((mode, index) => mode !== currentModes[index]);

    if (!changed) {
      setMouseTrackingEnabled(normalizedModes.length > 0);
      return normalizedModes;
    }

    mouseModesRef.current = new Set(normalizedModes);
    setMouseTrackingEnabled(normalizedModes.length > 0);
    setTerminalMouseModes(session.id, normalizedModes);
    return normalizedModes;
  }, [session.id, setTerminalMouseModes]);

  const replayMouseModes = useCallback((modes: Iterable<number>) => {
    const normalizedModes = syncMouseModes(modes);
    if (normalizedModes.length === 0) return;

    const term = xtermRef.current;
    if (!term) return;

    term.write(buildMouseModeSequence(normalizedModes, 'h'));
  }, [syncMouseModes]);

  const handleRefreshCli = useCallback(async () => {
    if (!session.agent || isRefreshing) return;
    setIsRefreshing(true);
    launchAttemptsRef.current = 0;

    try {
      await stopCli(session.id);
    } catch {
      // Ignore stop errors
    }

    setCliLaunched(false);

    setTimeout(async () => {
      try {
        await launchCli(session.id, session.agent!);
        await checkAuth(session.agent!);
        setCliLaunched(true);
      } catch (e) {
        console.error('Refresh CLI launch failed:', e);
      }
      setIsRefreshing(false);
    }, 1000);
  }, [session.id, session.agent, isRefreshing, stopCli, launchCli, checkAuth]);

  const parseMouseTrackingState = useCallback((output: string) => {
    if (!output.includes('\x1b[') && !output.includes('\x9b')) return;

    // Match CSI private mode set/reset such as: ESC[?1000h, ESC[?1002;1006l, CSI ? 1006 h
    const regex = /(?:\x1b\[|\x9b)\?([0-9;]+)([hl])/g;
    let match: RegExpExecArray | null = regex.exec(output);

    while (match) {
      const [, params, op] = match;
      const codes = params.split(';').map((n) => Number(n)).filter((n) => !Number.isNaN(n));

      for (const code of codes) {
        if (SUPPORTED_MOUSE_MODE_CODES.includes(code as typeof SUPPORTED_MOUSE_MODE_CODES[number])) {
          if (op === 'h') {
            mouseModesRef.current.add(code);
          } else {
            mouseModesRef.current.delete(code);
          }
        }
      }

      match = regex.exec(output);
    }

    syncMouseModes(mouseModesRef.current);
  }, [syncMouseModes]);

  const handleToggleMouseTracking = useCallback(async () => {
    const enableModes = normalizeMouseModes(DEFAULT_MOUSE_TRACKING_MODES);
    const disableModes = normalizeMouseModes(mouseModesRef.current);
    const enableSequence = buildMouseModeSequence(enableModes, 'h');
    const disableSequence = buildMouseModeSequence(disableModes, 'l');

    try {
      await invoke('write_to_terminal', {
        sessionId: session.id,
        input: mouseTrackingEnabled ? disableSequence : enableSequence,
      });

      if (mouseTrackingEnabled) {
        xtermRef.current?.write(disableSequence);
        syncMouseModes([]);
      } else {
        xtermRef.current?.write(enableSequence);
        syncMouseModes(enableModes);
      }
    } catch (error) {
      console.error('Failed to toggle mouse tracking:', error);
    }
  }, [session.id, mouseTrackingEnabled, syncMouseModes]);

  const startManagedCommand = useCallback(async (command: string) => {
    await invoke('run_managed_terminal_command', {
      request: {
        sessionId: session.id,
        workspaceId: session.workspaceId,
        cwd: session.cwd,
        command,
      },
    });
  }, [session.cwd, session.id, session.workspaceId]);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;
    const terminalElement = terminalRef.current;

    const xterm = new XTerm({
      theme: terminalTheme,
      fontFamily: 'Cascadia Mono',
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 1,
      letterSpacing: 0,
      customGlyphs: true,
      rescaleOverlappingGlyphs: true,
      minimumContrastRatio: 1,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: false,
      allowTransparency: false,
      disableStdin: false,
      macOptionIsMeta: false,
      macOptionClickForcesSelection: false,
      scrollOnUserInput: true,
      smoothScrollDuration: 0,
      windowsPty: isWindowsHost ? { backend: 'conpty', buildNumber: 19000 } : undefined,
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

    xterm.open(terminalElement);
    if (savedMouseModes.length > 0) {
      replayMouseModes(savedMouseModes);
    }

    const handlePasteCapture = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleMouseDownFocus = () => {
      xterm.focus();
    };

    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
    };

    terminalElement.addEventListener('paste', handlePasteCapture, { capture: true });
    terminalElement.addEventListener('mousedown', handleMouseDownFocus);
    terminalElement.addEventListener('wheel', handleWheel, { passive: true });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    terminalReadyRef.current = true;

    setTimeout(() => {
      handleFitAndResize();
    }, 50);
    setTimeout(() => {
      handleFitAndResize();
    }, 250);
    setTimeout(() => {
      handleFitAndResize();
    }, 900);

    const fontsApi = (document as Document & { fonts?: FontFaceSet }).fonts;
    const onFontsDone = () => {
      handleFitAndResize();
      xterm.clearTextureAtlas();
      if (xterm.rows > 0) {
        xterm.refresh(0, xterm.rows - 1);
      }
    };

    if (fontsApi) {
      fontsApi.ready.then(() => {
        onFontsDone();
      }).catch(() => {
        // Ignore font readiness errors.
      });
      fontsApi.addEventListener('loadingdone', onFontsDone);
    }

    // Non-blocking input pipeline with write buffer for TUI mouse/scroll support.
    // Fire-and-forget prevents mouse events from queue-blocking.
    let inputBuffer = '';
    let inputFlushTimer: ReturnType<typeof setTimeout> | null = null;

    xterm.onData((data) => {
      if (!managedCommandActive && data.includes('\r') && lineTrackingReliableRef.current) {
        const commandCandidate = lineBufferRef.current;
        lineBufferRef.current = '';
        lineTrackingReliableRef.current = true;

        if (shouldInterceptManagedCommand(commandCandidate)) {
          inputBuffer = '';
          if (inputFlushTimer) {
            clearTimeout(inputFlushTimer);
            inputFlushTimer = null;
          }

          void (async () => {
            try {
              await invoke('write_to_terminal', {
                sessionId: session.id,
                input: '\x03\r',
              });
              await startManagedCommand(commandCandidate.trim());
            } catch (error) {
              console.error('Failed to reroute managed terminal command:', error);
            }
          })();
          return;
        }
      }

      for (const char of data) {
        if (char === '\r' || char === '\n') {
          lineBufferRef.current = '';
          lineTrackingReliableRef.current = true;
          continue;
        }

        if (char === '\u0003' || char === '\u0015') {
          lineBufferRef.current = '';
          lineTrackingReliableRef.current = true;
          continue;
        }

        if (char === '\u001b') {
          lineBufferRef.current = '';
          lineTrackingReliableRef.current = false;
          continue;
        }

        if (char === '\u0008' || char === '\u007f') {
          if (lineTrackingReliableRef.current) {
            lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          }
          continue;
        }

        if (char < ' ') {
          lineTrackingReliableRef.current = false;
          continue;
        }

        if (lineTrackingReliableRef.current) {
          lineBufferRef.current += char;
        }
      }

      inputBuffer += data;
      if (!inputFlushTimer) {
        inputFlushTimer = setTimeout(() => {
          const toSend = inputBuffer;
          inputBuffer = '';
          inputFlushTimer = null;
          invoke('write_to_terminal', { sessionId: session.id, input: toSend }).catch((error) => {
            console.error('Failed to write to terminal:', error);
          });
        }, 0);
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

          if (text.length > 1024) {
            setPendingPasteText(text);
            setShowPasteConfirm(true);
            return;
          }

          const CHUNK_SIZE = 512;
          const DELAY = 2;

          try {
            await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[200~' });

            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
              const chunk = text.slice(i, i + CHUNK_SIZE);
              await invoke('write_to_terminal', { sessionId: session.id, input: chunk });
              if (i + CHUNK_SIZE < text.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY));
              }
            }

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
      if (inputFlushTimer) {
        clearTimeout(inputFlushTimer);
      }
      lineBufferRef.current = '';
      lineTrackingReliableRef.current = true;
      if (fontsApi) {
        fontsApi.removeEventListener('loadingdone', onFontsDone);
      }
      terminalElement.removeEventListener('paste', handlePasteCapture, true);
      terminalElement.removeEventListener('mousedown', handleMouseDownFocus);
      terminalElement.removeEventListener('wheel', handleWheel);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [session.id, isWindowsHost, replayMouseModes, savedMouseModes, terminalTheme, handleFitAndResize, managedCommandActive, startManagedCommand]);

  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.options.theme = terminalTheme;
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    invoke<ManagedTerminalCommandState | null>('get_managed_terminal_command_state', {
      sessionId: session.id,
    }).then((state) => {
      if (mounted) {
        setManagedCommandState(state);
      }
    }).catch(() => undefined);

    let unlistenFn: (() => void) | null = null;
    listen<ManagedTerminalCommandState>('managed-command-state-changed', (event) => {
      if (!mounted || event.payload.sessionId !== session.id) return;
      setManagedCommandState(event.payload);
    }).then((fn) => {
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
    if (!xtermRef.current) return;
    xtermRef.current.options.disableStdin = managedCommandActive;
  }, [managedCommandActive]);

  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      const unlisten = await listen<string>(`terminal-output:${session.id}`, (event) => {
        if (!mounted) return;
        parseMouseTrackingState(event.payload);
        const term = xtermRef.current;
        if (!term) return;

        term.write(event.payload);
        if (!firstOutputFitDoneRef.current) {
          firstOutputFitDoneRef.current = true;
          setTimeout(() => {
            if (!mounted) return;
            handleFitAndResize();
          }, 0);
        }
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
  }, [session.id, parseMouseTrackingState, handleFitAndResize]);

  useEffect(() => {
    setCliLaunched(false);
    terminalReadyRef.current = false;
    firstOutputFitDoneRef.current = false;
    launchAttemptsRef.current = 0;
    mouseModesRef.current = new Set(savedMouseModes);
    setMouseTrackingEnabled(savedMouseModes.length > 0);
    if (launchTimeoutRef.current) {
      clearTimeout(launchTimeoutRef.current);
      launchTimeoutRef.current = null;
    }
  }, [session.id, isWindowsHost, savedMouseModes]);

  useEffect(() => {
    mouseModesRef.current = new Set(savedMouseModes);
    setMouseTrackingEnabled(savedMouseModes.length > 0);

    if (savedMouseModes.length > 0 && xtermRef.current) {
      replayMouseModes(savedMouseModes);
    }
  }, [savedMouseModes, replayMouseModes]);

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

    const doLaunch = async () => {
      try {
        await launchCli(session.id, session.agent!);
        await checkAuth(session.agent!);
        setCliLaunched(true);
        launchAttemptsRef.current = 0;
      } catch (e) {
        console.error('CLI launch failed:', e);
        launchAttemptsRef.current += 1;
        if (launchAttemptsRef.current < 3) {
          const delay = 3000 * launchAttemptsRef.current;
          launchTimeoutRef.current = setTimeout(() => {
            setCliLaunched(false);
          }, delay);
        }
      }
    };

    if (!terminalReadyRef.current) {
      const interval = setInterval(() => {
        if (terminalReadyRef.current) {
          clearInterval(interval);
          doLaunch();
        }
      }, 200);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        launchAttemptsRef.current += 1;
        if (launchAttemptsRef.current < 3) {
          const delay = 3000 * launchAttemptsRef.current;
          launchTimeoutRef.current = setTimeout(() => {
            setCliLaunched(false);
          }, delay);
        }
      }, 12000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
        if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
      };
    }

    doLaunch();

    return () => {
      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
    };
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
    if (installProgress && installProgress.agent === session.agent) {
      if (installProgress.stage === 'Completed' || installProgress.stage === 'Failed') {
        setInstalling(false);
      }
    }
  }, [installProgress, session.agent]);

  const handleRetryInstall = async () => {
    if (!session.agent) return;
    const agentTypes: AgentType[] = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'kilo', 'hermes'];
    if (!agentTypes.includes(session.agent as AgentType)) return;
    setInstalling(true);
    await installCli(session.agent as AgentType);
    if (session.agent) {
      await detectCli(session.agent as AgentType);
    }
  };

  const handleAuthenticate = async () => {
    setShowAuthModal(true);
  };

  const executePaste = useCallback(async () => {
    if (!pendingPasteText) return;
    setShowPasteConfirm(false);

    const CHUNK_SIZE = 512;
    const DELAY = 2;

    try {
      await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[200~' });

      for (let i = 0; i < pendingPasteText.length; i += CHUNK_SIZE) {
        const chunk = pendingPasteText.slice(i, i + CHUNK_SIZE);
        await invoke('write_to_terminal', { sessionId: session.id, input: chunk });
        if (i + CHUNK_SIZE < pendingPasteText.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY));
        }
      }

      await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[201~' });
    } catch (error) {
      console.error('Failed to paste to terminal:', error);
    }
    setPendingPasteText('');
  }, [pendingPasteText, session.id]);

  const cancelPaste = useCallback(() => {
    setShowPasteConfirm(false);
    setPendingPasteText('');
  }, []);

  return (
    <div
      className={`h-full flex flex-col overflow-hidden rounded-2xl font-mono border border-zinc-800/80 ${
        isLight
          ? 'bg-zinc-900'
          : 'bg-zinc-950'
      }`}
    >
      <TerminalHeader
        session={session}
        theme={theme}
        onRefreshCli={handleRefreshCli}
        isRefreshing={isRefreshing}
        onClose={onClose}
        mouseTrackingEnabled={mouseTrackingEnabled}
        onToggleMouseTracking={handleToggleMouseTracking}
        cliStatusBadge={
          <CliStatusBadge
            cliInfo={cliInfo}
            launchState={launchState}
            authInfo={authInfo}
            theme={theme}
            onAuthenticate={handleAuthenticate}
            onRetryInstall={handleRetryInstall}
            installing={installing}
          />
        }
        dragListeners={dragListeners}
      />

      {showSearch && (
        <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${
          isLight ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-900 border-zinc-800'
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
              isLight ? 'text-zinc-200 placeholder-zinc-500' : 'text-zinc-300 placeholder-zinc-600'
            }`}
            autoFocus
          />
          <button
            onClick={() => handleSearch('prev')}
            className={`p-1 rounded transition-colors cursor-pointer ${isLight ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-800 text-zinc-500'}`}
            title="Previous match"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => handleSearch('next')}
            className={`p-1 rounded transition-colors cursor-pointer ${isLight ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-800 text-zinc-500'}`}
            title="Next match"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={handleClearSearch}
            className={`p-1 rounded transition-colors cursor-pointer ${isLight ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-800 text-zinc-500'}`}
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
        className={`flex-1 overflow-hidden min-h-0 p-[3px] ${isLight ? 'bg-[#18181b]' : 'bg-[#09090b]'}`}
        style={{
          pointerEvents: 'auto',
          touchAction: 'auto',
        }}
        onClick={() => xtermRef.current?.focus()}
        onMouseDown={() => xtermRef.current?.focus()}
      />

      {showAuthModal && session.agent && (
        <AuthModal
          agent={session.agent}
          onClose={() => setShowAuthModal(false)}
          getAuthInstructions={getAuthInstructions}
          theme={theme}
        />
      )}

      {showPasteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`w-80 rounded-xl border shadow-2xl p-5 ${
            isLight ? 'bg-zinc-900 border-zinc-700' : 'bg-zinc-950 border-zinc-800'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-zinc-200' : 'text-zinc-200'}`}>
                Large Paste Detected
              </span>
            </div>
            <p className={`text-[10px] leading-relaxed mb-4 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
              You are about to paste {(pendingPasteText.length / 1024).toFixed(1)} KB of text into the terminal. This may take a moment.
            </p>
            <div className="flex gap-2">
              <button
                onClick={cancelPaste}
                className={`flex-1 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  isLight ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={executePaste}
                className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 transition-colors cursor-pointer"
              >
                Paste Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
