import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Copy, DownloadSimple, Export, PencilSimple, Plus, Palette, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import type { CustomTheme } from '../../../types';
import {
  MAX_CUSTOM_THEMES,
  THEME_FILE_MAX_CHARS,
  createCustomTheme,
  parseCustomThemeFile,
  serializeCustomTheme,
  themeSwatches,
  uniqueThemeName,
} from '../../../utils/customTheme';
import { Badge, Button, Field, Notice, SettingsBlock, SettingsEmpty, SettingsGroup, SettingsRow } from '../SettingsKit';

interface SettingsCustomThemesProps {
  onCreate: () => void;
  onEdit: (theme: CustomTheme) => void;
}

interface Message {
  tone: 'success' | 'warning';
  text: string;
  /** Shown for manual copying when the clipboard is unavailable. */
  json?: string;
}

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const SettingsCustomThemes = ({ onCreate, onEdit }: SettingsCustomThemesProps) => {
  const customThemes = useAppStore((s) => s.customThemes);
  const activeCustomThemeId = useAppStore((s) => s.activeCustomThemeId);
  const themeMode = useAppStore((s) => s.themeMode);
  const applyCustomTheme = useAppStore((s) => s.applyCustomTheme);
  const saveCustomTheme = useAppStore((s) => s.saveCustomTheme);
  const deleteCustomTheme = useAppStore((s) => s.deleteCustomTheme);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const atLimit = customThemes.length >= MAX_CUSTOM_THEMES;
  const names = customThemes.map((theme) => theme.name);

  const closeImport = (): void => {
    setImportOpen(false);
    setImportText('');
    setImportError(null);
  };

  const runImport = (text: string): void => {
    const result = parseCustomThemeFile(text);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    const name = uniqueThemeName(result.theme.name, names);
    saveCustomTheme({ ...result.theme, name });
    closeImport();
    setMessage({ tone: 'success', text: `Imported “${name}”. Use it from the list below.` });
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > THEME_FILE_MAX_CHARS * 4) {
      setImportError('This file is too large to be a theme.');
      return;
    }
    try {
      runImport(await file.text());
    } catch {
      setImportError('That file could not be read.');
    }
  };

  const exportTheme = async (theme: CustomTheme): Promise<void> => {
    const json = serializeCustomTheme(theme);
    try {
      await navigator.clipboard.writeText(json);
      setMessage({ tone: 'success', text: `Copied “${theme.name}” to the clipboard. Paste it into Import on another machine to share it.` });
    } catch {
      setMessage({ tone: 'warning', text: 'Could not reach the clipboard. Copy the theme from the box below instead.', json });
    }
  };

  const duplicateTheme = (theme: CustomTheme): void => {
    saveCustomTheme(createCustomTheme(theme, uniqueThemeName(`${theme.name} copy`, names)));
  };

  return (
    <SettingsGroup
      action={
        <div className="st-actions">
          <Button
            disabled={atLimit}
            icon={DownloadSimple}
            onClick={() => (importOpen ? closeImport() : setImportOpen(true))}
            size="sm"
          >
            Import
          </Button>
          <Button disabled={atLimit} icon={Plus} onClick={onCreate} size="sm" variant="primary">
            New theme
          </Button>
        </div>
      }
      description="Design your own look. A custom theme brings its own accent color."
      footer={atLimit ? `You have reached the limit of ${MAX_CUSTOM_THEMES} custom themes. Delete one to add another.` : undefined}
      title="Custom themes"
    >
      {message && (
        <SettingsBlock>
          <Notice
            action={<Button aria-label="Dismiss" icon={X} iconOnly onClick={() => setMessage(null)} size="sm" variant="ghost" />}
            tone={message.tone}
          >
            {message.text}
          </Notice>
          {message.json && (
            <textarea
              aria-label="Theme JSON"
              className="st-textarea st-textarea--mono st-themeimport__json"
              onFocus={(event) => event.target.select()}
              readOnly
              rows={8}
              value={message.json}
            />
          )}
        </SettingsBlock>
      )}

      {importOpen && (
        <SettingsBlock>
          <div className="st-themeimport">
            <Field hint="Theme files are plain JSON exported from YzPzCode." label="Paste a theme">
              {(id) => (
                <textarea
                  className="st-textarea st-textarea--mono"
                  id={id}
                  onChange={(event) => {
                    setImportText(event.target.value);
                    setImportError(null);
                  }}
                  placeholder={'{ "format": "yzpzcode-theme", … }'}
                  rows={6}
                  spellCheck={false}
                  value={importText}
                />
              )}
            </Field>
            {importError && <Notice tone="danger">{importError}</Notice>}
            <div className="st-actions">
              <Button disabled={!importText.trim()} onClick={() => runImport(importText)} variant="primary">
                Import theme
              </Button>
              <Button icon={UploadSimple} onClick={() => fileInputRef.current?.click()}>
                Choose file…
              </Button>
              <Button onClick={closeImport} variant="ghost">
                Cancel
              </Button>
            </div>
            <input accept=".json,application/json" hidden onChange={(event) => void importFile(event)} ref={fileInputRef} type="file" />
          </div>
        </SettingsBlock>
      )}

      {customThemes.length === 0 ? (
        <SettingsEmpty icon={Palette} title="No custom themes yet">
          Start from any built-in theme and make it yours, or import one someone shared.
        </SettingsEmpty>
      ) : (
        customThemes.map((theme) => {
          const isActive = themeMode === 'custom' && activeCustomThemeId === theme.id;
          return (
            <SettingsRow
              badge={isActive && <Badge tone="accent">In use</Badge>}
              description={`${theme.base === 'dark' ? 'Dark' : 'Light'} · Updated ${formatDate(theme.updatedAt)}`}
              icon={
                <span aria-hidden="true" className="st-themechip">
                  {themeSwatches(theme).map((color, index) => (
                    <span key={`${color}-${index}`} style={{ backgroundColor: color }} />
                  ))}
                </span>
              }
              iconBare
              key={theme.id}
              label={theme.name}
            >
              {pendingDelete === theme.id ? (
                <>
                  <span className="st-themerow__confirm">Delete this theme?</span>
                  <Button
                    onClick={() => {
                      deleteCustomTheme(theme.id);
                      setPendingDelete(null);
                    }}
                    size="sm"
                    variant="danger-solid"
                  >
                    Delete
                  </Button>
                  <Button onClick={() => setPendingDelete(null)} size="sm">
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {!isActive && (
                    <Button aria-label={`Use ${theme.name}`} onClick={() => applyCustomTheme(theme.id)} size="sm">
                      Use
                    </Button>
                  )}
                  <Button
                    aria-label={`Edit ${theme.name}`}
                    icon={PencilSimple}
                    iconOnly
                    onClick={() => onEdit(theme)}
                    size="sm"
                    title="Edit"
                    variant="ghost"
                  />
                  <Button
                    aria-label={`Duplicate ${theme.name}`}
                    disabled={atLimit}
                    icon={Copy}
                    iconOnly
                    onClick={() => duplicateTheme(theme)}
                    size="sm"
                    title={atLimit ? 'Theme limit reached' : 'Duplicate'}
                    variant="ghost"
                  />
                  <Button
                    aria-label={`Copy ${theme.name} to share`}
                    icon={Export}
                    iconOnly
                    onClick={() => void exportTheme(theme)}
                    size="sm"
                    title="Copy theme to share"
                    variant="ghost"
                  />
                  <Button
                    aria-label={`Delete ${theme.name}`}
                    icon={Trash}
                    iconOnly
                    onClick={() => setPendingDelete(theme.id)}
                    size="sm"
                    title="Delete"
                    variant="danger"
                  />
                </>
              )}
            </SettingsRow>
          );
        })
      )}
    </SettingsGroup>
  );
};
