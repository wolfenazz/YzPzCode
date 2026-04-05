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

const LINE_NUMBER_MODES = [
  { value: 'on' as const, label: 'On' },
  { value: 'off' as const, label: 'Off' },
  { value: 'relative' as const, label: 'Relative' },
];

const TAB_SIZES = [2, 4, 8];

export const SettingsEditor: React.FC = () => {
  const {
    autoSave,
    setAutoSave,
    autoSaveDelay,
    setAutoSaveDelay,
    showMinimap,
    setShowMinimap,
    editorFontFamily,
    setEditorFontFamily,
    editorFontSize,
    setEditorFontSize,
    editorTabSize,
    setEditorTabSize,
    editorWordWrap,
    setEditorWordWrap,
    editorLineNumbers,
    setEditorLineNumbers,
    editorBracketColorization,
    setEditorBracketColorization,
    editorFormatOnSave,
    setEditorFormatOnSave,
    editorTrimWhitespace,
    setEditorTrimWhitespace,
  } = useAppStore();

  return (
    <div className="space-y-8 font-mono">
      <div>
        <h2 className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em] mb-1">Editor</h2>
        <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Configure code editor behavior and appearance</p>
      </div>

      <div className="space-y-6">
        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em]">Font</h3>

          <div>
            <p className="text-xs text-zinc-300 font-mono mb-2">Font Family</p>
            <div className="flex items-center gap-2 flex-wrap">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font}
                  onClick={() => setEditorFontFamily(font)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono transition-all duration-150 cursor-pointer ${
                    editorFontFamily === font
                      ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                      : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              ))}
            </div>
          </div>

          <SettingsSlider
            label="Font Size"
            description="Editor text size in pixels"
            value={editorFontSize}
            displayValue={`${editorFontSize}px`}
            min={10}
            max={24}
            onChange={setEditorFontSize}
          />
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em]">Formatting</h3>

          <div>
            <p className="text-xs text-zinc-300 font-mono mb-2">Tab Size</p>
            <div className="flex items-center gap-2">
              {TAB_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setEditorTabSize(size)}
                  className={`w-10 h-8 rounded-md text-[10px] font-mono transition-all duration-150 cursor-pointer ${
                    editorTabSize === size
                      ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                      : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-300 font-mono mb-2">Line Numbers</p>
            <div className="flex items-center gap-2">
              {LINE_NUMBER_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setEditorLineNumbers(mode.value)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                    editorLineNumbers === mode.value
                      ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                      : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em]">Toggles</h3>

          <div className="space-y-3">
            <SettingsToggle
              enabled={autoSave}
              onToggle={() => setAutoSave(!autoSave)}
              label="Auto Save"
              description="Automatically save file changes"
            />

            {autoSave && (
              <div className="border-l-2 border-cyan-500/20 pl-3">
                <SettingsSlider
                  label="Auto Save Delay"
                  description="Delay before saving (ms)"
                  value={autoSaveDelay}
                  displayValue={`${autoSaveDelay}ms`}
                  min={500}
                  max={5000}
                  step={500}
                  onChange={setAutoSaveDelay}
                />
              </div>
            )}

            <SettingsToggle
              enabled={showMinimap}
              onToggle={() => setShowMinimap(!showMinimap)}
              label="Show Minimap"
              description="Display code overview on the right side"
            />

            <SettingsToggle
              enabled={editorWordWrap}
              onToggle={() => setEditorWordWrap(!editorWordWrap)}
              label="Word Wrap"
              description="Wrap long lines in the editor"
            />

            <SettingsToggle
              enabled={editorBracketColorization}
              onToggle={() => setEditorBracketColorization(!editorBracketColorization)}
              label="Bracket Pair Colorization"
              description="Color matching brackets differently"
            />

            <SettingsToggle
              enabled={editorFormatOnSave}
              onToggle={() => setEditorFormatOnSave(!editorFormatOnSave)}
              label="Format on Save"
              description="Auto-format code when saving files"
            />

            <SettingsToggle
              enabled={editorTrimWhitespace}
              onToggle={() => setEditorTrimWhitespace(!editorTrimWhitespace)}
              label="Trim Trailing Whitespace"
              description="Remove trailing whitespace on save"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
