import React from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAppStore } from '../../../stores/appStore';
import { SettingsToggle } from '../../common/SettingsToggle';
import { SettingsSlider } from '../../common/SettingsSlider';

type Platform = 'win' | 'mac' | 'linux';

interface FontOption {
  name: string;
  source: 'bundled' | 'win' | 'mac' | 'linux' | 'win-mac' | 'fallback';
  downloadUrl?: string;
  downloadLabel?: string;
  note?: string;
}

const FONT_OPTIONS: FontOption[] = [
  { name: 'Cascadia Mono', source: 'bundled' },
  { name: 'JetBrains Mono', source: 'bundled' },
  { name: 'Fira Code', source: 'bundled' },
  {
    name: 'Cascadia Code',
    source: 'win',
    downloadUrl: 'https://github.com/microsoft/cascadia-code/releases',
    downloadLabel: 'GitHub (Microsoft)',
  },
  {
    name: 'Consolas',
    source: 'win',
    note: 'ships with Windows; copy the .ttf from a Windows PC for other systems.',
  },
  { name: 'Courier New', source: 'win-mac', note: 'bundled with Windows and macOS.' },
  { name: 'Menlo', source: 'mac', note: 'Apple font; only available on macOS.' },
  { name: 'Monaco', source: 'mac', note: 'Apple font; only available on macOS.' },
  { name: 'SF Mono', source: 'mac', note: 'Apple font; ships with macOS (Xcode).' },
  {
    name: 'DejaVu Sans Mono',
    source: 'linux',
    downloadUrl: 'https://dejavu-fonts.github.io/',
    downloadLabel: 'dejavu-fonts.github.io',
  },
  {
    name: 'Ubuntu Mono',
    source: 'linux',
    downloadUrl: 'https://font.ubuntu.com/',
    downloadLabel: 'font.ubuntu.com',
  },
  { name: 'Monospace', source: 'fallback' },
];

const NATIVE_PLATFORMS: Record<FontOption['source'], Platform[]> = {
  bundled: ['win', 'mac', 'linux'],
  fallback: ['win', 'mac', 'linux'],
  win: ['win'],
  mac: ['mac'],
  linux: ['linux'],
  'win-mac': ['win', 'mac'],
};

const PLATFORM_LABELS: Record<Platform, string> = {
  win: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
};

const INSTALL_STEPS: Record<Platform, string> = {
  mac: 'Download, unzip, double-click the font and choose "Install Font", then relaunch the app.',
  win: 'Download, unzip, right-click the font and choose Install, then relaunch the app.',
  linux: 'Download, unzip into ~/.local/share/fonts, run fc-cache -f, then relaunch the app.',
};

const getPlatform = (): Platform => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) return 'win';
  if (ua.includes('mac')) return 'mac';
  return 'linux';
};

const statusOf = (
  font: FontOption,
  platform: Platform
): { label: string; tone: 'good' | 'neutral' | 'warn' } => {
  if (font.source === 'bundled') return { label: 'Bundled', tone: 'good' };
  if (font.source === 'fallback') return { label: 'Fallback', tone: 'neutral' };
  if (NATIVE_PLATFORMS[font.source].includes(platform)) return { label: 'Built-in', tone: 'neutral' };
  return { label: 'Install', tone: 'warn' };
};

const CURSOR_STYLES = [
  { value: 'block' as const, label: 'Block' },
  { value: 'underline' as const, label: 'Underline' },
  { value: 'bar' as const, label: 'Bar' },
];

const DEFAULT_TERMINAL_BACKGROUND = '#262626';
const DEFAULT_TERMINAL_FOREGROUND = '#c3c1ba';

const TERMINAL_COLOR_PRESETS = [
  { label: 'Theme', background: null, foreground: null },
  { label: 'Graphite', background: '#171717', foreground: '#e5e7eb' },
  { label: 'Midnight', background: '#0b1020', foreground: '#d7e0ff' },
  { label: 'Solarized', background: '#002b36', foreground: '#93a1a1' },
  { label: 'Paper', background: '#f4f0e6', foreground: '#2f2a24' },
] as const;

const Divider = () => (
  <div className="h-px bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent" />
);

export const SettingsTerminal: React.FC = () => {
  const {
    terminalFontFamily,
    setTerminalFontFamily,
    terminalFontSize,
    setTerminalFontSize,
    terminalCursorStyle,
    setTerminalCursorStyle,
    terminalCursorBlink,
    setTerminalCursorBlink,
    terminalScrollbackSize,
    setTerminalScrollbackSize,
    terminalCopyOnSelect,
    setTerminalCopyOnSelect,
    terminalPasteOnRightClick,
    setTerminalPasteOnRightClick,
    terminalBellEnabled,
    setTerminalBellEnabled,
    terminalOpacity,
    setTerminalOpacity,
    terminalBackgroundColor,
    setTerminalBackgroundColor,
    terminalForegroundColor,
    setTerminalForegroundColor,
    terminalWordWrap,
    setTerminalWordWrap,
    independentGridResize,
    setIndependentGridResize,
  } = useAppStore();

  const platform = getPlatform();
  const needsInstall = FONT_OPTIONS.filter((f) => !NATIVE_PLATFORMS[f.source].includes(platform));

  return (
    <div className="space-y-8 font-mono">
      <div>
        <h2 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em] mb-1">
          Terminal
        </h2>
        <p className="text-[10px] text-[var(--text-secondary)] font-mono uppercase tracking-wider">
          Configure terminal appearance and behavior
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            Font
          </h3>

          <div>
            <p className="text-xs text-[var(--text-primary)] font-mono mb-2">Font Family</p>
            <div className="flex items-start gap-2 flex-wrap">
              {FONT_OPTIONS.map((font) => {
                const status = statusOf(font, platform);
                return (
                  <button
                    key={font.name}
                    onClick={() => setTerminalFontFamily(font.name)}
                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-md text-[10px] font-mono transition-all duration-150 cursor-pointer ${
                      terminalFontFamily === font.name
                        ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                        : 'bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border border-[var(--border-primary)]/70 hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]'
                    }`}
                  >
                    <span style={{ fontFamily: font.name }}>{font.name}</span>
                    <span
                      className={`px-1.5 py-px rounded text-[8px] uppercase tracking-wider ${
                        status.tone === 'good'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : status.tone === 'warn'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-zinc-500/10 text-[var(--text-secondary)]'
                      }`}
                    >
                      {status.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3 flex-wrap text-[9px] font-mono text-[var(--text-secondary)]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
                  Bundled — works everywhere
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-zinc-500/70" />
                  Built-in — included with your OS
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400/70" />
                  Install — not included on {PLATFORM_LABELS[platform]}
                </span>
              </div>

              {needsInstall.length > 0 && (
                <div className="border border-amber-500/20 bg-amber-500/5 rounded-md p-3 space-y-2">
                  <p className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider">
                    Fonts to install for {PLATFORM_LABELS[platform]}
                  </p>
                  <ul className="space-y-1.5">
                    {needsInstall.map((font) => (
                      <li key={font.name} className="text-[10px] font-mono text-[var(--text-secondary)] leading-relaxed">
                        <span className="text-zinc-200">{font.name}</span>
                        {font.downloadUrl ? (
                          <>
                            {' — '}
                            <button
                              onClick={() => openUrl(font.downloadUrl as string)}
                              className="text-[var(--accent)] underline hover:opacity-80 cursor-pointer"
                            >
                              {font.downloadLabel ?? 'Download'}
                            </button>
                            <span className="text-[var(--text-secondary)]"> {INSTALL_STEPS[platform]}</span>
                          </>
                        ) : (
                          <span> — {font.note}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <Divider />

          <SettingsSlider
            label="Font Size"
            description="Terminal text size in pixels"
            value={terminalFontSize}
            displayValue={`${terminalFontSize}px`}
            min={10}
            max={24}
            onChange={setTerminalFontSize}
          />
        </div>

        <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
                Colors
              </h3>
              <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                Personalize the terminal canvas and default text color
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTerminalBackgroundColor(null);
                setTerminalForegroundColor(null);
              }}
              disabled={!terminalBackgroundColor && !terminalForegroundColor}
              className="rounded-md border border-[var(--border-primary)] px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            >
              Reset colors
            </button>
          </div>

          <div
            className="relative overflow-hidden rounded-lg border border-white/10 p-4 shadow-inner"
            style={{
              backgroundColor: terminalBackgroundColor ?? 'var(--bg-terminal)',
              color: terminalForegroundColor ?? DEFAULT_TERMINAL_FOREGROUND,
            }}
          >
            <div className="absolute inset-y-0 left-0 w-0.5 bg-[var(--accent)]" />
            <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">Live preview</p>
            <p className="mt-2 text-[12px] leading-relaxed">
              <span className="text-emerald-400">user@yzpz</span>
              <span className="opacity-55">:</span>
              <span className="text-sky-400">~/workspace</span>
              <span className="opacity-55">$</span> npm run dev
            </p>
            <p className="mt-1 text-[10px] opacity-65">Ready on http://localhost:8745</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/55 px-3 py-2.5">
              <span>
                <span className="block text-[10px] text-[var(--text-primary)]">Background</span>
                <span className="mt-0.5 block text-[9px] text-[var(--text-secondary)]">
                  {terminalBackgroundColor ?? 'Theme default'}
                </span>
              </span>
              <input
                type="color"
                value={terminalBackgroundColor ?? DEFAULT_TERMINAL_BACKGROUND}
                onChange={(event) => setTerminalBackgroundColor(event.target.value)}
                aria-label="Terminal background color"
                className="h-8 w-11 cursor-pointer rounded border border-[var(--border-primary)] bg-transparent p-0.5"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/55 px-3 py-2.5">
              <span>
                <span className="block text-[10px] text-[var(--text-primary)]">Text</span>
                <span className="mt-0.5 block text-[9px] text-[var(--text-secondary)]">
                  {terminalForegroundColor ?? 'Theme default'}
                </span>
              </span>
              <input
                type="color"
                value={terminalForegroundColor ?? DEFAULT_TERMINAL_FOREGROUND}
                onChange={(event) => setTerminalForegroundColor(event.target.value)}
                aria-label="Terminal text color"
                className="h-8 w-11 cursor-pointer rounded border border-[var(--border-primary)] bg-transparent p-0.5"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">Presets</p>
            <div className="flex flex-wrap gap-2">
              {TERMINAL_COLOR_PRESETS.map((preset) => {
                const isActive = terminalBackgroundColor === preset.background
                  && terminalForegroundColor === preset.foreground;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTerminalBackgroundColor(preset.background);
                      setTerminalForegroundColor(preset.foreground);
                    }}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[9px] uppercase tracking-wider transition-colors cursor-pointer ${
                      isActive
                        ? 'border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--accent)]'
                        : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/55 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-white/15"
                      style={{ backgroundColor: preset.background ?? 'var(--bg-terminal)' }}
                    />
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Divider />

          <SettingsSlider
            label="Background Opacity"
            description="Transparency of the terminal canvas"
            value={terminalOpacity}
            displayValue={`${terminalOpacity}%`}
            min={70}
            max={100}
            onChange={setTerminalOpacity}
          />
        </div>

        <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            Cursor
          </h3>

          <div>
            <p className="text-xs text-[var(--text-primary)] font-mono mb-2">Cursor Style</p>
            <div className="flex items-center gap-2">
              {CURSOR_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => setTerminalCursorStyle(style.value)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                    terminalCursorStyle === style.value
                      ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                      : 'bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border border-[var(--border-primary)]/70 hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <Divider />

          <SettingsToggle
            enabled={terminalCursorBlink}
            onToggle={() => setTerminalCursorBlink(!terminalCursorBlink)}
            label="Blinking Cursor"
            description="Animate the terminal cursor"
          />
        </div>

        <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            Behavior
          </h3>

          <SettingsSlider
            label="Scrollback Buffer"
            description="Maximum lines to keep in history"
            value={terminalScrollbackSize}
            displayValue={`${(terminalScrollbackSize / 1000).toFixed(0)}k`}
            min={1000}
            max={100000}
            step={1000}
            onChange={setTerminalScrollbackSize}
          />

          <Divider />

          <div className="space-y-4">
            <SettingsToggle
              enabled={terminalCopyOnSelect}
              onToggle={() => setTerminalCopyOnSelect(!terminalCopyOnSelect)}
              label="Copy on Select"
              description="Automatically copy selected text to clipboard"
            />

            <SettingsToggle
              enabled={terminalPasteOnRightClick}
              onToggle={() =>
                setTerminalPasteOnRightClick(!terminalPasteOnRightClick)
              }
              label="Paste on Right Click"
              description="Enable paste via right-click in terminal"
            />

            <SettingsToggle
              enabled={terminalBellEnabled}
              onToggle={() => setTerminalBellEnabled(!terminalBellEnabled)}
              label="Bell Notifications"
              description="Visual notification on command complete"
            />

            <SettingsToggle
              enabled={terminalWordWrap}
              onToggle={() => setTerminalWordWrap(!terminalWordWrap)}
              label="Word Wrap"
              description="Wrap long lines in terminal output"
            />

            <SettingsToggle
              enabled={independentGridResize}
              onToggle={() => setIndependentGridResize(!independentGridResize)}
              label="Independent Grid Resize"
              description="Resize dividers affect only the terminals in the same row/column. Turn off for the classic global resize."
            />
          </div>
        </div>
      </div>
    </div>
  );
};
