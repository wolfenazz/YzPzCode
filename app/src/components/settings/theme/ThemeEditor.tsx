import { useMemo, useState } from 'react';
import { ArrowCounterClockwise, ArrowLeft, Moon, Palette, Sun } from '@phosphor-icons/react';
import type { CustomTheme, CustomThemeBase, CustomThemeColors } from '../../../types';
import {
  THEME_NAME_MAX_LENGTH,
  THEME_RADIUS_MAX,
  THEME_RADIUS_MIN,
  getBlockingProblems,
  getContrastChecks,
  getThemePreset,
  relativeLuminance,
  themesEqual,
} from '../../../utils/customTheme';
import {
  Badge,
  Button,
  Field,
  Notice,
  Segmented,
  SettingsBlock,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SliderRow,
} from '../SettingsKit';
import { ThemeColorField } from './ThemeColorField';
import { ThemePaletteGallery } from './ThemePaletteGallery';
import { ThemePreview } from './ThemePreview';

interface ColorFieldSpec {
  key: keyof CustomThemeColors;
  label: string;
  description: string;
}

const COLOR_GROUPS: ReadonlyArray<{ title: string; description: string; fields: ReadonlyArray<ColorFieldSpec> }> = [
  {
    title: 'Surfaces',
    description: 'The layers the interface is built from, back to front.',
    fields: [
      { key: 'background', label: 'Background', description: 'The canvas behind every panel.' },
      { key: 'surface', label: 'Panels', description: 'Sidebars, cards, tab bars and settings.' },
      { key: 'elevated', label: 'Raised surfaces', description: 'Hovered rows, menus, popovers and buttons.' },
      { key: 'terminal', label: 'Terminal', description: 'Terminal and agent output background.' },
    ],
  },
  {
    title: 'Text and lines',
    description: 'Keep text readable: the checks on the right update as you go.',
    fields: [
      { key: 'text', label: 'Text', description: 'Primary text and icons.' },
      { key: 'textMuted', label: 'Muted text', description: 'Descriptions, hints and secondary labels.' },
      { key: 'border', label: 'Borders', description: 'Dividers and outlines.' },
    ],
  },
  {
    title: 'Highlights',
    description: 'Accent marks selection and focus; danger marks errors and destructive actions.',
    fields: [
      { key: 'accent', label: 'Accent', description: 'Toggles, selection, focus rings and highlights.' },
      { key: 'danger', label: 'Danger', description: 'Errors and delete actions.' },
    ],
  },
];

const MODE_OPTIONS = [
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'light' as const, label: 'Light', icon: Sun },
];

interface ThemeEditorProps {
  initial: CustomTheme;
  isNew: boolean;
  /** True when this is the theme currently applied to the app. */
  isActive: boolean;
  onSave: (theme: CustomTheme, apply: boolean) => void;
  onClose: () => void;
}

export const ThemeEditor = ({ initial, isNew, isActive, onSave, onClose }: ThemeEditorProps) => {
  const [draft, setDraft] = useState<CustomTheme>(initial);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = !themesEqual(draft, initial);
  const checks = useMemo(() => getContrastChecks(draft), [draft]);
  const problems = useMemo(() => getBlockingProblems(draft), [draft]);
  const nameMissing = draft.name.trim().length === 0;
  const canSave = problems.length === 0 && !nameMissing && (isNew || dirty);
  const modeMismatch =
    (draft.base === 'dark' && relativeLuminance(draft.colors.background) > 0.4) ||
    (draft.base === 'light' && relativeLuminance(draft.colors.background) < 0.1);

  const setColor = (key: keyof CustomThemeColors, value: string): void =>
    setDraft((current) => ({ ...current, colors: { ...current.colors, [key]: value } }));

  const loadPreset = (id: string): void => {
    const preset = getThemePreset(id);
    if (preset) setDraft((current) => ({ ...current, base: preset.base, colors: { ...preset.colors } }));
  };

  const requestClose = (): void => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  return (
    <div>
      <div className="st-themeed__bar">
        <div className="st-themeed__bar-lead">
          <Button icon={ArrowLeft} onClick={requestClose} size="sm" variant="ghost">
            Themes
          </Button>
          <strong className="st-themeed__title">{isNew ? 'New theme' : 'Edit theme'}</strong>
          {dirty && <Badge tone="warning">Unsaved</Badge>}
        </div>
        <div className="st-actions">
          <Button
            disabled={!dirty}
            icon={ArrowCounterClockwise}
            onClick={() => {
              setDraft(initial);
              setConfirmDiscard(false);
            }}
            size="sm"
            variant="ghost"
          >
            Revert
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave(draft, false)}
            size="sm"
            variant={isActive ? 'primary' : 'default'}
          >
            Save
          </Button>
          {!isActive && (
            <Button disabled={!canSave} onClick={() => onSave(draft, true)} size="sm" variant="primary">
              Save and use
            </Button>
          )}
        </div>
      </div>

      {confirmDiscard && (
        <div className="st-themeed__notice">
          <Notice
            action={
              <div className="st-actions">
                <Button onClick={() => setConfirmDiscard(false)} size="sm">
                  Keep editing
                </Button>
                <Button onClick={onClose} size="sm" variant="danger-solid">
                  Discard
                </Button>
              </div>
            }
            tone="warning"
          >
            You have unsaved changes to this theme.
          </Notice>
        </div>
      )}

      <div className="st-themeed">
        <SettingsStack>
          <SettingsGroup title="Basics">
            <SettingsBlock>
              <Field
                hint={nameMissing ? 'Give your theme a name to save it.' : `Up to ${THEME_NAME_MAX_LENGTH} characters.`}
                label="Theme name"
              >
                {(id) => (
                  <input
                    aria-invalid={nameMissing}
                    className="st-input"
                    id={id}
                    maxLength={THEME_NAME_MAX_LENGTH}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="My theme"
                    value={draft.name}
                  />
                )}
              </Field>
            </SettingsBlock>
            <SettingsRow
              description="Matches your background so scrollbars, editor base colors and shadows suit it."
              icon={<Palette size={16} aria-hidden="true" />}
              label="Mode"
            >
              <Segmented
                label="Theme mode"
                onChange={(value: CustomThemeBase) => setDraft((current) => ({ ...current, base: value }))}
                options={MODE_OPTIONS}
                value={draft.base}
              />
            </SettingsRow>
            {modeMismatch && (
              <SettingsBlock>
                <Notice tone="info">
                  Your background looks {draft.base === 'dark' ? 'light' : 'dark'}, but the mode is set to{' '}
                  {draft.base === 'dark' ? 'Dark' : 'Light'}. Switch the mode to match for correct scrollbars and editor
                  colors.
                </Notice>
              </SettingsBlock>
            )}
            <SliderRow
              description="Rounds buttons, cards and dialogs. Everything scales from this one value."
              format={(value) => `${value}px`}
              label="Corner radius"
              max={THEME_RADIUS_MAX}
              min={THEME_RADIUS_MIN}
              onChange={(value) => setDraft((current) => ({ ...current, radius: value }))}
              value={draft.radius}
            />
          </SettingsGroup>

          <ThemePaletteGallery base={draft.base} colors={draft.colors} onPick={loadPreset} />

          {COLOR_GROUPS.map((group) => (
            <SettingsGroup description={group.description} key={group.title} title={group.title}>
              {group.fields.map((field) => (
                <SettingsRow description={field.description} key={field.key} label={field.label}>
                  <ThemeColorField
                    label={field.label}
                    onChange={(value) => setColor(field.key, value)}
                    value={draft.colors[field.key]}
                  />
                </SettingsRow>
              ))}
            </SettingsGroup>
          ))}
        </SettingsStack>

        <aside aria-label="Theme preview" className="st-themeed__aside">
          <ThemePreview theme={draft} />

          {problems.length > 0 && (
            <Notice tone="danger">
              <strong>This theme can’t be saved yet.</strong>
              <ul className="st-themeed__problems">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Notice>
          )}

          <SettingsGroup description="WCAG contrast of the colors you picked." title="Readability">
            {checks.map((check) => (
              <div className="st-contrast" key={check.id}>
                <span
                  aria-hidden="true"
                  className="st-contrast__sample"
                  style={{ color: check.foreground, background: check.background }}
                >
                  Aa
                </span>
                <span className="st-contrast__label">{check.label}</span>
                <span className="st-contrast__ratio">{check.ratio.toFixed(1)}:1</span>
                <Badge tone={check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'danger'}>
                  {check.status === 'pass' ? (check.grade ?? 'Pass') : check.status === 'warn' ? 'Low' : 'Fail'}
                </Badge>
              </div>
            ))}
          </SettingsGroup>
        </aside>
      </div>
    </div>
  );
};
