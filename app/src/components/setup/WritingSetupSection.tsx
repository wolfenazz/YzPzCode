import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '@iconify/react';
import { ArrowClockwise, Check } from '@phosphor-icons/react';
import { useWritingStore } from '../../stores/writingStore';
import { listWritingEngines, type WritingEngineInfo } from '../../utils/writing/aiClient';
import type { CliType } from '../../types';
import type { WritingEngineId } from '../../utils/writing/types';
import { cliMeta } from './cliCatalog';
import { SETUP_EASE, useSetupMotion } from './useSetupMotion';

/** The engine CLI types these writing engines correspond to, for logos. */
const ENGINE_CLI: Record<WritingEngineId, CliType> = {
  claude: 'claude',
  codex: 'codex',
  grok: 'grok',
  antigravity: 'antigravity',
  opencode: 'opencode',
};

/** Setup step for a writing workspace: which AI writes, and how reports start. */
export function WritingSetupSection(): React.JSX.Element {
  const motionEnabled = useSetupMotion();
  const defaultEngine = useWritingStore((state) => state.defaultEngine);
  const setDefaultEngine = useWritingStore((state) => state.setDefaultEngine);
  const profiles = useWritingStore((state) => state.profiles);
  const defaultProfileId = useWritingStore((state) => state.defaultProfileId);
  const setDefaultProfile = useWritingStore((state) => state.setDefaultProfile);
  const openWizardOnStart = useWritingStore((state) => state.openWizardOnStart);
  const setPreference = useWritingStore((state) => state.setPreference);
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = (force: boolean): void => {
    setChecking(true);
    listWritingEngines(force)
      .then(setEngines)
      .catch((error: unknown) => console.error('Could not detect writing engines:', error))
      .finally(() => setChecking(false));
  };
  useEffect(() => refresh(false), []);

  // Prefer an installed engine when the saved default is missing.
  useEffect(() => {
    if (!engines) return;
    const current = engines.find((engine) => engine.engine === defaultEngine.engine);
    if (current?.installed) return;
    const fallback = engines.find((engine) => engine.installed && engine.support === 'supported');
    if (fallback) setDefaultEngine({ ...defaultEngine, engine: fallback.engine });
  }, [engines, defaultEngine, setDefaultEngine]);

  const visible = (engines ?? []);

  return (
    <div className="space-y-5">
      <div>
        <div className="ws-toolbar">
          <span className="ws-label" style={{ margin: 0 }}>Who writes</span>
          <button type="button" className="ws-btn ws-btn--icon" onClick={() => refresh(true)} disabled={checking} aria-label="Check installed AI CLIs again" title="Check again">
            <ArrowClockwise size={15} className={checking ? 'animate-spin' : undefined} />
          </button>
        </div>
        <div className="ws-list">
          <div className="ws-list__scroll">
            {!engines && <div className="ws-row"><span className="ws-row__body"><span className="ws-row__status"><span className="ws-spinner" /> Looking for AI CLIs…</span></span></div>}
            {visible.map((engine, index) => {
              const meta = cliMeta(ENGINE_CLI[engine.engine]);
              const active = defaultEngine.engine === engine.engine;
              return (
                <motion.button
                  key={engine.engine}
                  type="button"
                  className="ws-row w-full text-left"
                  data-active={active}
                  data-installed={engine.installed}
                  disabled={!engine.installed}
                  onClick={() => setDefaultEngine({ ...defaultEngine, engine: engine.engine, model: '' })}
                  initial={motionEnabled ? { opacity: 0, y: 6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: SETUP_EASE, delay: motionEnabled ? index * 0.03 : 0 }}
                >
                  {active && <span className="ws-row__accent" style={{ background: meta?.color ?? 'var(--accent)' }} aria-hidden="true" />}
                  <span className="ws-row__logo" aria-hidden="true">
                    {meta?.logo ? <img src={meta.logo} alt="" draggable={false} /> : <Icon icon={meta?.icon ?? 'ph:sparkle'} width={18} height={18} />}
                  </span>
                  <span className="ws-row__body">
                    <span className="ws-row__name block">{engine.displayName}{engine.support === 'experimental' ? ' · beta' : ''}</span>
                    <span className="ws-row__status">
                      <span className="ws-status-dot" data-tone={engine.installed ? 'ok' : 'missing'} />
                      {engine.installed
                        ? `${engine.version ?? 'Installed'} · ${engine.streaming === 'token' ? 'writes live, word by word' : 'writes a section at a time'}`
                        : 'Not installed — add it from Settings → Agents'}
                    </span>
                  </span>
                  {active && <Check size={15} weight="bold" />}
                </motion.button>
              );
            })}
          </div>
        </div>
        <p className="ws-help">The writer runs your installed CLI in the background with no tools and no access to the project, so it can only write. It uses your existing subscription; no API keys.</p>
      </div>

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
