import type { ReactElement } from 'react';
import { CheckCircle, CircleNotch, Clock, DownloadSimple, Warning } from '@phosphor-icons/react';
import { usePrewarmStatus } from '../../utils/tts/prewarm';
import type { SlideVoiceState } from '../../utils/tts/prewarm';

const STATE_LABEL: Record<SlideVoiceState, string> = {
  waiting: 'Waiting',
  preparing: 'Preparing…',
  ready: 'Ready',
  failed: 'Failed',
  needsVoice: 'Voice not downloaded',
  tooLong: 'Too long to narrate',
};

/**
 * Compact progress of the background narration for the open presentation:
 * how many slides' notes are already audio. Sits in the speaker-notes row;
 * pressing it opens the voice list with the per-slide detail.
 */
export function NarrationChip({ onOpen }: { onOpen: () => void }): ReactElement | null {
  const phase = usePrewarmStatus((state) => state.phase);
  const total = usePrewarmStatus((state) => state.total);
  const ready = usePrewarmStatus((state) => state.ready);
  const message = usePrewarmStatus((state) => state.message);
  if (phase === 'idle' || total === 0) return null;

  const allReady: boolean = ready === total;
  const percent: number = Math.round((ready / total) * 100);
  let tone: 'busy' | 'ok' | 'warn' | 'idle' = 'idle';
  let label: string;
  let icon: ReactElement;
  if (allReady) {
    tone = 'ok';
    label = total === 1 ? 'Voice ready' : 'All voices ready';
    icon = <CheckCircle size={13} weight="fill" aria-hidden="true" />;
  } else if (phase === 'blocked') {
    tone = 'warn';
    label = 'Voice needed';
    icon = <DownloadSimple size={13} aria-hidden="true" />;
  } else if (phase === 'failed') {
    tone = 'warn';
    label = ready + '/' + total + ' ready';
    icon = <Warning size={13} weight="fill" aria-hidden="true" />;
  } else if (phase === 'scheduled') {
    label = ready + '/' + total + ' voices';
    icon = <Clock size={13} aria-hidden="true" />;
  } else {
    tone = 'busy';
    label = ready + '/' + total + ' voices';
    icon = <CircleNotch size={13} className="animate-spin" aria-hidden="true" />;
  }

  const title: string =
    'Speaker-note narration: ' + ready + ' of ' + total + ' slides ready' + (message ? '. ' + message : '.');

  return (
    <button
      type="button"
      className="pr-notes__status"
      data-tone={tone}
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {icon}
      <span className="pr-notes__status-label">{label}</span>
      {!allReady && (
        <span className="pr-notes__status-bar" aria-hidden="true">
          <span style={{ width: percent + '%' }} />
        </span>
      )}
    </button>
  );
}

/** Per-slide narration state for the open presentation, shown inside the voice popover. */
export function NarrationSlideList({
  slides,
}: {
  slides: ReadonlyArray<{ id: string }> | null | undefined;
}): ReactElement | null {
  const states = usePrewarmStatus((state) => state.slides);
  const phase = usePrewarmStatus((state) => state.phase);
  const total = usePrewarmStatus((state) => state.total);
  const ready = usePrewarmStatus((state) => state.ready);
  const message = usePrewarmStatus((state) => state.message);
  if (!slides || phase === 'idle' || total === 0) return null;

  const rows: Array<{ id: string; number: number; state: SlideVoiceState }> = [];
  slides.forEach((slide, index) => {
    const state: SlideVoiceState | undefined = states[slide.id];
    if (state) rows.push({ id: slide.id, number: index + 1, state });
  });
  if (rows.length === 0) return null;

  return (
    <section className="pr-voices" aria-label="Narration progress">
      <div className="pr-voices__head">
        <span>This presentation</span>
        <span className="pr-voices__count">
          {ready} of {total} ready
        </span>
      </div>
      {message && <p className="pr-voices__note">{message}</p>}
      <ul className="pr-voices__list">
        {rows.map((row) => (
          <li key={row.id} className="pr-voices__row" data-state={row.state}>
            <span>Slide {row.number}</span>
            <span className="pr-voices__state">
              {row.state === 'preparing' && <CircleNotch size={11} className="animate-spin" aria-hidden="true" />}
              {row.state === 'ready' && <CheckCircle size={11} weight="fill" aria-hidden="true" />}
              {STATE_LABEL[row.state]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
