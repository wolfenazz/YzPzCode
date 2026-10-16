import React from 'react';
import {
  ChartBar, Cursor, Globe, ImageSquare, ListPlus, MagicWand, NotePencil, PaintBrush, Play, SquaresFour, Sparkle, TextAlignLeft, X,
} from '@phosphor-icons/react';
import { REFINE_ACTIONS } from '../../utils/presentation/designPrompts';
import type { DesignedSlide } from '../../utils/presentation/designTypes';
import PromptBar, { type PromptBarSource } from '../reactbits/PromptBar';
import { SvgSlide } from './SvgSlide';

/** The AI tab's bar has no "+" sources: pictures and files reach the deck through the Design tab. */
const NO_SOURCES: PromptBarSource[] = [];

/** Which slides an instruction applies to. */
export type AiScope = 'current' | 'picked' | 'all';

/** `animate` designs the element animation and leaves the drawing as it is. */
export type AiKind = 'edit' | 'redesign' | 'animate';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  polish: <MagicWand size={14} />,
  visual: <ImageSquare size={14} />,
  simplify: <TextAlignLeft size={14} />,
  layout: <SquaresFour size={14} />,
  expand: <ListPlus size={14} />,
  chart: <ChartBar size={14} />,
  notes: <NotePencil size={14} />,
};

const MAX_THUMBS = 4;

interface DesignedAiPanelProps {
  scope: AiScope;
  onScope: (scope: AiScope) => void;
  /** The slides the instruction applies to, in deck order (empty while "Several" has fewer than two). */
  slides: DesignedSlide[];
  total: number;
  /** 1-based position of the slide on the stage. */
  currentNumber: number;
  pickedCount: number;
  canvas: { width: number; height: number };
  resolveHref: (href: string) => string;
  /** Elements picked on the slide; the instruction is about them. */
  targets: Array<{ id: string; label: string }>;
  onClearTargets: () => void;
  value: string;
  onValue: (value: string) => void;
  /** A run is in flight: sending is off and Stop shows. */
  busy: boolean;
  /** The run's error, if the last run failed (shown even when idle). */
  error?: string | null;
  /** The current slide has no drawing yet. */
  blank: boolean;
  engine: string;
  imported: boolean;
  onSend: (text: string, label: string, kind: AiKind) => void;
  onStop: () => void;
  onPickSlides: () => void;
  children?: React.ReactNode;
}

const SCOPES: Array<{ id: AiScope; label: string }> = [
  { id: 'current', label: 'This slide' },
  { id: 'picked', label: 'Several' },
  { id: 'all', label: 'Whole deck' },
];

/** The AI tab: who the change is for, what to change, and quick actions. */
export const DesignedAiPanel: React.FC<DesignedAiPanelProps> = ({
  scope, onScope, slides, total, currentNumber, pickedCount, canvas, resolveHref, targets, onClearTargets, value, onValue, busy, blank, error, engine, imported,
  onSend, onStop, onPickSlides, children,
}) => {
  const count = slides.length;
  const ready = count > 0 && !blank;
  const text = value.trim();
  const many = scope !== 'current';

  const placeholder = scope === 'current'
    ? `What should change on slide ${currentNumber}? e.g. make the title bigger, add a chart of these numbers…`
    : scope === 'picked'
      ? count > 0 ? `What should change on these ${count} slides?` : 'Pick two or more slides first'
      : `What should change on all ${total} slides? e.g. use shorter titles, add more space…`;

  const send = (kind: AiKind = 'edit'): void => {
    if (!ready || busy) return;
    if (kind === 'edit' && !text) return;
    onSend(text, kind === 'redesign' ? 'Redesign' : kind === 'animate' ? 'Animate' : 'Your change', kind);
  };

  const shown = slides.slice(0, MAX_THUMBS);
  const current = slides.length === 1 ? slides[0] : null;

  return (
    <div className="pd-ai">
      <section className="pd-ai__block">
        <div className="pd-ai__label">Apply to</div>
        <div className="pd-scope" role="radiogroup" aria-label="Which slides">
          {SCOPES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={scope === option.id}
              disabled={busy}
              onClick={() => { onScope(option.id); if (option.id === 'picked' && pickedCount < 2) onPickSlides(); }}
            >
              {option.label}
              {option.id === 'picked' && pickedCount > 1 && <em>{pickedCount}</em>}
            </button>
          ))}
        </div>

        {count > 0 ? (
          <div className="pd-scope__sum" data-many={!current || undefined}>
            <div className="pd-scope__thumbs" aria-hidden="true">
              {shown.map((entry, index) => (
                <span key={entry.id} className="pd-scope__thumb">
                  <SvgSlide svg={entry.svg} width={current ? 76 : 60} canvas={canvas} resolveHref={resolveHref} placeholder={{ title: entry.title, busy: false }} />
                  {count > MAX_THUMBS && index === MAX_THUMBS - 1 && <span className="pd-scope__plus">+{count - MAX_THUMBS + 1}</span>}
                </span>
              ))}
            </div>
            <div className="pd-scope__text">
              <strong>{current ? current.title || `Slide ${currentNumber}` : scope === 'all' ? 'Every slide' : `${count} slides`}</strong>
              <span>
                {current ? `Slide ${currentNumber} of ${total}` : scope === 'all' ? `${count} of ${total} drawn` : 'Edited one by one, reviewed together'}
              </span>
            </div>
          </div>
        ) : (
          <div className="pd-scope__empty">
            <span>Tick two or more slides in the strip on the left. Shift-click picks a range.</span>
            <button type="button" className="pr-btn pr-btn--sm" onClick={onPickSlides}><Cursor size={12} /> Pick slides</button>
          </div>
        )}
      </section>

      <section className="pd-ai__block">
        <div className="pd-ai__label">Instruction</div>
        <div className="pd-compose" data-disabled={!ready || undefined} onKeyDown={(event) => event.stopPropagation()}>
          {scope === 'current' && targets.length > 0 && (
            <div className="pd-compose__targets">
              {targets.slice(0, 3).map((target) => (
                <span key={target.id} className="pd-target" title={target.label}><Cursor size={11} weight="fill" /><span>{target.label}</span></span>
              ))}
              {targets.length > 3 && <span className="pd-target"><span>+{targets.length - 3}</span></span>}
              <button type="button" className="pd-target__clear" aria-label="Stop pointing at these elements" title="Ask about the whole slide instead" onClick={onClearTargets}><X size={11} weight="bold" /></button>
            </div>
          )}
          <PromptBar
            placeholder={blank && scope === 'current' ? 'This slide is not drawn yet.' : placeholder}
            inputLabel="Instruction for the AI"
            sources={NO_SOURCES}
            commands={[]}
            models={[]}
            efforts={[]}
            draft={value}
            onDraftChange={onValue}
            disabled={!ready || busy}
            busy={busy}
            canSend={ready && text.length > 0}
            onSend={() => send()}
            onStop={onStop}
            width="100%"
            radius={10}
            background="transparent"
            color="var(--pr-ink)"
            menuBackground="var(--pr-raised)"
            sparkColor="var(--pr-accent)"
            extras={scope === 'current' ? (
              <button
                type="button"
                className="pd-compose__tool"
                disabled={!ready || busy}
                title="Ask for a real photo from the web"
                onClick={() => onValue(value.trim() ? value : 'Add a picture from the internet of ')}
              >
                <Globe size={13} /> Web photo
              </button>
            ) : undefined}
          />
        </div>
        <span className="pd-compose__engine" title="The AI engine for this deck (change it below)">
          <Sparkle size={11} weight="fill" /> {engine}
        </span>
        {error && !busy && (
          <p className="pr-error" role="alert">{error}</p>
        )}
        {many && count > 0 && <p className="pr-hint">One AI call per slide. Nothing changes until you keep it, and one Undo takes it all back.</p>}
        {imported && !many && <p className="pr-hint">Every AI change is a proposal: Keep it, or Discard to leave the slide exactly as it came from PowerPoint.</p>}
      </section>

      <section className="pd-ai__block">
        <div className="pd-ai__label">Quick actions</div>
        <div className="pd-quick">
          {REFINE_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="pd-quick__item"
              disabled={!ready || busy}
              title={action.instruction}
              onClick={() => onSend(action.instruction, action.label, 'edit')}
            >
              {ACTION_ICONS[action.id]} {action.label}
            </button>
          ))}
          <button
            type="button"
            className="pd-quick__item"
            disabled={!ready || busy}
            title={text ? `Redraw from scratch: ${text}` : 'Redraw from scratch with a clearly different look (type a direction first to steer it)'}
            onClick={() => send('redesign')}
          >
            <PaintBrush size={14} /> Redesign
          </button>
        </div>
        <button
          type="button"
          className="pd-quick__wide"
          disabled={!ready || busy}
          title={text ? `Design the animation: ${text}` : 'The AI designs how the elements come in, one idea per click. The drawing stays as it is.'}
          onClick={() => send('animate')}
        >
          <Play size={14} weight="fill" />
          <span>
            <strong>{scope === 'current' ? 'Animate this slide' : scope === 'all' ? `Animate all ${count} slides` : count > 0 ? `Animate ${count} slides` : 'Animate slides'}</strong>
            <em>{text ? 'Uses your instruction as the direction' : 'The AI designs the motion; the drawing stays as it is'}</em>
          </span>
        </button>
      </section>

      {children}
    </div>
  );
};
