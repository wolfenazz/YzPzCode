// Natural-writing rules for the AI, presets for them, and a local lint that
// finds the patterns that make prose read as machine-written.
// Dependency-free (tested by `npm run test:writing`).

import type { HumanizerSettings, VoiceSettings } from './types';

/** Words and stock phrases that are strong tells of model prose. */
export const DEFAULT_BANNED_PHRASES: string[] = [
  'delve',
  'delves',
  'delving',
  'tapestry',
  'testament to',
  'in today\'s fast-paced world',
  'in today\'s digital age',
  'in the ever-evolving',
  'ever-evolving landscape',
  'navigate the complexities',
  'navigating the complexities',
  'it is important to note',
  'it\'s important to note',
  'it is worth noting',
  'it\'s worth noting',
  'plays a crucial role',
  'plays a pivotal role',
  'pivotal role',
  'a crucial role',
  'shed light on',
  'sheds light on',
  'unlock the potential',
  'unleash',
  'harness the power',
  'game-changer',
  'game changer',
  'paradigm shift',
  'seamlessly',
  'seamless integration',
  'robust and scalable',
  'cutting-edge',
  'state-of-the-art',
  'meticulous',
  'meticulously',
  'intricate',
  'intricacies',
  'realm',
  'embark',
  'embarking',
  'beacon',
  'symphony',
  'multifaceted',
  'holistic approach',
  'foster',
  'fostering',
  'leverage',
  'leveraging',
  'underscore',
  'underscores',
  'showcasing',
  'a myriad of',
  'myriad',
  'plethora',
  'in conclusion,',
  'in summary,',
  'to sum up,',
  'at the end of the day',
  'when it comes to',
  'a wide range of',
  'not only',
  'serves as a',
  'stands as a',
  'rich tapestry',
  'vibrant',
  'bustling',
  'elevate',
  'resonate',
  'empower',
];

/** Sentence openers that pile up in model prose. */
export const STOCK_TRANSITIONS: string[] = [
  'moreover',
  'furthermore',
  'additionally',
  'in addition',
  'consequently',
  'ultimately',
  'notably',
  'importantly',
  'overall',
  'thus',
  'hence',
  'indeed',
];

export interface HumanizerPreset {
  id: string;
  name: string;
  description: string;
  values: Pick<HumanizerSettings, 'intensity' | 'burstiness' | 'formality' | 'hedging' | 'contractions'>;
}

export const HUMANIZER_PRESETS: HumanizerPreset[] = [
  {
    id: 'light',
    name: 'Light touch',
    description: 'Removes stock phrases and evens out rhythm. Keeps the draft close to the original.',
    values: { intensity: 25, burstiness: 45, formality: 70, hedging: 40, contractions: false },
  },
  {
    id: 'natural',
    name: 'Natural',
    description: 'Varied sentences, concrete detail, a confident human voice. The default.',
    values: { intensity: 55, burstiness: 65, formality: 60, hedging: 30, contractions: false },
  },
  {
    id: 'scholarly',
    name: 'Scholarly',
    description: 'Measured academic register with a real author’s judgement and careful claims.',
    values: { intensity: 50, burstiness: 55, formality: 85, hedging: 55, contractions: false },
  },
  {
    id: 'conversational',
    name: 'Conversational',
    description: 'Warm and direct, with contractions and plain words. For guides and articles.',
    values: { intensity: 65, burstiness: 75, formality: 35, hedging: 25, contractions: true },
  },
  {
    id: 'strong',
    name: 'Deep rewrite',
    description: 'Rebuilds sentences from scratch for the most natural reading. Changes more.',
    values: { intensity: 85, burstiness: 80, formality: 60, hedging: 30, contractions: false },
  },
];

export function defaultHumanizer(presetId = 'natural'): HumanizerSettings {
  const preset = HUMANIZER_PRESETS.find((entry) => entry.id === presetId) ?? HUMANIZER_PRESETS[1];
  return {
    enabled: true,
    presetId: preset.id,
    ...preset.values,
    bannedPhrases: [...DEFAULT_BANNED_PHRASES],
    customInstructions: '',
  };
}

export function applyHumanizerPreset(settings: HumanizerSettings, presetId: string): HumanizerSettings {
  const preset = HUMANIZER_PRESETS.find((entry) => entry.id === presetId);
  return preset ? { ...settings, presetId: preset.id, ...preset.values } : settings;
}

const band = (value: number, low: string, mid: string, high: string): string =>
  value < 34 ? low : value < 67 ? mid : high;

const PERSON_RULES: Record<VoiceSettings['person'], string> = {
  auto: 'Choose the point of view the report type conventionally uses and keep it consistent.',
  'first-singular': 'Write in the first person singular ("I") where the author speaks.',
  'first-plural': 'Write in the first person plural ("we") where the authors speak.',
  third: 'Write in the third person; avoid "I" and "we".',
};

/** The writing-style rules block added to every drafting and rewriting prompt. */
export function buildStyleRules(humanizer: HumanizerSettings, voice: VoiceSettings): string {
  const rules: string[] = [
    `Tone: ${voice.tone}. Reading level: ${voice.readingLevel}. ${PERSON_RULES[voice.person]}`,
    `Spelling: ${voice.spelling === 'uk' ? 'British English (organise, colour, analyse)' : 'American English (organize, color, analyze)'}.`,
  ];
  if (!humanizer.enabled) return rules.map((rule) => `- ${rule}`).join('\n');

  rules.push(
    `Sentence rhythm: ${band(
      humanizer.burstiness,
      'keep sentences of similar, moderate length',
      'mix short and long sentences; let a short sentence land a key point now and then',
      'vary sentence length strongly — some very short, some long and layered; never three sentences of similar length in a row',
    )}.`,
    `Register: ${band(
      humanizer.formality,
      'plain and conversational, as a knowledgeable person would explain it aloud',
      'professional but natural; plain words over formal ones when they mean the same',
      'formal and precise, but still a real author’s voice, never stiff or ornamental',
    )}.`,
    `Hedging: ${band(
      humanizer.hedging,
      'state findings directly; qualify only when the evidence is genuinely uncertain',
      'qualify claims in proportion to the evidence',
      'qualify claims carefully, as cautious scholarship does, without stacking hedges',
    )}.`,
    humanizer.contractions
      ? 'Use contractions where they sound natural.'
      : 'Avoid contractions.',
    'Prefer concrete specifics — names, numbers, dates, examples, mechanisms — over abstract generalities.',
    'Open paragraphs in different ways. Do not start sentences with stock transitions such as Moreover, Furthermore, Additionally, In addition, Notably or Ultimately; connect ideas through the content instead.',
    'Avoid formulaic patterns: lists of three adjectives, "not only… but also", "It is not X, it is Y", rhetorical questions as openers, and summary sentences that repeat the paragraph.',
    'Use em dashes sparingly — at most one per page.',
    'Do not end sections with a moralising or sweeping wrap-up line.',
  );
  if (humanizer.intensity >= 67) {
    rules.push('Write each sentence fresh, the way a seasoned expert in this field would phrase it; avoid any template-like phrasing.');
  }
  if (humanizer.bannedPhrases.length > 0) {
    rules.push(`Never use these words or phrases: ${humanizer.bannedPhrases.map((phrase) => `"${phrase}"`).join(', ')}.`);
  }
  if (humanizer.customInstructions.trim()) {
    rules.push(humanizer.customInstructions.trim());
  }
  return rules.map((rule) => `- ${rule}`).join('\n');
}

export type LintKind = 'phrase' | 'transition' | 'rhythm' | 'dash';

export interface LintIssue {
  kind: LintKind;
  message: string;
  /** Offsets into the linted text. */
  start: number;
  end: number;
}

export interface LintResult {
  /** 0–100: higher reads more naturally. */
  score: number;
  issues: LintIssue[];
  words: number;
  sentences: number;
  /** Coefficient of variation of sentence length; human prose is usually above 0.4. */
  rhythmVariation: number;
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface SentenceSpan {
  start: number;
  end: number;
  words: number;
}

function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const pattern = /[^.!?\n]+(?:[.!?]+["”’)]*|\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    const raw = match[0];
    const words = raw.trim().split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
    if (words > 0) spans.push({ start: match.index, end: match.index + raw.length, words });
  }
  return spans;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Lints plain text. `paragraphs` are separated by blank lines or newlines;
 * rhythm is judged per paragraph, phrases and transitions across the text.
 */
export function lintText(text: string, bannedPhrases: string[] = DEFAULT_BANNED_PHRASES): LintResult {
  const issues: LintIssue[] = [];
  const lower = text.toLowerCase();

  const phrases = [...new Set(bannedPhrases.map((phrase) => phrase.trim().toLowerCase()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  const covered: Array<[number, number]> = [];
  for (const phrase of phrases) {
    const startsWord = /^\w/.test(phrase);
    const endsWord = /\w$/.test(phrase);
    const pattern = new RegExp(`${startsWord ? '\\b' : ''}${escapeRegex(phrase)}${endsWord ? '\\b' : ''}`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (covered.some(([a, b]) => start < b && end > a)) continue;
      covered.push([start, end]);
      issues.push({ kind: 'phrase', message: `“${text.slice(start, end)}” is a common AI tell`, start, end });
    }
  }

  const sentences = splitSentences(text);
  const words = text.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;

  for (const sentence of sentences) {
    const body = text.slice(sentence.start, sentence.end);
    const leading = body.length - body.trimStart().length;
    const opener = body.trimStart().toLowerCase();
    const transition = STOCK_TRANSITIONS.find((word) => opener.startsWith(`${word},`) || opener.startsWith(`${word} `));
    if (transition) {
      const start = sentence.start + leading;
      issues.push({ kind: 'transition', message: `Stock opener “${text.slice(start, start + transition.length)}”`, start, end: start + transition.length });
    }
  }

  let paragraphStart = 0;
  const paragraphs = text.split(/\n/);
  const variations: number[] = [];
  for (const paragraph of paragraphs) {
    const paragraphEnd = paragraphStart + paragraph.length;
    const inside = sentences.filter((sentence) => sentence.start >= paragraphStart && sentence.end <= paragraphEnd + 1);
    if (inside.length >= 4) {
      const variation = coefficientOfVariation(inside.map((sentence) => sentence.words));
      variations.push(variation);
      if (variation < 0.25) {
        issues.push({
          kind: 'rhythm',
          message: 'Sentences in this paragraph are all a similar length',
          start: paragraphStart,
          end: paragraphEnd,
        });
      }
    }
    paragraphStart = paragraphEnd + 1;
  }

  const dashPattern = /—|\s–\s|\s--\s/g;
  const dashes: number[] = [];
  let dash: RegExpExecArray | null;
  while ((dash = dashPattern.exec(text)) !== null) dashes.push(dash.index);
  const dashAllowance = Math.max(1, Math.floor(words / 350));
  if (dashes.length > dashAllowance) {
    for (const index of dashes.slice(dashAllowance)) {
      issues.push({ kind: 'dash', message: 'Frequent em dashes read as machine-written', start: index, end: index + 1 });
    }
  }

  const overall = variations.length > 0
    ? variations.reduce((sum, value) => sum + value, 0) / variations.length
    : coefficientOfVariation(sentences.map((sentence) => sentence.words));

  const per1000 = (count: number): number => (words > 0 ? (count * 1000) / words : 0);
  const phraseCount = issues.filter((issue) => issue.kind === 'phrase').length;
  const transitionCount = issues.filter((issue) => issue.kind === 'transition').length;
  const rhythmCount = issues.filter((issue) => issue.kind === 'rhythm').length;
  const dashCount = issues.filter((issue) => issue.kind === 'dash').length;

  let score = 100;
  score -= Math.min(40, per1000(phraseCount) * 6);
  score -= Math.min(20, per1000(transitionCount) * 4);
  score -= Math.min(20, rhythmCount * 5);
  score -= Math.min(10, per1000(dashCount) * 3);
  if (sentences.length >= 4 && overall < 0.35) score -= Math.round((0.35 - overall) * 40);
  score = Math.max(0, Math.min(100, Math.round(score)));
  if (words === 0) score = 100;

  issues.sort((a, b) => a.start - b.start);
  return { score, issues, words, sentences: sentences.length, rhythmVariation: Math.round(overall * 100) / 100 };
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Reads naturally';
  if (score >= 70) return 'Mostly natural';
  if (score >= 50) return 'Some AI patterns';
  return 'Strong AI patterns';
}
