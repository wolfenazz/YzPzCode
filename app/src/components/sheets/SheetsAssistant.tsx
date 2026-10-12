import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwise, Check, FilePlus, FileText, Image as ImageIcon, Paperclip, Sparkle, X } from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-dialog';
import { listWritingEngines, type WritingEngineInfo } from '../../utils/writing/aiClient';
import { useEngineModels } from '../../utils/writing/useEngineModels';
import type { EngineChoice, WritingEngineId } from '../../utils/writing/types';
import type { AiScope } from '../../utils/sheets/ai/context';
import type { ChatTurn, Proposal, AssistantRun } from '../../stores/sheetsSessionStore';
import { Hint, PromptBox, Segmented, Target } from '../studio/Inspector';
import { EffortSelect, hasEfforts } from '../writing/EffortSelect';
import { ModelInput } from '../writing/ModelInput';
import { attachmentFromPath, DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS, MAX_ATTACHMENT_COUNT, saveDropped, type SheetAttachment } from './attachments';

export interface QuickAction {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  scope?: AiScope;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'picture', label: 'Picture to sheet', hint: 'Attach a photo of a table, then use this', prompt: 'Transcribe the attached picture into this workbook as a clean table with a header row. Copy every value exactly as printed; leave unreadable cells empty and add a note on them. Add totals or averages as formulas only if the picture shows them.', scope: 'workbook' },
  { id: 'clean', label: 'Clean data', hint: 'Trim, fix types and capitalisation', prompt: 'Clean the data: trim spaces, make numbers and dates real values, fix inconsistent capitalisation, and remove exact duplicate rows. Tell me what you changed.', scope: 'sheet' },
  { id: 'totals', label: 'Add totals and averages', hint: 'With formulas', prompt: 'Add a totals row and, where it makes sense, averages for the numeric columns, using formulas. Style the totals row so it reads as a total.', scope: 'sheet' },
  { id: 'chart', label: 'Make a chart', hint: 'From the selection or the table', prompt: 'Make the most useful chart for this data and place it beside the table with a clear title.', scope: 'selection' },
  { id: 'explain', label: 'Explain formulas', hint: 'What this does, step by step', prompt: 'Explain how the formulas in the selection work, in plain language. Do not change anything.', scope: 'selection' },
  { id: 'errors', label: 'Find and fix errors', hint: 'Broken or odd formulas', prompt: 'Find cells with errors, inconsistent formulas or suspicious values, fix what is clearly wrong and list anything you are unsure about.', scope: 'sheet' },
  { id: 'format', label: 'Format as a table', hint: 'Professional look', prompt: 'Format this data as a professional table: one header style, number formats, column widths, a frozen header row and a filter. Keep it restrained.', scope: 'sheet' },
  { id: 'translate', label: 'Translate', hint: 'Keep the structure', prompt: 'Translate the text in the selected cells to English (or to Arabic if it is already English), keeping numbers and formulas as they are.', scope: 'selection' },
];

interface AssistantProps {
  turns: ChatTurn[];
  run: AssistantRun | null;
  proposal: Proposal | null;
  scope: AiScope;
  onScope: (scope: AiScope) => void;
  targetLabel: string;
  engine: EngineChoice;
  onEngine: (engine: EngineChoice) => void;
  readOnly: boolean;
  attachments: SheetAttachment[];
  onAttachments: (items: SheetAttachment[]) => void;
  folder: string;
  onAsk: (instruction: string, label?: string, scope?: AiScope) => void;
  onStop: () => void;
  onKeep: () => void;
  onDiscard: () => void;
  onPeek: (peeking: boolean) => void;
}

const SCOPES: Array<{ id: AiScope; label: string }> = [
  { id: 'selection', label: 'Selection' },
  { id: 'sheet', label: 'Sheet' },
  { id: 'workbook', label: 'Workbook' },
];

const elapsed = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** The assistant tab: transcript, proposal review, attachments, scope and the box to ask in. */
export const SheetsAssistant: React.FC<AssistantProps> = ({
  turns, run, proposal, scope, onScope, targetLabel, engine, onEngine, readOnly, attachments, onAttachments, folder, onAsk, onStop, onKeep, onDiscard, onPeek,
}) => {
  const [draft, setDraft] = useState('');
  const [, setTick] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const busy = Boolean(run);

  useEffect(() => {
    if (!run) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [run]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns.length, run?.phase, proposal?.id]);

  const addPaths = (paths: string[]): void => {
    const items = paths.map(attachmentFromPath).filter((item): item is SheetAttachment => item !== null);
    if (items.length < paths.length) setFileError('Some files were skipped: use pictures, PDF, Word, Excel, CSV or text files.');
    else setFileError(null);
    onAttachments([...attachments, ...items].slice(0, MAX_ATTACHMENT_COUNT));
  };

  const addFiles = async (files: File[]): Promise<void> => {
    try {
      const paths = await Promise.all(files.map((file) => saveDropped(file, folder)));
      addPaths(paths);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : String(error));
    }
  };

  const pick = async (): Promise<void> => {
    const chosen = await open({ multiple: true, filters: [{ name: 'Pictures and documents', extensions: [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS] }] });
    if (!chosen) return;
    addPaths(Array.isArray(chosen) ? chosen : [chosen]);
  };

  const submit = (instruction = draft, label?: string, quickScope?: AiScope): void => {
    if (!instruction.trim() || busy || proposal) return;
    onAsk(instruction.trim(), label, quickScope);
    setDraft('');
  };

  const pictureOnly = useMemo(() => attachments.some((a) => a.kind === 'image') && engine.engine !== 'claude' && engine.engine !== 'codex', [attachments, engine.engine]);
  const now = Date.now();

  return (
    <div
      className="sh-ai"
      data-dragging={dragging || undefined}
      onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { dragDepth.current += 1; setDragging(true); } }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="sh-ai__log" ref={log}>
        {turns.length === 0 && !run && (
          <div className="sh-ai__empty">
            <Sparkle size={18} weight="fill" />
            <p>Ask for anything: build a table, add formulas, clean data, make a chart. Attach a photo or a file and it becomes cells.</p>
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className={`sh-turn sh-turn--${turn.role}${turn.error ? ' is-error' : ''}`}>
            <div className="sh-turn__text" dir="auto">{turn.text}</div>
            {turn.attachments && turn.attachments.length > 0 && (
              <div className="sh-turn__files">{turn.attachments.map((name) => <span key={name}><Paperclip size={10} /> {name}</span>)}</div>
            )}
            {turn.summary && turn.summary.length > 0 && (
              <ul className="sh-turn__ops">
                {turn.summary.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
              </ul>
            )}
            {turn.role === 'assistant' && turn.outcome === 'kept' && <span className="sh-turn__badge is-kept"><Check size={10} weight="bold" /> Kept</span>}
            {turn.role === 'assistant' && turn.outcome === 'discarded' && <span className="sh-turn__badge">Discarded</span>}
          </div>
        ))}
        {run && (
          <div className="sh-turn sh-turn--status" role="status">
            <span className="sh-pulse" aria-hidden="true" />
            <span>{run.label}</span>
            <span className="sh-turn__time">{elapsed(now - run.startedAt)}</span>
          </div>
        )}
      </div>

      {proposal && (
        <div className="sh-proposal" role="group" aria-label="Proposed changes">
          <div className="sh-proposal__head">
            <strong>{proposal.summary.length} change{proposal.summary.length === 1 ? '' : 's'} ready</strong>
            <span>Tinted cells are new or changed</span>
          </div>
          {proposal.warnings.length > 0 && <Hint error>{proposal.warnings.slice(0, 2).join(' ')}</Hint>}
          <div className="sh-proposal__actions">
            <button type="button" className="sx-btn sx-btn--primary" onClick={onKeep}><Check size={13} weight="bold" /> Keep</button>
            <button type="button" className="sx-btn" onClick={onDiscard}><X size={13} /> Discard</button>
            <button
              type="button"
              className="sx-btn sx-btn--quiet"
              title="Hold to see the workbook as it was"
              onMouseDown={() => onPeek(true)}
              onMouseUp={() => onPeek(false)}
              onMouseLeave={() => onPeek(false)}
              onBlur={() => onPeek(false)}
            >
              <ArrowCounterClockwise size={13} /> Before
            </button>
          </div>
        </div>
      )}

      {!busy && !proposal && turns.length < 2 && (
        <div className="sh-quick">
          {QUICK_ACTIONS.map((action) => (
            <button key={action.id} type="button" className="sh-quick__item" title={action.hint} disabled={readOnly} onClick={() => submit(action.prompt, action.label, action.scope)}>
              <FilePlus size={13} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sh-ai__compose">
        <Segmented value={scope} options={SCOPES} onChange={onScope} label="What the assistant looks at" />
        <Target label="Looking at" value={scope === 'selection' ? targetLabel : scope === 'sheet' ? 'The active sheet' : 'Every sheet'} />
        {(attachments.length > 0 || fileError) && (
          <div className="sh-chips">
            {attachments.map((item) => (
              <span key={item.id} className="sh-chip" title={item.path}>
                {item.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
                <span className="sh-chip__name">{item.name}</span>
                <button type="button" aria-label={`Remove ${item.name}`} onClick={() => onAttachments(attachments.filter((a) => a.id !== item.id))}><X size={10} /></button>
              </span>
            ))}
            {fileError && <span className="sh-chips__error">{fileError}</span>}
          </div>
        )}
        {pictureOnly && <Hint error>This engine cannot look at pictures. Pick Claude Code or Codex below.</Hint>}
        <PromptBox
          value={draft}
          onChange={setDraft}
          onSubmit={() => submit()}
          placeholder={attachments.length ? 'What should it do with the files?' : 'Describe what you want in the workbook'}
          disabled={busy || Boolean(proposal)}
          running={busy}
          onStop={onStop}
          rows={3}
        />
        <div className="sh-ai__tools">
          <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" disabled={busy || Boolean(proposal)} onClick={() => void pick()}><Paperclip size={12} /> Add files</button>
          <span className="sh-ai__hint">or drop or paste a picture</span>
        </div>
        <EngineRow value={engine} onChange={onEngine} />
      </div>
    </div>
  );
};

const EngineRow: React.FC<{ value: EngineChoice; onChange: (value: EngineChoice) => void }> = ({ value, onChange }) => {
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  useEffect(() => {
    let alive = true;
    listWritingEngines().then((list) => { if (alive) setEngines(list); }).catch(() => { if (alive) setEngines([]); });
    return () => { alive = false; };
  }, []);
  const installed = engines?.find((entry) => entry.engine === value.engine)?.installed ?? false;
  const { models, loading } = useEngineModels(value.engine, installed);
  return (
    <div className="sh-engine">
      <select
        className="sh-engine__select"
        aria-label="AI engine"
        value={value.engine}
        onChange={(event) => onChange({ ...value, engine: event.target.value as WritingEngineId, model: '', effort: '' })}
      >
        {(engines ?? [{ engine: value.engine, displayName: value.engine, installed: true } as WritingEngineInfo]).map((entry) => (
          <option key={entry.engine} value={entry.engine} disabled={!entry.installed}>{entry.displayName}{entry.installed ? '' : ' (not installed)'}</option>
        ))}
      </select>
      <ModelInput className="sh-engine__select" value={value.model} onChange={(model) => onChange({ ...value, model })} models={models} loading={loading} placeholder="CLI default" />
      {hasEfforts(models, value.model) && (
        <EffortSelect className="sh-engine__select" value={value.effort ?? ''} onChange={(effort) => onChange({ ...value, effort })} models={models} model={value.model} />
      )}
    </div>
  );
};
