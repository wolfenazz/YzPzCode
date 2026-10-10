import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  ArrowCounterClockwise,
  BookmarkSimple,
  Copy,
  DownloadSimple,
  Feather,
  PencilSimple,
  Plus,
  Sparkle,
  Star,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import SwipeRow from '../../reactbits/SwipeRow';
import { CommissionWizard } from '../../writing/wizard/CommissionWizard';
import { useWritingStore } from '../../../stores/writingStore';
import { listWritingEngines, type WritingEngineInfo } from '../../../utils/writing/aiClient';
import { useEngineModels } from '../../../utils/writing/useEngineModels';
import { EffortSelect, hasEfforts } from '../../writing/EffortSelect';
import { ModelInput } from '../../writing/ModelInput';
import { applyHumanizerPreset, DEFAULT_BANNED_PHRASES, HUMANIZER_PRESETS } from '../../../utils/writing/humanizer';
import { getReportType } from '../../../utils/writing/reportTypes';
import { STYLE_THEMES } from '../../../utils/writing/stylePresets';
import type { FileContent } from '../../../types';
import type { ReportProfile, WritingEngineId } from '../../../utils/writing/types';
import {
  Badge,
  Button,
  Field,
  Notice,
  Segmented,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SettingsTabs,
  SliderRow,
  StatusDot,
  ToggleRow,
} from '../SettingsKit';
import '../../writing/writing.css';

type Tab = 'profiles' | 'humanizer' | 'style' | 'engines' | 'storage';

const TABS = [
  { id: 'profiles' as const, label: 'Profiles', icon: BookmarkSimple },
  { id: 'humanizer' as const, label: 'Humanizer', icon: Sparkle },
  { id: 'style' as const, label: 'Style defaults', icon: Feather },
  { id: 'engines' as const, label: 'Engines', icon: PencilSimple },
  { id: 'storage' as const, label: 'Saving', icon: DownloadSimple },
];

function ProfilesTab({ onEdit }: { onEdit: (profile: ReportProfile | null) => void }): React.JSX.Element {
  const profiles = useWritingStore((state) => state.profiles);
  const defaultProfileId = useWritingStore((state) => state.defaultProfileId);
  const { deleteProfile, duplicateProfile, setDefaultProfile, importProfiles, restoreBuiltIns } = useWritingStore.getState();
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const exportProfiles = async (): Promise<void> => {
    const path = await save({ title: 'Export report profiles', defaultPath: 'report-profiles.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!path) return;
    try {
      const custom = profiles.filter((profile) => !profile.builtIn);
      await invoke('write_file_content', { path, content: `${JSON.stringify({ format: 'yzpz-report-profiles', version: 1, profiles: custom }, null, 2)}\n` });
      setMessage({ tone: 'success', text: `Exported ${custom.length} profile${custom.length === 1 ? '' : 's'}.` });
    } catch (error) {
      setMessage({ tone: 'danger', text: `Could not export: ${String(error)}` });
    }
  };

  const importFile = async (): Promise<void> => {
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (typeof path !== 'string') return;
    try {
      const file = await invoke<FileContent>('read_file_content', { path });
      const parsed = JSON.parse(file.content) as { profiles?: unknown[] } | unknown[];
      const list = Array.isArray(parsed) ? parsed : parsed.profiles;
      if (!Array.isArray(list)) throw new Error('No profiles in this file.');
      const count = importProfiles(list as ReportProfile[]);
      setMessage(count > 0 ? { tone: 'success', text: `Imported ${count} profile${count === 1 ? '' : 's'}.` } : { tone: 'danger', text: 'No valid profiles were found in this file.' });
    } catch (error) {
      setMessage({ tone: 'danger', text: `Could not import: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  return (
    <SettingsGroup
      title="Report profiles"
      description="Saved setups — report type, house style, voice, humanizer and the details you always reuse, like your university or team. New reports can start from one."
      action={(
        <span style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" icon={UploadSimple} onClick={() => void importFile()}>Import</Button>
          <Button size="sm" icon={DownloadSimple} onClick={() => void exportProfiles()}>Export</Button>
          <Button size="sm" variant="primary" icon={Plus} onClick={() => onEdit(null)}>New profile</Button>
        </span>
      )}
      footer={<Button size="sm" variant="ghost" icon={ArrowCounterClockwise} onClick={restoreBuiltIns}>Restore the built-in profiles</Button>}
    >
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {profiles.length === 0 ? (
        <SettingsEmpty icon={BookmarkSimple} title="No profiles yet">Create one here, or save one from the last step of the report wizard.</SettingsEmpty>
      ) : profiles.map((profile) => {
        const type = getReportType(profile.typeId);
        return (
          <SwipeRow
            key={profile.id}
            height={68}
            radius={10}
            rowColor="transparent"
            drawerColor="var(--bg-tertiary)"
            textColor="var(--text-primary)"
            label={`${profile.name} actions`}
            actions={[
              { id: 'duplicate', label: 'Duplicate', icon: <Copy size={16} />, color: '#3f6fd8', onSelect: () => { duplicateProfile(profile.id); } },
              { id: 'delete', label: 'Delete', icon: <Trash size={16} />, color: '#e5484d', dismiss: true, onSelect: () => deleteProfile(profile.id) },
            ]}
          >
            <SettingsRow
              label={(
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {profile.name}
                  {profile.id === defaultProfileId && <Badge tone="accent">Default</Badge>}
                  {profile.builtIn && <Badge>Built in</Badge>}
                </span>
              )}
              description={`${type.name} · ${profile.style.bodyFont} ${profile.style.bodySize}pt · ${profile.style.citationStyle.toUpperCase()}`}
            >
              <span style={{ display: 'flex', gap: 4 }}>
                <Button size="sm" variant="ghost" iconOnly icon={Star} iconWeight={profile.id === defaultProfileId ? 'fill' : 'regular'} aria-label="Use as default" title="Use as default for new reports" onClick={() => setDefaultProfile(profile.id === defaultProfileId ? null : profile.id)} />
                <Button size="sm" variant="ghost" iconOnly icon={PencilSimple} aria-label="Edit" title="Edit" onClick={() => onEdit(profile)} />
                <Button size="sm" variant="ghost" iconOnly icon={Copy} aria-label="Duplicate" title="Duplicate" onClick={() => duplicateProfile(profile.id)} />
                <Button size="sm" variant="ghost" iconOnly icon={Trash} aria-label="Delete" title="Delete" onClick={() => deleteProfile(profile.id)} />
              </span>
            </SettingsRow>
          </SwipeRow>
        );
      })}
    </SettingsGroup>
  );
}

function HumanizerTab(): React.JSX.Element {
  const settings = useWritingStore((state) => state.defaultHumanizer);
  const setSettings = useWritingStore((state) => state.setDefaultHumanizer);
  const [phrases, setPhrases] = useState(settings.bannedPhrases.join('\n'));
  useEffect(() => setPhrases(settings.bannedPhrases.join('\n')), [settings.bannedPhrases]);
  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]): void => setSettings({ ...settings, [key]: value, presetId: ['enabled', 'bannedPhrases', 'customInstructions'].includes(key as string) ? settings.presetId : 'custom' });
  const percent = (value: number): string => `${value}%`;
  return (
    <>
      <SettingsGroup title="Default humanizer" description="Used by new reports that don't start from a profile. Each report keeps its own copy, editable from the Humanizer panel.">
        <ToggleRow label="Humanize the writing" description="Shape every section so it reads like an experienced person wrote it." checked={settings.enabled} onChange={(value) => set('enabled', value)} />
        <SettingsRow label="Preset" description={HUMANIZER_PRESETS.find((preset) => preset.id === settings.presetId)?.description ?? 'Custom settings'}>
          <Segmented
            label="Humanizer preset"
            value={settings.presetId}
            options={[...HUMANIZER_PRESETS.map((preset) => ({ value: preset.id, label: preset.name })), ...(settings.presetId === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]}
            onChange={(value) => { if (value !== 'custom') setSettings(applyHumanizerPreset(settings, value)); }}
            disabled={!settings.enabled}
          />
        </SettingsRow>
        <SliderRow label="Rewrite depth" description="Light touch keeps the draft; deep rewrite rebuilds sentences." value={settings.intensity} min={0} max={100} format={percent} onChange={(value) => set('intensity', value)} disabled={!settings.enabled} />
        <SliderRow label="Sentence rhythm" description="How much sentence length varies." value={settings.burstiness} min={0} max={100} format={percent} onChange={(value) => set('burstiness', value)} disabled={!settings.enabled} />
        <SliderRow label="Register" description="From conversational to formal." value={settings.formality} min={0} max={100} format={percent} onChange={(value) => set('formality', value)} disabled={!settings.enabled} />
        <SliderRow label="Hedging" description="From direct statements to careful qualification." value={settings.hedging} min={0} max={100} format={percent} onChange={(value) => set('hedging', value)} disabled={!settings.enabled} />
        <ToggleRow label="Allow contractions" checked={settings.contractions} onChange={(value) => set('contractions', value)} disabled={!settings.enabled} />
      </SettingsGroup>
      <SettingsGroup
        title="Banned words and phrases"
        description="The writer never uses these, and the Humanizer panel highlights them. One per line."
        footer={<Button size="sm" variant="ghost" icon={ArrowCounterClockwise} onClick={() => setSettings({ ...settings, bannedPhrases: [...DEFAULT_BANNED_PHRASES] })}>Restore the default list ({DEFAULT_BANNED_PHRASES.length})</Button>}
      >
        <Field label="Phrases" full>
          {(id) => (
            <textarea
              id={id}
              className="st-textarea st-textarea--mono"
              rows={10}
              value={phrases}
              onChange={(event) => setPhrases(event.target.value)}
              onBlur={() => setSettings({ ...settings, bannedPhrases: [...new Set(phrases.split('\n').map((line) => line.trim().toLowerCase()).filter(Boolean))] })}
            />
          )}
        </Field>
      </SettingsGroup>
      <SettingsGroup title="Your style instructions" description="Added to every writing and rewriting prompt.">
        <Field label="Instructions" full>
          {(id) => (
            <textarea id={id} className="st-textarea" rows={4} value={settings.customInstructions} placeholder="e.g. Prefer active voice. Write amounts as SAR 1.2 million." onChange={(event) => setSettings({ ...settings, customInstructions: event.target.value })} />
          )}
        </Field>
      </SettingsGroup>
    </>
  );
}

function StyleTab(): React.JSX.Element {
  const themeId = useWritingStore((state) => state.defaultThemeId);
  const setThemeId = useWritingStore((state) => state.setDefaultThemeId);
  return (
    <SettingsGroup title="Template for new reports" description="Reports that don't start from a profile use their report type's usual template unless you pick one here.">
      <SettingsRow label="Template">
        <select className="st-select st-control-w" value={themeId ?? ''} onChange={(event) => setThemeId(event.target.value || null)}>
          <option value="">Follow the report type</option>
          {STYLE_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
        </select>
      </SettingsRow>
      {STYLE_THEMES.map((theme) => (
        <SettingsRow key={theme.id} label={theme.name} description={`${theme.tagline} · ${theme.bodyFont} ${theme.bodySize}pt`} nested />
      ))}
    </SettingsGroup>
  );
}

function EnginesTab(): React.JSX.Element {
  const defaultEngine = useWritingStore((state) => state.defaultEngine);
  const setDefaultEngine = useWritingStore((state) => state.setDefaultEngine);
  const timeout = useWritingStore((state) => state.aiTimeoutSecs);
  const setPreference = useWritingStore((state) => state.setPreference);
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  const [checking, setChecking] = useState(false);
  const { models, loading: loadingModels } = useEngineModels(defaultEngine.engine, !!engines?.find((e) => e.engine === defaultEngine.engine)?.installed);
  const refresh = (force: boolean): void => {
    setChecking(true);
    listWritingEngines(force).then(setEngines).catch(() => setEngines([])).finally(() => setChecking(false));
  };
  useEffect(() => refresh(false), []);
  return (
    <>
      <SettingsGroup
        title="Writing engines"
        description="The installed AI CLIs the writer can drive. They run in the background with no tools and an empty working folder, using your existing sign-in."
        action={<Button size="sm" icon={ArrowCounterClockwise} loading={checking} onClick={() => refresh(true)}>Check again</Button>}
      >
        {(engines ?? []).map((engine) => (
          <SettingsRow
            key={engine.engine}
            iconBare
            icon={<StatusDot tone={engine.installed ? 'success' : 'neutral'} />}
            label={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{engine.displayName}{engine.support === 'experimental' && <Badge tone="warning">Beta</Badge>}</span>}
            description={engine.installed ? `${engine.version ?? 'Installed'} · ${engine.streaming === 'token' ? 'streams word by word' : 'delivers each section whole'}` : 'Not installed'}
          >
            <Button size="sm" variant={defaultEngine.engine === engine.engine ? 'primary' : 'default'} disabled={!engine.installed} onClick={() => setDefaultEngine({ ...defaultEngine, engine: engine.engine as WritingEngineId, model: '', effort: '' })}>
              {defaultEngine.engine === engine.engine ? 'Default' : 'Use by default'}
            </Button>
          </SettingsRow>
        ))}
      </SettingsGroup>
      <SettingsGroup title="Requests">
        <SettingsRow label="Default model" description="Leave blank to use the CLI's own default.">
          <ModelInput className="st-input st-control-w" value={defaultEngine.model} models={models} loading={loadingModels} placeholder="CLI default" onChange={(model) => setDefaultEngine({ ...defaultEngine, model })} />
        </SettingsRow>
        {hasEfforts(models, defaultEngine.model) && (
          <SettingsRow label="Thinking effort" description="How long the model reasons before answering. Higher is slower and uses more of your limits.">
            <EffortSelect className="st-input st-control-w" value={defaultEngine.effort ?? ''} onChange={(effort) => setDefaultEngine({ ...defaultEngine, effort })} models={models} model={defaultEngine.model} />
          </SettingsRow>
        )}
        <SliderRow label="Time limit per AI call" description="A section that takes longer is stopped." value={timeout} min={60} max={1800} step={30} format={(value) => `${Math.round(value / 60)} min`} onChange={(value) => setPreference('aiTimeoutSecs', value)} />
      </SettingsGroup>
    </>
  );
}

function StorageTab(): React.JSX.Element {
  const autosave = useWritingStore((state) => state.autosaveDelayMs);
  const snapshots = useWritingStore((state) => state.snapshotLimit);
  const openWizard = useWritingStore((state) => state.openWizardOnStart);
  const setPreference = useWritingStore((state) => state.setPreference);
  return (
    <SettingsGroup title="Saving" description="Reports are saved as .yzdoc files in each writing workspace's Reports folder, with their images and exports beside them.">
      <SliderRow label="Autosave after typing stops" value={autosave} min={500} max={10000} step={250} format={(value) => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} s`} onChange={(value) => setPreference('autosaveDelayMs', value)} />
      <SliderRow label="Version history" description="Copies kept in the report's .history folder, at most one every five minutes." value={snapshots} min={0} max={100} step={5} format={(value) => (value === 0 ? 'Off' : `${value} versions`)} onChange={(value) => setPreference('snapshotLimit', value)} />
      <ToggleRow label="Open the report wizard in empty writing workspaces" checked={openWizard} onChange={(value) => setPreference('openWizardOnStart', value)} />
    </SettingsGroup>
  );
}

export function SettingsWriting(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('profiles');
  const [editing, setEditing] = useState<{ profile: ReportProfile | null } | null>(null);
  const saveProfile = useWritingStore((state) => state.saveProfile);
  return (
    <SettingsStack>
      <SettingsTabs tabs={TABS} value={tab} onChange={setTab} label="Writing settings" />
      {tab === 'profiles' && <ProfilesTab onEdit={(profile) => setEditing({ profile })} />}
      {tab === 'humanizer' && <HumanizerTab />}
      {tab === 'style' && <StyleTab />}
      {tab === 'engines' && <EnginesTab />}
      {tab === 'storage' && <StorageTab />}
      <AnimatePresence>
        {editing && (
          <div key="profile-wizard" className="wr-root" style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
            <CommissionWizard
              mode="profile"
              workspacePath=""
              profile={editing.profile}
              onClose={() => setEditing(null)}
              onSaveProfile={(profile) => { saveProfile(profile); setEditing(null); }}
            />
          </div>
        )}
      </AnimatePresence>
    </SettingsStack>
  );
}
