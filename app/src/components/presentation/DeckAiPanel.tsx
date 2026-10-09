import React, { useState } from 'react';
import { ArrowRight, CheckCircle, CircleNotch, Clock, Lightning, Stop, Warning, XCircle } from '@phosphor-icons/react';
import type { DeckRun } from '../../stores/presentationSessionStore';
import { slideTitle } from '../../utils/presentation/deck';
import { DECK_PASSES, SLIDE_ACTIONS, type DeckPass, type SlideAction } from '../../utils/presentation/prompts';
import { deckSeconds, formatDuration } from '../../utils/presentation/timing';
import type { YzDeck } from '../../utils/presentation/types';
import type { EngineChoice } from '../../utils/writing/types';
import { EnginePicker } from './EnginePicker';

interface DeckAiPanelProps {
  deck: YzDeck;
  run: DeckRun | null;
  selectedIds: string[];
  warnings: Record<string, string[]>;
  /** Actions offered (fewer for an original-design deck). */
  actions?: SlideAction[];
  onAction: (action: SlideAction, scope: 'selected' | 'all', instruction?: string) => void;
  /** Whole-deck passes (designed decks only). */
  onPass?: (pass: DeckPass, minutes?: number) => void;
  onFix: (slideId: string) => void;
  onRetryUnfinished?: () => void;
  onCancel: () => void;
  onEngine: (engine: EngineChoice) => void;
  onJump: (slideId: string) => void;
}

const seconds = (from: number, to: number | null): string => {
  const value = Math.max(0, Math.round(((to ?? Date.now()) - from) / 1000));
  return value >= 60 ? `${Math.floor(value / 60)}m ${value % 60}s` : `${value}s`;
};

export const DeckAiPanel: React.FC<DeckAiPanelProps> = ({ deck, run, selectedIds, warnings, actions, onAction, onPass, onFix, onRetryUnfinished, onCancel, onEngine, onJump }) => {
  const [instruction, setInstruction] = useState('');
  const [language, setLanguage] = useState('');
  const [translating, setTranslating] = useState(false);
  const [wholeDeck, setWholeDeck] = useState(false);
  const estimate = deck.source ? 0 : deckSeconds(deck.slides);
  const [minutes, setMinutes] = useState(() => Math.max(1, Math.round(estimate / 60) || 10));
  const busy = run?.phase === 'slides' || run?.phase === 'action' || run?.phase === 'outline';
  const scope = wholeDeck ? 'all' : 'selected';
  const preserve = Boolean(deck.source);
  const slideCount = preserve ? deck.source!.slides.length : deck.slides.length;
  const positions = preserve
    ? selectedIds.map((id) => deck.source!.slides.findIndex((slide) => slide.key === id) + 1).filter((value) => value > 0)
    : selectedIds.map((id) => deck.slides.findIndex((slide) => slide.id === id) + 1).filter((value) => value > 0);
  const target = wholeDeck ? `all ${slideCount} slides` : positions.length === 0 ? 'no slide selected' : positions.length === 1 ? `slide ${positions[0]}` : `${positions.length} slides`;
  const canRun = !busy && (wholeDeck || positions.length > 0);
  const offered = SLIDE_ACTIONS.filter((action) => !actions || actions.includes(action.id));
  const statuses = Object.values(run?.slideStatus ?? {});
  const done = statuses.filter((status) => status === 'done').length;
  const unfinished = statuses.filter((status) => status === 'failed' || status === 'cancelled').length;
  const warned = preserve ? [] : deck.slides.filter((slide) => (warnings[slide.id]?.length ?? 0) > 0);

  const send = (): void => {
    if (!instruction.trim() || !canRun) return;
    onAction('custom', scope, instruction.trim());
    setInstruction('');
  };

  return (
    <div className="pr-ai">
      <div className="pr-ai__section">
        <div className="pr-ai__target">
          <span>Applies to <strong>{target}</strong></span>
          <label className="pr-check"><input type="checkbox" checked={wholeDeck} onChange={(event) => setWholeDeck(event.target.checked)} /> Whole deck</label>
        </div>
        <div className="pr-ai__prompt">
          <textarea
            className="pr-input"
            rows={3}
            value={instruction}
            placeholder={preserve ? 'e.g. Tighten the wording and make the titles takeaways' : 'e.g. Make this a comparison of in-house vs agency, with costs'}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); }
            }}
          />
          <button type="button" className="pr-btn pr-btn--primary pr-btn--sm" disabled={!instruction.trim() || !canRun} onClick={send} title="Send (Ctrl Enter)">Send <ArrowRight size={12} /></button>
        </div>
        <div className="pr-ai__actions">
          {offered.map((action) => (
            <button
              key={action.id}
              type="button"
              className="pr-action"
              disabled={!canRun}
              title={action.hint}
              onClick={() => {
                if (action.id === 'translate') setTranslating((value) => !value);
                else onAction(action.id, scope);
              }}
            >
              <strong>{action.label}</strong>
              <span>{action.hint}</span>
            </button>
          ))}
        </div>
        {translating && (
          <div className="pr-ai__prompt">
            <input className="pr-input" autoFocus value={language} placeholder="Language, e.g. Arabic" onChange={(event) => setLanguage(event.target.value)}
              onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' && language.trim()) { onAction('translate', scope, language.trim()); setTranslating(false); } }} />
            <button type="button" className="pr-btn pr-btn--sm" disabled={!language.trim() || !canRun} onClick={() => { onAction('translate', scope, language.trim()); setTranslating(false); }}>Translate</button>
          </div>
        )}
      </div>

      {onPass && !preserve && (
        <div className="pr-ai__section">
          <div className="pr-ai__trace-head">
            <span className="pr-label">Deck passes</span>
            <span className="pr-hint" title="From the speaker notes at 140 words a minute"><Clock size={11} /> about {formatDuration(estimate)} to present</span>
          </div>
          <div className="pr-ai__actions">
            {DECK_PASSES.map((pass) => (
              <button key={pass.id} type="button" className="pr-action" disabled={busy || deck.slides.length === 0} title={pass.hint}
                onClick={() => onPass(pass.id, pass.id === 'coach' ? minutes : undefined)}>
                <strong>{pass.label}</strong>
                <span>{pass.hint}</span>
              </button>
            ))}
          </div>
          <label className="pr-ai__minutes">
            <span>Talk length for the notes coach</span>
            <input className="pr-input" type="number" min={1} max={180} value={minutes} onChange={(event) => setMinutes(Math.max(1, Math.min(180, Number(event.target.value) || 1)))} onKeyDown={(event) => event.stopPropagation()} />
            <span>min</span>
          </label>
        </div>
      )}

      {warned.length > 0 && (
        <div className="pr-ai__section">
          <div className="pr-label"><Warning size={12} weight="fill" /> Text that does not fit</div>
          {warned.map((slide) => (
            <div key={slide.id} className="pr-ai__warning">
              <button type="button" className="pr-link" onClick={() => onJump(slide.id)}>
                {deck.slides.indexOf(slide) + 1}. {slideTitle(slide) || 'Untitled'}
              </button>
              <button type="button" className="pr-btn pr-btn--sm" disabled={busy} onClick={() => onFix(slide.id)}><Lightning size={12} weight="fill" /> Fix with AI</button>
            </div>
          ))}
        </div>
      )}

      {run && (run.calls.length > 0 || busy) && (
        <div className="pr-ai__section pr-ai__trace">
          <div className="pr-ai__trace-head">
            <span className="pr-label">
              {run.phase === 'slides' ? `Writing slides · ${done} of ${statuses.length}` : run.phase === 'outline' ? 'Designing the storyline' : run.phase === 'action' ? 'Working' : run.phase === 'failed' ? 'Stopped with an error' : run.phase === 'cancelled' ? 'Stopped' : 'Done'}
            </span>
            {busy && <button type="button" className="pr-btn pr-btn--danger pr-btn--sm" onClick={onCancel}><Stop size={12} weight="fill" /> Stop</button>}
          </div>
          {run.phase === 'slides' && statuses.length > 0 && (
            <div className="pr-progress"><span style={{ width: `${(done / statuses.length) * 100}%` }} /></div>
          )}
          {run.error && <div className="pr-error">{run.error}</div>}
          {!busy && unfinished > 0 && onRetryUnfinished && (
            <button type="button" className="pr-btn pr-btn--sm" onClick={onRetryUnfinished}>Write the {unfinished} unfinished slide{unfinished === 1 ? '' : 's'}</button>
          )}
          <ol className="pr-calls">
            {[...run.calls].reverse().slice(0, 12).map((call) => (
              <li key={call.id} data-status={call.status}>
                {call.status === 'running' ? <CircleNotch size={13} className="pr-spin" /> : call.status === 'done' ? <CheckCircle size={13} weight="fill" /> : <XCircle size={13} weight="fill" />}
                <span className="pr-calls__label">{call.label}</span>
                <span className="pr-calls__time">{seconds(call.startedAt, call.endedAt)}</span>
                {call.error && <span className="pr-calls__error">{call.error}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="pr-ai__section">
        <div className="pr-label">Engine</div>
        <EnginePicker value={deck.brief.engine} onChange={onEngine} compact />
      </div>
    </div>
  );
};
