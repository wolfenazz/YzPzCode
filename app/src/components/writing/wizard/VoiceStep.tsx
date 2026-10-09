import React, { useEffect, useState } from 'react';
import { Plus, X } from '@phosphor-icons/react';
import { listWritingEngines, type WritingEngineInfo } from '../../../utils/writing/aiClient';
import { useEngineModels } from '../../../utils/writing/useEngineModels';
import { ModelInput } from '../ModelInput';
import { applyHumanizerPreset, DEFAULT_BANNED_PHRASES, HUMANIZER_PRESETS } from '../../../utils/writing/humanizer';
import type { EngineChoice, HumanizerSettings, Person, ReadingLevel, Spelling, Tone, VoiceSettings, WritingEngineId } from '../../../utils/writing/types';
import { Check, Chips, Dial, Segmented, Select } from '../controls';

export const HumanizerControls: React.FC<{ value: HumanizerSettings; onChange: (value: HumanizerSettings) => void; compact?: boolean }> = ({ value, onChange, compact }) => {
  const [phrase, setPhrase] = useState('');
  const set = <K extends keyof HumanizerSettings>(key: K, next: HumanizerSettings[K]): void => onChange({ ...value, [key]: next, presetId: key === 'enabled' || key === 'bannedPhrases' || key === 'customInstructions' ? value.presetId : 'custom' });
  const addPhrase = (): void => {
    const clean = phrase.trim().toLowerCase();
    if (!clean || value.bannedPhrases.includes(clean)) return;
    onChange({ ...value, bannedPhrases: [...value.bannedPhrases, clean] });
    setPhrase('');
  };
  const preset = HUMANIZER_PRESETS.find((entry) => entry.id === value.presetId);
  return (
    <div className="wr-stack">
      <Check label="Write in a natural, human voice (humanizer)" checked={value.enabled} onChange={(next) => set('enabled', next)} />
      {value.enabled && (
        <>
          <Chips
            items={[...HUMANIZER_PRESETS.map((entry) => ({ value: entry.id, label: entry.name })), ...(value.presetId === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]}
            value={value.presetId}
            onChange={(id) => { if (id !== 'custom') onChange(applyHumanizerPreset(value, id)); }}
            label="Humanizer preset"
          />
          {preset && <p className="wr-field__hint" style={{ margin: 0 }}>{preset.description}</p>}
          <div style={{ marginTop: 4 }}>
            <Dial label="Rewrite depth" value={value.intensity} onChange={(next) => set('intensity', next)} low="Light touch" high="Deep rewrite" />
            <Dial label="Sentence rhythm" value={value.burstiness} onChange={(next) => set('burstiness', next)} low="Even" high="Varied" />
            <Dial label="Register" value={value.formality} onChange={(next) => set('formality', next)} low="Conversational" high="Formal" />
            <Dial label="Hedging" value={value.hedging} onChange={(next) => set('hedging', next)} low="Direct" high="Cautious" />
          </div>
          <Check label="Allow contractions" checked={value.contractions} onChange={(next) => set('contractions', next)} />
          {!compact && (
            <>
              <div className="wr-field">
                <span className="wr-field__label">Never use these words or phrases <span className="wr-field__hint">({value.bannedPhrases.length})</span></span>
                <div className="wr-chips" style={{ maxHeight: 132, overflowY: 'auto' }}>
                  {value.bannedPhrases.map((entry) => (
                    <span key={entry} className="wr-chip">
                      {entry}
                      <button type="button" aria-label={`Allow ${entry}`} onClick={() => onChange({ ...value, bannedPhrases: value.bannedPhrases.filter((item) => item !== entry) })}><X size={11} /></button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="wr-input" value={phrase} onChange={(event) => setPhrase(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addPhrase(); } }} placeholder="Add a word or phrase…" />
                  <button type="button" className="wr-icon-btn" style={{ width: 36, height: 36 }} onClick={addPhrase} aria-label="Add phrase"><Plus size={14} /></button>
                </div>
                <button type="button" className="wr-ribbon__text-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...value, bannedPhrases: [...DEFAULT_BANNED_PHRASES] })}>Restore the default list</button>
              </div>
              <label className="wr-field">
                <span className="wr-field__label">Your own style instructions</span>
                <textarea className="wr-textarea" rows={3} value={value.customInstructions} onChange={(event) => set('customInstructions', event.target.value)} placeholder="e.g. Prefer active voice. Use Saudi Riyal (SAR) for amounts. Refer to the client as “the Authority”." />
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
};

export const EnginePicker: React.FC<{ value: EngineChoice; onChange: (value: EngineChoice) => void }> = ({ value, onChange }) => {
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listWritingEngines().then(setEngines).catch((reason: unknown) => setError(String(reason)));
  }, []);
  const visible = engines ?? [];
  const selected = engines?.find((engine) => engine.engine === value.engine);
  const { models, loading: loadingModels } = useEngineModels(value.engine, !!selected?.installed);
  return (
    <div className="wr-stack">
      <div className="wr-row">
        <span className="wr-row__label">AI engine</span>
        {engines ? (
          <Select
            options={visible.map((engine) => ({
              value: engine.engine,
              label: engine.displayName,
              tag: !engine.installed ? 'not installed' : engine.support === 'experimental' ? 'beta' : engine.streaming === 'token' ? 'live' : undefined,
            }))}
            value={value.engine}
            onChange={(engine) => onChange({ ...value, engine: engine as WritingEngineId, model: '' })}
            menuWidth={220}
            align="right"
            label="AI engine"
          />
        ) : (
          <span className="wr-field__hint">{error ? 'Could not detect engines' : 'Detecting…'}</span>
        )}
      </div>
      {selected && !selected.installed && (
        <p className="wr-ai__error" style={{ margin: 0 }}>{selected.displayName} is not installed. Install it from Settings → Agents, or pick another engine.</p>
      )}
      {selected?.installed && (
        <p className="wr-field__hint" style={{ margin: 0 }}>
          {selected.version ?? 'Installed'} · {selected.streaming === 'token' ? 'streams word by word' : 'delivers each section whole'}
        </p>
      )}
      <label className="wr-field">
        <span className="wr-field__label">Model <span className="wr-field__hint">— blank uses the CLI default</span></span>
        <ModelInput className="wr-input" value={value.model} onChange={(model) => onChange({ ...value, model })} models={models} loading={loadingModels} placeholder={value.engine === 'claude' ? 'e.g. opus, sonnet' : value.engine === 'codex' ? 'e.g. gpt-5-codex' : value.engine === 'opencode' ? 'First signed-in provider' : ''} />
      </label>
    </div>
  );
};

interface VoiceStepProps {
  voice: VoiceSettings;
  humanizer: HumanizerSettings;
  engine: EngineChoice;
  onVoice: (voice: VoiceSettings) => void;
  onHumanizer: (humanizer: HumanizerSettings) => void;
  onEngine: (engine: EngineChoice) => void;
}

export const VoiceStep: React.FC<VoiceStepProps> = ({ voice, humanizer, engine, onVoice, onHumanizer, onEngine }) => (
  <div className="wr-wizard__step">
    <span className="wr-eyebrow">Step four · Voice</span>
    <h2 className="wr-wizard__question">Whose <em>voice</em> is this?</h2>
    <p className="wr-wizard__lede">Set the register and how far the writing should move away from machine-sounding prose. The humanizer shapes every section as it is written, and you can run it again on any passage later.</p>

    <div className="wr-step-columns">
      <div className="wr-stack">
        <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
          <h3 className="wr-panel-card__title">Register</h3>
          <div className="wr-stack">
            <div className="wr-row">
              <span className="wr-row__label">Tone</span>
              <Chips
                items={[{ value: 'formal', label: 'Formal' }, { value: 'analytical', label: 'Analytical' }, { value: 'persuasive', label: 'Persuasive' }, { value: 'neutral', label: 'Neutral' }, { value: 'friendly', label: 'Warm' }]}
                value={voice.tone}
                onChange={(tone) => onVoice({ ...voice, tone: tone as Tone })}
                label="Tone"
              />
            </div>
            <div className="wr-row">
              <span className="wr-row__label">Reader</span>
              <Segmented items={[{ value: 'general', label: 'General' }, { value: 'professional', label: 'Professional' }, { value: 'expert', label: 'Expert' }]} value={voice.readingLevel} onChange={(readingLevel) => onVoice({ ...voice, readingLevel: readingLevel as ReadingLevel })} label="Reading level" />
            </div>
            <div className="wr-row">
              <span className="wr-row__label">Point of view</span>
              <Chips
                items={[{ value: 'auto', label: 'Conventional' }, { value: 'first-plural', label: 'We' }, { value: 'first-singular', label: 'I' }, { value: 'third', label: 'Third person' }]}
                value={voice.person}
                onChange={(person) => onVoice({ ...voice, person: person as Person })}
                label="Point of view"
              />
            </div>
            <div className="wr-row">
              <span className="wr-row__label">Spelling</span>
              <Segmented items={[{ value: 'us', label: 'American' }, { value: 'uk', label: 'British' }]} value={voice.spelling} onChange={(spelling) => onVoice({ ...voice, spelling: spelling as Spelling })} label="Spelling" />
            </div>
          </div>
        </div></div>

        <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
          <h3 className="wr-panel-card__title">Humanizer</h3>
          <HumanizerControls value={humanizer} onChange={onHumanizer} />
        </div></div>
      </div>

      <aside className="wr-stack">
        <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
          <h3 className="wr-panel-card__title">Writer</h3>
          <EnginePicker value={engine} onChange={onEngine} />
        </div></div>
      </aside>
    </div>
  </div>
);
