import { useEffect, useState } from 'react';
import { ArrowCounterClockwise, DownloadSimple, PencilSimple, Table } from '@phosphor-icons/react';
import { SHEETS_LANGUAGES, useSheetsStore, type SheetsLanguage } from '../../../stores/sheetsStore';
import { listWritingEngines, type WritingEngineInfo } from '../../../utils/writing/aiClient';
import { useEngineModels } from '../../../utils/writing/useEngineModels';
import type { WritingEngineId } from '../../../utils/writing/types';
import { EffortSelect, hasEfforts } from '../../writing/EffortSelect';
import { ModelInput } from '../../writing/ModelInput';
import {
  Badge, Button, Notice, SettingsGroup, SettingsRow, SettingsStack, SettingsTabs, SliderRow, StatusDot, ToggleRow,
} from '../SettingsKit';

type Tab = 'workbooks' | 'engines' | 'storage';

const TABS = [
  { id: 'workbooks' as const, label: 'Workbooks', icon: Table },
  { id: 'engines' as const, label: 'Engines', icon: PencilSimple },
  { id: 'storage' as const, label: 'Saving', icon: DownloadSimple },
];

function WorkbooksTab(): React.JSX.Element {
  const language = useSheetsStore((state) => state.language);
  const rtl = useSheetsStore((state) => state.newSheetsRtl);
  const formulaBar = useSheetsStore((state) => state.showFormulaBar);
  const setPreference = useSheetsStore((state) => state.setPreference);
  return (
    <SettingsGroup title="New workbooks" description="Workbooks are real .xlsx files. They open in Excel, and any .xlsx file can be opened and edited here in place.">
      <SettingsRow label="Assistant language" description="The language the assistant answers in. “Same as the request” follows what you write.">
        <select className="st-select st-control-w" value={language} onChange={(event) => setPreference('language', event.target.value as SheetsLanguage)}>
          {SHEETS_LANGUAGES.map((value) => <option key={value} value={value}>{value === 'auto' ? 'Same as the request' : value}</option>)}
        </select>
      </SettingsRow>
      <ToggleRow label="Start new sheets right to left" description="Column A sits at the right edge, like Excel's right-to-left sheets (Arabic, Hebrew, Persian)." checked={rtl} onChange={(value) => setPreference('newSheetsRtl', value)} />
      <ToggleRow label="Show the formula bar" checked={formulaBar} onChange={(value) => setPreference('showFormulaBar', value)} />
    </SettingsGroup>
  );
}

function EnginesTab(): React.JSX.Element {
  const engine = useSheetsStore((state) => state.defaultEngine);
  const setEngine = useSheetsStore((state) => state.setDefaultEngine);
  const timeout = useSheetsStore((state) => state.aiTimeoutSecs);
  const rounds = useSheetsStore((state) => state.maxReadRounds);
  const setPreference = useSheetsStore((state) => state.setPreference);
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
        title="Sheets engines"
        description="The installed AI CLIs that build and edit workbooks. They run in the background with no tools and no access to the project, using your existing sign-in, and return edits you review before keeping."
        action={<Button size="sm" icon={ArrowCounterClockwise} loading={checking} onClick={() => refresh(true)}>Check again</Button>}
      >
        {(engines ?? []).map((entry) => (
          <SettingsRow
            key={entry.engine}
            iconBare
            icon={<StatusDot tone={entry.installed ? 'success' : 'neutral'} />}
            label={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{entry.displayName}{entry.support === 'experimental' && <Badge tone="warning">Beta</Badge>}{(entry.engine === 'claude' || entry.engine === 'codex') && <Badge tone="accent">Reads pictures</Badge>}</span>}
            description={entry.installed ? (entry.version ?? 'Installed') : 'Not installed'}
          >
            <Button size="sm" variant={engine.engine === entry.engine ? 'primary' : 'default'} disabled={!entry.installed} onClick={() => setEngine({ ...engine, engine: entry.engine as WritingEngineId, model: '', effort: '' })}>
              {engine.engine === entry.engine ? 'Default' : 'Use by default'}
            </Button>
          </SettingsRow>
        ))}
      </SettingsGroup>
      <SettingsGroup title="Requests">
        <SettingsRow label="Default model" description="Leave blank to use the CLI's own default.">
          <ModelInput className="st-select st-control-w" value={engine.model} models={models} loading={loading} placeholder="CLI default" onChange={(model) => setEngine({ ...engine, model })} />
        </SettingsRow>
        {hasEfforts(models, engine.model) && (
          <SettingsRow label="Thinking effort" description="How long the model reasons before answering. Higher is slower and uses more of your limits.">
            <EffortSelect className="st-select st-control-w" value={engine.effort ?? ''} onChange={(effort) => setEngine({ ...engine, effort })} models={models} model={engine.model} />
          </SettingsRow>
        )}
        <SliderRow label="Rounds of reading cells" description="The assistant may ask to read more of a large workbook before it answers. Each round is one more request." value={rounds} min={0} max={6} format={(value) => (value === 0 ? 'Off' : `${value}`)} onChange={(value) => setPreference('maxReadRounds', value)} />
        <SliderRow label="Time limit per request" description="A request that takes longer is stopped." value={timeout} min={60} max={1800} step={30} format={(value) => `${Math.round(value / 60)} min`} onChange={(value) => setPreference('aiTimeoutSecs', value)} />
      </SettingsGroup>
      <Notice tone="info">Only Claude Code and Codex can look at pictures. Pick one of them to turn a photo of a printed table into a workbook.</Notice>
    </>
  );
}

function StorageTab(): React.JSX.Element {
  const autosave = useSheetsStore((state) => state.autosaveDelayMs);
  const snapshots = useSheetsStore((state) => state.snapshotLimit);
  const setPreference = useSheetsStore((state) => state.setPreference);
  return (
    <SettingsGroup title="Saving" description="Workbooks are saved as .xlsx files in the Sheets folder of your Documents/YzPzCode folder. The chat, version history and previews sit in a hidden .yzsheet folder beside each one.">
      <SliderRow label="Autosave after an edit" value={autosave} min={500} max={10000} step={250} format={(value) => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} s`} onChange={(value) => setPreference('autosaveDelayMs', value)} />
      <SliderRow label="Version history" description="Copies kept in the workbook's .yzsheet/history folder, at most one every five minutes." value={snapshots} min={0} max={100} step={5} format={(value) => (value === 0 ? 'Off' : `${value} versions`)} onChange={(value) => setPreference('snapshotLimit', value)} />
    </SettingsGroup>
  );
}

export function SettingsSheets(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('workbooks');
  return (
    <SettingsStack>
      <SettingsTabs tabs={TABS} value={tab} onChange={setTab} label="Sheets settings" />
      {tab === 'workbooks' && <WorkbooksTab />}
      {tab === 'engines' && <EnginesTab />}
      {tab === 'storage' && <StorageTab />}
    </SettingsStack>
  );
}
