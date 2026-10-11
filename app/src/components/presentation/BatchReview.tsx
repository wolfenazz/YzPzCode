import React, { useState } from 'react';
import { ArrowClockwise, ArrowRight, Check, Stop, WarningCircle, X } from '@phosphor-icons/react';
import type { SlideProposal } from './useDesignGenerator';
import { SvgSlide } from './SvgSlide';

export interface BatchItem {
  slideId: string;
  /** Position in the deck (0-based). */
  index: number;
  title: string;
  /** The slide as it was when the request started: a change is only kept over this. */
  baseSvg: string;
  status: 'queued' | 'running' | 'ready' | 'failed';
  proposal: SlideProposal | null;
  error: string | null;
  keep: boolean;
}

/** One instruction changing several slides, reviewed together. */
export interface Batch {
  kind: 'edit' | 'redesign';
  label: string;
  /** What the AI is told (kept for Try again). */
  instruction: string;
  /** What the request was, in words for the panel. */
  shown: string;
  items: BatchItem[];
  running: boolean;
}

interface BatchReviewProps {
  batch: Batch;
  canvas: { width: number; height: number };
  resolveHref: (href: string) => string;
  onToggle: (slideId: string) => void;
  onAll: (keep: boolean) => void;
  onKeep: () => void;
  onDiscard: () => void;
  onRetry: () => void;
  onStop: () => void;
}

const PREVIEW = 118;

const statusText = (item: BatchItem): string => (item.status === 'queued' ? 'Waiting' : item.status === 'running' ? 'Working…' : item.status === 'ready' ? 'Ready' : item.error ?? 'Failed');

/** Before / after for every slide of a batch, with a choice of which changes to keep. */
export const BatchReview: React.FC<BatchReviewProps> = ({ batch, canvas, resolveHref, onToggle, onAll, onKeep, onDiscard, onRetry, onStop }) => {
  const [open, setOpen] = useState<string | null>(null);
  const total = batch.items.length;
  const ready = batch.items.filter((item) => item.status === 'ready');
  const failed = batch.items.filter((item) => item.status === 'failed');
  const kept = ready.filter((item) => item.keep).length;
  const finished = ready.length + failed.length;

  return (
    <div className="pd-panel pd-batch">
      <div className="pd-batch__head">
        <div>
          <strong>{batch.kind === 'redesign' ? 'Redesigning' : 'Editing'} {total} slide{total === 1 ? '' : 's'}</strong>
          <span>{batch.running ? `${finished} of ${total} done` : `${ready.length} of ${total} ready${failed.length > 0 ? ` · ${failed.length} failed` : ''}`}</span>
        </div>
        {batch.running && <button type="button" className="pr-btn pr-btn--sm" onClick={onStop}><Stop size={12} weight="fill" /> Stop</button>}
      </div>
      <div className="pd-batch__bar" aria-hidden="true"><span style={{ width: `${(finished / Math.max(1, total)) * 100}%` }} /></div>
      <p className="pd-batch__ask" title={batch.shown}>{batch.kind === 'redesign' ? 'Redesign' : batch.label === 'Your change' ? 'Change' : batch.label}{batch.shown && batch.shown !== batch.label ? `: ${batch.shown}` : ''}</p>

      {ready.length > 1 && (
        <div className="pd-batch__all">
          <button type="button" className="pd-linkbtn" onClick={() => onAll(true)}>Keep all</button>
          <button type="button" className="pd-linkbtn" onClick={() => onAll(false)}>Keep none</button>
        </div>
      )}

      <ul className="pd-batch__list">
        {batch.items.map((item) => {
          const expanded = open === item.slideId && item.proposal;
          return (
            <li key={item.slideId} className="pd-batch__row" data-status={item.status} data-keep={(item.keep && item.status === 'ready') || undefined}>
              <div className="pd-batch__title">
                <button
                  type="button"
                  className="pd-batch__check"
                  role="checkbox"
                  aria-checked={item.keep && item.status === 'ready'}
                  aria-label={`Keep the change to slide ${item.index + 1}`}
                  disabled={item.status !== 'ready'}
                  onClick={() => onToggle(item.slideId)}
                >
                  {item.keep && item.status === 'ready' && <Check size={10} weight="bold" />}
                </button>
                <span className="pd-batch__num">{item.index + 1}</span>
                <span className="pd-batch__name">{item.title || 'Slide'}</span>
                <span className="pd-batch__state" data-status={item.status}>
                  {item.status === 'failed' && <WarningCircle size={11} />}
                  {item.status === 'running' && <span className="pd-run__dot" />}
                  {item.status === 'failed' ? 'Failed' : statusText(item)}
                </span>
              </div>
              {item.status === 'failed' ? (
                <p className="pd-batch__error">{item.error}</p>
              ) : (
                <button type="button" className="pd-batch__pair" disabled={!item.proposal} onClick={() => setOpen(expanded ? null : item.slideId)} title={item.proposal ? (expanded ? 'Smaller' : 'Look closer') : undefined}>
                  <span className="pd-batch__col">
                    <span className="pd-batch__shot">
                      <SvgSlide svg={item.baseSvg} width={expanded ? 262 : PREVIEW} canvas={canvas} resolveHref={resolveHref} />
                    </span>
                    <em>Before</em>
                  </span>
                  {!expanded && <ArrowRight size={12} className="pd-batch__arrow" />}
                  <span className="pd-batch__col">
                    <span className="pd-batch__shot" data-busy={!item.proposal || undefined}>
                      <SvgSlide svg={item.proposal?.svg ?? ''} width={expanded ? 262 : PREVIEW} canvas={canvas} resolveHref={resolveHref} placeholder={{ title: item.title, busy: true }} />
                    </span>
                    <em>After</em>
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="pd-batch__actions">
        {!batch.running && failed.length > 0 && <button type="button" className="pr-btn pr-btn--sm" onClick={onRetry}><ArrowClockwise size={12} /> Try {failed.length} again</button>}
        <button type="button" className="pr-btn pr-btn--sm" onClick={onDiscard}><X size={12} /> {batch.running ? 'Cancel' : 'Discard'}</button>
        <button type="button" className="pr-btn pr-btn--sm pr-btn--primary" disabled={kept === 0} onClick={onKeep}>
          <Check size={12} weight="bold" /> Keep {kept > 0 ? kept : ''}{batch.running && kept > 0 ? ' so far' : ''}
        </button>
      </div>
      <p className="pr-hint">Nothing changes until you keep it; one Undo takes every kept change back.</p>
    </div>
  );
};
