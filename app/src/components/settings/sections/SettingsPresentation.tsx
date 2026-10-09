import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ArrowCounterClockwise, BookmarkSimple, DownloadSimple, ImageSquare, Palette, PencilSimple, Plus, Swatches, Trash, UploadSimple } from '@phosphor-icons/react';
import type { FileContent } from '../../../types';
import { ThemeEditor } from '../../presentation/ThemeEditor';
import { parseTemplateFile, parseThemeFile, serializeTemplate, serializeTheme } from '../../../utils/presentation/templates';
import { STOCK_PROVIDERS } from '../../../utils/presentation/stockImages';
import type { DeckTheme } from '../../../utils/presentation/types';
import { slugify } from '../../../utils/writing/document';
import type { StockProvider } from '../../../stores/presentationStore';
import '../../presentation/presentation.css';
import { usePresentationStore } from '../../../stores/presentationStore';
import { DECK_TONES, MAX_SLIDES, MIN_SLIDES } from '../../../utils/presentation/deck';
import { DECK_THEMES } from '../../../utils/presentation/themes';
import type { DeckTone } from '../../../utils/presentation/types';
import { listWritingEngines, type WritingEngineInfo } from '../../../utils/writing/aiClient';
import { useEngineModels } from '../../../utils/writing/useEngineModels';
import type { WritingEngineId } from '../../../utils/writing/types';
import { ModelInput } from '../../writing/ModelInput';
import {
  Badge,
  Button,
  ColorBands,
  Field,
  Notice,
  SettingsEmpty,
  Segmented,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SettingsTabs,
  SliderRow,
  StatusDot,
  ToggleRow,
} from '../SettingsKit';

type Tab = 'decks' | 'themes' | 'images' | 'engines' | 'storage';

const TABS = [
  { id: 'decks' as const, label: 'New decks', icon: Palette },
  { id: 'themes' as const, label: 'Themes & templates', icon: Swatches },
  { id: 'images' as const, label: 'Images', icon: ImageSquare },
  { id: 'engines' as const, label: 'Engines', icon: PencilSimple },
  { id: 'storage' as const, label: 'Saving', icon: DownloadSimple },
];

function DecksTab(): React.JSX.Element {
  const themeId = usePresentationStore((state) => state.defaultThemeId);
  const size = usePresentationStore((state) => state.defaultSize);
  const count = usePresentationStore((state) => state.defaultSlideCount);
  const tone = usePresentationStore((state) => state.defaultTone);
  const openWizard = usePresentationStore((state) => state.openWizardOnStart);
  const setPreference = usePresentationStore((state) => state.setPreference);
  return (
    <>
      <SettingsGroup title="Defaults for new presentations" description="The wizard starts from these. Each deck can change them, and the theme can be switched any time.">
        <SliderRow label="Length" description="How many slides the storyline aims for." value={count} min={MIN_SLIDES} max={MAX_SLIDES} format={(value) => `${value} slides`} onChange={(value) => setPreference('defaultSlideCount', value)} />
        <SettingsRow label="Tone" description={DECK_TONES.find((entry) => entry.id === tone)?.hint}>
          <Segmented<DeckTone> label="Tone" value={tone} options={DECK_TONES.map((entry) => ({ value: entry.id, label: entry.label }))} onChange={(value) => setPreference('defaultTone', value)} />
        </SettingsRow>
        <SettingsRow label="Slide size">
          <Segmented<'16:9' | '4:3'> label="Slide size" value={size} options={[{ value: '16:9', label: 'Widescreen 16:9' }, { value: '4:3', label: 'Standard 4:3' }]} onChange={(value) => setPreference('defaultSize', value)} />
        </SettingsRow>
        <ToggleRow label="Open the wizard in empty presentation workspaces" checked={openWizard} onChange={(value) => setPreference('openWizardOnStart', value)} />
      </SettingsGroup>
      <SettingsGroup title="Default theme" description="Themes use only fonts every copy of PowerPoint has, so exported files look the same on other machines.">
        {DECK_THEMES.map((theme) => (
          <SettingsRow
            key={theme.id}
            label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{theme.name}{theme.id === themeId && <Badge tone="accent">Default</Badge>}{theme.dark && <Badge>Dark</Badge>}</span>}
            description={`${theme.tagline} · ${theme.headingFont} / ${theme.bodyFont}`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <ColorBands colors={[theme.palette.background, theme.palette.text, theme.palette.accent1, theme.palette.accent2, theme.palette.accent3]} />
              <Button size="sm" variant={theme.id === themeId ? 'primary' : 'default'} onClick={() => setPreference('defaultThemeId', theme.id)}>
                {theme.id === themeId ? 'Default' : 'Use'}
              </Button>
            </span>
          </SettingsRow>
        ))}
      </SettingsGroup>
    </>
  );
}

async function writeJson(title: string, defaultPath: string, content: string): Promise<boolean> {
  const path = await save({ title, defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!path) return false;
  await invoke('write_file_content', { path, content });
  return true;
}

async function readJson(): Promise<string | null> {
  const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (typeof path !== 'string') return null;
  return (await invoke<FileContent>('read_file_content', { path })).content;
}

function ThemesTab({ onEdit }: { onEdit: (theme: DeckTheme | null) => void }): React.JSX.Element {
  const themes = usePresentationStore((state) => state.customThemes);
  const templates = usePresentationStore((state) => state.templates);
  const defaultThemeId = usePresentationStore((state) => state.defaultThemeId);
  const { deleteTheme, saveTheme, deleteTemplate, saveTemplate, setPreference } = usePresentationStore.getState();
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const report = (promise: Promise<unknown>, success: string): void => {
    promise.then((value) => { if (value !== false && value !== null) setMessage({ tone: 'success', text: success }); })
      .catch((error: unknown) => setMessage({ tone: 'danger', text: error instanceof Error ? error.message : String(error) }));
  };
  return (
    <>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <SettingsGroup
        title="Your themes"
        description="Themes you made in the theme editor or imported. They appear in every deck's Theme menu and the wizard."
        action={(
          <span style={{ display: 'flex', gap: 6 }}>
            <Button size="sm" icon={UploadSimple} onClick={() => report(readJson().then((text) => { if (text === null) return null; saveTheme(parseThemeFile(text)); return true; }), 'Theme imported.')}>Import</Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => onEdit(null)}>New theme</Button>
          </span>
        )}
      >
        {themes.length === 0 ? (
          <SettingsEmpty icon={Swatches} title="No custom themes yet">Start one here, or choose Customize in a deck's Theme menu.</SettingsEmpty>
        ) : themes.map((theme) => (
          <SettingsRow
            key={theme.id}
            label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{theme.name}{theme.id === defaultThemeId && <Badge tone="accent">Default</Badge>}</span>}
            description={`${theme.headingFont} / ${theme.bodyFont} · ${theme.titleSize}/${theme.bodySize} pt`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ColorBands colors={[theme.palette.background, theme.palette.text, theme.palette.accent1, theme.palette.accent2, theme.palette.accent3]} />
              <Button size="sm" variant="ghost" iconOnly icon={PencilSimple} aria-label="Edit" title="Edit" onClick={() => onEdit(theme)} />
              <Button size="sm" variant="ghost" iconOnly icon={DownloadSimple} aria-label="Export" title="Export" onClick={() => report(writeJson('Export theme', `${slugify(theme.name)}.yzdeck-theme.json`, serializeTheme(theme)), 'Theme exported.')} />
              <Button size="sm" variant="ghost" iconOnly icon={BookmarkSimple} aria-label="Use by default" title="Use for new decks" onClick={() => setPreference('defaultThemeId', theme.id)} />
              <Button size="sm" variant="ghost" iconOnly icon={Trash} aria-label="Delete" title="Delete" onClick={() => deleteTheme(theme.id)} />
            </span>
          </SettingsRow>
        ))}
      </SettingsGroup>
      <SettingsGroup
        title="Templates"
        description="Decks saved with More → Save as template. Start from one on the Slides home page or in the wizard's Style step."
        action={<Button size="sm" icon={UploadSimple} onClick={() => report(readJson().then((text) => { if (text === null) return null; saveTemplate(parseTemplateFile(text)); return true; }), 'Template imported.')}>Import</Button>}
      >
        {templates.length === 0 ? (
          <SettingsEmpty icon={BookmarkSimple} title="No templates yet">Open a deck you like and choose More → Save as template.</SettingsEmpty>
        ) : templates.map((template) => (
          <SettingsRow key={template.id} label={template.name} description={`${template.slides.length} slides · ${template.theme.name} · ${template.size}${template.description ? ` · ${template.description}` : ''}`}>
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <Button size="sm" variant="ghost" iconOnly icon={DownloadSimple} aria-label="Export" title="Export" onClick={() => report(writeJson('Export template', `${slugify(template.name)}.yzdeck-template.json`, serializeTemplate(template)), 'Template exported.')} />
              <Button size="sm" variant="ghost" iconOnly icon={Trash} aria-label="Delete" title="Delete" onClick={() => deleteTemplate(template.id)} />
            </span>
          </SettingsRow>
        ))}
      </SettingsGroup>
    </>
  );
}

function ImagesTab(): React.JSX.Element {
  const provider = usePresentationStore((state) => state.stockProvider);
  const keys = usePresentationStore((state) => state.stockKeys);
  const setPreference = usePresentationStore((state) => state.setPreference);
  const setStockKey = usePresentationStore((state) => state.setStockKey);
  const meta = STOCK_PROVIDERS.find((entry) => entry.id === provider);
  return (
    <>
      <SettingsGroup title="Stock photos" description="“Search photos” in a picture's editor looks here. Searches go straight from this computer to the service; photos are saved into the deck's assets folder with their credit.">
        <SettingsRow label="Service" description={meta?.hint ?? 'Photo search is turned off.'}>
          <Segmented<StockProvider> label="Photo service" value={provider} options={[{ value: 'off', label: 'Off' }, ...STOCK_PROVIDERS.map((entry) => ({ value: entry.id, label: entry.label }))]} onChange={(value) => setPreference('stockProvider', value)} />
        </SettingsRow>
        <Field label="Unsplash access key" hint="From unsplash.com/developers (free). Stored on this computer only.">
          {(id) => <input id={id} className="st-input" type="password" value={keys.unsplash} placeholder="Access key" onChange={(event) => setStockKey('unsplash', event.target.value)} />}
        </Field>
        <Field label="Pexels API key" hint="From pexels.com/api (free). Stored on this computer only.">
          {(id) => <input id={id} className="st-input" type="password" value={keys.pexels} placeholder="API key" onChange={(event) => setStockKey('pexels', event.target.value)} />}
        </Field>
      </SettingsGroup>
      <Notice tone="info">The AI CLIs cannot draw pictures. Every picture slot has an image prompt to copy into your own image generator: write one, draft it from the slide, or run the Image prompts pass in the AI panel for the whole deck.</Notice>
    </>
  );
}

function EnginesTab(): React.JSX.Element {
  const engine = usePresentationStore((state) => state.defaultEngine);
  const setEngine = usePresentationStore((state) => state.setDefaultEngine);
  const timeout = usePresentationStore((state) => state.aiTimeoutSecs);
  const batchSize = usePresentationStore((state) => state.batchSize);
  const setPreference = usePresentationStore((state) => state.setPreference);
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  const [checking, setChecking] = useState(false);
  const { models, loading } = useEngineModels(engine.engine, Boolean(engines?.find((entry) => entry.engine === engine.engine)?.installed));
  const refresh = (force: boolean): void => {
    setChecking(true);
    listWritingEngines(force).then(setEngines).catch(() => setEngines([])).finally(() => setChecking(false));
  };
  useEffect(() => refresh(false), []);
  return (
    <>
      <SettingsGroup
        title="Presenter engines"
        description="The installed AI CLIs that write decks. They run in the background with no tools and an empty working folder, using your existing sign-in, and return slides as structured data the studio designs."
        action={<Button size="sm" icon={ArrowCounterClockwise} loading={checking} onClick={() => refresh(true)}>Check again</Button>}
      >
        {(engines ?? []).map((entry) => (
          <SettingsRow
            key={entry.engine}
            iconBare
            icon={<StatusDot tone={entry.installed ? 'success' : 'neutral'} />}
            label={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{entry.displayName}{entry.support === 'experimental' && <Badge tone="warning">Beta</Badge>}</span>}
            description={entry.installed ? `${entry.version ?? 'Installed'} · ${entry.streaming === 'token' ? 'slides appear one by one' : 'slides arrive a batch at a time'}` : 'Not installed'}
          >
            <Button size="sm" variant={engine.engine === entry.engine ? 'primary' : 'default'} disabled={!entry.installed} onClick={() => setEngine({ ...engine, engine: entry.engine as WritingEngineId, model: '' })}>
              {engine.engine === entry.engine ? 'Default' : 'Use by default'}
            </Button>
          </SettingsRow>
        ))}
      </SettingsGroup>
      <SettingsGroup title="Requests">
        <SettingsRow label="Default model" description="Leave blank to use the CLI's own default.">
          <ModelInput className="st-input st-control-w" value={engine.model} models={models} loading={loading} placeholder="CLI default" onChange={(model) => setEngine({ ...engine, model })} />
        </SettingsRow>
        <SliderRow label="Slides per AI call" description="Smaller batches show slides sooner; larger ones keep the deck more consistent." value={batchSize} min={2} max={8} format={(value) => `${value} slides`} onChange={(value) => setPreference('batchSize', value)} />
        <SliderRow label="Time limit per AI call" description="A call that takes longer is stopped." value={timeout} min={60} max={1800} step={30} format={(value) => `${Math.round(value / 60)} min`} onChange={(value) => setPreference('aiTimeoutSecs', value)} />
      </SettingsGroup>
    </>
  );
}

function StorageTab(): React.JSX.Element {
  const autosave = usePresentationStore((state) => state.autosaveDelayMs);
  const snapshots = usePresentationStore((state) => state.snapshotLimit);
  const setPreference = usePresentationStore((state) => state.setPreference);
  return (
    <SettingsGroup title="Saving" description="Decks are saved as .yzdeck files in each presentation workspace's Presentations folder, with their images, exports and (for opened PowerPoint files) the untouched original beside them.">
      <SliderRow label="Autosave after an edit" value={autosave} min={500} max={10000} step={250} format={(value) => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} s`} onChange={(value) => setPreference('autosaveDelayMs', value)} />
      <SliderRow label="Version history" description="Copies kept in the deck's .history folder, at most one every five minutes." value={snapshots} min={0} max={100} step={5} format={(value) => (value === 0 ? 'Off' : `${value} versions`)} onChange={(value) => setPreference('snapshotLimit', value)} />
    </SettingsGroup>
  );
}

export function SettingsPresentation(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('decks');
  const [editing, setEditing] = useState<{ theme: DeckTheme | null } | null>(null);
  const defaultThemeId = usePresentationStore((state) => state.defaultThemeId);
  const customThemes = usePresentationStore((state) => state.customThemes);
  return (
    <SettingsStack>
      <SettingsTabs tabs={TABS} value={tab} onChange={setTab} label="Presentation settings" />
      {tab === 'decks' && <DecksTab />}
      {tab === 'themes' && <ThemesTab onEdit={(theme) => setEditing({ theme })} />}
      {tab === 'images' && <ImagesTab />}
      {editing && (
        <div className="pr-root" style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'transparent' }}>
          <ThemeEditor
            theme={editing.theme ?? customThemes.find((theme) => theme.id === defaultThemeId) ?? DECK_THEMES.find((theme) => theme.id === defaultThemeId) ?? DECK_THEMES[0]}
            size="16:9"
            canApply={false}
            onClose={() => setEditing(null)}
            onSave={(theme) => { usePresentationStore.getState().saveTheme(theme); setEditing(null); }}
          />
        </div>
      )}
      {tab === 'engines' && <EnginesTab />}
      {tab === 'storage' && <StorageTab />}
    </SettingsStack>
  );
}
