import React, { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Bell,
  ClipboardText,
  Copy,
  Cursor,
  GridFour,
  Palette,
  Scroll,
  SlidersHorizontal,
  TextAa,
  TextAlignLeft,
  TerminalWindow,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import {
  Button,
  ColorInput,
  Disclosure,
  Notice,
  OptionCard,
  Segmented,
  SettingsBlock,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SettingsTabs,
  SliderRow,
  ToggleRow,
} from '../SettingsKit';

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
    note: 'Ships with Windows; copy the .ttf from a Windows PC for other systems.',
  },
  { name: 'Courier New', source: 'win-mac', note: 'Bundled with Windows and macOS.' },
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
  mac: 'Download, unzip, double-click the font and choose “Install Font”, then relaunch the app.',
  win: 'Download, unzip, right-click the font and choose Install, then relaunch the app.',
  linux: 'Download, unzip into ~/.local/share/fonts, run fc-cache -f, then relaunch the app.',
};

const getPlatform = (): Platform => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) return 'win';
  if (ua.includes('mac')) return 'mac';
  return 'linux';
};

const isAvailable = (font: FontOption, platform: Platform): boolean =>
  NATIVE_PLATFORMS[font.source].includes(platform);

const CURSOR_STYLES = [
  { value: 'block' as const, label: 'Block' },
  { value: 'underline' as const, label: 'Underline' },
  { value: 'bar' as const, label: 'Bar' },
];

const TERMINAL_COUNTS = [0, 1, 2, 4, 6, 8];

const DEFAULT_TERMINAL_BACKGROUND = '#262626';
const DEFAULT_TERMINAL_FOREGROUND = '#c3c1ba';

const TERMINAL_COLOR_PRESETS = [
  { label: 'Theme', background: null, foreground: null },
  { label: 'Graphite', background: '#171717', foreground: '#e5e7eb' },
  { label: 'Midnight', background: '#0b1020', foreground: '#d7e0ff' },
  { label: 'Solarized', background: '#002b36', foreground: '#93a1a1' },
  { label: 'Paper', background: '#f4f0e6', foreground: '#2f2a24' },
] as const;

type TerminalTab = 'text' | 'colors' | 'behavior';

const TABS = [
  { id: 'text' as const, label: 'Text', icon: TextAa },
  { id: 'colors' as const, label: 'Colors', icon: Palette },
  { id: 'behavior' as const, label: 'Behavior', icon: SlidersHorizontal },
];

export const SettingsTerminal: React.FC = () => {
  const {
    defaultTerminalCount,
    setDefaultTerminalCount,
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

  const [tab, setTab] = useState<TerminalTab>('text');
  const platform = getPlatform();
  const needsInstall = FONT_OPTIONS.filter((font) => !isAvailable(font, platform));
  const selectedFont = FONT_OPTIONS.find((font) => font.name === terminalFontFamily);
  const selectedNeedsInstall = selectedFont ? !isAvailable(selectedFont, platform) : false;
  const colorsCustomized = Boolean(terminalBackgroundColor || terminalForegroundColor);

  const fontGroups: Array<{ label: string; fonts: FontOption[] }> = [
    { label: 'Included with YzPzCode', fonts: FONT_OPTIONS.filter((f) => f.source === 'bundled' || f.source === 'fallback') },
    {
      label: `Built into ${PLATFORM_LABELS[platform]}`,
      fonts: FONT_OPTIONS.filter((f) => f.source !== 'bundled' && f.source !== 'fallback' && isAvailable(f, platform)),
    },
    { label: 'Needs installing', fonts: needsInstall },
  ].filter((group) => group.fonts.length > 0);

  return (
    <>
      <SettingsTabs label="Terminal sections" onChange={setTab} tabs={TABS} value={tab} />

      {tab === 'text' && (
        <SettingsStack>
          <SettingsGroup title="Font">
            <SettingsRow
              description="Monospaced fonts work best in a terminal."
              icon={<TextAa size={16} aria-hidden="true" />}
              label="Font family"
            >
              <select
                aria-label="Terminal font family"
                className="st-select st-control-w"
                onChange={(event) => setTerminalFontFamily(event.target.value)}
                value={terminalFontFamily}
              >
                {fontGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.fonts.map((font) => (
                      <option key={font.name} value={font.name}>{font.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </SettingsRow>
            <SliderRow
              description="Terminal text size in pixels."
              format={(value) => `${value}px`}
              icon={<TextAa size={16} aria-hidden="true" />}
              label="Font size"
              max={24}
              min={10}
              onChange={setTerminalFontSize}
              value={terminalFontSize}
            />
            <SettingsBlock>
              <div
                className="st-terminal-preview"
                style={{
                  backgroundColor: terminalBackgroundColor ?? 'var(--bg-terminal)',
                  color: terminalForegroundColor ?? DEFAULT_TERMINAL_FOREGROUND,
                  fontFamily: `'${terminalFontFamily}', monospace`,
                  fontSize: `${terminalFontSize}px`,
                }}
              >
                <p>
                  <span style={{ color: '#4ade80' }}>user@yzpz</span>
                  <span style={{ opacity: 0.55 }}>:</span>
                  <span style={{ color: '#38bdf8' }}>~/workspace</span>
                  <span style={{ opacity: 0.55 }}>$</span> npm run dev
                </p>
                <p style={{ opacity: 0.65 }}>Ready on http://localhost:8745</p>
              </div>
            </SettingsBlock>
          </SettingsGroup>

          {selectedNeedsInstall && selectedFont && (
            <Notice tone="warning">
              <strong>{selectedFont.name}</strong> is not included with {PLATFORM_LABELS[platform]}, so the terminal
              falls back to another font until you install it.{' '}
              {selectedFont.downloadUrl ? (
                <>
                  <button className="st-link" onClick={() => void openUrl(selectedFont.downloadUrl as string)} type="button">
                    Download from {selectedFont.downloadLabel ?? 'the website'}
                  </button>
                  . {INSTALL_STEPS[platform]}
                </>
              ) : (
                selectedFont.note
              )}
            </Notice>
          )}

          {needsInstall.length > 0 && (
            <SettingsGroup>
              <Disclosure
                description="Optional fonts you can add to your system"
                label={`Fonts you can install on ${PLATFORM_LABELS[platform]}`}
              >
                {needsInstall.map((font) => (
                  <SettingsRow
                    description={font.downloadUrl ? INSTALL_STEPS[platform] : font.note}
                    key={font.name}
                    label={font.name}
                  >
                    {font.downloadUrl && (
                      <Button icon={ArrowSquareOut} onClick={() => void openUrl(font.downloadUrl as string)} size="sm">
                        {font.downloadLabel ?? 'Download'}
                      </Button>
                    )}
                  </SettingsRow>
                ))}
              </Disclosure>
            </SettingsGroup>
          )}

          <SettingsGroup title="Cursor">
            <SettingsRow
              description="The shape of the text cursor."
              icon={<Cursor size={16} aria-hidden="true" />}
              label="Cursor style"
            >
              <Segmented label="Cursor style" onChange={setTerminalCursorStyle} options={CURSOR_STYLES} value={terminalCursorStyle} />
            </SettingsRow>
            <ToggleRow
              checked={terminalCursorBlink}
              description="Animate the cursor while the terminal is focused."
              icon={<Cursor size={16} aria-hidden="true" />}
              label="Blinking cursor"
              onChange={setTerminalCursorBlink}
            />
          </SettingsGroup>
        </SettingsStack>
      )}

      {tab === 'colors' && (
        <SettingsStack>
          <SettingsGroup
            action={
              <Button
                disabled={!colorsCustomized}
                icon={ArrowCounterClockwise}
                onClick={() => {
                  setTerminalBackgroundColor(null);
                  setTerminalForegroundColor(null);
                }}
                size="sm"
                variant="ghost"
              >
                Reset colors
              </Button>
            }
            description="Choose a preset or set your own colors."
            title="Color scheme"
          >
            <SettingsBlock>
              <div
                className="st-terminal-preview"
                style={{
                  backgroundColor: terminalBackgroundColor ?? 'var(--bg-terminal)',
                  color: terminalForegroundColor ?? DEFAULT_TERMINAL_FOREGROUND,
                  fontFamily: `'${terminalFontFamily}', monospace`,
                }}
              >
                <p>
                  <span style={{ color: '#4ade80' }}>user@yzpz</span>
                  <span style={{ opacity: 0.55 }}>:</span>
                  <span style={{ color: '#38bdf8' }}>~/workspace</span>
                  <span style={{ opacity: 0.55 }}>$</span> npm run dev
                </p>
                <p style={{ opacity: 0.65 }}>Ready on http://localhost:8745</p>
              </div>
            </SettingsBlock>
            <SettingsBlock>
              <div className="st-options" role="group" aria-label="Color presets">
                {TERMINAL_COLOR_PRESETS.map((preset) => (
                  <OptionCard
                    key={preset.label}
                    onSelect={() => {
                      setTerminalBackgroundColor(preset.background);
                      setTerminalForegroundColor(preset.foreground);
                    }}
                    preview={
                      <span aria-hidden="true" className="st-option__preview" style={{ height: '2.25rem' }}>
                        <span style={{ background: preset.background ?? 'var(--bg-terminal)', flex: 3 }} />
                        <span style={{ background: preset.foreground ?? DEFAULT_TERMINAL_FOREGROUND, flex: 1 }} />
                      </span>
                    }
                    selected={terminalBackgroundColor === preset.background && terminalForegroundColor === preset.foreground}
                    title={preset.label}
                  />
                ))}
              </div>
            </SettingsBlock>
          </SettingsGroup>

          <SettingsGroup title="Custom colors">
            <SettingsRow description={terminalBackgroundColor ?? 'Using the theme default'} label="Background">
              <ColorInput
                label="Terminal background color"
                onChange={setTerminalBackgroundColor}
                value={terminalBackgroundColor ?? DEFAULT_TERMINAL_BACKGROUND}
              />
            </SettingsRow>
            <SettingsRow description={terminalForegroundColor ?? 'Using the theme default'} label="Text">
              <ColorInput
                label="Terminal text color"
                onChange={setTerminalForegroundColor}
                value={terminalForegroundColor ?? DEFAULT_TERMINAL_FOREGROUND}
              />
            </SettingsRow>
            <SliderRow
              description="Lower values let the workspace background show through."
              format={(value) => `${value}%`}
              label="Background opacity"
              max={100}
              min={70}
              onChange={setTerminalOpacity}
              value={terminalOpacity}
            />
          </SettingsGroup>
        </SettingsStack>
      )}

      {tab === 'behavior' && (
        <SettingsStack>
          <SettingsGroup
            footer="Templates can override this number when you create a workspace."
            title="New workspaces"
          >
            <SettingsRow
              description="Choose 0 to use the editor and extensions without opening a shell."
              icon={<TerminalWindow size={16} aria-hidden="true" />}
              label="Terminals to open"
            >
              <select
                aria-label="Terminals in new workspaces"
                className="st-select st-control-w"
                onChange={(event) => setDefaultTerminalCount(Number(event.target.value))}
                value={defaultTerminalCount}
              >
                {TERMINAL_COUNTS.map((count) => (
                  <option key={count} value={count}>
                    {count === 0 ? 'None' : `${count} terminal${count === 1 ? '' : 's'}`}
                  </option>
                ))}
              </select>
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Mouse and clipboard">
            <ToggleRow
              checked={terminalCopyOnSelect}
              description="Copy text to the clipboard as soon as you select it."
              icon={<Copy size={16} aria-hidden="true" />}
              label="Copy on select"
              onChange={setTerminalCopyOnSelect}
            />
            <ToggleRow
              checked={terminalPasteOnRightClick}
              description="Right-click inside a terminal to paste."
              icon={<ClipboardText size={16} aria-hidden="true" />}
              label="Paste on right-click"
              onChange={setTerminalPasteOnRightClick}
            />
          </SettingsGroup>

          <SettingsGroup title="Output">
            <SliderRow
              description="How many lines of history each terminal keeps."
              format={(value) => `${(value / 1000).toFixed(0)}k lines`}
              icon={<Scroll size={16} aria-hidden="true" />}
              label="Scrollback"
              max={100000}
              min={1000}
              onChange={setTerminalScrollbackSize}
              step={1000}
              value={terminalScrollbackSize}
            />
            <ToggleRow
              checked={terminalWordWrap}
              description="Wrap long lines instead of scrolling sideways."
              icon={<TextAlignLeft size={16} aria-hidden="true" />}
              label="Word wrap"
              onChange={setTerminalWordWrap}
            />
            <ToggleRow
              checked={terminalBellEnabled}
              description="Show a visual alert when a command finishes."
              icon={<Bell size={16} aria-hidden="true" />}
              label="Bell notifications"
              onChange={setTerminalBellEnabled}
            />
          </SettingsGroup>

          <SettingsGroup title="Grid">
            <ToggleRow
              checked={independentGridResize}
              description="Dragging a divider only resizes the terminals in that row or column. Turn off for the classic behavior where every pane moves."
              icon={<GridFour size={16} aria-hidden="true" />}
              label="Independent resize"
              onChange={setIndependentGridResize}
            />
          </SettingsGroup>
        </SettingsStack>
      )}
    </>
  );
};
