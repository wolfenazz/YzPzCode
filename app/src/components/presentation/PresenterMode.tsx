import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ArrowCounterClockwise, CaretDown, CaretLeft, CaretRight, Minus, Monitor, Plus, Presentation, X } from '@phosphor-icons/react';
import { formatDuration } from '../../utils/presentation/timing';
import type { SlideTransition } from '../../utils/presentation/types';
import { useTtsPlayback } from '../../hooks/useTtsPlayback';
import { useTtsStore } from '../../stores/ttsStore';
import { ttsBilingual } from '../../utils/tts/strings';
import { NarrateButton } from '../tts/NarrateButton';
import { TtsModelPicker } from '../tts/TtsModelPicker';

/** What the slideshow needs of a slide; layout decks and designed decks both fit. */
export interface PresentableSlide {
  id: string;
  hidden?: boolean;
  notes: string;
}

interface PresenterModeProps<T extends PresentableSlide> {
  slides: T[];
  /** The slide's natural size in px (only the aspect ratio matters). */
  aspect: { width: number; height: number };
  transition: SlideTransition;
  /** Id of the slide to start on (hidden slides are skipped). */
  startId: string | null;
  /** `revealed` is how many animation clicks of the slide have been played (all of them for a slide that is not the one being shown). */
  renderSlide: (slide: T, width: number, revealed: number) => React.ReactNode;
  /** Animation clicks a slide has before the next slide comes (0 or unset: none). */
  stepsOf?: (slide: T) => number;
  /** Planned seconds on a slide, for the pace indicator. */
  seconds: (slide: T) => number;
  onExit: (lastId: string | null) => void;
  /** Optional host toast surface for narration errors (falls back to inline error). */
  onToast?: (message: string) => void;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P']);

function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Fullscreen slideshow with a presenter view (notes, next slide, timer). */
export function PresenterMode<T extends PresentableSlide>({ slides, aspect, transition, startId, renderSlide, stepsOf: slideSteps, seconds: slideSeconds, onExit, onToast }: PresenterModeProps<T>): React.ReactPortal {
  const visible = useMemo(() => slides.filter((slide) => !slide.hidden), [slides]);
  const [index, setIndex] = useState(() => Math.max(0, visible.findIndex((slide) => slide.id === startId)));
  const [direction, setDirection] = useState(1);
  const [revealed, setRevealed] = useState(0);
  const [presenter, setPresenter] = useState(false);
  const [blank, setBlank] = useState<'black' | 'white' | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [notesSize, setNotesSize] = useState(20);
  const [controls, setControls] = useState(true);
  const typed = useRef('');
  /** When the last digit was typed: number-jump buffers expire after 3 seconds. */
  const typedAt = useRef(0);
  const hideTimer = useRef<number | null>(null);
  const wasFullscreen = useRef<boolean | null>(null);
  const viewport = useViewport();
  const now = useNow(true);
  const current = visible[index] ?? null;
  const next = visible[index + 1] ?? null;
  const stepsOf = useCallback((slide: T | null): number => (slide && slideSteps ? slideSteps(slide) : 0), [slideSteps]);
  const currentSteps = stepsOf(current);

  // Local TTS narration (Task 5): one hook for the R shortcut + autoplay +
  // stop-on-navigate. The bar/notes NarrateButtons own their own hook
  // instances driving the same shared <audio> element, so stopping here
  // always halts any narration and each button self-corrects on slide change
  // via its slideId cleanup.
  const { status: ttsStatus, errorMsg: ttsErrorMsg, speak, stop: stopTts } = useTtsPlayback();
  const autoplayInPresenter = useTtsStore((state) => state.autoplayInPresenter);
  const setAutoplayInPresenter = useTtsStore((state) => state.setAutoplayInPresenter);
  const [modelsOpen, setModelsOpen] = useState<boolean>(false);
  const [ttsInlineError, setTtsInlineError] = useState<string | null>(null);

  const notifyTts = useCallback((message: string): void => {
    if (onToast) onToast(message);
    else setTtsInlineError(message);
  }, [onToast]);

  useEffect(() => {
    if (ttsErrorMsg) notifyTts(ttsErrorMsg);
  }, [ttsErrorMsg, notifyTts]);

  const currentNotes: string = current?.notes ?? '';
  const currentId: string | null = current?.id ?? null;
  const hasNotes: boolean = currentNotes.trim().length > 0;
  const ttsBusy: boolean = ttsStatus === 'preparing' || ttsStatus === 'synthesizing' || ttsStatus === 'playing';

  const toggleNarration = useCallback((): void => {
    if (ttsBusy) {
      stopTts();
      return;
    }
    if (!current || !hasNotes) {
      notifyTts(ttsBilingual('emptyNotes'));
      return;
    }
    setTtsInlineError(null);
    void speak(currentNotes, { slideId: current.id });
  }, [ttsBusy, current, hasNotes, currentNotes, speak, stopTts, notifyTts]);

  const absorbTts = useCallback((event: SyntheticEvent): void => {
    event.stopPropagation();
  }, []);

  const exit = useCallback(() => {
    stopTts();
    setModelsOpen(false);
    onExit(current?.id ?? null);
  }, [current, onExit, stopTts]);

  // Fullscreen for the whole window while presenting; restored on exit.
  useEffect(() => {
    const window_ = getCurrentWindow();
    // Record synchronously so the cleanup below never sees a null first value
    // (the async read only corrects this when the window was already fullscreen).
    wasFullscreen.current = false;
    let alive = true;
    void window_.isFullscreen().then((value) => {
      if (!alive) return;
      wasFullscreen.current = value;
    }).catch(() => undefined);
    void window_.setFullscreen(true).catch(() => undefined);
    return () => {
      alive = false;
      if (wasFullscreen.current === false) void window_.setFullscreen(false).catch(() => undefined);
    };
  }, []);

  const go = useCallback((target: number) => {
    stopTts();
    setBlank(null);
    const clamped = Math.max(0, Math.min(visible.length - 1, target));
    if (clamped === index) return;
    setDirection(clamped >= index ? 1 : -1);
    // Coming back to a slide shows it as it ended; arriving forward starts it from the top.
    setRevealed(clamped < index ? stepsOf(visible[clamped] ?? null) : 0);
    setIndex(clamped);
  }, [index, visible, stepsOf, stopTts]);

  /** → / click / Space: the next animation click of the slide, else the next slide. */
  const advance = useCallback(() => {
    if (revealed < currentSteps) {
      stopTts();
      setRevealed(revealed + 1);
    } else go(index + 1);
  }, [currentSteps, go, index, revealed, stopTts]);

  /** ←: undoes the last animation click of the slide, else goes to the previous slide. */
  const back = useCallback(() => {
    if (revealed > 0) setRevealed(revealed - 1);
    else go(index - 1);
  }, [go, index, revealed]);

  const wake = useCallback(() => {
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 2400);
  }, []);

  useEffect(() => {
    wake();
    return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [wake]);

  // Always halt narration when the slideshow unmounts.
  useEffect(() => {
    return () => stopTts();
  }, [stopTts]);

  // Optional per-slide autoplay (default off, persisted). The go() stop above
  // halts the previous slide; this speaks the new one. Debounced so flipping
  // quickly through slides does not synthesize every one passed through.
  // Cleanup stops when the slide changes again or autoplay is toggled off mid-synthesis.
  useEffect(() => {
    if (!autoplayInPresenter) return;
    if (!current || current.notes.trim().length === 0) return;
    setTtsInlineError(null);
    const timer = window.setTimeout(() => {
      void speak(current.notes, { slideId: current.id });
    }, 600);
    return () => { window.clearTimeout(timer); stopTts(); };
  }, [autoplayInPresenter, current, speak, stopTts]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const { key } = event;
      const target = event.target as HTMLElement | null;
      const inTtsUi: boolean = Boolean(
        target && typeof target.closest === 'function' && target.closest('[data-tts-ui]'),
      );
      // Never steal Space/Enter/arrows from the narration controls themselves
      // (play button, speed select, model list, autoplay checkbox).
      if (inTtsUi && (key === ' ' || key === 'Enter' || key.startsWith('Arrow'))) return;
      if (/^[0-9]$/.test(key)) {
        // Only handled keys are stopped: anything else stays for the app.
        event.stopPropagation();
        typed.current = Date.now() - typedAt.current < 3000 ? `${typed.current}${key}`.slice(-3) : key;
        typedAt.current = Date.now();
        event.preventDefault();
        return;
      }
      if (key === 'Enter' && typed.current) {
        event.stopPropagation();
        event.preventDefault();
        go(Number(typed.current) - 1);
        typed.current = '';
        return;
      }
      typed.current = '';
      if (key === 'Escape') {
        event.stopPropagation();
        if (modelsOpen) { event.preventDefault(); setModelsOpen(false); }
        else { event.preventDefault(); exit(); }
      }
      else if (key === 'r' || key === 'R') { event.stopPropagation(); event.preventDefault(); toggleNarration(); }
      else if (NEXT_KEYS.has(key)) { event.stopPropagation(); event.preventDefault(); if (blank) setBlank(null); else advance(); }
      else if (PREV_KEYS.has(key)) { event.stopPropagation(); event.preventDefault(); if (blank) setBlank(null); else back(); }
      else if (key === 'Home') { event.stopPropagation(); event.preventDefault(); go(0); }
      else if (key === 'End') { event.stopPropagation(); event.preventDefault(); go(visible.length - 1); }
      else if (key === 'b' || key === 'B' || key === '.') { event.stopPropagation(); event.preventDefault(); setBlank((value) => (value === 'black' ? null : 'black')); }
      else if (key === 'w' || key === 'W' || key === ',') { event.stopPropagation(); event.preventDefault(); setBlank((value) => (value === 'white' ? null : 'white')); }
      else if (key === 's' || key === 'S') { event.stopPropagation(); event.preventDefault(); setPresenter((value) => !value); }
      else if (key === 't' || key === 'T') { event.stopPropagation(); event.preventDefault(); setStartedAt(Date.now()); setPausedAt(null); }
      else if (key === 'F5') { event.stopPropagation(); event.preventDefault(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [advance, back, blank, exit, go, modelsOpen, toggleNarration, visible.length]);

  const naturalWidth = aspect.width;
  const naturalHeight = aspect.height;
  const elapsed = Math.max(0, (pausedAt ?? now) - startedAt) / 1000;
  const planned = visible.slice(0, index + 1).reduce((sum, slide) => sum + slideSeconds(slide), 0);
  const total = visible.reduce((sum, slide) => sum + slideSeconds(slide), 0);
  const pace = elapsed - planned;

  const variants = transition === 'slide'
    ? { enter: (dir: number) => ({ x: `${dir * 100}%`, opacity: 1 }), center: { x: '0%', opacity: 1 }, exit: (dir: number) => ({ x: `${dir * -100}%`, opacity: 1 }) }
    : transition === 'fade'
      ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
      : { enter: { opacity: 1 }, center: { opacity: 1 }, exit: { opacity: 1 } };
  const duration = transition === 'none' ? 0 : transition === 'slide' ? 0.45 : 0.35;

  const stage = (slide: T | null, width: number, animate: boolean): React.JSX.Element => (
    <div className="pr-show__stage" style={{ width, height: (width / naturalWidth) * naturalHeight }}>
      <AnimatePresence initial={false} custom={direction} mode={transition === 'slide' ? 'sync' : 'sync'}>
        {slide && (
          <motion.div
            key={slide.id}
            className="pr-show__frame"
            custom={direction}
            variants={animate ? variants : undefined}
            initial={animate ? 'enter' : false}
            animate="center"
            exit={animate ? 'exit' : undefined}
            transition={{ duration, ease: [0.32, 0.72, 0, 1] }}
          >
            {renderSlide(slide, width, slide === current ? revealed : stepsOf(slide))}
          </motion.div>
        )}
      </AnimatePresence>
      {blank && <div className="pr-show__blank" style={{ background: blank === 'black' ? '#000' : '#fff' }} />}
    </div>
  );

  const audienceWidth = Math.min(viewport.width, (viewport.height * naturalWidth) / naturalHeight);

  // Nothing to show: every slide is hidden. Navigation is blocked until one is shown again.
  if (visible.length === 0) {
    return createPortal(
      <div className="pr-show" role="dialog" aria-label="Slideshow">
        <div className="pr-show__end">
          <strong>All slides are hidden</strong>
          <p>Show at least one slide to present.</p>
          <button type="button" className="pr-show__btn" onClick={exit}>End</button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="pr-show"
      data-controls={controls || undefined}
      role="dialog"
      aria-label="Slideshow"
      onMouseMove={wake}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, [data-tts-ui], .pr-show__notes')) return;
        if (!presenter) advance();
      }}
      onContextMenu={(event) => { event.preventDefault(); back(); }}
    >
      {presenter ? (
        <div className="pr-show__presenter">
          <div className="pr-show__main">
            {stage(current, Math.min(viewport.width * 0.62, ((viewport.height - 120) * naturalWidth) / naturalHeight), true)}
          </div>
          <aside className="pr-show__side">
            <div className="pr-show__clock">
              <div>
                <span className="pr-show__label">Elapsed</span>
                <strong>{formatDuration(elapsed)}</strong>
                <span className={`pr-show__pace${pace > 30 ? ' is-behind' : pace < -30 ? ' is-ahead' : ''}`}>
                  {Math.abs(pace) < 30 ? 'On pace' : pace > 0 ? `${formatDuration(pace)} behind` : `${formatDuration(-pace)} ahead`} · plan {formatDuration(total)}
                </span>
              </div>
              <div className="pr-show__clock-actions">
                <button type="button" className="pr-show__btn" title={pausedAt ? 'Resume timer' : 'Pause timer'} onClick={() => {
                  if (pausedAt) { setStartedAt((value) => value + (Date.now() - pausedAt)); setPausedAt(null); } else setPausedAt(Date.now());
                }}>{pausedAt ? 'Resume' : 'Pause'}</button>
                <button type="button" className="pr-show__btn" title="Reset timer (T)" onClick={() => { setStartedAt(Date.now()); setPausedAt(null); }}><ArrowCounterClockwise size={14} /></button>
                <span className="pr-show__time">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <div>
              <span className="pr-show__label">Next</span>
              {next ? stage(next, 300, false) : <div className="pr-show__end">End of the presentation</div>}
            </div>
            <div className="pr-show__notes-head">
              <span className="pr-show__label">Notes · about {formatDuration(current ? slideSeconds(current) : 0)}</span>
              <div className="pr-show__notes-actions" data-tts-ui onMouseDown={absorbTts} onClick={absorbTts} onKeyDown={absorbTts}>
                <NarrateButton
                  text={currentNotes}
                  slideId={currentId ?? undefined}
                  variant="compact"
                  onToast={notifyTts}
                />
                <button type="button" className="pr-show__btn" aria-label="Smaller notes" onClick={() => setNotesSize((value) => Math.max(12, value - 2))}><Minus size={12} /></button>
                <button type="button" className="pr-show__btn" aria-label="Larger notes" onClick={() => setNotesSize((value) => Math.min(40, value + 2))}><Plus size={12} /></button>
              </div>
            </div>
            <div className="pr-show__notes" dir="auto" style={{ fontSize: notesSize }}>{current?.notes || <em>No speaker notes for this slide.</em>}</div>
          </aside>
        </div>
      ) : (
        stage(current, audienceWidth, true)
      )}

      {modelsOpen && (
        <div
          className="pr-show__models"
          data-tts-ui
          role="dialog"
          aria-label="Narration voices"
          onMouseDown={absorbTts}
          onClick={absorbTts}
          onKeyDown={absorbTts}
        >
          <TtsModelPicker variant="compact" slideId={currentId ?? undefined} onToast={notifyTts} />
        </div>
      )}
      <div
        className="pr-show__narrate"
        data-tts-ui
        onMouseDown={absorbTts}
        onClick={absorbTts}
        onKeyDown={absorbTts}
      >
        <NarrateButton
          text={currentNotes}
          slideId={currentId ?? undefined}
          onToast={notifyTts}
        />
        <span className="pr-show__sep" aria-hidden="true" />
        <button
          type="button"
          className="pr-show__btn"
          data-active={modelsOpen || undefined}
          title="Narration voice (per-slide override)"
          aria-expanded={modelsOpen}
          onClick={() => setModelsOpen((value) => !value)}
        >
          Voice <CaretDown size={12} aria-hidden="true" />
        </button>
        <label
          className="pr-show__narrate-auto"
          title="Auto-narrate each slide's notes when it appears (off by default)"
          onClick={absorbTts}
        >
          <input
            type="checkbox"
            checked={autoplayInPresenter}
            onChange={(event) => setAutoplayInPresenter(event.target.checked)}
            aria-label="Auto-narrate slides"
          />
          Auto
        </label>
        {ttsInlineError && !onToast && (
          <span className="pr-show__narrate-error" title={ttsInlineError} role="alert">
            {ttsInlineError}
          </span>
        )}
      </div>
      <div className="pr-show__bar">
        <button type="button" className="pr-show__btn" aria-label="Previous" disabled={index === 0 && revealed === 0} onClick={back}><CaretLeft size={16} /></button>
        <span className="pr-show__count">{index + 1} / {visible.length}{currentSteps > 0 ? ` · ${revealed}/${currentSteps}` : ''}</span>
        <button type="button" className="pr-show__btn" aria-label="Next" disabled={index >= visible.length - 1 && revealed >= currentSteps} onClick={advance}><CaretRight size={16} /></button>
        <span className="pr-show__sep" />
        <button type="button" className="pr-show__btn" data-active={presenter || undefined} title="Presenter view (S)" onClick={() => setPresenter((value) => !value)}>
          {presenter ? <Monitor size={15} /> : <Presentation size={15} />} {presenter ? 'Audience view' : 'Presenter view'}
        </button>
        <span className="pr-show__hint">B black · W white · R narrate · number + Enter to jump</span>
        <button type="button" className="pr-show__btn" title="End the show (Esc)" onClick={exit}><X size={15} /> End</button>
      </div>
    </div>,
    document.body,
  );
}
