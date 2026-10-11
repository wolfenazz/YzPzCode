import React from 'react';
import { ArrowLeft, Stop } from '@phosphor-icons/react';
import './studio.css';

export interface StudioSaveState {
  text: string;
  state: 'saved' | 'unsaved' | 'saving' | 'error';
  title?: string;
}

export interface StudioRun {
  /** What is happening, e.g. "Drawing slides". */
  label: string;
  /** The part of the label that names the current item. */
  detail?: string;
  elapsed?: string;
  /** 0 to 1, or null while the length of the run is not known. */
  progress: number | null;
  onStop: () => void;
}

interface StudioTopBarProps {
  backLabel: string;
  onBack: () => void;
  title: string;
  titlePlaceholder?: string;
  onTitle: (title: string) => void;
  /** The line under the title: what kind of document, how big. */
  meta?: React.ReactNode;
  save: StudioSaveState;
  run?: StudioRun | null;
  /** Actions at the right edge. */
  children?: React.ReactNode;
}

/** The bar on top of a studio: where you are, what it is called, what is running, what you can do. */
export const StudioTopBar: React.FC<StudioTopBarProps> = ({ backLabel, onBack, title, titlePlaceholder, onTitle, meta, save, run, children }) => (
  <header className="sx-bar">
    <div className="sx-bar__lead">
      <button type="button" className="sx-bar__back" onClick={onBack} title={`Back to ${backLabel.toLowerCase()}`}>
        <ArrowLeft size={14} />
        <span>{backLabel}</span>
      </button>
      <span className="sx-bar__rule" aria-hidden="true" />
      <div className="sx-bar__doc">
        <input
          className="sx-bar__title"
          value={title}
          placeholder={titlePlaceholder ?? 'Untitled'}
          aria-label="Title"
          size={Math.max(8, Math.min(48, (title || titlePlaceholder || 'Untitled').length + 1))}
          onChange={(event) => onTitle(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          }}
        />
        <div className="sx-bar__meta">
          {meta}
          {meta && <span className="sx-bar__dot" aria-hidden="true" />}
          <span className="sx-bar__save" data-state={save.state} title={save.title}>{save.text}</span>
        </div>
      </div>
    </div>

    {run && (
      <div className="sx-run" role="status">
        <span className="sx-run__label"><strong>{run.label}</strong>{run.detail ? ` · ${run.detail}` : ''}</span>
        {run.elapsed && <span className="sx-run__time">{run.elapsed}</span>}
        <button type="button" className="sx-btn sx-btn--sm sx-btn--quiet" onClick={run.onStop}><Stop size={11} weight="fill" /> Stop</button>
      </div>
    )}

    <div className="sx-bar__tail">{children}</div>

    {run && (
      <div className="sx-bar__progress" data-indeterminate={run.progress === null || undefined} aria-hidden="true">
        <span style={run.progress === null ? undefined : { width: `${Math.round(Math.max(0.02, Math.min(1, run.progress)) * 100)}%` }} />
      </div>
    )}
  </header>
);

/** A thin rule between groups of bar actions. */
export const BarSeparator: React.FC = () => <span className="sx-bar__sep" aria-hidden="true" />;
