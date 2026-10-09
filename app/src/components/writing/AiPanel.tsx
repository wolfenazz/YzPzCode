import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { ArrowClockwise, CrosshairSimple, Feather, Highlighter, Sparkle, Stop } from '@phosphor-icons/react';
import ThoughtLine from '../reactbits/ThoughtLine';
import StatusMark, { type StatusMarkStatus } from '../reactbits/StatusMark';
import CallChip from '../reactbits/CallChip';
import SloshGauge from '../reactbits/SloshGauge';
import HoldButton from '../reactbits/HoldButton';
import PromptBar from '../reactbits/PromptBar';
import CountUp from '../reactbits/CountUp';
import type { WritingSession } from '../../stores/writingSessionStore';
import { lintText, scoreLabel, type LintKind } from '../../utils/writing/humanizer';
import { REWRITE_ACTIONS, type RewriteAction } from '../../utils/writing/prompts';
import { wordsToPages } from '../../utils/writing/reportTypes';
import type { HumanizerSettings, SectionRunStatus } from '../../utils/writing/types';
import { HumanizerControls } from './wizard/VoiceStep';

export type AiPanelTab = 'write' | 'humanize';

const STATUS_MAP: Record<SectionRunStatus, StatusMarkStatus> = {
  queued: 'pending',
  writing: 'running',
  done: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

const KIND_LABEL: Record<LintKind, { label: string; color: string }> = {
  phrase: { label: 'Stock AI phrases', color: '#e0802c' },
  transition: { label: 'Formulaic sentence openers', color: '#b5179e' },
  rhythm: { label: 'Paragraphs with flat rhythm', color: '#f2b544' },
  dash: { label: 'Em-dash overuse', color: '#7c5cff' },
};

interface AiPanelProps {
  editor: Editor | null;
  session: WritingSession;
  tab: AiPanelTab;
  lintEnabled: boolean;
  wordCount: number;
  onTab: (tab: AiPanelTab) => void;
  onToggleLint: () => void;
  onWriteRemaining: () => void;
  onRewriteAll: () => void;
  onWriteSection: (sectionId: string) => void;
  onJumpToSection: (sectionId: string) => void;
  onInstruction: (action: RewriteAction, instruction: string, sectionId: string | null) => void;
  onHumanizeSection: () => void;
  onHumanizeAll: () => void;
  onCancel: () => void;
  onHumanizerChange: (settings: HumanizerSettings) => void;
}


export const AiPanel: React.FC<AiPanelProps> = ({
  editor,
  session,
  tab,
  lintEnabled,
  wordCount,
  onTab,
  onToggleLint,
  onWriteRemaining,
  onRewriteAll,
  onWriteSection,
  onJumpToSection,
  onInstruction,
  onHumanizeSection,
  onHumanizeAll,
  onCancel,
  onHumanizerChange,
}) => {
  const { run, outline, brief } = session;
  const busy = run?.phase === 'writing' || run?.phase === 'outline';
  const current = outline.find((section) => section.id === run?.currentSectionId);
  const doneCount = outline.filter((section) => run?.sectionStatus[section.id] === 'done').length;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy || !run) return;
    const tick = (): void => setElapsed((Date.now() - run.startedAt) / 1000);
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [busy, run]);

  // Naturalness of the whole document, recomputed when the text settles.
  const [lint, setLint] = useState(() => lintText(''));
  useEffect(() => {
    if (!editor || tab !== 'humanize') return;
    let timer = 0;
    const compute = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setLint(lintText(editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' '), brief?.humanizer.bannedPhrases));
      }, 400);
    };
    compute();
    editor.on('update', compute);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', compute);
    };
  }, [editor, tab, brief?.humanizer.bannedPhrases]);

  const counts = useMemo(() => {
    const result: Record<LintKind, number> = { phrase: 0, transition: 0, rhythm: 0, dash: 0 };
    for (const issue of lint.issues) result[issue.kind] += 1;
    return result;
  }, [lint]);

  const traceLabel = run?.phase === 'outline'
    ? 'Designing the outline'
    : run?.phase === 'writing'
      ? current ? `Writing ${current.title}` : 'Preparing the sources'
      : 'Writing';
  const doneLabel = run?.phase === 'done'
    ? `Wrote ${run.wordsWritten.toLocaleString()} words in`
    : run?.phase === 'failed'
      ? 'Stopped after an error'
      : run?.phase === 'cancelled'
        ? 'Stopped'
        : 'Ready';

  const sectionMentionSources = outline.map((section) => ({ key: section.id, name: section.title, description: `${section.targetWords} words` }));

  return (
    <aside className="wr-ai" aria-label="AI writer">
      <div className="wr-ai__tabs" role="tablist">
        {(['write', 'humanize'] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`wr-ribbon__tab${tab === id ? ' is-active' : ''}`} onClick={() => onTab(id)}>
            {id === 'write' ? 'AI writer' : 'Humanizer'}
            {tab === id && <motion.span layoutId="wr-ai-tab" className="wr-ribbon__tab-line" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />}
          </button>
        ))}
      </div>

      <div className="wr-ai__scroll">
        {tab === 'write' ? (
          <>
            <div className="wr-bezel wr-ai__card"><div className="wr-bezel__core wr-ai__card-body">
              {run && run.phase !== 'idle' ? (
                <ThoughtLine
                  label={traceLabel}
                  doneLabel={doneLabel}
                  working={busy}
                  elapsed={busy ? elapsed : run.endedAt ? (run.endedAt - run.startedAt) / 1000 : undefined}
                  showTimer
                  steps={run.calls.filter((call) => call.status !== 'running').slice(-6).map((call) => `${call.status === 'done' ? '✓' : call.status === 'failed' ? '✕' : '·'} ${call.label.replace(/^Writing /, '')}`)}
                  color="var(--text-primary)"
                  glyphColor="var(--wr-gold)"
                  fontSize={14}
                  collapsible
                />
              ) : (
                <>
                  <h3 className="wr-ai__heading">Your writer</h3>
                  <p className="wr-ai__sub">Writes each section in turn, streaming it onto the page. You can keep editing anywhere else while it works.</p>
                </>
              )}
              <div className="wr-ai__stats">
                <div className="wr-ai__stat"><strong><CountUp to={wordCount} /></strong><span>words</span></div>
                <div className="wr-ai__stat"><strong><CountUp to={wordsToPages(wordCount)} /></strong><span>pages (approx.)</span></div>
                <div className="wr-ai__stat"><strong>{doneCount}/{outline.length}</strong><span>sections</span></div>
              </div>
              {run?.error && <div className="wr-ai__error">{run.error}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {busy ? (
                  <button type="button" className="wr-pill-btn is-danger" onClick={onCancel}><Stop size={14} weight="fill" /> Stop writing</button>
                ) : (
                  <>
                    <button type="button" className="wr-pill-btn is-gold" onClick={onWriteRemaining} disabled={outline.length === 0}>
                      <Feather size={14} weight="fill" /> Write remaining sections
                    </button>
                    <HoldButton
                      holdTime={1100}
                      size="sm"
                      radius={999}
                      backgroundColor="color-mix(in oklab, var(--text-primary) 6%, transparent)"
                      textColor="var(--text-secondary)"
                      fillColor="var(--wr-danger)"
                      fillTextColor="#fff"
                      doneLabel="Rewriting…"
                      disabled={outline.length === 0}
                      onHold={onRewriteAll}
                    >
                      Hold to rewrite all
                    </HoldButton>
                  </>
                )}
              </div>
            </div></div>

            {outline.length > 0 && (
              <div className="wr-bezel wr-ai__card"><div className="wr-bezel__core wr-ai__card-body">
                <div className="wr-sidebar__label" style={{ padding: '0 0 8px' }}>Sections</div>
                <div className="wr-ai__sections">
                  {outline.map((section) => {
                    const status = run?.sectionStatus[section.id];
                    return (
                      <div key={section.id} className="wr-ai__section">
                        <StatusMark
                          status={status ? STATUS_MAP[status] : 'pending'}
                          label={section.title}
                          color="var(--text-primary)"
                          doneColor="var(--wr-success)"
                          errorColor="var(--wr-danger)"
                          size={16}
                          fontSize={12.5}
                          strike={false}
                        />
                        <span className="wr-ai__section-actions">
                          <button type="button" className="wr-icon-btn" title="Go to section" onClick={() => onJumpToSection(section.id)}><CrosshairSimple size={13} /></button>
                          <button type="button" className="wr-icon-btn" title="Write this section again" disabled={busy} onClick={() => onWriteSection(section.id)}><ArrowClockwise size={13} /></button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div></div>
            )}

            {run && run.calls.length > 0 && (
              <div className="wr-ai__calls">
                {run.calls.slice(-6).map((call) => (
                  <CallChip
                    key={call.id}
                    icon="edit"
                    name={call.label.split(' ')[0]}
                    argument={call.label.split(' ').slice(1).join(' ')}
                    status={call.status === 'running' ? 'running' : call.status === 'done' ? 'done' : call.status === 'failed' ? 'error' : 'idle'}
                    expectedMs={45_000}
                    size={12}
                    color="var(--text-primary)"
                    surfaceColor="color-mix(in oklab, var(--text-primary) 6%, transparent)"
                    progressColor="var(--wr-gold)"
                    doneColor="var(--wr-success)"
                    errorColor="var(--wr-danger)"
                    showTimer
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="wr-bezel wr-ai__card"><div className="wr-bezel__core wr-ai__card-body">
              <div className="wr-gauge-row">
                <SloshGauge value={lint.score} width={56} height={92} radius={14} ticks={5} liquidColor={lint.score >= 70 ? 'var(--wr-success)' : lint.score >= 50 ? 'var(--wr-gold)' : 'var(--wr-danger)'} glassColor="color-mix(in oklab, var(--text-primary) 8%, transparent)" ariaLabel="Naturalness" />
                <div className="wr-gauge-row__text">
                  <strong>{lint.score}</strong>
                  <span>{scoreLabel(lint.score)}</span>
                  <div className="wr-field__hint" style={{ marginTop: 6 }}>Rhythm variation {lint.rhythmVariation} · {lint.sentences} sentences</div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                {(Object.keys(KIND_LABEL) as LintKind[]).map((kind) => (
                  <div key={kind} className="wr-issue">
                    <span className="wr-issue__swatch" style={{ background: KIND_LABEL[kind].color }} />
                    <span style={{ flex: 1 }}>{KIND_LABEL[kind].label}</span>
                    <strong>{counts[kind]}</strong>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                <button type="button" className={`wr-pill-btn${lintEnabled ? ' is-gold' : ''}`} onClick={onToggleLint}><Highlighter size={14} /> {lintEnabled ? 'Highlighting on' : 'Highlight in text'}</button>
                <button type="button" className="wr-pill-btn" onClick={onHumanizeSection} disabled={busy}><Sparkle size={14} /> Humanize this section</button>
              </div>
              <div style={{ marginTop: 10 }}>
                <HoldButton
                  holdTime={1000}
                  size="sm"
                  radius={999}
                  backgroundColor="color-mix(in oklab, var(--text-primary) 6%, transparent)"
                  textColor="var(--text-primary)"
                  fillColor="var(--wr-gold)"
                  fillTextColor="#1b1408"
                  doneLabel="Humanizing…"
                  disabled={busy || outline.length === 0}
                  onHold={onHumanizeAll}
                >
                  Hold to humanize the whole report
                </HoldButton>
              </div>
            </div></div>

            {brief && (
              <div className="wr-bezel wr-ai__card"><div className="wr-bezel__core wr-ai__card-body">
                <h3 className="wr-ai__heading" style={{ fontSize: 16 }}>Humanizer settings</h3>
                <p className="wr-ai__sub">Used for every new section and every rewrite in this report.</p>
                <HumanizerControls value={brief.humanizer} onChange={onHumanizerChange} />
              </div></div>
            )}
          </>
        )}
      </div>

      <div className="wr-ai__composer">
        <PromptBar
          placeholder={outline.length > 0 ? 'Ask for a change… / for actions, @ for a section' : 'Open or commission a report first'}
          sources={sectionMentionSources}
          commands={REWRITE_ACTIONS.map((action) => ({ key: action.id, name: `/${action.id}`, description: action.label }))}
          models={[]}
          efforts={[]}
          busy={busy}
          onStop={onCancel}
          onSend={(text) => {
            const command = /^\/(\w+)/.exec(text);
            const action = (REWRITE_ACTIONS.find((entry) => entry.id === command?.[1])?.id ?? 'custom') as RewriteAction;
            const mention = [...outline].sort((a, b) => b.title.length - a.title.length).find((section) => text.includes(`@${section.title}`));
            const instruction = text.replace(/^\/\w+\s*/, '').replace(mention ? `@${mention.title}` : /$^/, '').trim();
            onInstruction(action, instruction, mention?.id ?? null);
          }}
          background="color-mix(in oklab, var(--text-primary) 5%, var(--bg-secondary))"
          color="var(--text-primary)"
          menuBackground="var(--bg-secondary)"
          sparkColor="#d9b56a"
          radius={16}
          maxRows={6}
        />
      </div>
    </aside>
  );
};
