import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { TerminalSession } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { getTerminalFontStack } from '../../utils/terminalFonts';
import '@xterm/xterm/css/xterm.css';

interface InlineTerminalProps {
  command: string;
  cwd: string;
  autoRun: boolean;
  onClose: () => void;
}

const TERMINAL_THEME = {
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

const getTerminalCellPixels = (term: XTerm): { width: number; height: number } => {
  const fallback = {
    width: Math.max(1, Math.round(13 * 0.6)),
    height: Math.max(1, Math.round(13 * 1.2)),
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

export const InlineTerminal: React.FC<InlineTerminalProps> = ({ command, cwd, autoRun, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(async () => {
    if (isClosing) return;
    setIsClosing(true);

    try {
      if (sessionIdRef.current) {
        await invoke('kill_session', { sessionId: sessionIdRef.current });
      }
    } catch {
      // Session might already be dead
    }

    onClose();
  }, [isClosing, onClose]);

  useEffect(() => {
    if (!terminalRef.current) return;
    const terminalElement = terminalRef.current;
    let mounted = true;

    const init = async () => {
      try {
        const session = await invoke<TerminalSession>('create_single_terminal_session', {
          request: {
            workspaceId: `init-${Date.now()}`,
            workspacePath: cwd,
            index: 0,
            agent: null,
          },
        });

        if (!mounted) {
          await invoke('kill_session', { sessionId: session.id });
          return;
        }

        sessionIdRef.current = session.id;

        const xterm = new XTerm({
          theme: TERMINAL_THEME,
          fontFamily: getTerminalFontStack(useAppStore.getState().terminalFontFamily),
          fontSize: 14,
          fontWeight: '400',
          lineHeight: 1,
          letterSpacing: 0,
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
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon(async (_event, uri) => {
          try {
            await invoke('open_url', { url: uri });
          } catch {
            window.open(uri, '_blank', 'noopener,noreferrer');
          }
        });

        xterm.loadAddon(fitAddon);
        xterm.loadAddon(webLinksAddon);
        xterm.open(terminalElement);

        try {
          const webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => {
            console.warn('Inline terminal WebGL context lost; falling back to the DOM renderer.');
            webglAddon.dispose();
          });
          xterm.loadAddon(webglAddon);
        } catch (error) {
          console.warn('Inline terminal WebGL renderer is unavailable; using the DOM renderer.', error);
        }

        const handleMouseDownFocus = () => {
          xterm.focus();
        };

        const handleWheel = (e: WheelEvent) => {
          e.stopPropagation();
        };

        terminalElement.addEventListener('mousedown', handleMouseDownFocus, { capture: false });
        terminalElement.addEventListener('wheel', handleWheel, { passive: true });

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        setTimeout(() => {
          if (fitAddonRef.current) {
            try {
              fitAddonRef.current.fit();
              const cols = xterm.cols;
              const rows = xterm.rows;
              const cell = getTerminalCellPixels(xterm);
              invoke('resize_terminal', {
                sessionId: session.id,
                cols,
                rows,
                pixelWidth: Math.round(cols * cell.width),
                pixelHeight: Math.round(rows * cell.height),
              }).catch(() => {});
            } catch {}
          }
        }, 50);

        const fontsApi = (document as Document & { fonts?: FontFaceSet }).fonts;
        const onFontsDone = () => {
          if (!fitAddonRef.current || !xtermRef.current || !sessionIdRef.current) return;
          try {
            fitAddonRef.current.fit();
            const cols = xtermRef.current.cols;
            const rows = xtermRef.current.rows;
            const cell = getTerminalCellPixels(xtermRef.current);
            invoke('resize_terminal', {
              sessionId: sessionIdRef.current,
              cols,
              rows,
              pixelWidth: Math.round(cols * cell.width),
              pixelHeight: Math.round(rows * cell.height),
            }).catch(() => {});
            xtermRef.current.clearTextureAtlas();
            xtermRef.current.refresh(0, Math.max(0, xtermRef.current.rows - 1));
          } catch {}
        };

        if (fontsApi) {
          fontsApi.ready.then(() => onFontsDone()).catch(() => {});
          fontsApi.addEventListener('loadingdone', onFontsDone);
        }

        // Non-blocking input pipeline — fire-and-forget for TUI mouse/scroll support
        let inputBuffer = '';
        let inputFlushTimer: ReturnType<typeof setTimeout> | null = null;

        xterm.onData((data) => {
          inputBuffer += data;
          if (!inputFlushTimer) {
            inputFlushTimer = setTimeout(() => {
              const toSend = inputBuffer;
              inputBuffer = '';
              inputFlushTimer = null;
              invoke('write_to_terminal', { sessionId: session.id, input: toSend }).catch(() => {});
            }, 0);
          }
        });

        xterm.attachCustomKeyEventHandler((event) => {
          const isCtrl = event.ctrlKey || event.metaKey;
          const isKeydown = event.type === 'keydown';

          if (isCtrl && event.key === 'c' && xterm.hasSelection() && isKeydown) {
            const selection = xterm.getSelection();
            if (selection) {
              navigator.clipboard.writeText(selection).catch(() => {});
            }
            return false;
          }

          if (isCtrl && event.key === 'v' && isKeydown) {
            navigator.clipboard.readText().then(async (text) => {
              if (!text) return;
              try {
                await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[200~' });
                const CHUNK = 512;
                for (let i = 0; i < text.length; i += CHUNK) {
                  const chunk = text.slice(i, i + CHUNK);
                  await invoke('write_to_terminal', { sessionId: session.id, input: chunk });
                  if (i + CHUNK < text.length) {
                    await new Promise((r) => setTimeout(r, 2));
                  }
                }
                await invoke('write_to_terminal', { sessionId: session.id, input: '\x1b[201~' });
              } catch {}
            }).catch(() => {});
            return false;
          }

          return true;
        });

        const unlisten = await listen<string>(`terminal-output:${session.id}`, (event) => {
          if (mounted) {
            xtermRef.current?.write(event.payload);
          }
        });

        setTimeout(async () => {
          if (mounted && sessionIdRef.current) {
            try {
              const payload = autoRun
                ? '\x1b[200~' + command + '\x1b[201~\r'
                : '\x1b[200~' + command + '\x1b[201~';
              await invoke('write_to_terminal', {
                sessionId: sessionIdRef.current,
                input: payload,
              });
            } catch {}
          }
        }, 300);

        return () => {
          if (inputFlushTimer) {
            clearTimeout(inputFlushTimer);
          }
          if (fontsApi) {
            fontsApi.removeEventListener('loadingdone', onFontsDone);
          }
          terminalElement.removeEventListener('mousedown', handleMouseDownFocus);
          terminalElement.removeEventListener('wheel', handleWheel);
          unlisten();
        };
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    let cleanup: (() => void) | null = null;
    init().then((fn) => {
      if (fn) cleanup = fn;
    });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cwd]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current && sessionIdRef.current) {
        try {
          fitAddonRef.current.fit();
          const cols = xtermRef.current.cols;
          const rows = xtermRef.current.rows;
          const cell = getTerminalCellPixels(xtermRef.current);
          invoke('resize_terminal', {
            sessionId: sessionIdRef.current,
            cols,
            rows,
            pixelWidth: Math.round(cols * cell.width),
            pixelHeight: Math.round(rows * cell.height),
          }).catch(() => {});
        } catch {}
      }
    });

    observer.observe(terminalRef.current);
    return () => observer.disconnect();
  }, []);

  if (error) {
    return (
      <div className="border border-red-900/50 rounded-lg bg-red-950/20 p-4">
        <p className="text-xs font-mono text-red-400 mb-3">{error}</p>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[10px] font-mono text-zinc-500 ml-2">Terminal</span>
          <code className="text-[9px] font-mono text-zinc-600 truncate max-w-[200px]">{command}</code>
        </div>
        <button
          type="button"
          onClick={handleClose}
          disabled={isClosing}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close Terminal
        </button>
      </div>

      <div
        ref={terminalRef}
        className="w-full bg-[#262626]"
        style={{ height: '320px', touchAction: 'none' }}
      />
    </div>
  );
};
