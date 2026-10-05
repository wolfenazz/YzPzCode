import React from 'react';
import {
  BracketsCurly,
  FloppyDisk,
  Hash,
  MapTrifold,
  Scissors,
  TextAa,
  TextAlignLeft,
  TextIndent,
  Timer,
  MagicWand,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import {
  Segmented,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SliderRow,
  ToggleRow,
} from '../SettingsKit';

const FONT_FAMILIES = [
  'Cascadia Mono',
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Consolas',
  'Menlo',
  'Monospace',
];

const LINE_NUMBER_MODES = [
  { value: 'on' as const, label: 'On' },
  { value: 'relative' as const, label: 'Relative' },
  { value: 'off' as const, label: 'Off' },
];

const TAB_SIZES = [
  { value: 2, label: '2' },
  { value: 4, label: '4' },
  { value: 8, label: '8' },
];

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
    <SettingsStack>
      <SettingsGroup title="Text">
        <SettingsRow
          description="The typeface used for code."
          icon={<TextAa size={16} aria-hidden="true" />}
          label="Font family"
        >
          <select
            aria-label="Editor font family"
            className="st-select st-control-w"
            onChange={(event) => setEditorFontFamily(event.target.value)}
            value={editorFontFamily}
          >
            {FONT_FAMILIES.includes(editorFontFamily) ? null : <option value={editorFontFamily}>{editorFontFamily}</option>}
            {FONT_FAMILIES.map((font) => (
              <option key={font} value={font}>{font}</option>
            ))}
          </select>
        </SettingsRow>
        <SliderRow
          description="Editor text size in pixels."
          format={(value) => `${value}px`}
          icon={<TextAa size={16} aria-hidden="true" />}
          label="Font size"
          max={24}
          min={10}
          onChange={setEditorFontSize}
          value={editorFontSize}
        />
        <SettingsRow
          description="Spaces per indentation level."
          icon={<TextIndent size={16} aria-hidden="true" />}
          label="Tab size"
        >
          <Segmented label="Tab size" onChange={setEditorTabSize} options={TAB_SIZES} value={editorTabSize} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Display">
        <SettingsRow
          description="Show line numbers in the gutter, or numbers relative to the cursor."
          icon={<Hash size={16} aria-hidden="true" />}
          label="Line numbers"
        >
          <Segmented label="Line numbers" onChange={setEditorLineNumbers} options={LINE_NUMBER_MODES} value={editorLineNumbers} />
        </SettingsRow>
        <ToggleRow
          checked={editorWordWrap}
          description="Wrap long lines instead of scrolling sideways."
          icon={<TextAlignLeft size={16} aria-hidden="true" />}
          label="Word wrap"
          onChange={setEditorWordWrap}
        />
        <ToggleRow
          checked={showMinimap}
          description="A zoomed-out overview of the file on the right."
          icon={<MapTrifold size={16} aria-hidden="true" />}
          label="Minimap"
          onChange={setShowMinimap}
        />
        <ToggleRow
          checked={editorBracketColorization}
          description="Give matching brackets the same color."
          icon={<BracketsCurly size={16} aria-hidden="true" />}
          label="Bracket pair colors"
          onChange={setEditorBracketColorization}
        />
      </SettingsGroup>

      <SettingsGroup title="Saving">
        <ToggleRow
          checked={autoSave}
          description="Save changes automatically while you type."
          icon={<FloppyDisk size={16} aria-hidden="true" />}
          label="Auto save"
          onChange={setAutoSave}
        />
        {autoSave && (
          <SliderRow
            description="How long to wait after you stop typing."
            format={(value) => `${(value / 1000).toFixed(1)}s`}
            icon={<Timer size={16} aria-hidden="true" />}
            label="Auto save delay"
            max={5000}
            min={500}
            nested
            onChange={setAutoSaveDelay}
            step={500}
            value={autoSaveDelay}
          />
        )}
        <ToggleRow
          checked={editorFormatOnSave}
          description="Tidy up code formatting each time a file is saved."
          icon={<MagicWand size={16} aria-hidden="true" />}
          label="Format on save"
          onChange={setEditorFormatOnSave}
        />
        <ToggleRow
          checked={editorTrimWhitespace}
          description="Remove spaces at the end of lines when saving."
          icon={<Scissors size={16} aria-hidden="true" />}
          label="Trim trailing whitespace"
          onChange={setEditorTrimWhitespace}
        />
      </SettingsGroup>
    </SettingsStack>
  );
};
