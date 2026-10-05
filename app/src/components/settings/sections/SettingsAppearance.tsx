import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowsOutLineHorizontal,
  Check,
  CursorClick,
  Desktop,
  DiscordLogo,
  ImageSquare,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Moon,
  Palette,
  Rows,
  Sparkle,
  Sun,
  SquaresFour,
  X,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { useActiveCustomTheme } from '../../../hooks/useCustomTheme';
import { SettingsWorkspaceBackground } from './SettingsWorkspaceBackground';
import { SettingsSetupBackground } from './SettingsSetupBackground';
import { SettingsCustomThemes } from './SettingsCustomThemes';
import { ThemeEditor } from '../theme/ThemeEditor';
import { THEME_PRESETS, createCustomTheme, getThemePreset, uniqueThemeName } from '../../../utils/customTheme';
import type { CursorSize, CursorStyleId, CustomTheme, ThemeMode } from '../../../types';
import { CursorPreview } from '../../common/cursor/CursorPreview';
import { CURSOR_STYLES } from '../../common/cursor/cursorStyles';
import claudeLogo from '../../../assets/claude.png';
import yzpzLogo from '../../../assets/YzPzCodeLogo.png';
import {
  Badge,
  Button,
  ColorBands,
  Notice,
  OptionCard,
  Segmented,
  SettingsBlock,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SettingsTabs,
  ToggleRow,
} from '../SettingsKit';

const ACCENT_COLORS = [
  { name: 'Claude', value: 'default', color: '#c15f3c' },
  { name: 'YzPz Burple', value: 'burple', color: '#8c4edd' },
  { name: 'Claude Blue', value: 'blue', color: '#1b7ede' },
  { name: 'Purple', value: 'purple', color: '#8b5cf6' },
  { name: 'Green', value: 'green', color: '#10b981' },
  { name: 'Orange', value: 'orange', color: '#f97316' },
  { name: 'Red', value: 'red', color: '#f14444' },
  { name: 'Pink', value: 'pink', color: '#ec4899' },
  { name: 'Cyan', value: 'cyan', color: '#06b6d4' },
];

const UI_DENSITIES = [
  { value: 'compact' as const, label: 'Compact' },
  { value: 'comfortable' as const, label: 'Comfortable' },
  { value: 'spacious' as const, label: 'Spacious' },
];

const SETUP_VIEW_MODES = [
  { value: 'page' as const, label: 'Single page' },
  { value: 'stepper' as const, label: 'Step by step' },
];

const CURSOR_SIZES: Array<{ value: CursorSize; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const APP_ZOOM_MIN = 80;
const APP_ZOOM_MAX = 140;
const APP_ZOOM_STEP = 10;

const LogoIcon = ({ src }: { src: string }) => (
  <img src={src} alt="" width={14} height={14} style={{ objectFit: 'contain' }} />
);

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  swatches: string[];
}> = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright neutral interface',
    icon: <Sun size={14} aria-hidden="true" />,
    swatches: ['#f6f6f4', '#fbfbfa', '#4f5358'],
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Deep neutral interface',
    icon: <Moon size={14} aria-hidden="true" />,
    swatches: ['#0b0b0b', '#1a1a1a', '#d0d0d0'],
  },
  {
    value: 'claude',
    label: 'Claude',
    description: 'Warm Crail and Pampas interface',
    icon: <LogoIcon src={claudeLogo} />,
    swatches: ['#c15f3c', '#b1ada1', '#f4f3ee', '#ffffff'],
  },
  {
    value: 'yzpz',
    label: 'YzPzCode',
    description: 'Textured Burple brand interface',
    icon: <LogoIcon src={yzpzLogo} />,
    swatches: ['#8c4edd', '#2e1b9c', '#546bf3', '#c7b8f5'],
  },
  {
    value: 'system',
    label: 'System',
    description: 'Follows your OS theme',
    icon: <Desktop size={14} aria-hidden="true" />,
    swatches: ['#0b0b0b', '#f6f6f4'],
  },
];

type AppearanceTab = 'theme' | 'interface' | 'backgrounds';

interface ThemeEditorState {
  theme: CustomTheme;
  isNew: boolean;
}

const TABS = [
  { id: 'theme' as const, label: 'Theme', icon: Palette },
  { id: 'interface' as const, label: 'Interface', icon: SquaresFour },
  { id: 'backgrounds' as const, label: 'Backgrounds', icon: ImageSquare },
];

export const SettingsAppearance: React.FC = () => {
  const {
    customCursor,
    setCustomCursor,
    cursorStyle,
    setCursorStyle,
    cursorSize,
    setCursorSize,
    accentColor,
    setAccentColor,
    uiDensity,
    setUiDensity,
    appZoom,
    setAppZoom,
    animationsEnabled,
    setAnimationsEnabled,
    themeMode,
    setThemeMode,
    customThemes,
    activeCustomThemeId,
    saveCustomTheme,
    applyCustomTheme,
    setupViewMode,
    setSetupViewMode,
    discordRichPresence,
    setDiscordRichPresence,
  } = useAppStore();
  const customTheme = useActiveCustomTheme();

  const [tab, setTab] = useState<AppearanceTab>('theme');
  const [editor, setEditor] = useState<ThemeEditorState | null>(null);
  const [discordError, setDiscordError] = useState<string | null>(null);

  const changeAppZoom = (delta: number): void => {
    setAppZoom(Math.min(APP_ZOOM_MAX, Math.max(APP_ZOOM_MIN, appZoom + delta)));
  };

  const changeTheme = (mode: ThemeMode): void => {
    setThemeMode(mode);
    if (mode === 'claude') {
      setAccentColor('default');
    } else if (mode === 'yzpz') {
      setAccentColor('burple');
    }
  };

  /** A new theme starts as a copy of whatever the app looks like right now. */
  const startNewTheme = (): void => {
    const presetId =
      themeMode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        : themeMode;
    const source = customTheme ?? getThemePreset(presetId) ?? THEME_PRESETS[0];
    const name = uniqueThemeName('My theme', customThemes.map((theme) => theme.name));
    setEditor({ theme: createCustomTheme(source, name), isNew: true });
  };

  const saveEditedTheme = (theme: CustomTheme, apply: boolean): void => {
    saveCustomTheme(theme);
    if (apply) applyCustomTheme(theme.id);
    setEditor(null);
  };

  useEffect(() => {
    if (discordRichPresence) {
      invoke('enable_discord_presence').catch(() => {
        setDiscordError('Discord is not running. Open Discord to enable Rich Presence.');
      });
    } else {
      setDiscordError(null);
      invoke('disable_discord_presence').catch(() => {});
    }
  }, [discordRichPresence]);

  const chooseCursorStyle = (style: CursorStyleId): void => {
    setCursorStyle(style);
    if (!customCursor) setCustomCursor(true);
  };

  const activeAccent = ACCENT_COLORS.find((color) => color.value === accentColor);

  return (
    <>
      {/* The editor is a focused task with its own Back button; hiding the tabs keeps a draft from being lost by switching away. */}
      {!editor && <SettingsTabs label="Appearance sections" onChange={setTab} tabs={TABS} value={tab} />}

      {tab === 'theme' && editor && (
        <ThemeEditor
          initial={editor.theme}
          isActive={themeMode === 'custom' && activeCustomThemeId === editor.theme.id}
          isNew={editor.isNew}
          key={editor.theme.id}
          onClose={() => setEditor(null)}
          onSave={saveEditedTheme}
        />
      )}

      {tab === 'theme' && !editor && (
        <SettingsStack>
          <SettingsGroup title="Theme" description="Claude and YzPzCode themes bring their own accent color.">
            <SettingsBlock>
              <div className="st-options st-options--5" role="group" aria-label="Theme">
                {THEME_OPTIONS.map(({ value, label, description, icon, swatches }) => (
                  <OptionCard
                    hint={description}
                    key={value}
                    onSelect={() => changeTheme(value)}
                    preview={<ColorBands colors={swatches} />}
                    selected={themeMode === value}
                    title={label}
                    trailing={themeMode === value ? <Check size={14} weight="bold" aria-hidden="true" /> : undefined}
                    icon={icon}
                  />
                ))}
              </div>
            </SettingsBlock>
          </SettingsGroup>

          <SettingsCustomThemes
            onCreate={startNewTheme}
            onEdit={(theme) => setEditor({ theme, isNew: false })}
          />

          <SettingsGroup title="Accent color">
            {customTheme ? (
              <SettingsRow
                badge={<Badge tone="accent">{customTheme.name}</Badge>}
                description="This custom theme defines its own accent. Edit the theme to change it."
                label="Highlight color"
              >
                <span aria-hidden="true" className="st-accentchip" style={{ backgroundColor: customTheme.colors.accent }} />
              </SettingsRow>
            ) : (
              <>
                <SettingsRow
                  badge={activeAccent && <Badge tone="accent">{activeAccent.name}</Badge>}
                  description="Used for toggles, selection and highlights."
                  label="Highlight color"
                />
                <SettingsBlock>
                  <div className="st-swatches" role="group" aria-label="Accent color">
                    {ACCENT_COLORS.map((color) => (
                      <button
                        aria-label={color.name}
                        aria-pressed={accentColor === color.value}
                        className="st-swatch"
                        key={color.value}
                        onClick={() => setAccentColor(color.value)}
                        style={{ backgroundColor: color.color, ['--swatch-color' as string]: color.color }}
                        title={color.name}
                        type="button"
                      >
                        {accentColor === color.value && <Check size={13} weight="bold" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </SettingsBlock>
              </>
            )}
          </SettingsGroup>
        </SettingsStack>
      )}

      {tab === 'interface' && (
        <SettingsStack>
          <SettingsGroup title="Size and spacing">
            <SettingsRow
              description="How much breathing room the interface has."
              icon={<Rows size={16} aria-hidden="true" />}
              label="Density"
            >
              <Segmented label="Density" onChange={setUiDensity} options={UI_DENSITIES} value={uiDensity} />
            </SettingsRow>
            <SettingsRow
              description="Scales the whole app. Terminal and editor fonts are set separately."
              icon={<ArrowsOutLineHorizontal size={16} aria-hidden="true" />}
              label="Interface zoom"
            >
              <Button
                aria-label="Zoom out"
                disabled={appZoom <= APP_ZOOM_MIN}
                icon={MagnifyingGlassMinus}
                iconOnly
                onClick={() => changeAppZoom(-APP_ZOOM_STEP)}
                title="Zoom out"
              />
              <Button
                aria-label={`Reset zoom to 100%, currently ${appZoom}%`}
                onClick={() => setAppZoom(100)}
                title="Reset to 100%"
              >
                <span style={{ minWidth: '2.5rem', fontVariantNumeric: 'tabular-nums' }}>{appZoom}%</span>
              </Button>
              <Button
                aria-label="Zoom in"
                disabled={appZoom >= APP_ZOOM_MAX}
                icon={MagnifyingGlassPlus}
                iconOnly
                onClick={() => changeAppZoom(APP_ZOOM_STEP)}
                title="Zoom in"
              />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Motion and pointer">
            <ToggleRow
              checked={animationsEnabled}
              description="Transitions and animated effects throughout the app."
              icon={<Sparkle size={16} aria-hidden="true" />}
              label="Animations"
              onChange={setAnimationsEnabled}
            />
            <ToggleRow
              checked={customCursor}
              description="Replace the system pointer with an animated one."
              icon={<CursorClick size={16} aria-hidden="true" />}
              label="Custom cursor"
              onChange={setCustomCursor}
            />
          </SettingsGroup>

          <SettingsGroup title="Cursor style" description="Pick a pointer. Choosing one turns the custom cursor on; hover a card to see how it reacts to buttons.">
            <SettingsRow
              description="How large the custom cursor is drawn."
              icon={<ArrowsOutLineHorizontal size={16} aria-hidden="true" />}
              label="Cursor size"
            >
              <Segmented label="Cursor size" onChange={setCursorSize} options={CURSOR_SIZES} value={cursorSize} />
            </SettingsRow>
            <SettingsBlock>
              <div className="st-options st-options--5" role="group" aria-label="Cursor style">
                {CURSOR_STYLES.map(({ id, name, description }) => {
                  const selected = customCursor && cursorStyle === id;
                  return (
                    <OptionCard
                      hint={description}
                      key={id}
                      onSelect={() => chooseCursorStyle(id)}
                      preview={<CursorPreview id={id} />}
                      selected={selected}
                      title={name}
                      trailing={selected ? <Check size={14} weight="bold" aria-hidden="true" /> : undefined}
                    />
                  );
                })}
              </div>
            </SettingsBlock>
          </SettingsGroup>

          <SettingsGroup title="New workspace">
            <SettingsRow
              description="Configure everything on one page, or be guided through it."
              icon={<SquaresFour size={16} aria-hidden="true" />}
              label="Setup layout"
            >
              <Segmented label="Setup layout" onChange={setSetupViewMode} options={SETUP_VIEW_MODES} value={setupViewMode} />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Integrations">
            <ToggleRow
              checked={discordRichPresence}
              description="Show the workspace you are working in on your Discord profile."
              icon={<DiscordLogo size={16} aria-hidden="true" />}
              label="Discord Rich Presence"
              onChange={(value) => {
                setDiscordRichPresence(value);
                setDiscordError(null);
              }}
            />
            {discordRichPresence && discordError && (
              <SettingsBlock>
                <Notice
                  action={<Button aria-label="Dismiss" icon={X} iconOnly onClick={() => setDiscordError(null)} size="sm" variant="ghost" />}
                  tone="warning"
                >
                  {discordError}
                </Notice>
              </SettingsBlock>
            )}
          </SettingsGroup>
        </SettingsStack>
      )}

      {tab === 'backgrounds' && (
        <SettingsStack>
          <SettingsWorkspaceBackground />
          <SettingsSetupBackground />
        </SettingsStack>
      )}
    </>
  );
};
