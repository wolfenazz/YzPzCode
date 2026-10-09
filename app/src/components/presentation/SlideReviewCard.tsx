import React from 'react';
import { ArrowClockwise, ArrowRight, Check, X } from '@phosphor-icons/react';
import LatticeLoader from '../reactbits/LatticeLoader';
import FuseButton from '../reactbits/FuseButton';
import type { PlanContext } from '../../utils/presentation/render';
import { formatDuration, slideSeconds } from '../../utils/presentation/timing';
import type { Slide } from '../../utils/presentation/types';
import { SlideRenderer } from './SlideRenderer';

export interface SlideReview {
  label: string;
  instruction?: string;
  status: 'running' | 'done' | 'failed';
  error: string | null;
  /** Deck slides (designed decks). */
  before: Slide[];
  after: Slide[];
  /** Image prompts are reviewed as text. */
  mode?: 'slides' | 'prompts';
  /** Plain-text before/after (original-design decks). */
  beforeText?: string[];
  afterText?: string[];
}

interface SlideReviewCardProps {
  review: SlideReview;
  context: PlanContext | null;
  resolveImage: (src: string) => string;
  onAccept: () => void;
  onUndoAccept: () => void;
  onSettled: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

const WIDTH = 236;

export const SlideReviewCard: React.FC<SlideReviewCardProps> = ({ review, context, resolveImage, onAccept, onUndoAccept, onSettled, onRetry, onDiscard }) => {
  const notesOnly = review.before.length > 0 && review.after.length === review.before.length
    && review.after.every((slide, index) => JSON.stringify(slide.slots) === JSON.stringify(review.before[index].slots) && slide.layout === review.before[index].layout);
  return (
    <div className="pr-review" role="dialog" aria-label="Review AI suggestion">
      <div className="pr-review__head">
        <div>
          <span className="pr-eyebrow">{review.label}</span>
          {review.instruction && <div className="pr-hint">“{review.instruction}”</div>}
        </div>
        <button type="button" className="pr-icon-btn" onClick={onDiscard} aria-label="Discard"><X size={15} /></button>
      </div>
      <div className="pr-review__body">
        {review.status === 'running' && (
          <div className="pr-review__loading">
            <LatticeLoader label={review.label} status="working" pattern="ripple" color="var(--accent)" fontSize={13} showTimer />
          </div>
        )}
        {review.status === 'failed' && <div className="pr-error">{review.error ?? 'The AI could not finish this.'}</div>}
        {review.status === 'done' && review.mode === 'prompts' && (
          <div className="pr-review__notes">
            {review.after.map((slide, index) => {
              const image = Object.values(slide.slots).find((block) => block.type === 'image');
              const prompt = image?.type === 'image' ? image.prompt : '';
              return (
                <div key={slide.id}>
                  <div className="pr-label">Slide {index + 1}{image?.type === 'image' && image.alt ? ` · ${image.alt}` : ''}</div>
                  <p>{prompt || '—'}</p>
                </div>
              );
            })}
          </div>
        )}
        {review.status === 'done' && review.mode !== 'prompts' && context && review.after.length > 0 && (
          notesOnly ? (
            <div className="pr-review__notes">
              {review.after.map((slide, index) => (
                <div key={slide.id}>
                  <div className="pr-label">Slide {index + 1} notes · about {formatDuration(slideSeconds(slide))}</div>
                  <p>{slide.notes || '—'}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="pr-review__pairs">
              <div className="pr-review__col">
                <div className="pr-label">Before</div>
                {review.before.map((slide, index) => (
                  <SlideRenderer key={slide.id} context={context} slide={slide} index={index} width={WIDTH} resolveImage={resolveImage} />
                ))}
              </div>
              <ArrowRight size={16} className="pr-review__arrow" />
              <div className="pr-review__col">
                <div className="pr-label">After</div>
                {review.after.map((slide, index) => (
                  <SlideRenderer key={`${slide.id}:${index}`} context={context} slide={slide} index={index} width={WIDTH} resolveImage={resolveImage} />
                ))}
              </div>
            </div>
          )
        )}
        {review.status === 'done' && review.afterText && (
          <div className="pr-review__text">
            {review.afterText.map((text, index) => (
              <div key={index} className="pr-review__text-pair">
                <div className="pr-review__before">{review.beforeText?.[index] ?? ''}</div>
                <div className="pr-review__after">{text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="pr-review__foot">
        {review.status === 'failed' ? (
          <button type="button" className="pr-btn" onClick={onRetry}><ArrowClockwise size={14} /> Try again</button>
        ) : (
          <>
            <button type="button" className="pr-btn" onClick={onRetry} disabled={review.status === 'running'}><ArrowClockwise size={14} /> Another version</button>
            <FuseButton
              label="Accept"
              undoLabel="Undo"
              doneLabel="Applied"
              icon={<Check size={14} weight="bold" />}
              background="var(--accent)"
              color="var(--bg-primary)"
              fuseColor="var(--bg-primary)"
              size="sm"
              radius={8}
              undoWindow={4000}
              disabled={review.status !== 'done'}
              onCommit={onAccept}
              onUndo={onUndoAccept}
              onFuseEnd={onSettled}
            />
          </>
        )}
      </div>
    </div>
  );
};
