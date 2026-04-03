import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { TerminalSession } from '../../types';
import '@xterm/xterm/css/xterm.css';

interface InlineTerminalProps {
  command: string;
  cwd: string;
  autoRun: boolean;
  onClose: () => void;
}

const TERMINAL_THEME = {
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
  blue: '#52525b',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#71717a',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
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
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          fontSize: 13,
          cursorBlink: true,
          cursorStyle: 'block',
          allowProposedApi: true,
          scrollback: 10000,
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
        xterm.open(terminalRef.current!);

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        setTimeout(() => {
          if (fitAddonRef.current) {
            try {
              fitAddonRef.current.fit();
              const cols = xterm.cols;
              const rows = xterm.rows;
              const fontSize = 13;
              invoke('resize_terminal', {
                sessionId: session.id,
                cols,
                rows,
                pixelWidth: Math.round(cols * fontSize * 0.6),
                pixelHeight: Math.round(rows * fontSize * 1.2),
              }).catch(() => {});
            } catch {}
          }
        }, 50);

        xterm.onData(async (data) => {
          try {
            await invoke('write_to_terminal', { sessionId: session.id, input: data });
          } catch {}
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
          invoke('resize_terminal', {
            sessionId: sessionIdRef.current,
            cols,
            rows,
            pixelWidth: Math.round(cols * 13 * 0.6),
            pixelHeight: Math.round(rows * 13 * 1.2),
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
        className="w-full bg-[#09090b]"
        style={{ height: '320px' }}
      />
    </div>
  );
};
