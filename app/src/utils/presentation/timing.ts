// Speaking-time estimates for presenter mode and the speaker-notes coach.
// Dependency-free.

import { blockText, wordCount } from './richText';
import type { Slide } from './types';

/** A comfortable presenting pace, in words per minute. */
export const SPEAKING_WPM = 140;
/** Time on a slide with nothing to say (taking it in, transitions). */
const SLIDE_FLOOR_SECS = 12;

/** Seconds to present one slide: its notes at speaking pace, or a share of its on-slide text. */
export function slideSeconds(slide: Slide): number {
  if (slide.hidden) return 0;
  const notes = wordCount(slide.notes);
  if (notes > 0) return Math.max(SLIDE_FLOOR_SECS, Math.round((notes / SPEAKING_WPM) * 60));
  // Without notes the presenter roughly reads and expands the slide.
  const onSlide = wordCount(Object.values(slide.slots).map(blockText).join(' '));
  const title = ['title', 'section', 'closing'].includes(slide.layout);
  return Math.max(title ? 8 : SLIDE_FLOOR_SECS, Math.round(((onSlide * 1.6) / SPEAKING_WPM) * 60));
}

export function deckSeconds(slides: Slide[]): number {
  return slides.reduce((sum, slide) => sum + slideSeconds(slide), 0);
}

/** "1:05", "12:30", "1:02:00". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Words of notes per slide that fill `minutes` across the visible slides. */
export function notesBudget(slides: Slide[], minutes: number): number {
  const visible = slides.filter((slide) => !slide.hidden).length || 1;
  return Math.max(20, Math.round(((minutes * 60) / visible / 60) * SPEAKING_WPM));
}
