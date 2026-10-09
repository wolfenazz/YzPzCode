import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '@iconify/react';
import { ArrowClockwise, Check } from '@phosphor-icons/react';
import { listWritingEngines, type WritingEngineInfo } from '../../utils/writing/aiClient';
import type { CliType } from '../../types';
import type { WritingEngineId } from '../../utils/writing/types';
import { cliMeta } from './cliCatalog';
import { SETUP_EASE, useSetupMotion } from './useSetupMotion';

/** The engine CLI types the headless AI engines correspond to, for logos. */
export const ENGINE_CLI: Record<WritingEngineId, CliType> = {
  claude: 'claude',
  codex: 'codex',
  grok: 'grok',
  antigravity: 'antigravity',
  opencode: 'opencode',
};

interface EngineChoiceGridProps {
  value: WritingEngineId;
  onChange: (engine: WritingEngineId) => void;
  label: string;
  /** How an installed engine streams, in this studio's words. */
  streamingHint: (streaming: WritingEngineInfo['streaming']) => string;
  help: string;
}

/** Installed AI CLIs the headless runner can drive, as a pickable list. */
export function EngineChoiceGrid({ value, onChange, label, streamingHint, help }: EngineChoiceGridProps): React.JSX.Element {
  const motionEnabled = useSetupMotion();
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = (force: boolean): void => {
    setChecking(true);
    listWritingEngines(force)
      .then(setEngines)
      .catch((error: unknown) => console.error('Could not detect AI engines:', error))
      .finally(() => setChecking(false));
  };
  useEffect(() => refresh(false), []);

  // Prefer an installed engine when the saved choice is missing.
  useEffect(() => {
    if (!engines) return;
    if (engines.find((engine) => engine.engine === value)?.installed) return;
    const fallback = engines.find((engine) => engine.installed && engine.support === 'supported');
    if (fallback) onChange(fallback.engine);
  }, [engines, onChange, value]);

  return (
    <div>
      <div className="ws-toolbar">
        <span className="ws-label" style={{ margin: 0 }}>{label}</span>
        <button type="button" className="ws-btn ws-btn--icon" onClick={() => refresh(true)} disabled={checking} aria-label="Check installed AI CLIs again" title="Check again">
          <ArrowClockwise size={15} className={checking ? 'animate-spin' : undefined} />
        </button>
      </div>
      <div className="ws-list">
        <div className="ws-list__scroll">
          {!engines && <div className="ws-row"><span className="ws-row__body"><span className="ws-row__status"><span className="ws-spinner" /> Looking for AI CLIs…</span></span></div>}
          {(engines ?? []).map((engine, index) => {
            const meta = cliMeta(ENGINE_CLI[engine.engine]);
            const active = value === engine.engine;
            return (
              <motion.button
                key={engine.engine}
                type="button"
                className="ws-row w-full text-left"
                data-active={active}
                data-installed={engine.installed}
                disabled={!engine.installed}
                onClick={() => onChange(engine.engine)}
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
                      ? `${engine.version ?? 'Installed'} · ${streamingHint(engine.streaming)}`
                      : 'Not installed — add it from Settings → Agents'}
                  </span>
                </span>
                {active && <Check size={15} weight="bold" />}
              </motion.button>
            );
          })}
        </div>
      </div>
      <p className="ws-help">{help}</p>
    </div>
  );
}
