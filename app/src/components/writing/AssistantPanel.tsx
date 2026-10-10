import React, { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowUp, Stop } from '@phosphor-icons/react';
import type { WritingSession } from '../../stores/writingSessionStore';
import { applyHumanizerPreset, HUMANIZER_PRESETS, lintText, scoreLabel, type LintKind } from '../../utils/writing/humanizer';
import { REWRITE_ACTIONS, type RewriteAction } from '../../utils/writing/prompts';
import type { HumanizerSettings, Person, ReadingLevel, ReportBrief, Spelling, Tone } from '../../utils/writing/types';
import { findSectionRange } from './editor/extensions';
import { EngineFields, formatElapsed, WebPhotosToggle } from './ui';

const KIND_LABEL: Record<LintKind, string> = {
  phrase: 'Stock phrases',
  transition: 'Formulaic openers',
  rhythm: 'Flat rhythm',
  dash: 'Em-dash overuse',
};

interface Target {
  kind: 'selection' | 'section' | 'none';
  label: string;
}

interface AssistantPanelProps {
  editor: Editor | null;
  session: WritingSession;
  lintEnabled: boolean;
  onToggleLint: () => void;
  onWriteRemaining: () => void;
  onRewriteAll: () => void;
  onHumanizeAll: () => void;
  onCancel: () => void;
  onInstruction: (action: RewriteAction, instruction: string) => void;
  onBriefChange: (patch: Partial<ReportBrief>) => void;
}

function useTarget(editor: Editor | null, session: WritingSession): Target {
  const [target, setTarget] = useState<Target>({ kind: 'none', label: 'Put the cursor in a section or select text' });
  useEffect(() => {
    if (!editor) return;
    const update = (): void => {
      const { selection, doc } = editor.state;
      if (!selection.empty) {
        const words = doc.textBetween(selection.from, selection.to, ' ', ' ').split(/\s+/).filter(Boolean).length;
        setTarget({ kind: 'selection', label: `Selected text · ${words} word${words === 1 ? '' : 's'}` });
        return;
      }
      let sectionId: string | null = null;
      doc.forEach((node, offset) => {
        if (offset <= selection.from && node.type.name === 'heading' && node.attrs.sectionId) sectionId = node.attrs.sectionId as string;
      });
      const section = sectionId ? session.outline.find((entry) => entry.id === sectionId) : null;
      setTarget(section ? { kind: 'section', label: section.title } : { kind: 'none', label: 'Put the cursor in a section or select text' });
    };
    update();
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('update', update);
    };
  }, [editor, session.outline]);
  return target;
}

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  editor,
  session,
  lintEnabled,
  onToggleLint,
  onWriteRemaining,
  onRewriteAll,
  onHumanizeAll,
  onCancel,
  onInstruction,
  onBriefChange,
}) => {
  const { run, outline, brief } = session;
  const busy = run?.phase === 'writing' || run?.phase === 'outline';
  const target = useTarget(editor, session);
  const [instruction, setInstruction] = useState('');
  const [confirm, setConfirm] = useState<'rewrite' | 'humanize' | null>(null);
  const [now, setNow] = useState(Date.now());
  const [emptyCount, setEmptyCount] = useState(0);
  const [lint, setLint] = useState(() => lintText(''));

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [busy]);

  // Sections still empty, and the naturalness of the whole text, once the text settles.
  useEffect(() => {
    if (!editor) return;
    let timer = 0;
    const compute = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const { doc } = editor.state;
        let empty = 0;
        for (const section of outline) {
          const range = findSectionRange(doc, section.id);
          if (!range || doc.textBetween(range.bodyFrom, range.to, ' ', ' ').trim().split(/\s+/).filter(Boolean).length < 20) empty += 1;
        }
        setEmptyCount(empty);
        setLint(lintText(doc.textBetween(0, doc.content.size, '\n', ' '), brief?.humanizer.bannedPhrases));
      }, 500);
    };
    compute();
    editor.on('update', compute);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', compute);
    };
  }, [editor, outline, brief?.humanizer.bannedPhrases]);

  const counts = useMemo(() => {
    const result: Record<LintKind, number> = { phrase: 0, transition: 0, rhythm: 0, dash: 0 };
    for (const issue of lint.issues) result[issue.kind] += 1;
    return result;
  }, [lint]);

  const targets = run ? Object.keys(run.sectionStatus) : [];
  const finished = run ? Object.values(run.sectionStatus).filter((status) => status === 'done').length : 0;
  const current = outline.find((section) => section.id === run?.currentSectionId);
  const elapsed = run ? ((run.endedAt ?? now) - run.startedAt) / 1000 : 0;

  const send = (): void => {
    const text = instruction.trim();
    if (!text || busy || target.kind === 'none') return;
    onInstruction('custom', text);
    setInstruction('');
  };

  const setHumanizer = (patch: Partial<HumanizerSettings>, custom = true): void => {
    if (!brief) return;
    onBriefChange({ humanizer: { ...brief.humanizer, ...patch, presetId: custom ? 'custom' : brief.humanizer.presetId } });
  };

  return (
    <div className="wr-panel-body">
      {(busy || (run && run.phase !== 'idle' && run.phase !== 'done') || emptyCount > 0) && (
        <section className="wr-section">
          {busy ? (
            <>
              <div className="wr-section__row">
                <h3 className="wr-section__title">{run?.phase === 'outline' ? 'Planning' : 'Writing'}</h3>
                <span className="wr-note">{formatElapsed(elapsed)}</span>
              </div>
              {run?.phase === 'writing' && targets.length > 0 && (
                <>
                  <div className="wr-progress" aria-hidden="true"><span style={{ width: `${Math.round((finished / targets.length) * 100)}%` }} /></div>
                  <p className="wr-note">{current ? current.title : 'Reading your material'} · {finished} of {targets.length}</p>
                </>
              )}
              <button type="button" className="wr-btn wr-btn--block" onClick={onCancel}><Stop size={11} weight="fill" /> Stop</button>
            </>
          ) : (
            <>
              {run?.phase === 'failed' && run.error && <p className="wr-note is-error">{run.error}</p>}
              {run?.phase === 'cancelled' && <p className="wr-note">Stopped.</p>}
              {emptyCount > 0 && (
                <>
                  <p className="wr-note">{emptyCount} section{emptyCount === 1 ? ' is' : 's are'} not written yet.</p>
                  <button type="button" className="wr-btn wr-btn--primary wr-btn--block" onClick={onWriteRemaining}>Write {emptyCount === 1 ? 'it' : 'them'}</button>
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="wr-section">
        <h3 className="wr-section__title">Edit with AI</h3>
        <p className={`wr-target${target.kind === 'none' ? ' is-empty' : ''}`}>{target.kind === 'section' ? `Section · ${target.label}` : target.label}</p>
        <div className="wr-actions">
          {REWRITE_ACTIONS.map((action) => (
            <button key={action.id} type="button" className="wr-action" title={action.hint} disabled={busy || target.kind === 'none'} onClick={() => onInstruction(action.id, '')}>
              {action.label}
            </button>
          ))}
        </div>
        <div className="wr-ask">
          <textarea
            className="wr-ask__input"
            rows={2}
            value={instruction}
            disabled={busy}
            placeholder="Describe a change, e.g. “Add a comparison table”"
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <button type="button" className="wr-ask__send" aria-label="Send" disabled={busy || !instruction.trim() || target.kind === 'none'} onClick={send}><ArrowUp size={13} weight="bold" /></button>
        </div>
      </section>

      <section className="wr-section">
        <h3 className="wr-section__title">Whole document</h3>
        {confirm ? (
          <div className="wr-confirm">
            <p className="wr-note">{confirm === 'rewrite' ? `Write all ${outline.length} sections again? Your edits in them are replaced.` : 'Humanize every section? Each one is rewritten in a more natural voice.'} Ctrl+Z undoes it section by section.</p>
            <div className="wr-confirm__row">
              <button type="button" className="wr-btn wr-btn--sm" onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" className="wr-btn wr-btn--sm wr-btn--primary" onClick={() => { const choice = confirm; setConfirm(null); if (choice === 'rewrite') onRewriteAll(); else onHumanizeAll(); }}>
                {confirm === 'rewrite' ? 'Write again' : 'Humanize'}
              </button>
            </div>
          </div>
        ) : (
          <div className="wr-actions">
            <button type="button" className="wr-action" disabled={busy || outline.length === 0} onClick={() => setConfirm('humanize')}>Humanize all</button>
            <button type="button" className="wr-action" disabled={busy || outline.length === 0} onClick={() => setConfirm('rewrite')}>Write all again</button>
          </div>
        )}
      </section>

      <section className="wr-section">
        <div className="wr-section__row">
          <h3 className="wr-section__title">Naturalness</h3>
          <span className="wr-score"><strong>{lint.words > 0 ? lint.score : '–'}</strong> {lint.words > 0 ? scoreLabel(lint.score) : 'No text yet'}</span>
        </div>
        <dl className="wr-stats">
          {(Object.keys(KIND_LABEL) as LintKind[]).map((kind) => (
            <div key={kind}><dt>{KIND_LABEL[kind]}</dt><dd>{counts[kind]}</dd></div>
          ))}
        </dl>
        <label className="wr-switch-row">
          <span>Highlight in the text</span>
          <input type="checkbox" className="wr-switch" checked={lintEnabled} onChange={onToggleLint} />
        </label>
      </section>

      {brief && (
        <details className="wr-section wr-disclosure">
          <summary className="wr-section__title">Voice</summary>
          <div className="wr-disclosure__body">
            <label className="wr-row-field">
              <span>Tone</span>
              <select className="wr-control" value={brief.voice.tone} onChange={(event) => onBriefChange({ voice: { ...brief.voice, tone: event.target.value as Tone } })}>
                <option value="formal">Formal</option>
                <option value="analytical">Analytical</option>
                <option value="persuasive">Persuasive</option>
                <option value="neutral">Neutral</option>
                <option value="friendly">Warm</option>
              </select>
            </label>
            <label className="wr-row-field">
              <span>Reader</span>
              <select className="wr-control" value={brief.voice.readingLevel} onChange={(event) => onBriefChange({ voice: { ...brief.voice, readingLevel: event.target.value as ReadingLevel } })}>
                <option value="general">General</option>
                <option value="professional">Professional</option>
                <option value="expert">Expert</option>
              </select>
            </label>
            <label className="wr-row-field">
              <span>Voice</span>
              <select className="wr-control" value={brief.voice.person} onChange={(event) => onBriefChange({ voice: { ...brief.voice, person: event.target.value as Person } })}>
                <option value="auto">Conventional</option>
                <option value="first-plural">We</option>
                <option value="first-singular">I</option>
                <option value="third">Third person</option>
              </select>
            </label>
            <label className="wr-row-field">
              <span>Spelling</span>
              <select className="wr-control" value={brief.voice.spelling} onChange={(event) => onBriefChange({ voice: { ...brief.voice, spelling: event.target.value as Spelling } })}>
                <option value="us">American</option>
                <option value="uk">British</option>
              </select>
            </label>
            <label className="wr-switch-row">
              <span>Humanizer</span>
              <input type="checkbox" className="wr-switch" checked={brief.humanizer.enabled} onChange={(event) => setHumanizer({ enabled: event.target.checked }, false)} />
            </label>
            {brief.humanizer.enabled && (
              <>
                <label className="wr-row-field">
                  <span>Preset</span>
                  <select className="wr-control" value={brief.humanizer.presetId} onChange={(event) => { if (event.target.value !== 'custom') onBriefChange({ humanizer: applyHumanizerPreset(brief.humanizer, event.target.value) }); }}>
                    {HUMANIZER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                    {brief.humanizer.presetId === 'custom' && <option value="custom">Custom</option>}
                  </select>
                </label>
                {([
                  ['intensity', 'Rewrite depth', 'Light', 'Deep'],
                  ['burstiness', 'Sentence rhythm', 'Even', 'Varied'],
                  ['formality', 'Register', 'Plain', 'Formal'],
                  ['hedging', 'Hedging', 'Direct', 'Careful'],
                ] as const).map(([key, label, low, high]) => (
                  <label key={key} className="wr-range">
                    <span className="wr-range__head"><span>{label}</span><span className="wr-note">{brief.humanizer[key] < 34 ? low : brief.humanizer[key] < 67 ? 'Balanced' : high}</span></span>
                    <input type="range" min={0} max={100} value={brief.humanizer[key]} onChange={(event) => setHumanizer({ [key]: Number(event.target.value) })} />
                  </label>
                ))}
                <label className="wr-switch-row">
                  <span>Contractions</span>
                  <input type="checkbox" className="wr-switch" checked={brief.humanizer.contractions} onChange={(event) => setHumanizer({ contractions: event.target.checked })} />
                </label>
                <label className="wr-field">
                  <span className="wr-label">Your own rules</span>
                  <textarea className="wr-textarea" rows={3} value={brief.humanizer.customInstructions} placeholder="e.g. Prefer active voice. Amounts in SAR." onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setHumanizer({ customInstructions: event.target.value }, false)} />
                </label>
              </>
            )}
          </div>
        </details>
      )}

      {brief && (
        <details className="wr-section wr-disclosure">
          <summary className="wr-section__title">Writer</summary>
          <div className="wr-disclosure__body">
            <WebPhotosToggle value={brief.pictures !== 'none'} onChange={(on) => onBriefChange({ pictures: on ? 'web' : 'none' })} />
            <EngineFields value={brief.engine} onChange={(engine) => onBriefChange({ engine })} />
          </div>
        </details>
      )}
    </div>
  );
};
