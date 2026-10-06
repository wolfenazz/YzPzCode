import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { TerminalSession, AgentCliInfo, CliLaunchState, AuthInfo, AgentType, CliType, ManagedTerminalCommandState } from '../../types';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useCliLauncher } from '../../hooks/useCliLauncher';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useActiveCustomTheme } from '../../hooks/useCustomTheme';
import { useAppStore } from '../../stores/appStore';
import { buildTerminalPalette } from '../../utils/customTheme';
import { getTerminalFontStack } from '../../utils/terminalFonts';
import { registerTerminal } from '../../utils/terminalRegistry';
import { observeTerminalLayout, refreshTerminalAtlases, registerTerminalRenderer } from '../../utils/terminalRendering';
import { detectTerminalCwd } from '../../utils/terminalCwd';
import { buildMouseModeSequence, DEFAULT_MOUSE_TRACKING_MODES, registerTerminalMouseModes } from '../../utils/terminalMouseModes';
import { ADDITIONAL_AGENT_TYPES } from '../../data/additionalAgents';
import { AgentActivityTracker, playAgentDoneSound } from '../../utils/agentDoneNotifier';
import { CaretDown, CaretUp, MagnifyingGlass, Warning, X } from '@phosphor-icons/react';
import '@xterm/xterm/css/xterm.css';
import './TerminalPane.css';

import { TerminalHeader, isAgentType } from './TerminalHeader';
import { CliStatusBadge } from './CliStatusBadge';
import { AuthModal } from './AuthModal';
import { QuickPromptChips } from '../common/QuickPromptChips';

interface TerminalPaneProps {
  session: TerminalSession;
  onResize?: (cols: number, rows: number) => void;
  onClose?: () => void;
  dragListeners?: Record<string, unknown>;
}

const DARK_TERMINAL_THEME = {
  background: '#262626',
  foreground: '#c3c1ba',
  cursor: '#d87757',
  cursorAccent: '#262626',
  selectionBackground: '#3e3e38',
  selectionForeground: '#faf8f1',
  black: '#1b1b1b',
  red: '#f14444',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#1b7ede',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e4e4e4',
  brightBlack: '#51504a',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#38bdf8',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#faf8f1',
};

/** ANSI colors tuned for a light terminal background (custom themes may choose one). */
const LIGHT_TERMINAL_ANSI = {
  black: '#2b2b2b',
  red: '#c42b1c',
  green: '#0f7b45',
  yellow: '#8a6100',
  blue: '#1b5fb8',
  magenta: '#9b2f9b',
  cyan: '#0e6f87',
  white: '#6b6b6b',
  brightBlack: '#555555',
  brightRed: '#d13438',
  brightGreen: '#13804b',
  brightYellow: '#9a6c00',
  brightBlue: '#2468c4',
  brightMagenta: '#a93fa9',
  brightCyan: '#137a94',
  brightWhite: '#1a1a1a',
};

const withOpacity = (color: string, opacityPercent: number): string => {
  const alpha = Math.min(1, Math.max(0, opacityPercent / 100));
  if (alpha >= 1) return color;

  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const normalized = hex.length === 3
      ? hex.split('').map((digit) => `${digit}${digit}`).join('')
      : hex;
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }

  return color;
};

/** Local dev-server URLs printed by `npm run dev` / `vite` / `next dev` etc. */
const DEV_SERVER_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/gi;

const NEW_SESSION_COMMANDS: Partial<Record<CliType, string>> = {
  opencode: '/new',
  kilo: '/new',
  codex: '/new',
  antigravity: '/clear',
  cursor: '/new',
  hermes: '/new',
  pi: '/new',
  claude: '/clear',
  grok: '/new',
};

// AI agent binary names a user may type to launch an agent manually inside a
// shell terminal. Cursor's CLI binary is `agent` (not `cursor`), so both the
// user-facing name and the real binary are matched to the Cursor agent.
const AGENT_BINARY_NAMES: Record<string, AgentType> = {
  claude: 'claude',
  codex: 'codex',
  antigravity: 'antigravity',
  opencode: 'opencode',
  kilo: 'kilo',
  hermes: 'hermes',
  pi: 'pi',
  agent: 'cursor',
  cursor: 'cursor',
  // The Command Code CLI is `cmd` on macOS/Linux/WSL. We deliberately do NOT
  // map `cmd` here because on native Windows that is the system command shell;
  // only the Windows alias (`cmdc`) and the full name (`command-code`) tag a
  // session as Command Code.
  cmdc: 'commandcode',
  'command-code': 'commandcode',
  cline: 'cline',
  grok: 'grok',
  devin: 'devin',
  traecli: 'trae',
  kimi: 'kimi',
  qoder: 'qoder',
  copilot: 'copilot',
  'kiro-cli': 'kiro',
  vibe: 'mistralvibe',
  deepseek: 'deepseektui',
  aider: 'aider',
  agy: 'antigravity',
  reasonix: 'reasonix',
  amp: 'amp',
  dsh: 'dsh',
  codebuddy: 'codebuddy',
  mimo: 'mimo',
  atomcode: 'atomcode',
};

const LAUNCHER_TOKENS = new Set(['npx', 'npx.cmd', 'npx.exe', 'bunx', 'bunx.cmd', 'bunx.exe', 'sudo', 'yarn', 'npm', 'pnpm']);
const SUBCOMMAND_TOKENS = new Set(['dlx', 'exec', 'create', 'dlx.cmd', 'exec.cmd']);

const commandBasename = (token: string): string => {
  const normalized = token.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
};

const detectAgentFromCommand = (command: string): AgentType | null => {
  const tokens = command.trim().split(/\s+/);
  if (tokens.length === 0) return null;

  while (tokens.length && /^[-@]/.test(tokens[0])) tokens.shift();

  // Peel off launchers (npx / bunx / sudo / pnpm dlx / yarn dlx / npm exec ...)
  // plus their option/subcommand tokens until the resolved executable is first.
  let changed = true;
  while (changed && tokens.length) {
    changed = false;
    const current = commandBasename(tokens[0]).toLowerCase();
    if (LAUNCHER_TOKENS.has(current)) {
      tokens.shift();
      changed = true;
      while (tokens.length && /^-/.test(tokens[0])) tokens.shift();
      if (tokens.length && SUBCOMMAND_TOKENS.has(tokens[0].toLowerCase())) {
        tokens.shift();
        changed = true;
        while (tokens.length && /^-/.test(tokens[0])) tokens.shift();
      }
    }
  }

  if (tokens.length === 0) return null;
  const name = commandBasename(tokens[0]).toLowerCase().replace(/\.(exe|cmd|bat|sh)$/, '');
  return AGENT_BINARY_NAMES[name] ?? null;
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

type ShellKind = 'cmd' | 'powershell' | 'unix';

/**
 * Determine the running shell kind from the session shell path so paste and
 * mouse behaviour can be matched to what the shell actually supports.
 */
const detectShellKind = (shell: string): ShellKind => {
  const s = shell.toLowerCase();
  if (s.includes('cmd') || s.includes('command.com')) return 'cmd';
  if (s.includes('powershell') || s.includes('pwsh')) return 'powershell';
  return 'unix';
};

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  session,
  onResize,
  onClose,
  dragListeners,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ index: number; count: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [cliLaunched, setCliLaunched] = useState(false);
  const terminalReadyRef = useRef(false);
  const firstOutputFitDoneRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const launchAttemptsRef = useRef(0);
  const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPasteConfirm, setShowPasteConfirm] = useState(false);
  const [pendingPasteText, setPendingPasteText] = useState('');
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [mouseTrackingEnabled, setMouseTrackingEnabled] = useState(false);
  const [managedCommandState, setManagedCommandState] = useState<ManagedTerminalCommandState | null>(null);
  const [currentCwd, setCurrentCwd] = useState(session.cwd);
  const currentCwdRef = useRef(session.cwd);
  const cwdOutputBufferRef = useRef('');
  const mouseModesRef = useRef<Set<number>>(new Set());
  const lineBufferRef = useRef('');
  const lineTrackingReliableRef = useRef(true);
  const managedCommandActiveRef = useRef(false);
  const managedStopRequestedRef = useRef(false);
  const setTerminalMouseModes = useAppStore((state) => state.setTerminalMouseModes);
  const addDevServerUrl = useAppStore((state) => state.addDevServerUrl);
  const manualAgent = useAppStore((state) => state.manualAgentBySession[session.id]);
  const setManualAgent = useAppStore((state) => state.setManualAgent);
  const terminalPasteOnRightClick = useAppStore((state) => state.terminalPasteOnRightClick);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const activeView = useAppStore((state) => state.activeView);
  const view = useAppStore((state) => state.view);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const setActiveSession = useAppStore((state) => state.setActiveSession);
  const isActive = activeSessionId === session.id;

  // Resize coalescing: we only send the latest size to the PTY, debounced, so
  // rapid ResizeObserver/window resize events don't flood ConPTY with resizes.
  const resizePendingRef = useRef<{ cols: number; rows: number; pixelWidth: number; pixelHeight: number } | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeInFlightRef = useRef(false);
  // Tracks the last size we told the PTY about so identical refits (font load,
  // repeated ResizeObserver fires, mount-time fits) become no-ops instead of
  // resize storms that make running agents reflow "chunky".
  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  // Refs mirroring store settings so the xterm lifecycle effect (which only
  // re-runs per session) can read the latest values without being re-created.
  const effectiveAgent = manualAgent ?? session.agent;
  const pasteOnRightClickRef = useRef(terminalPasteOnRightClick);
  const effectiveAgentRef = useRef(effectiveAgent);
  const promoteToAgentRef = useRef<((agent: AgentType) => void) | null>(null);
  useEffect(() => {
    effectiveAgentRef.current = effectiveAgent;
  }, [effectiveAgent]);
  useEffect(() => {
    pasteOnRightClickRef.current = terminalPasteOnRightClick;
  }, [terminalPasteOnRightClick]);

  // Plays the notification sound when an AI agent in this pane finishes a task.
  const agentActivityRef = useRef<AgentActivityTracker | null>(null);
  useEffect(() => {
    const tracker = new AgentActivityTracker(() => {
      const { agentDoneSoundEnabled, notificationSoundVolume } = useAppStore.getState();
      if (agentDoneSoundEnabled) playAgentDoneSound(notificationSoundVolume);
    });
    agentActivityRef.current = tracker;
    return () => {
      tracker.dispose();
      if (agentActivityRef.current === tracker) agentActivityRef.current = null;
    };
  }, [session.id]);

  const terminalFontFamily = useAppStore((s) => s.terminalFontFamily);
  const terminalFontStack = useMemo(() => getTerminalFontStack(terminalFontFamily), [terminalFontFamily]);
  const terminalFontSize = useAppStore((s) => s.terminalFontSize);
  const terminalCursorStyle = useAppStore((s) => s.terminalCursorStyle);
  const terminalCursorBlink = useAppStore((s) => s.terminalCursorBlink);
  const terminalScrollbackSize = useAppStore((s) => s.terminalScrollbackSize);
  const terminalOpacity = useAppStore((s) => s.terminalOpacity);
  const terminalBackgroundColor = useAppStore((s) => s.terminalBackgroundColor);
  const terminalForegroundColor = useAppStore((s) => s.terminalForegroundColor);

  const terminalPrefsRef = useRef({
    fontFamily: terminalFontStack,
    fontSize: terminalFontSize,
    cursorStyle: terminalCursorStyle,
    cursorBlink: terminalCursorBlink,
    scrollback: terminalScrollbackSize,
  });
  useEffect(() => {
    terminalPrefsRef.current = {
      fontFamily: terminalFontStack,
      fontSize: terminalFontSize,
      cursorStyle: terminalCursorStyle,
      cursorBlink: terminalCursorBlink,
      scrollback: terminalScrollbackSize,
    };
  }, [terminalFontStack, terminalFontSize, terminalCursorStyle, terminalCursorBlink, terminalScrollbackSize]);

  const { cliStatuses, installCli, installProgress, detectCli } = useAgentCli();
  const { launchCli, stopCli, checkAuth, getAuthInstructions, getLaunchState, getLaunchStateSync, getAuthInfoSync } = useCliLauncher();
  const [installing, setInstalling] = useState(false);

  const cliInfo: AgentCliInfo | null = session.agent ? cliStatuses[session.agent] : null;
  const launchState: CliLaunchState | null | undefined = session.agent ? getLaunchStateSync(session.id) : undefined;
  const authInfo: AuthInfo | null | undefined = session.agent ? getAuthInfoSync(session.agent) : undefined;

  const effectiveTheme = useEffectiveTheme();
  const customTheme = useActiveCustomTheme();

  // xterm's color parser rejects CSS var strings, so read the resolved value
  // of --bg-terminal (app background darkened) for the canvas background.
  // A custom theme supplies its palette directly: the CSS variables it sets land
  // after this memo runs, so reading them back here would be one theme behind.
  const terminalTheme = useMemo(() => {
    const palette = customTheme ? buildTerminalPalette(customTheme) : null;
    const themeBackground = palette?.background ?? getComputedStyle(document.documentElement).getPropertyValue('--bg-terminal').trim();
    const background = terminalBackgroundColor || themeBackground || DARK_TERMINAL_THEME.background;
    return {
      ...(palette?.light ? { ...DARK_TERMINAL_THEME, ...LIGHT_TERMINAL_ANSI } : DARK_TERMINAL_THEME),
      ...(palette && {
        cursor: palette.cursor,
        selectionBackground: palette.selectionBackground,
        selectionForeground: palette.selectionForeground,
      }),
      background: withOpacity(background, terminalOpacity),
      foreground: terminalForegroundColor || palette?.foreground || DARK_TERMINAL_THEME.foreground,
      cursorAccent: background,
    };
  }, [effectiveTheme, customTheme, terminalBackgroundColor, terminalForegroundColor, terminalOpacity]);
  const managedCommandActive =
    managedCommandState?.status === 'Starting' ||
    managedCommandState?.status === 'Running' ||
    managedCommandState?.status === 'Stopping';
  useEffect(() => {
    managedCommandActiveRef.current = managedCommandActive;
    if (!managedCommandActive) managedStopRequestedRef.current = false;
  }, [managedCommandActive]);

  const sendResize = useCallback(async (dims: { cols: number; rows: number; pixelWidth: number; pixelHeight: number }) => {
    resizeInFlightRef.current = true;
    try {
      await invoke('resize_terminal', {
        sessionId: session.id,
        cols: dims.cols,
        rows: dims.rows,
        pixelWidth: dims.pixelWidth,
        pixelHeight: dims.pixelHeight,
      });
    } catch (e) {
      console.error('Failed to resize terminal:', e);
    } finally {
      resizeInFlightRef.current = false;
      // Flush any newer size that arrived while this request was in flight,
      // so the PTY always ends up with the latest dimensions.
      const pending = resizePendingRef.current;
      if (pending) {
        resizePendingRef.current = null;
        void sendResize(pending);
      }
    }
  }, [session.id]);

  const handleFitAndResize = useCallback((forceRepaint = false) => {
    if (!fitAddonRef.current || !xtermRef.current) return;
    const container = terminalRef.current;
    if (!container) return;

    // Skip when hidden or zero-sized (view switch, collapsed layout). Sending
    // a 0x0 PTY resize corrupts the window size TUI apps see and causes
    // chunky rendering glitches.
    const rect = container.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    try {
      const proposed = fitAddonRef.current.proposeDimensions();
      if (!proposed || proposed.cols < 2 || proposed.rows < 2) return;
      fitAddonRef.current.fit();
      const xterm = xtermRef.current;
      const cols = xterm.cols;
      const rows = xterm.rows;
      if (cols < 2 || rows < 2) return;

      const last = lastSentSizeRef.current;
      const sizeChanged = !last || last.cols !== cols || last.rows !== rows;

      if (sizeChanged) {
        lastSentSizeRef.current = { cols, rows };

        // Round UP so ConPTY never derives fewer rows/cols than xterm actually
        // renders — rounding down is what made running agents reflow "chunky".
        const cell = getTerminalCellPixels(xterm);
        const pixelWidth = Math.max(1, Math.ceil(cols * cell.width));
        const pixelHeight = Math.max(1, Math.ceil(rows * cell.height));

        onResizeRef.current?.(cols, rows);

        resizePendingRef.current = { cols, rows, pixelWidth, pixelHeight };
        if (resizeTimerRef.current) {
          clearTimeout(resizeTimerRef.current);
        }
        resizeTimerRef.current = setTimeout(() => {
          const pending = resizePendingRef.current;
          resizePendingRef.current = null;
          if (!pending) return;
          if (resizeInFlightRef.current) {
            // Hand back to the in-flight request's finally to avoid a parallel
            // second request racing the first.
            resizePendingRef.current = pending;
            return;
          }
          void sendResize(pending);
        }, 120);
      }

      // After a real size change (or when the terminal just became visible
      // again after a view switch) force a full repaint so the canvas never
      // shows stale rows from the previous size.
      if (sizeChanged || forceRepaint) {
        if (forceRepaint) refreshTerminalAtlases();
        else xterm.refresh(0, xterm.rows - 1);
      }
    } catch (e) {
      console.error('Error fitting terminal:', e);
    }
  }, [sendResize]);

  const handleSearch = useCallback((direction: 'next' | 'prev', query = searchQuery, incremental = false) => {
    if (!searchAddonRef.current) return;
    if (!query) {
      searchAddonRef.current.clearDecorations();
      setSearchResults(null);
      return;
    }

    const options = {
      regex: false,
      wholeWord: false,
      caseSensitive: false,
      incremental,
      decorations: {
        matchBackground: '#3b8eea66',
        matchBorder: '#3b8eea',
        activeMatchBackground: '#f5f543',
        activeMatchBorder: '#f5f543',
        matchOverviewRuler: '#3b8eea',
        activeMatchColorOverviewRuler: '#f5f543',
      },
    };

    if (direction === 'next') {
      searchAddonRef.current.findNext(query, options);
    } else {
      searchAddonRef.current.findPrevious(query, options);
    }
  }, [searchQuery]);

  const handleOpenSearch = useCallback(() => {
    setShowSearch(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    if (searchAddonRef.current) {
      searchAddonRef.current.clearDecorations();
    }
    setSearchQuery('');
    setSearchResults(null);
    setShowSearch(false);
    xtermRef.current?.focus();
  }, []);

  const handleClearTerminal = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  const focusTerminal = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  const handleRunCommand = useCallback(async (command: string) => {
    try {
      // Write the command text and the Enter separately with a small gap.
      // TUI agents (opencode, kilo, ...) can drop the submit if the Enter byte
      // arrives in the same chunk as the text — the text stays in the input
      // box but never runs. Splitting reproduces real typing.
      await invoke('write_to_terminal', { sessionId: session.id, input: command });
      await new Promise((resolve) => setTimeout(resolve, 120));
      await invoke('write_to_terminal', { sessionId: session.id, input: '\r' });
    } catch (e) {
      console.error('Failed to run agent command:', e);
    }
  }, [session.id, setManualAgent]);

  const handleNewSession = useCallback(async () => {
    if (!effectiveAgentRef.current) return;
    const command = NEW_SESSION_COMMANDS[effectiveAgentRef.current as CliType] ?? '/new';
    await handleRunCommand(command);
  }, [handleRunCommand]);

  const promoteToAgent = useCallback((agent: AgentType) => {
    if (effectiveAgentRef.current) return;
    setManualAgent(session.id, agent);
  }, [session.id, setManualAgent]);

  promoteToAgentRef.current = promoteToAgent;

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

  const handleToggleMouseTracking = useCallback(() => {
    const modes = mouseTrackingEnabled ? mouseModesRef.current : DEFAULT_MOUSE_TRACKING_MODES;
    xtermRef.current?.write(buildMouseModeSequence(modes, mouseTrackingEnabled ? 'l' : 'h'));
  }, [mouseTrackingEnabled]);

  const stopManagedCommand = useCallback(async () => {
    if (managedStopRequestedRef.current) return;
    managedStopRequestedRef.current = true;
    try {
      await invoke('stop_managed_terminal_command', { sessionId: session.id });
    } catch (error) {
      managedStopRequestedRef.current = false;
      console.error('Failed to stop managed terminal command:', error);
      xtermRef.current?.writeln(`\r\n[managed] failed to stop command: ${String(error)}`);
    }
  }, [session.id]);

  /**
   * Shell-aware paste. CMD (cmd.exe) does NOT support bracketed paste — the
   * \x1b[200~ markers would be typed literally and break multi-line pastes.
   * For CMD we normalize line endings and execute each line immediately, just
   * like native CMD paste. Other shells receive bracketed paste only when
   * the foreground application has enabled it.
   */
  const pasteToTerminal = useCallback(async (text: string) => {
    if (!text) return;
    if (managedCommandActiveRef.current) {
      // Let xterm honor the foreground application's bracketed-paste mode.
      xtermRef.current?.paste(text);
      return;
    }

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const pastedLine = normalized.replace(/\n$/, '');
    const isSingleLine = !pastedLine.includes('\n');
    if (lineTrackingReliableRef.current && isSingleLine) {
      const commandCandidate = lineBufferRef.current + pastedLine;
      lineBufferRef.current = normalized.endsWith('\n') ? '' : commandCandidate;
    } else {
      lineBufferRef.current = '';
      lineTrackingReliableRef.current = false;
    }

    // Pasting writes directly to the PTY (and therefore does not pass through
    // xterm's onData handler). Promote a plain pasted agent command as well so
    // the header controls stay in sync with what the shell is running.
    if (!effectiveAgentRef.current) {
      const pastedCommand = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')[0] ?? '';
      const detectedAgent = detectAgentFromCommand(pastedCommand);
      if (detectedAgent) setManualAgent(session.id, detectedAgent);
    }

    const shellKind = detectShellKind(session.shell);
    const CHUNK_SIZE = 512;
    const DELAY = 2;

    if (shellKind === 'cmd') {
      const lines = normalized.split('\n');
      const endsWithNewline = normalized.endsWith('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isLast = i === lines.length - 1;
        const submit = !isLast || endsWithNewline;

        for (let j = 0; j < line.length; j += CHUNK_SIZE) {
          const chunk = line.slice(j, j + CHUNK_SIZE);
          await invoke('write_to_terminal', { sessionId: session.id, input: chunk });
          if (j + CHUNK_SIZE < line.length) {
            await new Promise((resolve) => setTimeout(resolve, DELAY));
          }
        }

        if (submit) {
          await invoke('write_to_terminal', { sessionId: session.id, input: '\r' });
          await new Promise((resolve) => setTimeout(resolve, DELAY));
        }
      }
      return;
    }

    const bracketedPaste = xtermRef.current?.modes.bracketedPasteMode === true;
    const input = bracketedPaste ? normalized : normalized.replace(/\n/g, '\r');
    if (bracketedPaste) {
      await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[200~' });
    }
    for (let i = 0; i < input.length; i += CHUNK_SIZE) {
      const chunk = input.slice(i, i + CHUNK_SIZE);
      await invoke('write_to_terminal', { sessionId: session.id, input: chunk });
      if (i + CHUNK_SIZE < input.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY));
      }
    }
    if (bracketedPaste) {
      await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[201~' });
    }
  }, [session.id, session.shell, setManualAgent]);

  const pasteClipboardText = useCallback(
    (text: string) => {
      if (!text) return;
      if (text.length > 1024) {
        setPendingPasteText(text);
        setShowPasteConfirm(true);
        return;
      }
      return pasteToTerminal(text);
    },
    [pasteToTerminal]
  );

  useEffect(() => {
    terminalReadyRef.current = false;
    if (!terminalRef.current || xtermRef.current) return;
    const terminalElement = terminalRef.current;

    const terminalPrefs = terminalPrefsRef.current;
    const xterm = new XTerm({
      theme: terminalTheme,
      fontFamily: terminalPrefs.fontFamily,
      fontSize: terminalPrefs.fontSize,
      fontWeight: '400',
      lineHeight: 1,
      letterSpacing: 0,
      minimumContrastRatio: 1,
      cursorBlink: terminalPrefs.cursorBlink,
      cursorStyle: terminalPrefs.cursorStyle,
      allowProposedApi: true,
      scrollback: terminalPrefs.scrollback,
      convertEol: false,
      allowTransparency: true,
      disableStdin: false,
      macOptionIsMeta: false,
      macOptionClickForcesSelection: false,
      scrollOnUserInput: true,
      smoothScrollDuration: 0,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const unicodeAddon = new Unicode11Addon();
    const webLinksAddon = new WebLinksAddon(async (event, uri) => {
      event.preventDefault();
      // Localhost links open in the embedded browser pane; everything else
      // still goes to the system browser.
      if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?\//i.test(`${uri}/`)) {
        try {
          addDevServerUrl(session.workspaceId, uri);
          useAppStore.getState().setActiveView('browser');
          // Reuse an existing tab for the same URL instead of stacking
          // duplicates — the same localhost URL may be printed many times.
          useAppStore.getState().openBrowserTab(session.workspaceId, uri);
          return;
        } catch (e) {
          console.error('Failed to open URL in embedded browser:', e);
        }
      }
      try {
        await invoke('open_url', { url: uri });
      } catch (e) {
        console.error('Failed to open URL:', e);
        window.open(uri, '_blank', 'noopener,noreferrer');
      }
    });

    const searchResultsSubscription = searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
      setSearchResults({ index: resultIndex, count: resultCount });
    });

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(searchAddon);
    xterm.loadAddon(unicodeAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.unicode.activeVersion = '11';

    xterm.open(terminalElement);

    // xterm 6 defaults to its DOM renderer, whose per-cell fractional spacing
    // breaks Unicode block art at Windows display scaling. Use the same GPU
    // renderer as VS Code; if WebGL is unavailable xterm continues with DOM.
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        console.warn('Terminal WebGL context lost; falling back to the DOM renderer.');
        webglAddon.dispose();
      });
      xterm.loadAddon(webglAddon);
    } catch (error) {
      console.warn('Terminal WebGL renderer is unavailable; using the DOM renderer.', error);
    }

    // Paste is owned by the app so it can apply shell-aware bracketed paste and
    // managed-command interception. The text is read synchronously from the
    // clipboard data carried by the native paste event instead of
    // navigator.clipboard.readText(): dictation/injection tools (for example
    // Handy) publish the transcript, inject Ctrl+V, then restore the previous
    // clipboard after only ~60 ms, so an async clipboard read can lose the race
    // and return the old (often empty) clipboard — the paste then silently does
    // nothing. The paste event's clipboardData is captured synchronously by the
    // browser and needs no read permission, so it works for synthetic and real
    // input alike. Running in the capture phase also swallows the event before
    // xterm's own paste listeners (on the terminal element and helper textarea)
    // can double-insert.
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      e.preventDefault();
      e.stopPropagation();
      if (text) {
        void pasteClipboardText(text);
      }
    };

    const handleMouseDownFocus = () => {
      xterm.focus();
    };

    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Right-click paste when enabled; otherwise let the app's global menu show.
      if (!pasteOnRightClickRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.readText().then((text) => {
        if (text) void pasteToTerminal(text);
      }).catch(console.error);
    };

    // Deliver Ctrl+C before the webview's clipboard shortcut can consume it.
    // ETX goes to the foreground PTY so programs can handle Ctrl+C normally.
    // The header's Stop button remains available for forced termination.
    const handleInterrupt = (event: KeyboardEvent) => {
      const isCtrlC = event.ctrlKey
        && !event.altKey
        && !event.shiftKey
        && (event.key.toLowerCase() === 'c' || event.code === 'KeyC');
      if (!isCtrlC || xterm.hasSelection()) return;

      event.preventDefault();
      event.stopPropagation();
      xterm.input('\x03', true);
    };

    terminalElement.addEventListener('paste', handlePaste, { capture: true });
    terminalElement.addEventListener('keydown', handleInterrupt, { capture: true });
    terminalElement.addEventListener('mousedown', handleMouseDownFocus);
    terminalElement.addEventListener('wheel', handleWheel, { passive: true });
    terminalElement.addEventListener('contextmenu', handleContextMenu);

    const unregisterTerminal = registerTerminal({
      element: terminalElement,
      xterm,
      paste: pasteClipboardText,
      focus: () => xterm.focus(),
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    terminalReadyRef.current = true;
    const unregisterRenderer = registerTerminalRenderer(xterm);
    let disposed = false;

    const mouseSubscription = registerTerminalMouseModes(xterm, (modes, enabled) => {
      mouseModesRef.current = new Set(modes);
      setMouseTrackingEnabled(enabled);
      setTerminalMouseModes(session.id, modes);
    });
    // The PTY can outlive the pane (for example when opening Settings). Restore
    // its last parsed protocol and encoding before accepting further output.
    const savedMouseModes = useAppStore.getState().terminalMouseModesBySession[session.id] ?? [];
    mouseModesRef.current = new Set(savedMouseModes);
    xterm.write(buildMouseModeSequence(savedMouseModes, 'h'));

    // Initial fit: wait for layout to settle (double rAF), then fit. The
    // ResizeObserver and font-ready fit handle any later size changes, and the
    // unchanged-dims guard makes redundant fits cheap no-ops.
    let secondInitialFrame: number | null = null;
    const firstInitialFrame = requestAnimationFrame(() => {
      secondInitialFrame = requestAnimationFrame(() => {
        handleFitAndResize();
      });
    });
    // Fallback in case the pane is still inside a mount transition at rAF time.
    const initialFitTimeout = setTimeout(() => {
      handleFitAndResize();
    }, 300);

    const fontsApi = (document as Document & { fonts?: FontFaceSet }).fonts;
    const onFontsDone = () => {
      if (disposed) return;
      handleFitAndResize();
      refreshTerminalAtlases();
    };

    if (fontsApi) {
      fontsApi.ready.then(() => {
        onFontsDone();
      }).catch(() => {
        // Ignore font readiness errors.
      });
      fontsApi.addEventListener('loadingdone', onFontsDone);
    }

    // Batch input without blocking rendering, and serialize IPC writes so
    // fast typing, Enter, and control sequences arrive in their original order.
    let inputBuffer = '';
    let inputFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let inputWrites: Promise<unknown> = Promise.resolve();

    xterm.onData((data) => {
      const agent = effectiveAgentRef.current;
      if (agent && isAgentType(agent)) {
        if (data === '\u001b' || data.includes('\u0003')) agentActivityRef.current?.disarm();
        else if (/[\r\n]/.test(data)) agentActivityRef.current?.arm();
      }

      // xterm normally reports Enter as CR, but some shells/keymaps emit LF.
      // Detect both so manually typed AI commands promote the terminal header
      // consistently across Windows, macOS, and Linux shells.
      if (!managedCommandActiveRef.current && /[\r\n]/.test(data) && lineTrackingReliableRef.current) {
        const commandCandidate = lineBufferRef.current;
        lineBufferRef.current = '';
        lineTrackingReliableRef.current = true;

        const detectedAgent = detectAgentFromCommand(commandCandidate);
        if (detectedAgent && !effectiveAgentRef.current) {
          promoteToAgentRef.current?.(detectedAgent);
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
          inputWrites = inputWrites
            .then(() => invoke('write_to_terminal', { sessionId: session.id, input: toSend }))
            .catch((error: unknown) => {
              console.error('Failed to write to terminal:', error);
            });
        }, 0);
      }
    });

    xterm.attachCustomKeyEventHandler((event) => {
      const isCtrl = event.ctrlKey || event.metaKey;
      const isKeydown = event.type === 'keydown';

      if (isCtrl && !event.altKey && !event.shiftKey
        && (event.key.toLowerCase() === 'c' || event.code === 'KeyC')
        && xterm.hasSelection() && isKeydown) {
        event.preventDefault();
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(console.error);
        }
        xterm.clearSelection();
        return false;
      }

      // Do not consume the paste chord here — returning false only stops xterm
      // from turning it into raw bytes. The browser still performs its default
      // paste command, which fires the capture-phase paste handler above and
      // reads the clipboard synchronously. Matching on `code` as well as `key`
      // keeps this correct on non-Latin layouts (Handy injects VK_V, which is
      // layout independent) and for Ctrl+Shift+V (the key is "V" while Shift is
      // held). The Shift+Insert branch covers the alternate chord dictation
      // tools use.
      if (isCtrl && isKeydown && (event.key.toLowerCase() === 'v' || event.code === 'KeyV')) {
        return false;
      }

      if (isKeydown && event.shiftKey && (event.key === 'Insert' || event.code === 'Insert')) {
        return false;
      }

      // Returning false only stops xterm from emitting bytes; without
      // preventDefault the WebView's own find bar opens on top of ours.
      if (isCtrl && !event.altKey && !event.shiftKey
        && (event.key.toLowerCase() === 'f' || event.code === 'KeyF')) {
        event.preventDefault();
        event.stopPropagation();
        if (isKeydown) setShowSearch(prev => !prev);
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
      disposed = true;
      cancelAnimationFrame(firstInitialFrame);
      if (secondInitialFrame !== null) cancelAnimationFrame(secondInitialFrame);
      clearTimeout(initialFitTimeout);
      if (inputFlushTimer) {
        clearTimeout(inputFlushTimer);
      }
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      resizePendingRef.current = null;
      lineBufferRef.current = '';
      lineTrackingReliableRef.current = true;
      if (fontsApi) {
        fontsApi.removeEventListener('loadingdone', onFontsDone);
      }
      terminalElement.removeEventListener('paste', handlePaste, true);
      terminalElement.removeEventListener('keydown', handleInterrupt, true);
      terminalElement.removeEventListener('mousedown', handleMouseDownFocus);
      terminalElement.removeEventListener('wheel', handleWheel);
      terminalElement.removeEventListener('contextmenu', handleContextMenu);
      unregisterTerminal();
      unregisterRenderer();
      mouseSubscription.dispose();
      searchResultsSubscription.dispose();
      xterm.dispose();
      terminalReadyRef.current = false;
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [session.id, handleFitAndResize, stopManagedCommand, pasteToTerminal, pasteClipboardText, setTerminalMouseModes]);

  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.options.theme = terminalTheme;
  }, [terminalTheme]);

  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    term.options.fontFamily = terminalFontStack;
    term.options.fontSize = terminalFontSize;
    term.options.cursorBlink = terminalCursorBlink;
    term.options.cursorStyle = terminalCursorStyle;
    handleFitAndResize();
  }, [terminalFontStack, terminalFontSize, terminalCursorBlink, terminalCursorStyle, handleFitAndResize]);

  useEffect(() => {
    if (!('fonts' in document)) return;
    const term = xtermRef.current;
    if (!term) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      handleFitAndResize();
      term.refresh(0, term.rows - 1);
    });
    return () => {
      cancelled = true;
    };
  }, [terminalFontStack, handleFitAndResize]);

  useEffect(() => {
    let mounted = true;
    let unlistenFn: (() => void) | null = null;
    let receivedEvent = false;
    setManagedCommandState(null);
    void (async () => {
      const unlisten = await listen<ManagedTerminalCommandState>('managed-command-state-changed', (event) => {
        if (!mounted || event.payload.sessionId !== session.id) return;
        receivedEvent = true;
        managedCommandActiveRef.current = ['Starting', 'Running', 'Stopping'].includes(event.payload.status);
        setManagedCommandState(event.payload);
      });
      if (!mounted) {
        unlisten();
        return;
      }
      unlistenFn = unlisten;
      const state = await invoke<ManagedTerminalCommandState | null>('get_managed_terminal_command_state', {
        sessionId: session.id,
      });
      if (mounted && !receivedEvent) setManagedCommandState(state);
    })().catch((error) => console.error('Failed to load managed command state:', error));

    return () => {
      mounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, [session.id]);

  useEffect(() => {
    if (managedCommandState?.status === 'Running' && terminalRef.current?.getClientRects().length) {
      xtermRef.current?.focus();
    }
  }, [managedCommandState?.status]);

  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      const unlisten = await listen<string>(`terminal-output:${session.id}`, (event) => {
        if (!mounted) return;
        agentActivityRef.current?.output();
        cwdOutputBufferRef.current = `${cwdOutputBufferRef.current}${event.payload}`.slice(-8192);
        const detectedCwd = detectTerminalCwd(
          cwdOutputBufferRef.current,
          session.shell,
          currentCwdRef.current,
        );
        if (detectedCwd && detectedCwd !== currentCwdRef.current) {
          currentCwdRef.current = detectedCwd;
          setCurrentCwd(detectedCwd);
        }
        // Detect dev-server URLs printed by `npm run dev` / vite / next etc.
        // and surface them to the workspace (chip + optional auto-open).
        const urls = event.payload.match(DEV_SERVER_URL_RE);
        if (urls && urls.length > 0) {
          urls.forEach((url) => addDevServerUrl(session.workspaceId, url.replace(/[.,;)\]}>]+$/g, '')));
        }
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
  }, [session.id, session.shell, session.workspaceId, addDevServerUrl, handleFitAndResize]);

  useEffect(() => {
    currentCwdRef.current = session.cwd;
    cwdOutputBufferRef.current = '';
    setCurrentCwd(session.cwd);
    setCliLaunched(false);
    firstOutputFitDoneRef.current = false;
    launchAttemptsRef.current = 0;
    lastSentSizeRef.current = null;
    if (launchTimeoutRef.current) {
      clearTimeout(launchTimeoutRef.current);
      launchTimeoutRef.current = null;
    }
  }, [session.cwd, session.id]);

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
    const element = terminalRef.current;
    if (!element) return;
    // Explicit view changes also schedule a repaint: some webviews miss the
    // intersection/resize notification when display:none is toggled quickly.
    return observeTerminalLayout(element, handleFitAndResize);
  }, [view, activeView, activeWorkspaceId, handleFitAndResize]);

  useEffect(() => {
    if (installProgress && installProgress.agent === session.agent) {
      if (installProgress.stage === 'Completed' || installProgress.stage === 'Failed') {
        setInstalling(false);
      }
    }
  }, [installProgress, session.agent]);

  const handleRetryInstall = async () => {
    if (!session.agent) return;
    const agentTypes: AgentType[] = ['claude', 'codex', 'antigravity', 'opencode', 'cursor', 'kilo', 'hermes', 'pi', 'commandcode', 'cline', 'grok', ...ADDITIONAL_AGENT_TYPES];
    if (!agentTypes.includes(session.agent as AgentType)) return;
    if (session.agent === 'amp' && navigator.userAgent.includes('Windows')) {
      await openUrl('https://ampcode.com/docs/cli');
      return;
    }
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

    try {
      await pasteToTerminal(pendingPasteText);
    } catch (error) {
      console.error('Failed to paste to terminal:', error);
    }
    setPendingPasteText('');
  }, [pendingPasteText, pasteToTerminal]);

  const cancelPaste = useCallback(() => {
    setShowPasteConfirm(false);
    setPendingPasteText('');
  }, []);

  return (
    <div
      className={`term-pane ${isActive ? 'term-pane--active' : ''}`}
      style={terminalBackgroundColor ? ({ '--term-surface': terminalBackgroundColor } as React.CSSProperties) : undefined}
      onMouseDown={() => setActiveSession(session.id)}
    >
      <TerminalHeader
        session={session}
        currentCwd={currentCwd}
        isActive={isActive}
        onRefreshCli={handleRefreshCli}
        isRefreshing={isRefreshing}
        onClose={onClose}
        mouseTrackingEnabled={mouseTrackingEnabled}
        onToggleMouseTracking={handleToggleMouseTracking}
        onNewSession={handleNewSession}
        onRunCommand={handleRunCommand}
        agentOverride={effectiveAgent}
        showQuickPrompts={showQuickPrompts}
        onToggleQuickPrompts={() => setShowQuickPrompts((v) => !v)}
        managedCommandState={managedCommandState}
        onStopManagedCommand={() => void stopManagedCommand()}
        onFind={handleOpenSearch}
        onClear={handleClearTerminal}
        onFocusTerminal={focusTerminal}
        cliStatusBadge={
          <CliStatusBadge
            cliInfo={cliInfo}
            launchState={launchState}
            authInfo={authInfo}
            onAuthenticate={handleAuthenticate}
            onRetryInstall={handleRetryInstall}
            installing={installing}
          />
        }
        dragListeners={dragListeners}
      />

      {showQuickPrompts && effectiveAgent && (
        <div className="term-strip">
          <QuickPromptChips
            compact
            onSelect={(prompt) => void handleRunCommand(prompt.text)}
          />
        </div>
      )}

      <div className="term-body">
        {showSearch && (
          <div className="term-find" role="search" onMouseDown={(e) => e.stopPropagation()}>
            <MagnifyingGlass size={13} className="shrink-0 opacity-60" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch('next', e.target.value, true);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
                  && (e.key.toLowerCase() === 'f' || e.code === 'KeyF')) {
                  // Keep Ctrl+F inside our find bar instead of the WebView's.
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.select();
                } else if (e.key === 'Enter') {
                  handleSearch(e.shiftKey ? 'prev' : 'next');
                } else if (e.key === 'Escape') {
                  handleClearSearch();
                }
              }}
              placeholder="Find in terminal"
              aria-label="Find in terminal"
              autoFocus
            />
            <span
              className={`term-find__count ${searchQuery && searchResults?.count === 0 ? 'term-find__count--empty' : ''}`}
              aria-live="polite"
            >
              {searchQuery && searchResults
                ? searchResults.count === 0
                  ? 'No results'
                  : `${searchResults.index >= 0 ? searchResults.index + 1 : '?'}/${searchResults.count}`
                : ''}
            </span>
            <button type="button" onClick={() => handleSearch('prev')} className="term-btn" title="Previous match (Shift+Enter)" aria-label="Previous match">
              <CaretUp size={13} />
            </button>
            <button type="button" onClick={() => handleSearch('next')} className="term-btn" title="Next match (Enter)" aria-label="Next match">
              <CaretDown size={13} />
            </button>
            <button type="button" onClick={handleClearSearch} className="term-btn" title="Close (Esc)" aria-label="Close find">
              <X size={13} />
            </button>
          </div>
        )}

        <div
          ref={terminalRef}
          className="term-canvas"
          style={{
            pointerEvents: 'auto',
            touchAction: 'auto',
          }}
          onClick={() => xtermRef.current?.focus()}
          onMouseDown={() => xtermRef.current?.focus()}
        />
      </div>

      {showAuthModal && session.agent && (
        <AuthModal
          agent={session.agent}
          onClose={() => setShowAuthModal(false)}
          getAuthInstructions={getAuthInstructions}
        />
      )}

      {showPasteConfirm && (
        <div className="term-overlay" role="dialog" aria-modal="true" aria-labelledby={`paste-title-${session.id}`}>
          <div className="term-dialog">
            <p id={`paste-title-${session.id}`} className="term-dialog__title">
              <Warning size={15} weight="fill" className="text-amber-400" aria-hidden="true" />
              Paste {(pendingPasteText.length / 1024).toFixed(1)} KB?
            </p>
            <p className="term-dialog__body">
              This is a large paste and may take a moment to send to the terminal.
            </p>
            <div className="term-dialog__actions">
              <button type="button" onClick={cancelPaste} className="term-dialog__btn">
                Cancel
              </button>
              <button type="button" onClick={executePaste} className="term-dialog__btn term-dialog__btn--primary" autoFocus>
                Paste anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
