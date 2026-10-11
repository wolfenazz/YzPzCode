import { useEffect, useRef } from 'react';
import type { ChangeEvent, MouseEvent, ReactElement, SyntheticEvent } from 'react';
import { CircleNotch, Play, Stop } from '@phosphor-icons/react';
import { useTtsPlayback } from '../../hooks/useTtsPlayback';
import { TTS_SPEEDS, useTtsStore } from '../../stores/ttsStore';
import { isTtsOverLimit, needsTtsChunkNote, ttsBilingual, ttsDirForText } from '../../utils/tts/strings';
import type { TtsSpeed } from '../../utils/tts/types';

export interface NarrateButtonProps {
  /** Text to narrate (slide notes, report selection, section body). */
  text: string;
  slideId?: string;
  disabled?: boolean;
  title?: string;
  variant?: 'default' | 'compact';
  onToast?: (message: string) => void;
}

/**
 * Play/Stop narration for a unit of text, with a speed menu.
 *
 * USAGE: render inside a plain `div` row (e.g. the `.pr-notes__head` row or the
 * slideshow bar) — NEVER inside a `<button>`, nested buttons are invalid HTML
 * and break clicks. The wrapper absorbs mouse/keyboard events
 * (`stopPropagation` on mousedown/click/keydown) so slideshow advance
 * (click-to-next) and editor shortcuts ignore interactions with this control.
 * Playback auto-stops when `slideId` changes or this component unmounts.
 */
export function NarrateButton({
  text,
  slideId,
  disabled,
  title,
  variant,
  onToast,
}: NarrateButtonProps): ReactElement {
  const { status, progress, errorMsg, speak, stop, audioRef } = useTtsPlayback();
  const speed = useTtsStore((state) => state.speed);
  const setSpeed = useTtsStore((state) => state.setSpeed);
  const lastToasted = useRef<string | null>(null);

  const busy: boolean = status === 'preparing' || status === 'synthesizing' || status === 'playing';
  const empty: boolean = !text.trim();
  // 6000-char backend ceiling: refuse in the UI with a bilingual tooltip
  // instead of a backend round-trip (see tts/bridge.rs MAX_TEXT_CHARS).
  const overLimit: boolean = isTtsOverLimit(text);
  const showChunkHint: boolean = needsTtsChunkNote(text);
  const effectiveDisabled: boolean = Boolean(disabled) || empty || overLimit;
  const compact: boolean = variant === 'compact';
  // dir="auto" on the control so bilingual EN/AR tooltips and AT read
  // correctly; layout itself stays logical (flex + gap + rtl: icon flip).
  const dir: 'rtl' | 'ltr' = ttsDirForText(text);

  // Surface hook errors once each through the host toast surface.
  useEffect(() => {
    if (!errorMsg) {
      // Re-arm: the same failure on a retry must be reported again.
      lastToasted.current = null;
      return;
    }
    if (errorMsg !== lastToasted.current) {
      lastToasted.current = errorMsg;
      onToast?.(errorMsg);
    }
  }, [errorMsg, onToast]);

  // Auto-stop when the bound slide changes (cleanup of the previous id). Only
  // when this button is the one narrating: `stop()` halts the shared audio, and
  // must not cut off narration another control (e.g. presenter autoplay) just
  // started for the new slide.
  const busyRef = useRef<boolean>(false);
  busyRef.current = busy;
  useEffect(() => {
    return () => {
      if (busyRef.current) stop();
    };
  }, [slideId, stop]);

  // Absorb events so slideshow click-to-advance and editor shortcuts ignore us.
  const absorb = (event: SyntheticEvent): void => {
    event.stopPropagation();
  };

  const handleToggle = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (busy) {
      stop();
      return;
    }
    if (effectiveDisabled) return;
    void speak(text, { slideId });
  };

  const handleSpeed = (event: ChangeEvent<HTMLSelectElement>): void => {
    event.stopPropagation();
    const next = Number(event.target.value) as TtsSpeed;
    if (next === 0.75 || next === 1 || next === 1.25) {
      setSpeed(next);
      const audio: HTMLAudioElement | null = audioRef.current;
      if (audio && !audio.paused) audio.playbackRate = next;
    }
  };

  const label: string = busy
    ? 'Stop narration · إيقاف السرد'
    : empty
      ? ttsBilingual('emptyNotes')
      : overLimit
        ? ttsBilingual('tooLong')
        : showChunkHint
          ? `${title ?? 'Narrate with local TTS · سرد محلي'} — ${ttsBilingual('chunkNote')}`
          : (title ? `${title} · سرد محلي` : 'Narrate with local TTS · سرد محلي');

  return (
    <div
      className="inline-flex shrink-0 items-center gap-1.5"
      dir={dir}
      onMouseDown={absorb}
      onClick={absorb}
      onKeyDown={absorb}
    >
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={busy}
        disabled={effectiveDisabled}
        onClick={handleToggle}
        className="inline-flex h-7 min-w-7 cursor-pointer items-center justify-center gap-1 rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1.5 text-[11px] font-medium text-[var(--text-primary)] tabular-nums hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-default disabled:opacity-35"
      >
        {status === 'preparing' || status === 'synthesizing' ? (
          <CircleNotch size={14} className="animate-spin" aria-hidden="true" />
        ) : status === 'playing' ? (
          <Stop size={14} weight="fill" aria-hidden="true" />
        ) : (
          <Play size={14} weight="fill" aria-hidden="true" className="rtl:-scale-x-100" />
        )}
        {!compact && (
          <span aria-live="polite">
            {status === 'playing'
              ? 'Stop'
              : status === 'preparing' || status === 'synthesizing'
                ? Math.round(progress) + '%'
                : 'Narrate'}
          </span>
        )}
      </button>
      {!compact && (
        <label className="inline-flex h-7 items-center">
          <span className="sr-only">Narration speed</span>
          <select
            value={speed}
            onChange={handleSpeed}
            aria-label="Narration speed"
            className="h-6 cursor-pointer rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 text-[11px] text-[var(--text-primary)] tabular-nums focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            {TTS_SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}x
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
