import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { TerminalSession, AgentCliInfo, CliLaunchState, AuthInfo, AgentType, CliType, ManagedTerminalCommandState } from '../../types';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useCliLauncher } from '../../hooks/useCliLauncher';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useAppStore } from '../../stores/appStore';
import { registerTerminal } from '../../utils/terminalRegistry';
import '@xterm/xterm/css/xterm.css';

import { TerminalHeader } from './TerminalHeader';
import { CliStatusBadge } from './CliStatusBadge';
import { AuthModal } from './AuthModal';

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

const SUPPORTED_MOUSE_MODE_CODES = [1000, 1002, 1003, 1005, 1006, 1015] as const;
const DEFAULT_MOUSE_TRACKING_MODES = [1000, 1002, 1006] as const;
/** Dev-server URLs printed by `npm run dev` / `vite` / `next dev` etc. */
const DEV_SERVER_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/g;
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

const NEW_SESSION_COMMANDS: Partial<Record<CliType, string>> = {
  opencode: '/new',
  kilo: '/new',
  codex: '/new',
  gemini: '/new',
  cursor: '/new',
  hermes: '/new',
  pi: '/new',
  claude: '/clear',
  grok: '/new',
};

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

// AI agent binary names a user may type to launch an agent manually inside a
// shell terminal. Cursor's CLI binary is `agent` (not `cursor`), so both the
// user-facing name and the real binary are matched to the Cursor agent.
const AGENT_BINARY_NAMES: Record<string, AgentType> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
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
  const setTerminalMouseModes = useAppStore((state) => state.setTerminalMouseModes);
  const setDevServerUrl = useAppStore((state) => state.setDevServerUrl);
  const manualAgent = useAppStore((state) => state.manualAgentBySession[session.id]);
  const setManualAgent = useAppStore((state) => state.setManualAgent);
  const terminalPasteOnRightClick = useAppStore((state) => state.terminalPasteOnRightClick);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
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
  // Tracks whether the terminal container is currently zero-sized (hidden view
  // switch). Used to force a full repaint when it becomes visible again.
  const terminalHiddenRef = useRef(false);

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

  const terminalFontFamily = useAppStore((s) => s.terminalFontFamily);
  const terminalFontSize = useAppStore((s) => s.terminalFontSize);
  const terminalCursorStyle = useAppStore((s) => s.terminalCursorStyle);
  const terminalCursorBlink = useAppStore((s) => s.terminalCursorBlink);
  const terminalScrollbackSize = useAppStore((s) => s.terminalScrollbackSize);

  const terminalPrefsRef = useRef({
    fontFamily: terminalFontFamily,
    fontSize: terminalFontSize,
    cursorStyle: terminalCursorStyle,
    cursorBlink: terminalCursorBlink,
    scrollback: terminalScrollbackSize,
  });
  useEffect(() => {
    terminalPrefsRef.current = {
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      cursorStyle: terminalCursorStyle,
      cursorBlink: terminalCursorBlink,
      scrollback: terminalScrollbackSize,
    };
  }, [terminalFontFamily, terminalFontSize, terminalCursorStyle, terminalCursorBlink, terminalScrollbackSize]);

  const { cliStatuses, installCli, installProgress, detectCli } = useAgentCli();
  const { launchCli, stopCli, checkAuth, getAuthInstructions, getLaunchState, getLaunchStateSync, getAuthInfoSync } = useCliLauncher();
  const [installing, setInstalling] = useState(false);

  const cliInfo: AgentCliInfo | null = session.agent ? cliStatuses[session.agent] : null;
  const launchState: CliLaunchState | null | undefined = session.agent ? getLaunchStateSync(session.id) : undefined;
  const authInfo: AuthInfo | null | undefined = session.agent ? getAuthInfoSync(session.agent) : undefined;

  const effectiveTheme = useEffectiveTheme();

  // xterm's color parser rejects CSS var strings, so read the resolved value
  // of --bg-terminal (app background darkened) for the canvas background.
  const terminalTheme = useMemo(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-terminal').trim();
    return {
      ...DARK_TERMINAL_THEME,
      background: bg || DARK_TERMINAL_THEME.background,
      cursorAccent: bg || DARK_TERMINAL_THEME.cursorAccent,
    };
  }, [effectiveTheme]);
  const managedCommandActive =
    managedCommandState?.status === 'Starting' ||
    managedCommandState?.status === 'Running' ||
    managedCommandState?.status === 'Stopping';

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

        onResize?.(cols, rows);

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
        requestAnimationFrame(() => {
          const t = xtermRef.current;
          if (t && t.rows > 0) t.refresh(0, t.rows - 1);
        });
      }
    } catch (e) {
      console.error('Error fitting terminal:', e);
    }
  }, [session.id, onResize, sendResize]);

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
  }, [session.id]);

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

  const handleToggleMouseTracking = useCallback(() => {
    const enableModes = normalizeMouseModes(DEFAULT_MOUSE_TRACKING_MODES);
    const disableModes = normalizeMouseModes(mouseModesRef.current);
    const enableSequence = buildMouseModeSequence(enableModes, 'h');
    const disableSequence = buildMouseModeSequence(disableModes, 'l');

    if (mouseTrackingEnabled) {
      xtermRef.current?.write(disableSequence);
      syncMouseModes([]);
    } else {
      xtermRef.current?.write(enableSequence);
      syncMouseModes(enableModes);
    }
  }, [mouseTrackingEnabled, syncMouseModes]);

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

  /**
   * Shell-aware paste. CMD (cmd.exe) does NOT support bracketed paste — the
   * \x1b[200~ markers would be typed literally and break multi-line pastes.
   * For CMD we normalize line endings and execute each line immediately, just
   * like native CMD paste. PowerShell / Unix shells get bracketed paste with
   * normalized \n endings.
   */
  const pasteToTerminal = useCallback(async (text: string) => {
    if (!text) return;

    const shellKind = detectShellKind(session.shell);
    const CHUNK_SIZE = 512;
    const DELAY = 2;

    if (shellKind === 'cmd') {
      const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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

    // PowerShell / bash / zsh: bracketed paste keeps multi-line input safe.
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[200~' });
    for (let i = 0; i < normalized.length; i += CHUNK_SIZE) {
      const chunk = normalized.slice(i, i + CHUNK_SIZE);
      await invoke('write_to_terminal', { sessionId: session.id, input: chunk });
      if (i + CHUNK_SIZE < normalized.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY));
      }
    }
    await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[201~' });
  }, [session.id]);

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
      customGlyphs: true,
      rescaleOverlappingGlyphs: true,
      minimumContrastRatio: 1,
      cursorBlink: terminalPrefs.cursorBlink,
      cursorStyle: terminalPrefs.cursorStyle,
      allowProposedApi: true,
      scrollback: terminalPrefs.scrollback,
      convertEol: false,
      allowTransparency: false,
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
      if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(`${uri}/`)) {
        try {
          setDevServerUrl(session.workspaceId, uri);
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

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(searchAddon);
    xterm.loadAddon(unicodeAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.unicode.activeVersion = '11';

    xterm.open(terminalElement);

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

    const handleContextMenu = (e: MouseEvent) => {
      // Right-click paste when enabled; otherwise let the app's global menu show.
      if (!pasteOnRightClickRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.readText().then((text) => {
        if (text) void pasteToTerminal(text);
      }).catch(console.error);
    };

    terminalElement.addEventListener('paste', handlePasteCapture, { capture: true });
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

    // Initial fit: wait for layout to settle (double rAF), then fit. The
    // ResizeObserver and font-ready fit handle any later size changes, and the
    // unchanged-dims guard makes redundant fits cheap no-ops.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        handleFitAndResize();
      });
    });
    // Fallback in case the pane is still inside a mount transition at rAF time.
    setTimeout(() => {
      handleFitAndResize();
    }, 300);

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
        navigator.clipboard.readText().then((text) => pasteClipboardText(text)).catch(console.error);
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
      terminalElement.removeEventListener('paste', handlePasteCapture, true);
      terminalElement.removeEventListener('mousedown', handleMouseDownFocus);
      terminalElement.removeEventListener('wheel', handleWheel);
      terminalElement.removeEventListener('contextmenu', handleContextMenu);
      unregisterTerminal();
      xterm.dispose();
      terminalReadyRef.current = false;
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [session.id, handleFitAndResize, managedCommandActive, startManagedCommand, pasteToTerminal, pasteClipboardText]);

  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.options.theme = terminalTheme;
  }, [terminalTheme]);

  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    term.options.fontFamily = terminalFontFamily;
    term.options.fontSize = terminalFontSize;
    term.options.cursorBlink = terminalCursorBlink;
    term.options.cursorStyle = terminalCursorStyle;
    handleFitAndResize();
  }, [terminalFontFamily, terminalFontSize, terminalCursorBlink, terminalCursorStyle, handleFitAndResize]);

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
  }, [terminalFontFamily, handleFitAndResize]);

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
        // Detect dev-server URLs printed by `npm run dev` / vite / next etc.
        // and surface them to the workspace (chip + optional auto-open).
        const urls = event.payload.match(DEV_SERVER_URL_RE);
        if (urls && urls.length > 0) {
          setDevServerUrl(session.workspaceId, urls[urls.length - 1].replace(/[.,;)\]}>]+$/g, ''));
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
  }, [session.id, parseMouseTrackingState, handleFitAndResize]);

  useEffect(() => {
    setCliLaunched(false);
    firstOutputFitDoneRef.current = false;
    launchAttemptsRef.current = 0;
    lastSentSizeRef.current = null;
    terminalHiddenRef.current = false;
    mouseModesRef.current = new Set();
    setMouseTrackingEnabled(false);
    setTerminalMouseModes(session.id, []);
    if (launchTimeoutRef.current) {
      clearTimeout(launchTimeoutRef.current);
      launchTimeoutRef.current = null;
    }
  }, [session.id, setTerminalMouseModes]);

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
      const container = terminalRef.current;
      const rect = container?.getBoundingClientRect();
      const isHidden = !rect || rect.width < 2 || rect.height < 2;
      // When the container comes back from display:none (view switch), force a
      // full repaint even if the pixel size is unchanged — the canvas may have
      // stale rows from before it was hidden.
      const becameVisible = terminalHiddenRef.current && !isHidden;
      terminalHiddenRef.current = isHidden;

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        handleFitAndResize(becameVisible);
      }, 100);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    const handleWindowResize = () => handleResize();
    window.addEventListener('resize', handleWindowResize);

    // A macOS WebView does not reliably emit a ResizeObserver notification
    // when an ancestor switches from `display: none` back to visible. The
    // terminal canvas consequently keeps its zero-sized backing store until a
    // native window resize (for example minimise/restore) happens. Observe
    // visibility directly and refit after the browser has completed layout.
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let visibleFitTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleVisibleFit = () => {
      if (document.visibilityState === 'hidden') return;

      if (firstFrame !== null) cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
      if (visibleFitTimeout) clearTimeout(visibleFitTimeout);

      const fitVisibleTerminal = () => {
        const rect = terminalRef.current?.getBoundingClientRect();
        if (rect && rect.width >= 2 && rect.height >= 2) {
          terminalHiddenRef.current = false;
          handleFitAndResize(true);
        }
      };

      firstFrame = requestAnimationFrame(() => {
        firstFrame = requestAnimationFrame(fitVisibleTerminal);
      });
      // WebKit can apply the final canvas dimensions after the next paint, so
      // keep one short settled-layout pass in addition to the double rAF.
      visibleFitTimeout = setTimeout(fitVisibleTerminal, 160);
    };

    const handleWindowFocus = () => scheduleVisibleFit();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleVisibleFit();
    };
    const visibilityObserver = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) scheduleVisibleFit();
        });

    if (terminalRef.current) visibilityObserver?.observe(terminalRef.current);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      visibilityObserver?.disconnect();
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (firstFrame !== null) cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
      if (visibleFitTimeout) clearTimeout(visibleFitTimeout);
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
    const agentTypes: AgentType[] = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'kilo', 'hermes', 'pi', 'commandcode', 'cline', 'grok'];
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
      className={`h-full flex flex-col overflow-hidden font-mono transition-[background-color,border-color,box-shadow] duration-200 ${
        isActive
          ? 'border border-[var(--accent)] bg-[var(--accent-light)] rounded-sm shadow-[inset_0_0_0_1px_var(--accent-border)]'
          : 'border border-[var(--border-primary)] bg-[var(--bg-terminal)] rounded-sm'
      }`}
      onMouseDown={() => setActiveSession(session.id)}
    >
      <TerminalHeader
        session={session}
        isActive={isActive}
        onRefreshCli={handleRefreshCli}
        isRefreshing={isRefreshing}
        onClose={onClose}
        mouseTrackingEnabled={mouseTrackingEnabled}
        onToggleMouseTracking={handleToggleMouseTracking}
        onNewSession={handleNewSession}
        onRunCommand={handleRunCommand}
        agentOverride={effectiveAgent}
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

      {showSearch && (
        <div className="flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1.5">
          <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="flex-1 bg-transparent text-xs outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            autoFocus
          />
          <button
            onClick={() => handleSearch('prev')}
            className="p-1 transition-colors cursor-pointer hover:bg-zinc-800 text-zinc-500"
            title="Previous match"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => handleSearch('next')}
            className="p-1 transition-colors cursor-pointer hover:bg-zinc-800 text-zinc-500"
            title="Next match"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={handleClearSearch}
            className="p-1 transition-colors cursor-pointer hover:bg-zinc-800 text-zinc-500"
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
        className="flex-1 overflow-hidden min-h-0 p-[3px] bg-theme-terminal"
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
        />
      )}

      {showPasteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 border border-zinc-700/70 p-5 bg-zinc-950 border-zinc-800">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Large Paste Detected
              </span>
            </div>
            <p className="text-[10px] leading-relaxed mb-4 text-zinc-500">
              You are about to paste {(pendingPasteText.length / 1024).toFixed(1)} KB of text into the terminal. This may take a moment.
            </p>
            <div className="flex gap-2">
              <button
                onClick={cancelPaste}
                className="flex-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={executePaste}
                className="flex-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 transition-colors cursor-pointer"
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
