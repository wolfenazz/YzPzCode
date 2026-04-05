import React from 'react';
import { useAppStore } from '../../../stores/appStore';
import { SettingsToggle } from '../../common/SettingsToggle';
import { SettingsSlider } from '../../common/SettingsSlider';

const FONT_FAMILIES = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Consolas',
  'Menlo',
  'Monospace',
];

const CURSOR_STYLES = [
  { value: 'block' as const, label: 'Block' },
  { value: 'underline' as const, label: 'Underline' },
  { value: 'bar' as const, label: 'Bar' },
];

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
    terminalWordWrap,
    setTerminalWordWrap,
  } = useAppStore();

  return (
    <div className="space-y-8 font-mono">
      <div>
        <h2 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em] mb-1">
          Terminal
        </h2>
        <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">
          Configure terminal appearance and behavior
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            Font
          </h3>

          <div>
            <p className="text-xs text-zinc-300 font-mono mb-2">Font Family</p>
            <div className="flex items-center gap-2 flex-wrap">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font}
                  onClick={() => setTerminalFontFamily(font)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono transition-all duration-150 cursor-pointer ${
                    terminalFontFamily === font
                      ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                      : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              ))}
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

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            Cursor
          </h3>

          <div>
            <p className="text-xs text-zinc-300 font-mono mb-2">Cursor Style</p>
            <div className="flex items-center gap-2">
              {CURSOR_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => setTerminalCursorStyle(style.value)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                    terminalCursorStyle === style.value
                      ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                      : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:text-zinc-300 hover:border-zinc-600'
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

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
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

          <SettingsSlider
            label="Terminal Opacity"
            description="Background transparency"
            value={terminalOpacity}
            displayValue={`${terminalOpacity}%`}
            min={70}
            max={100}
            onChange={setTerminalOpacity}
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
          </div>
        </div>
      </div>
    </div>
  );
};
