import React from 'react';
import { useAppStore } from '../../../stores/appStore';

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

  const Toggle = ({ enabled, onToggle, label, description }: { enabled: boolean; onToggle: () => void; label: string; description?: string }) => (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-zinc-300">{label}</p>
        {description && <p className="text-[10px] text-zinc-600 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
          enabled ? 'bg-emerald-600/60' : 'bg-zinc-800'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-zinc-300 transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase mb-1">Terminal</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Configure terminal appearance and behavior</p>
      </div>

      <div className="space-y-6">
        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Font</h3>
          
          <div>
            <p className="text-xs text-zinc-300 mb-2">Font Family</p>
            <div className="flex items-center gap-2 flex-wrap">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font}
                  onClick={() => setTerminalFontFamily(font)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono transition-all duration-150 cursor-pointer ${
                    terminalFontFamily === font
                      ? 'bg-theme-main/10 text-theme-main border border-theme-main/20'
                      : 'bg-zinc-900/50 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                  }`}
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-300">Font Size</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Terminal text size in pixels</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="24"
                value={terminalFontSize}
                onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                className="w-24 accent-zinc-400"
              />
              <span className="text-xs text-zinc-400 w-8 text-right">{terminalFontSize}px</span>
            </div>
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Cursor</h3>
          
          <div>
            <p className="text-xs text-zinc-300 mb-2">Cursor Style</p>
            <div className="flex items-center gap-2">
              {CURSOR_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => setTerminalCursorStyle(style.value)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                    terminalCursorStyle === style.value
                      ? 'bg-theme-main/10 text-theme-main border border-theme-main/20'
                      : 'bg-zinc-900/50 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <Toggle
            enabled={terminalCursorBlink}
            onToggle={() => setTerminalCursorBlink(!terminalCursorBlink)}
            label="Blinking Cursor"
            description="Animate the terminal cursor"
          />
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Behavior</h3>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-300">Scrollback Buffer</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Maximum lines to keep in history</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={terminalScrollbackSize}
                onChange={(e) => setTerminalScrollbackSize(Number(e.target.value))}
                className="w-24 accent-zinc-400"
              />
              <span className="text-xs text-zinc-400 w-12 text-right">{(terminalScrollbackSize / 1000).toFixed(0)}k</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-300">Terminal Opacity</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Background transparency</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="70"
                max="100"
                value={terminalOpacity}
                onChange={(e) => setTerminalOpacity(Number(e.target.value))}
                className="w-24 accent-zinc-400"
              />
              <span className="text-xs text-zinc-400 w-10 text-right">{terminalOpacity}%</span>
            </div>
          </div>

          <Toggle
            enabled={terminalCopyOnSelect}
            onToggle={() => setTerminalCopyOnSelect(!terminalCopyOnSelect)}
            label="Copy on Select"
            description="Automatically copy selected text to clipboard"
          />

          <Toggle
            enabled={terminalPasteOnRightClick}
            onToggle={() => setTerminalPasteOnRightClick(!terminalPasteOnRightClick)}
            label="Paste on Right Click"
            description="Enable paste via right-click in terminal"
          />

          <Toggle
            enabled={terminalBellEnabled}
            onToggle={() => setTerminalBellEnabled(!terminalBellEnabled)}
            label="Bell Notifications"
            description="Visual notification on command complete"
          />

          <Toggle
            enabled={terminalWordWrap}
            onToggle={() => setTerminalWordWrap(!terminalWordWrap)}
            label="Word Wrap"
            description="Wrap long lines in terminal output"
          />
        </div>
      </div>
    </div>
  );
};
