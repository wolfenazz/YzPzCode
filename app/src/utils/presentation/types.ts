// Shared types for the Presentation studio. Dependency-free so the pure
// modules beside it can be tested with `npm run test:presentation`.

import type { EngineChoice } from '../writing/types';
import type { DesignedDeck } from './designTypes';

export type DeckSize = '16:9' | '4:3';
export type SlideTransition = 'none' | 'fade' | 'slide';

export type LayoutId =
  | 'title'
  | 'agenda'
  | 'section'
  | 'bullets'
  | 'two-column'
  | 'comparison'
  | 'image-left'
  | 'image-right'
  | 'full-image'
  | 'stats'
  | 'quote'
  | 'timeline'
  | 'chart'
  | 'table'
  | 'closing';

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Hex colour, e.g. "#c2410c". */
  color?: string;
}

/** One paragraph (or bullet) of rich text. */
export interface RichPara {
  runs: TextRun[];
  /** Indent level for bullets: 0 or 1. */
  level?: number;
}

export type ChartKind = 'bar' | 'column' | 'line' | 'pie' | 'donut';

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface StatItem {
  value: string;
  label: string;
  /** Optional Iconify icon name, e.g. "ph:users-three". */
  icon?: string;
}

export interface StepItem {
  title: string;
  text: string;
  icon?: string;
}

export type Block =
  | { type: 'text'; items: RichPara[] }
  | { type: 'bullets'; items: RichPara[] }
  | {
    type: 'image';
    src: string;
    fit: 'cover' | 'contain';
    alt: string;
    /** Attribution shown on the slide (stock photos). */
    credit?: string;
    /** A prompt for the user's own image generator. */
    prompt?: string;
  }
  | { type: 'chart'; kind: ChartKind; categories: string[]; series: ChartSeries[]; unit?: string }
  | { type: 'table'; rows: string[][]; header: boolean }
  | { type: 'stats'; items: StatItem[] }
  | { type: 'steps'; items: StepItem[] }
  | { type: 'icon'; name: string }
  | { type: 'quote'; text: string; attribution: string };

export type BlockType = Block['type'];

export interface Slide {
  id: string;
  layout: LayoutId;
  slots: Record<string, Block>;
  notes: string;
  /** Hex colour override for the slide background. */
  background?: string;
  hidden?: boolean;
  /** Per-slot font scale set by the design check (1 = theme size). */
  fit?: Record<string, number>;
}

export type Decoration = 'rule' | 'corner' | 'band' | 'none';

export interface ThemePalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent1: string;
  accent2: string;
  accent3: string;
  /** Text on accent-filled title and section slides. */
  onAccent: string;
}

export interface DeckTheme {
  id: string;
  name: string;
  tagline: string;
  dark: boolean;
  palette: ThemePalette;
  headingFont: string;
  bodyFont: string;
  /** Points. */
  titleSize: number;
  bodySize: number;
  decoration: Decoration;
  /** How title, section and closing slides are filled. */
  titleFill: 'background' | 'accent' | 'gradient';
  chartColors: string[];
}

export type DeckTone = 'professional' | 'persuasive' | 'educational' | 'inspiring' | 'casual';

export interface DeckBrief {
  topic: string;
  audience: string;
  goal: string;
  slideCount: number;
  tone: DeckTone;
  language: string;
  sourceNotes: string;
  sourceFiles: string[];
  engine: EngineChoice;
}

export interface OutlineSlide {
  id: string;
  title: string;
  purpose: string;
  layout: LayoutId;
  keyPoints: string[];
}

export interface YzDeckMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** A slide of an existing .pptx edited in place ("Keep original design"). */
export interface PreserveSlide {
  /** Stable key: the slide's part name in the original file, or `dup:<id>` for copies. */
  key: string;
  /** Part name of the original slide this one is (a copy of). */
  source: string;
  hidden: boolean;
  /** New paragraph text by shape id, for shapes the user or the AI changed. */
  text: Record<string, string[]>;
  /** New speaker notes, when changed. */
  notes?: string;
}

export interface PreserveSource {
  mode: 'preserve';
  /** The untouched original, inside the deck folder. */
  pptxFile: string;
  /** Where it was imported from, for "save over the original". */
  originalPath: string;
  slides: PreserveSlide[];
}

/** The `.yzdeck` file. */
export interface YzDeck {
  format: 'yzdeck';
  version: 1;
  meta: YzDeckMeta;
  brief: DeckBrief;
  theme: DeckTheme;
  size: DeckSize;
  showNumbers: boolean;
  /** How slides change in presenter mode and the HTML deck. */
  transition: SlideTransition;
  outline: OutlineSlide[];
  slides: Slide[];
  source?: PreserveSource;
  /** AI-designed deck: the AI drew every slide as SVG in a design system it invented. */
  design?: DesignedDeck;
}

/** A reusable deck: theme, size and sample slides (images stripped). */
export interface DeckTemplate {
  id: string;
  name: string;
  description: string;
  theme: DeckTheme;
  size: DeckSize;
  slides: Slide[];
  createdAt: number;
}

export type SlideRunStatus = 'queued' | 'writing' | 'done' | 'failed' | 'cancelled';
