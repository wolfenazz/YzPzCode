import React, { useEffect } from 'react';
import { X } from '@phosphor-icons/react';
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
  onRetry: () => void;
  onDiscard: () => void;
}

const plain = (markdown: string): string => markdown.replace(/^#+\s+/gm, '').replace(/\*\*|__|\*|`/g, '').replace(/\[(@[^\]]+)\]/g, '[$1]');

/** An AI change waiting for a decision: before and after, then accept or discard. */
export const ReviewCard: React.FC<ReviewCardProps> = ({ review, bannedPhrases, onAccept, onRetry, onDiscard }) => {
  const label = review.action === 'custom' ? 'Your instruction' : REWRITE_ACTIONS.find((entry) => entry.id === review.action)?.label ?? 'Rewrite';
  const beforeScore = review.before ? lintText(review.before, bannedPhrases).score : null;
  const afterScore = review.after && review.status === 'done' ? lintText(plain(review.after), bannedPhrases).score : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDiscard();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && review.status === 'done') {
        // Stopped here, it never reaches the editor (where Ctrl+Enter is a page break).
        event.preventDefault();
        event.stopPropagation();
        onAccept();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onAccept, onDiscard, review.status]);

  return (
    <div className="wr-review" role="dialog" aria-label="Review the suggestion">
      <div className="wr-review__head">
        <div>
          <div className="wr-review__title">{label}</div>
          {review.instruction && <div className="wr-note">“{review.instruction}”</div>}
        </div>
        <button type="button" className="wr-icon" onClick={onDiscard} aria-label="Discard"><X size={13} /></button>
      </div>
      <div className="wr-review__body">
        {review.action !== 'continue' && (
          <div className="wr-review__block">
            <div className="wr-review__label">Before{beforeScore !== null ? ` · naturalness ${beforeScore}` : ''}</div>
            <div className="wr-review__text is-before">{review.before}</div>
          </div>
        )}
        <div className="wr-review__block">
          <div className="wr-review__label">{review.action === 'continue' ? 'New text' : 'After'}{afterScore !== null ? ` · naturalness ${afterScore}` : ''}</div>
          {review.status === 'running' && !review.after && <p className="wr-note"><span className="wr-pulse" aria-hidden="true" /> Writing…</p>}
          {review.after && <div className="wr-review__text">{plain(review.after)}</div>}
          {review.status === 'failed' && <p className="wr-note is-error">{review.error ?? 'The rewrite failed.'}</p>}
        </div>
      </div>
      <div className="wr-review__foot">
        <button type="button" className="wr-btn wr-btn--sm" onClick={onRetry} disabled={review.status === 'running'}>{review.status === 'failed' ? 'Try again' : 'Another version'}</button>
        <span className="wr-spacer" />
        <button type="button" className="wr-btn wr-btn--sm" onClick={onDiscard}>Discard</button>
        <button type="button" className="wr-btn wr-btn--sm wr-btn--primary" onClick={onAccept} disabled={review.status !== 'done'} title="Ctrl+Enter">
          {review.action === 'continue' ? 'Insert' : 'Accept'}
        </button>
      </div>
    </div>
  );
};
