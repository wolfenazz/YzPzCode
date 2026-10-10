import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ArrowCounterClockwise, CaretLeft, CaretRight, Minus, Monitor, Plus, Presentation, X } from '@phosphor-icons/react';
import { formatDuration } from '../../utils/presentation/timing';
import type { SlideTransition } from '../../utils/presentation/types';

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
  renderSlide: (slide: T, width: number) => React.ReactNode;
  /** Planned seconds on a slide, for the pace indicator. */
  seconds: (slide: T) => number;
  onExit: (lastId: string | null) => void;
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
export function PresenterMode<T extends PresentableSlide>({ slides, aspect, transition, startId, renderSlide, seconds: slideSeconds, onExit }: PresenterModeProps<T>): React.ReactPortal {
  const visible = useMemo(() => slides.filter((slide) => !slide.hidden), [slides]);
  const [index, setIndex] = useState(() => Math.max(0, visible.findIndex((slide) => slide.id === startId)));
  const [direction, setDirection] = useState(1);
  const [presenter, setPresenter] = useState(false);
  const [blank, setBlank] = useState<'black' | 'white' | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [notesSize, setNotesSize] = useState(20);
  const [controls, setControls] = useState(true);
  const typed = useRef('');
  const hideTimer = useRef<number | null>(null);
  const wasFullscreen = useRef<boolean | null>(null);
  const viewport = useViewport();
  const now = useNow(true);
  const current = visible[index] ?? null;
  const next = visible[index + 1] ?? null;

  const exit = useCallback(() => onExit(current?.id ?? null), [current, onExit]);

  // Fullscreen for the whole window while presenting; restored on exit.
  useEffect(() => {
    const window_ = getCurrentWindow();
    let alive = true;
    void window_.isFullscreen().then((value) => {
      if (!alive) return;
      wasFullscreen.current = value;
      if (!value) void window_.setFullscreen(true).catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      alive = false;
      if (wasFullscreen.current === false) void window_.setFullscreen(false).catch(() => undefined);
    };
  }, []);

  const go = useCallback((target: number) => {
    setBlank(null);
    setIndex((value) => {
      const clamped = Math.max(0, Math.min(visible.length - 1, target));
      setDirection(clamped >= value ? 1 : -1);
      return clamped;
    });
  }, [visible.length]);

  const wake = useCallback(() => {
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 2400);
  }, []);

  useEffect(() => {
    wake();
    return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [wake]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // The slideshow owns the keyboard while it is open.
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const { key } = event;
      if (/^[0-9]$/.test(key)) {
        typed.current = `${typed.current}${key}`.slice(-3);
        event.preventDefault();
        return;
      }
      if (key === 'Enter' && typed.current) {
        event.preventDefault();
        go(Number(typed.current) - 1);
        typed.current = '';
        return;
      }
      typed.current = '';
      if (key === 'Escape') { event.preventDefault(); exit(); }
      else if (NEXT_KEYS.has(key)) { event.preventDefault(); if (blank) setBlank(null); else go(index + 1); }
      else if (PREV_KEYS.has(key)) { event.preventDefault(); if (blank) setBlank(null); else go(index - 1); }
      else if (key === 'Home') { event.preventDefault(); go(0); }
      else if (key === 'End') { event.preventDefault(); go(visible.length - 1); }
      else if (key === 'b' || key === 'B' || key === '.') { event.preventDefault(); setBlank((value) => (value === 'black' ? null : 'black')); }
      else if (key === 'w' || key === 'W' || key === ',') { event.preventDefault(); setBlank((value) => (value === 'white' ? null : 'white')); }
      else if (key === 's' || key === 'S') { event.preventDefault(); setPresenter((value) => !value); }
      else if (key === 't' || key === 'T') { event.preventDefault(); setStartedAt(Date.now()); setPausedAt(null); }
      else if (key === 'F5') event.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [blank, exit, go, index, visible.length]);

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
            {renderSlide(slide, width)}
          </motion.div>
        )}
      </AnimatePresence>
      {blank && <div className="pr-show__blank" style={{ background: blank === 'black' ? '#000' : '#fff' }} />}
    </div>
  );

  const audienceWidth = Math.min(viewport.width, (viewport.height * naturalWidth) / naturalHeight);

  return createPortal(
    <div
      className="pr-show"
      data-controls={controls || undefined}
      role="dialog"
      aria-label="Slideshow"
      onMouseMove={wake}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, .pr-show__notes')) return;
        if (!presenter) go(index + 1);
      }}
      onContextMenu={(event) => { event.preventDefault(); go(index - 1); }}
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
              <span>
                <button type="button" className="pr-show__btn" aria-label="Smaller notes" onClick={() => setNotesSize((value) => Math.max(12, value - 2))}><Minus size={12} /></button>
                <button type="button" className="pr-show__btn" aria-label="Larger notes" onClick={() => setNotesSize((value) => Math.min(40, value + 2))}><Plus size={12} /></button>
              </span>
            </div>
            <div className="pr-show__notes" style={{ fontSize: notesSize }}>{current?.notes || <em>No speaker notes for this slide.</em>}</div>
          </aside>
        </div>
      ) : (
        stage(current, audienceWidth, true)
      )}

      <div className="pr-show__bar">
        <button type="button" className="pr-show__btn" aria-label="Previous slide" disabled={index === 0} onClick={() => go(index - 1)}><CaretLeft size={16} /></button>
        <span className="pr-show__count">{index + 1} / {visible.length}</span>
        <button type="button" className="pr-show__btn" aria-label="Next slide" disabled={index >= visible.length - 1} onClick={() => go(index + 1)}><CaretRight size={16} /></button>
        <span className="pr-show__sep" />
        <button type="button" className="pr-show__btn" data-active={presenter || undefined} title="Presenter view (S)" onClick={() => setPresenter((value) => !value)}>
          {presenter ? <Monitor size={15} /> : <Presentation size={15} />} {presenter ? 'Audience view' : 'Presenter view'}
        </button>
        <span className="pr-show__hint">B black · W white · number + Enter to jump</span>
        <button type="button" className="pr-show__btn" title="End the show (Esc)" onClick={exit}><X size={15} /> End</button>
      </div>
    </div>,
    document.body,
  );
}
