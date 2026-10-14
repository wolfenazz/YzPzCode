import React, { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { WritingSession } from '../../stores/writingSessionStore';
import { applyHumanizerPreset, HUMANIZER_PRESETS, lintText, scoreLabel, type LintKind } from '../../utils/writing/humanizer';
import { REWRITE_ACTIONS, type RewriteAction } from '../../utils/writing/prompts';
import type { HumanizerSettings, Person, ReadingLevel, ReportBrief, Spelling, Tone } from '../../utils/writing/types';
import { ActionList, Facts, Field, Hint, PromptBox, Section, Select, Slider, Target, Toggle } from '../studio/Inspector';
import { findSectionRange } from './editor/extensions';
import { WRITTEN_WORDS } from './useReportGenerator';
import { EngineFields, formatElapsed, WebPhotosToggle } from './ui';

const KIND_LABEL: Record<LintKind, string> = {
  phrase: 'Stock phrases',
  transition: 'Formulaic openers',
  rhythm: 'Flat rhythm',
  dash: 'Em-dash overuse',
};

interface TargetInfo {
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
  onInstruction: (action: RewriteAction, instruction: string) => void;
  onBriefChange: (patch: Partial<ReportBrief>) => void;
}

function useTarget(editor: Editor | null, session: WritingSession): TargetInfo {
  const [target, setTarget] = useState<TargetInfo>({ kind: 'none', label: 'Put the cursor in a section or select text' });
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
          if (!range || doc.textBetween(range.bodyFrom, range.to, ' ', ' ').trim().split(/\s+/).filter(Boolean).length < WRITTEN_WORDS) empty += 1;
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
  const lacksTarget = target.kind === 'none';
  const showJob = busy || (run && run.phase !== 'idle' && run.phase !== 'done') || emptyCount > 0;

  const send = (): void => {
    const text = instruction.trim();
    if (!text || busy || lacksTarget) return;
    onInstruction('custom', text);
    setInstruction('');
  };

  const setHumanizer = (patch: Partial<HumanizerSettings>, custom = true): void => {
    if (!brief) return;
    onBriefChange({ humanizer: { ...brief.humanizer, ...patch, presetId: custom ? 'custom' : brief.humanizer.presetId } });
  };

  return (
    <>
      {showJob && (
        <Section>
          {busy ? (
            <div className="sx-job">
              <div className="sx-job__row">
                <strong>{run?.phase === 'outline' ? 'Planning the report' : 'Writing'}</strong>
                <span>{formatElapsed(elapsed)}</span>
              </div>
              {run?.phase === 'writing' && targets.length > 0 && (
                <>
                  <div className="sx-meter" aria-hidden="true"><span style={{ width: `${Math.round((finished / targets.length) * 100)}%` }} /></div>
                  <Hint>{current ? current.title : 'Reading your material'} · {finished} of {targets.length}</Hint>
                </>
              )}
            </div>
          ) : (
            <>
              {run?.phase === 'failed' && run.error && <Hint error>{run.error}</Hint>}
              {run?.phase === 'cancelled' && <Hint>Writing was stopped.</Hint>}
              {emptyCount > 0 && (
                <div className="sx-job">
                  <div className="sx-job__row"><strong>{emptyCount} section{emptyCount === 1 ? ' is' : 's are'} not written yet</strong></div>
                  <button type="button" className="sx-btn sx-btn--primary sx-btn--block" onClick={onWriteRemaining}>Write {emptyCount === 1 ? 'it' : 'them'}</button>
                </div>
              )}
            </>
          )}
        </Section>
      )}

      <Section title="Edit with AI">
        <Target value={target.kind === 'section' ? `Section · ${target.label}` : target.label} empty={lacksTarget} />
        <PromptBox
          value={instruction}
          onChange={setInstruction}
          onSubmit={send}
          disabled={busy}
          blocked={lacksTarget}
          placeholder="Describe a change, e.g. “Add a comparison table”"
        />
        <ActionList
          items={REWRITE_ACTIONS.map((action) => ({
            id: action.id,
            label: action.label,
            hint: action.hint,
            disabled: busy || lacksTarget,
            onSelect: () => onInstruction(action.id, ''),
          }))}
        />
      </Section>

      <Section title="Whole document">
        {confirm ? (
          <div className="sx-job">
            <Hint>{confirm === 'rewrite' ? `Write all ${outline.length} sections again? Your edits in them are replaced.` : 'Humanize every section? Each one is rewritten in a more natural voice.'} Ctrl+Z undoes it section by section.</Hint>
            <div className="sx-row">
              <button type="button" className="sx-btn sx-btn--sm" onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" className="sx-btn sx-btn--sm sx-btn--primary" onClick={() => { const choice = confirm; setConfirm(null); if (choice === 'rewrite') onRewriteAll(); else onHumanizeAll(); }}>
                {confirm === 'rewrite' ? 'Write again' : 'Humanize'}
              </button>
            </div>
          </div>
        ) : (
          <ActionList
            items={[
              { id: 'humanize', label: 'Humanize all', hint: 'Rewrite every section in a more natural voice', disabled: busy || outline.length === 0, onSelect: () => setConfirm('humanize') },
              { id: 'rewrite', label: 'Write all again', hint: 'Write every section from the outline again', disabled: busy || outline.length === 0, onSelect: () => setConfirm('rewrite') },
            ]}
          />
        )}
      </Section>

      <Section title="Naturalness" aside={lint.words > 0 ? `${lint.score} · ${scoreLabel(lint.score)}` : 'No text yet'}>
        <Facts items={(Object.keys(KIND_LABEL) as LintKind[]).map((kind) => [KIND_LABEL[kind], counts[kind]] as [string, number])} />
        <Toggle label="Highlight in the text" checked={lintEnabled} onChange={onToggleLint} />
      </Section>

      {brief && (
        <Section title="Voice" collapsible defaultOpen={false}>
          <Field label="Tone">
            <Select value={brief.voice.tone} onChange={(event) => onBriefChange({ voice: { ...brief.voice, tone: event.target.value as Tone } })}>
              <option value="formal">Formal</option>
              <option value="analytical">Analytical</option>
              <option value="persuasive">Persuasive</option>
              <option value="neutral">Neutral</option>
              <option value="friendly">Warm</option>
            </Select>
          </Field>
          <Field label="Reader">
            <Select value={brief.voice.readingLevel} onChange={(event) => onBriefChange({ voice: { ...brief.voice, readingLevel: event.target.value as ReadingLevel } })}>
              <option value="general">General</option>
              <option value="professional">Professional</option>
              <option value="expert">Expert</option>
            </Select>
          </Field>
          <Field label="Voice">
            <Select value={brief.voice.person} onChange={(event) => onBriefChange({ voice: { ...brief.voice, person: event.target.value as Person } })}>
              <option value="auto">Conventional</option>
              <option value="first-plural">We</option>
              <option value="first-singular">I</option>
              <option value="third">Third person</option>
            </Select>
          </Field>
          <Field label="Spelling">
            <Select value={brief.voice.spelling} onChange={(event) => onBriefChange({ voice: { ...brief.voice, spelling: event.target.value as Spelling } })}>
              <option value="us">American</option>
              <option value="uk">British</option>
            </Select>
          </Field>
          <Toggle label="Humanizer" hint="Rewrites drafts so they read like a person wrote them" checked={brief.humanizer.enabled} onChange={(enabled) => setHumanizer({ enabled }, false)} />
          {brief.humanizer.enabled && (
            <>
              <Field label="Preset">
                <Select value={brief.humanizer.presetId} onChange={(event) => { if (event.target.value !== 'custom') onBriefChange({ humanizer: applyHumanizerPreset(brief.humanizer, event.target.value) }); }}>
                  {HUMANIZER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                  {brief.humanizer.presetId === 'custom' && <option value="custom">Custom</option>}
                </Select>
              </Field>
              {([
                ['intensity', 'Rewrite depth', 'Light', 'Deep'],
                ['burstiness', 'Sentence rhythm', 'Even', 'Varied'],
                ['formality', 'Register', 'Plain', 'Formal'],
                ['hedging', 'Hedging', 'Direct', 'Careful'],
              ] as const).map(([key, label, low, high]) => (
                <Slider
                  key={key}
                  label={label}
                  display={brief.humanizer[key] < 34 ? low : brief.humanizer[key] < 67 ? 'Balanced' : high}
                  value={brief.humanizer[key]}
                  onChange={(value) => setHumanizer({ [key]: value })}
                />
              ))}
              <Toggle label="Contractions" checked={brief.humanizer.contractions} onChange={(contractions) => setHumanizer({ contractions })} />
              <Field label="Your own rules" stack>
                <textarea className="sx-textarea" rows={3} value={brief.humanizer.customInstructions} placeholder="e.g. Prefer active voice. Amounts in SAR." onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setHumanizer({ customInstructions: event.target.value }, false)} />
              </Field>
            </>
          )}
        </Section>
      )}

      {brief && (
        <Section title="Writer" collapsible defaultOpen={false}>
          <WebPhotosToggle value={brief.pictures !== 'none'} onChange={(on) => onBriefChange({ pictures: on ? 'web' : 'none' })} />
          <EngineFields value={brief.engine} onChange={(engine) => onBriefChange({ engine })} />
        </Section>
      )}
    </>
  );
};
