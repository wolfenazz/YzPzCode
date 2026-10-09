// Shared types for the Writing workspace. Dependency-free so the pure
// modules beside it can be tested with `npm run test:writing`.

export type WritingEngineId = 'claude' | 'codex' | 'grok' | 'antigravity' | 'opencode';

export type PageSizeId = 'a4' | 'letter' | 'legal' | 'a5';
export type Orientation = 'portrait' | 'landscape';
export type CitationStyle = 'apa' | 'ieee' | 'harvard' | 'mla' | 'chicago';
export type HeadingNumbering = 'none' | 'decimal' | 'chapter';
export type CoverStyle = 'none' | 'classic' | 'academic' | 'corporate' | 'modern' | 'minimal';
export type PageNumberPosition = 'none' | 'bottom-center' | 'bottom-right' | 'top-right';
export type TextAlignment = 'left' | 'justify';

export interface PageMargins {
  /** Millimetres. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ReportStyle {
  themeId: string;
  bodyFont: string;
  headingFont: string;
  /** Points. */
  bodySize: number;
  /** Points, for the level-1 heading; lower levels scale down from it. */
  headingSize: number;
  lineHeight: number;
  /** Points after each paragraph. */
  paragraphSpacing: number;
  alignment: TextAlignment;
  firstLineIndent: boolean;
  headingColor: string;
  accentColor: string;
  pageSize: PageSizeId;
  orientation: Orientation;
  margins: PageMargins;
  headingNumbering: HeadingNumbering;
  /** Start every top-level section on a new page. */
  sectionBreaks: boolean;
  cover: CoverStyle;
  includeToc: boolean;
  includeListOfFigures: boolean;
  includeListOfTables: boolean;
  headerText: string;
  footerText: string;
  pageNumbers: PageNumberPosition;
  romanFrontMatter: boolean;
  citationStyle: CitationStyle;
}

export type Tone = 'formal' | 'analytical' | 'persuasive' | 'neutral' | 'friendly';
export type ReadingLevel = 'general' | 'professional' | 'expert';
export type Person = 'auto' | 'first-singular' | 'first-plural' | 'third';
export type Spelling = 'us' | 'uk';

export interface VoiceSettings {
  tone: Tone;
  readingLevel: ReadingLevel;
  person: Person;
  spelling: Spelling;
}

export interface HumanizerSettings {
  enabled: boolean;
  presetId: string;
  /** 0–100: how far the rewrite departs from typical model prose. */
  intensity: number;
  /** 0–100: variation in sentence length and rhythm. */
  burstiness: number;
  /** 0–100: register, from conversational to formal. */
  formality: number;
  /** 0–100: how much hedging and qualification is allowed. */
  hedging: number;
  contractions: boolean;
  bannedPhrases: string[];
  customInstructions: string;
}

export interface EngineChoice {
  engine: WritingEngineId;
  /** Empty means the CLI's default model. */
  model: string;
  allowWebResearch: boolean;
}

export interface ReportDetails {
  title: string;
  subtitle: string;
  brief: string;
  audience: string;
  authors: string;
  organization: string;
  date: string;
  language: string;
  targetWords: number;
  /** Values for the report type's own fields, by field key. */
  fields: Record<string, string>;
  /** Pasted notes, data and references the report must draw on. */
  sourceNotes: string;
  /** Workspace files whose text is given to the AI as source material. */
  sourceFiles: string[];
}

export interface ReportBrief {
  typeId: string;
  details: ReportDetails;
  style: ReportStyle;
  voice: VoiceSettings;
  humanizer: HumanizerSettings;
  engine: EngineChoice;
}

export interface OutlineSection {
  id: string;
  title: string;
  /** What the section must cover; given to the AI with the section prompt. */
  notes: string;
  targetWords: number;
  subsections: string[];
  /** Front/back matter that is not numbered (abstract, references…). */
  unnumbered?: boolean;
}

export interface Reference {
  id: string;
  /** Citation key used in the text as [@key]. */
  key: string;
  authors: string;
  year: string;
  title: string;
  source: string;
  url: string;
}

export interface ReportProfile {
  id: string;
  name: string;
  description: string;
  typeId: string;
  /** Detail values carried into every report made from the profile (institution, authors…). */
  details: Partial<ReportDetails>;
  style: ReportStyle;
  voice: VoiceSettings;
  humanizer: HumanizerSettings;
  engine?: EngineChoice;
  builtIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A TipTap/ProseMirror JSON node. Mirrors `JSONContent` without importing TipTap. */
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface YzDocMeta {
  id: string;
  title: string;
  typeId: string;
  createdAt: number;
  updatedAt: number;
}

/** The `.yzdoc` file: everything needed to reopen, regenerate and export a report. */
export interface YzDoc {
  format: 'yzdoc';
  version: 1;
  meta: YzDocMeta;
  brief: ReportBrief;
  outline: OutlineSection[];
  bibliography: Reference[];
  content: DocNode;
}

export type SectionRunStatus = 'queued' | 'writing' | 'done' | 'failed' | 'cancelled';
