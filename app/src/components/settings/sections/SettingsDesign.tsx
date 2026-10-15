import { useEffect, useState } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { DESIGN_LANGUAGES, useDesignStore, type DesignLanguage } from '../../../stores/designStore';
import { listWritingEngines, type WritingEngineInfo } from '../../../utils/writing/aiClient';
import { useEngineModels } from '../../../utils/writing/useEngineModels';
import type { WritingEngineId } from '../../../utils/writing/types';
import { EffortSelect, hasEfforts } from '../../writing/EffortSelect';
import { ModelInput } from '../../writing/ModelInput';
import {
  Badge, Button, SettingsGroup, SettingsRow, SettingsStack, SliderRow, StatusDot,
} from '../SettingsKit';

/** Settings → Design: the engine that designs, the language and saving. */
export function SettingsDesign(): React.JSX.Element {
  const engine = useDesignStore((state) => state.defaultEngine);
  const setEngine = useDesignStore((state) => state.setDefaultEngine);
  const language = useDesignStore((state) => state.language);
  const timeout = useDesignStore((state) => state.aiTimeoutSecs);
  const snapshots = useDesignStore((state) => state.snapshotLimit);
  const setPreference = useDesignStore((state) => state.setPreference);
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  const [checking, setChecking] = useState(false);
  const { models, loading } = useEngineModels(engine.engine, Boolean(engines?.find((entry) => entry.engine === engine.engine)?.installed));
  const refresh = (force: boolean): void => {
    setChecking(true);
    listWritingEngines(force).then(setEngines).catch(() => setEngines([])).finally(() => setChecking(false));
  };
  useEffect(() => refresh(false), []);

  return (
    <SettingsStack>
      <SettingsGroup
        title="Design engines"
        description="The installed AI CLIs that design screens and graphics. They run in the background with no tools and no access to the project, using your existing sign-in."
        action={<Button size="sm" icon={ArrowCounterClockwise} loading={checking} onClick={() => refresh(true)}>Check again</Button>}
      >
        {(engines ?? []).map((entry) => (
          <SettingsRow
            key={entry.engine}
            label={entry.displayName}
            description={entry.installed ? (entry.version ?? 'Installed') : 'Not installed'}
          >
            <span className="flex items-center gap-2">
              <StatusDot tone={entry.installed ? 'success' : 'neutral'} />
              {engine.engine === entry.engine
                ? <Badge>Selected</Badge>
                : (
                  <Button size="sm" disabled={!entry.installed} onClick={() => setEngine({ ...engine, engine: entry.engine as WritingEngineId, model: '', effort: '' })}>Use</Button>
                )}
            </span>
          </SettingsRow>
        ))}
        <SettingsRow label="Model" description="Optional. Leave empty for the CLI's default.">
          <ModelInput className="st-select st-control-w" value={engine.model} onChange={(model) => setEngine({ ...engine, model })} models={models} loading={loading} placeholder="CLI default" />
        </SettingsRow>
        {hasEfforts(models, engine.model) && (
          <SettingsRow label="Thinking effort">
            <EffortSelect className="st-select st-control-w" value={engine.effort ?? ''} onChange={(effort) => setEngine({ ...engine, effort })} models={models} model={engine.model} />
          </SettingsRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="New designs" description="Designs are kept in Documents/YzPzCode/Designs, one folder each, with their pictures and exports.">
        <SettingsRow label="Language" description="The language the design's text is written in. “Same as the description” follows what you write.">
          <select className="st-select st-control-w" value={language} onChange={(event) => setPreference('language', event.target.value as DesignLanguage)}>
            {DESIGN_LANGUAGES.map((value) => <option key={value} value={value}>{value === 'auto' ? 'Same as the description' : value}</option>)}
          </select>
        </SettingsRow>
        <SliderRow label="AI timeout" description="Seconds before one AI call is abandoned." value={timeout} min={60} max={1800} step={30} onChange={(value) => setPreference('aiTimeoutSecs', value)} format={(value) => `${value}s`} />
        <SliderRow label="History snapshots" description="Rolling copies kept in each design's .history folder (0 turns it off)." value={snapshots} min={0} max={50} step={1} onChange={(value) => setPreference('snapshotLimit', value)} />
      </SettingsGroup>
    </SettingsStack>
  );
}
