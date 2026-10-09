import { useCallback } from 'react';
import { useWritingStore } from '../../stores/writingStore';
import type { WritingEngineId } from '../../utils/writing/types';
import { EngineChoiceGrid } from './EngineChoiceGrid';

/** Setup step for a writing workspace: which AI writes, and how reports start. */
export function WritingSetupSection(): React.JSX.Element {
  const defaultEngine = useWritingStore((state) => state.defaultEngine);
  const setDefaultEngine = useWritingStore((state) => state.setDefaultEngine);
  const profiles = useWritingStore((state) => state.profiles);
  const defaultProfileId = useWritingStore((state) => state.defaultProfileId);
  const setDefaultProfile = useWritingStore((state) => state.setDefaultProfile);
  const openWizardOnStart = useWritingStore((state) => state.openWizardOnStart);
  const setPreference = useWritingStore((state) => state.setPreference);
  const pickEngine = useCallback((engine: WritingEngineId) => {
    const current = useWritingStore.getState().defaultEngine;
    if (current.engine !== engine) setDefaultEngine({ ...current, engine, model: '' });
  }, [setDefaultEngine]);

  return (
    <div className="space-y-5">
      <EngineChoiceGrid
        value={defaultEngine.engine}
        onChange={pickEngine}
        label="Who writes"
        streamingHint={(streaming) => (streaming === 'token' ? 'writes live, word by word' : 'writes a section at a time')}
        help="The writer runs your installed CLI in the background with no tools and no access to the project, so it can only write. It uses your existing subscription; no API keys."
      />

      <div>
        <label htmlFor="ws-writing-profile" className="ws-label">Default report profile</label>
        <select id="ws-writing-profile" className="ws-input" value={defaultProfileId ?? ''} onChange={(event) => setDefaultProfile(event.target.value || null)}>
          <option value="">None — choose each time</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
        <p className="ws-help">Prefills the style, voice and details of every new report. Manage profiles in Settings → Writing.</p>
      </div>

      <div className="ws-switch-row">
        <div>
          <div className="ws-switch-row__title" id="ws-writing-wizard-label">Start with a new report</div>
          <div className="ws-switch-row__desc">Open the report wizard straight away when the workspace has no reports yet.</div>
        </div>
        <button type="button" role="switch" className="ws-switch" aria-labelledby="ws-writing-wizard-label" aria-checked={openWizardOnStart}
          onClick={() => setPreference('openWizardOnStart', !openWizardOnStart)} />
      </div>
    </div>
  );
}
