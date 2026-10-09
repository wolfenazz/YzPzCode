import React from 'react';
import { ArrowClockwise, Check, X } from '@phosphor-icons/react';
import LatticeLoader from '../reactbits/LatticeLoader';
import FuseButton from '../reactbits/FuseButton';
import { lintText } from '../../utils/writing/humanizer';
import { REWRITE_ACTIONS, type RewriteAction } from '../../utils/writing/prompts';

export interface ReviewState {
  action: RewriteAction;
  instruction?: string;
  before: string;
  after: string;
  status: 'running' | 'done' | 'failed';
  error: string | null;
}

interface ReviewCardProps {
  review: ReviewState;
  bannedPhrases: string[];
  onAccept: () => void;
  onUndoAccept: () => void;
  /** The undo window closed: the change is final. */
  onSettled: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

const plain = (markdown: string): string => markdown.replace(/^#+\s+/gm, '').replace(/\*\*|__|\*|`/g, '').replace(/\[(@[^\]]+)\]/g, '[$1]');

export const ReviewCard: React.FC<ReviewCardProps> = ({ review, bannedPhrases, onAccept, onUndoAccept, onSettled, onRetry, onDiscard }) => {
  const label = review.action === 'custom' ? 'Your instruction' : REWRITE_ACTIONS.find((entry) => entry.id === review.action)?.label ?? 'Rewrite';
  const beforeScore = lintText(review.before, bannedPhrases).score;
  const afterScore = review.after ? lintText(plain(review.after), bannedPhrases).score : null;

  return (
    <div className="wr-review" role="dialog" aria-label="Review AI suggestion">
      <div className="wr-bezel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="wr-bezel__core">
          <div className="wr-review__head">
            <div>
              <span className="wr-eyebrow">{label}</span>
              {review.instruction && <div className="wr-field__hint" style={{ marginTop: 6 }}>“{review.instruction}”</div>}
            </div>
            <button type="button" className="wr-icon-btn" onClick={onDiscard} aria-label="Discard"><X size={15} /></button>
          </div>
          <div className="wr-review__body">
            {review.action !== 'continue' && (
              <>
                <div className="wr-review__label">Before · naturalness {beforeScore}</div>
                <div className="wr-review__before">{review.before}</div>
              </>
            )}
            <div className="wr-review__label">
              {review.action === 'continue' ? 'New text' : 'After'}{afterScore !== null && review.status === 'done' ? ` · naturalness ${afterScore}` : ''}
            </div>
            {review.status === 'running' && !review.after && (
              <LatticeLoader label="Rewriting" status="working" pattern="ripple" color="var(--wr-gold)" fontSize={13} showTimer />
            )}
            {review.after && <div className="wr-review__after">{plain(review.after)}</div>}
            {review.status === 'failed' && <div className="wr-ai__error">{review.error ?? 'The rewrite failed.'}</div>}
          </div>
          <div className="wr-review__foot">
            {review.status === 'failed' ? (
              <button type="button" className="wr-pill-btn" onClick={onRetry}><ArrowClockwise size={14} /> Try again</button>
            ) : (
              <>
                <button type="button" className="wr-pill-btn" onClick={onRetry} disabled={review.status === 'running'}><ArrowClockwise size={14} /> Another version</button>
                <FuseButton
                  label={review.action === 'continue' ? 'Insert' : 'Accept'}
                  undoLabel="Undo"
                  doneLabel="Applied"
                  icon={<Check size={14} weight="bold" />}
                  background="var(--wr-gold)"
                  color="#1b1408"
                  fuseColor="#1b1408"
                  size="sm"
                  radius={999}
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
      </div>
    </div>
  );
};
