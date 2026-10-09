// Prompts for every AI step of the Writing workspace: outline, section
// drafting, rewriting and humanizing. Dependency-free (tested by
// `npm run test:writing`).

import { CITATION_STYLES, isNumericStyle } from './citations';
import { buildStyleRules } from './humanizer';
import { getReportType, newSectionId, type ReportTypeDef } from './reportTypes';
import type { OutlineSection, Reference, ReportBrief } from './types';

export interface AiPrompt {
  system: string;
  prompt: string;
}

/** Caps the source material sent with every prompt. */
export const MAX_SOURCE_CHARS = 60_000;

export const WRITER_SYSTEM_PROMPT = [
  'You are a senior professional writer and subject-matter editor. You produce publication-quality reports for universities, companies, investors and public bodies.',
  'You write with authority, precision and a natural human voice. You never mention that you are an AI, never address the person commissioning the report, and never add commentary before or after the requested text.',
  'You do not use tools, browse files or ask questions. You work only from the brief and sources in the message and your own knowledge.',
  'Facts: never invent statistics, quotations, studies or references. When a specific figure is needed but not supplied, write a clearly marked placeholder such as [insert 2025 revenue] instead of guessing.',
].join('\n');

const MARKDOWN_CONTRACT = [
  'Output format — GitHub-flavoured Markdown, and nothing else:',
  '- Use ## for subsection headings and ### for sub-subsections. Never use a single #.',
  '- Paragraphs separated by blank lines. Use **bold** and *italic* sparingly.',
  '- Bulleted or numbered lists only where the content is genuinely list-like.',
  '- Tables as Markdown pipe tables with a header row. Put a caption line directly above each table in the form: Table: Caption text',
  '- Where a figure, chart or diagram would help, write a placeholder line on its own: [Figure: precise description of what the figure shows]',
  '- Footnotes as [^1] in the text with the definition "[^1]: Note text." at the end of the section.',
  '- No code fences around the answer, no preamble ("Here is…"), no closing remarks.',
].join('\n');

function describeDetails(brief: ReportBrief, type: ReportTypeDef): string {
  const { details } = brief;
  const lines: string[] = [];
  lines.push(`Report type: ${type.name} — ${type.description}`);
  if (details.title) lines.push(`Title: ${details.title}${details.subtitle ? ` — ${details.subtitle}` : ''}`);
  if (details.brief) lines.push(`Brief: ${details.brief}`);
  if (details.audience) lines.push(`Audience: ${details.audience}`);
  if (details.authors) lines.push(`Author(s): ${details.authors}`);
  if (details.organization) lines.push(`Organisation: ${details.organization}`);
  if (details.language && !/^en/i.test(details.language)) lines.push(`Write the entire report in: ${details.language}`);
  for (const field of type.fields) {
    const value = details.fields[field.key]?.trim();
    if (value) lines.push(`${field.label}: ${value}`);
  }
  for (const [key, value] of Object.entries(details.fields)) {
    if (!type.fields.some((field) => field.key === key) && value?.trim()) lines.push(`${key}: ${value.trim()}`);
  }
  return lines.join('\n');
}

function citationRules(brief: ReportBrief, references: Reference[]): string {
  const style = CITATION_STYLES.find((entry) => entry.id === brief.style.citationStyle)?.label ?? 'APA 7';
  if (references.length > 0) {
    const list = references.map((ref) => `- [@${ref.key}] ${ref.authors || 'Unknown'} (${ref.year || 'n.d.'}). ${ref.title}${ref.source ? `. ${ref.source}` : ''}`).join('\n');
    return [
      `Citations: cite sources with their keys in square brackets, e.g. [@${references[0].key}] or [@${references[0].key}, p. 12]. The app formats them in ${style}.`,
      'Cite only from this list:',
      list,
    ].join('\n');
  }
  return `Citations: when citing, write in-text citations directly in ${style} style${isNumericStyle(brief.style.citationStyle) ? ' as numbered brackets' : ''}. Cite only real, verifiable works you are confident exist; if unsure, write [citation needed] rather than inventing one.`;
}

function sourcesBlock(sources: string): string {
  if (!sources.trim()) return '';
  const trimmed = sources.length > MAX_SOURCE_CHARS ? `${sources.slice(0, MAX_SOURCE_CHARS)}\n[…source material truncated…]` : sources;
  return `\n<sources>\n${trimmed}\n</sources>\nUse the sources above as the primary basis for facts and figures.`;
}

export function outlineToText(outline: OutlineSection[]): string {
  let number = 0;
  return outline.map((section) => {
    const label = section.unnumbered ? section.title : `${(number += 1)}. ${section.title}`;
    const subs = section.subsections.length > 0 ? `\n   ${section.subsections.join(' · ')}` : '';
    return `${label} (~${section.targetWords} words)${subs}`;
  }).join('\n');
}

export function buildOutlinePrompt(brief: ReportBrief, sources: string, references: Reference[]): AiPrompt {
  const type = getReportType(brief.typeId);
  const template = type.sections.length > 0
    ? `A conventional structure for this type, to adapt (rename, merge, add or drop sections to fit this specific report):\n${type.sections.map((section) => `- ${section.title}: ${section.notes}`).join('\n')}`
    : 'Design the most fitting professional structure for this document.';
  const prompt = [
    'Design the outline for the following report.',
    '',
    describeDetails(brief, type),
    `Total length: about ${brief.details.targetWords} words.`,
    '',
    template,
    '',
    `Type-specific expectations: ${type.guidance}`,
    references.length > 0 ? `\nAvailable references: ${references.map((ref) => `${ref.authors} (${ref.year}) ${ref.title}`).join('; ')}` : '',
    sourcesBlock(sources),
    '',
    'Return ONLY a JSON object, with no Markdown fence and no commentary, in exactly this shape:',
    '{"sections":[{"title":"Introduction","notes":"What this section must cover, specific to this report (1–3 sentences)","targetWords":600,"subsections":["Background","Objectives"],"unnumbered":false}]}',
    'Rules: section titles must be specific to this report, not generic, where the convention allows. "unnumbered" is true only for front or back matter such as Abstract, Executive Summary, Acknowledgements and References. Word targets must add up to roughly the total. Do not include a table of contents or a title page; the app adds them.',
  ].filter((line) => line !== '').join('\n');
  return { system: WRITER_SYSTEM_PROMPT, prompt };
}

/** Condensed view of what has been written so far, for continuity. */
export interface WrittenSection {
  title: string;
  markdown: string;
}

function condense(markdown: string, words: number): string {
  const plain = markdown.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim();
  const list = plain.split(' ');
  return list.length <= words ? plain : `${list.slice(0, words).join(' ')}…`;
}

function tail(markdown: string, words: number): string {
  const list = markdown.replace(/\s+/g, ' ').trim().split(' ');
  return list.length <= words ? list.join(' ') : `…${list.slice(-words).join(' ')}`;
}

export interface SectionPromptInput {
  brief: ReportBrief;
  outline: OutlineSection[];
  index: number;
  written: WrittenSection[];
  sources: string;
  references: Reference[];
}

export function buildSectionPrompt({ brief, outline, index, written, sources, references }: SectionPromptInput): AiPrompt {
  const type = getReportType(brief.typeId);
  const section = outline[index];
  const isReferences = /^(references|bibliography|works cited|reference list)$/i.test(section.title.trim());
  const previous = written.length > 0
    ? [
      'Sections already written (condensed) — do not repeat their content:',
      ...written.map((entry) => `- ${entry.title}: ${condense(entry.markdown, 60)}`),
      '',
      `The previous section ended: "${tail(written[written.length - 1].markdown, 80)}"`,
    ].join('\n')
    : 'This is the first section of the report.';
  const subsectionRule = section.subsections.length > 0
    ? `Organise it under these ## subsections, in order: ${section.subsections.join('; ')}.`
    : 'Use ## subsections only if the section is long enough to need them.';
  const referencesRule = isReferences
    ? references.length > 0
      ? 'Write nothing but the line "[[BIBLIOGRAPHY]]"; the app generates the formatted list from the references.'
      : `List every work cited in the earlier sections, formatted in ${CITATION_STYLES.find((entry) => entry.id === brief.style.citationStyle)?.label} style, one per paragraph${isNumericStyle(brief.style.citationStyle) ? ' in citation order with [n] numbers' : ' in alphabetical order'}. Include only works actually cited.`
    : '';

  const prompt = [
    describeDetails(brief, type),
    '',
    'Full outline of the report:',
    outlineToText(outline),
    '',
    previous,
    '',
    `Now write the section "${section.title}" in full — about ${section.targetWords} words.`,
    section.notes ? `It must cover: ${section.notes}` : '',
    subsectionRule,
    referencesRule,
    'Do not write the section title itself; start directly with the content.',
    '',
    `Type-specific expectations: ${type.guidance}`,
    '',
    'Writing style:',
    buildStyleRules(brief.humanizer, brief.voice),
    '',
    citationRules(brief, references),
    '',
    MARKDOWN_CONTRACT,
    sourcesBlock(sources),
  ].filter((line) => line !== '').join('\n');
  return { system: WRITER_SYSTEM_PROMPT, prompt };
}

export type RewriteAction =
  | 'rewrite'
  | 'expand'
  | 'shorten'
  | 'humanize'
  | 'grammar'
  | 'formal'
  | 'simplify'
  | 'continue'
  | 'custom';

export const REWRITE_ACTIONS: Array<{ id: RewriteAction; label: string; hint: string }> = [
  { id: 'rewrite', label: 'Rewrite', hint: 'Same meaning, better prose' },
  { id: 'humanize', label: 'Humanize', hint: 'Make it read like a person wrote it' },
  { id: 'expand', label: 'Expand', hint: 'Add depth, evidence and examples' },
  { id: 'shorten', label: 'Shorten', hint: 'Cut to the essentials' },
  { id: 'grammar', label: 'Fix grammar', hint: 'Correct errors only' },
  { id: 'formal', label: 'More formal', hint: 'Raise the register' },
  { id: 'simplify', label: 'Simplify', hint: 'Plainer words, shorter sentences' },
  { id: 'continue', label: 'Continue writing', hint: 'Write what comes next' },
];

const ACTION_INSTRUCTIONS: Record<RewriteAction, string> = {
  rewrite: 'Rewrite the passage so it reads better: clearer, tighter and more fluent. Keep the meaning, facts, citations and structure.',
  expand: 'Expand the passage to roughly twice its length with substantive depth: reasoning, evidence, specific examples. Keep its structure and every fact and citation.',
  shorten: 'Shorten the passage to roughly half its length, keeping every essential point, fact and citation.',
  humanize: 'Rewrite the passage so it reads as if written by an experienced human expert. Rebuild sentences rather than swapping synonyms. Keep every fact, number, citation, term and the overall structure (headings, lists, tables) intact.',
  grammar: 'Correct grammar, spelling, punctuation and agreement only. Change nothing else.',
  formal: 'Rewrite the passage in a more formal, professional register without making it stiff.',
  simplify: 'Rewrite the passage in plainer language with shorter sentences, keeping all the content.',
  continue: 'Continue the text from where the passage ends, in the same voice and format, for about 200–300 words. Output only the new text.',
  custom: '',
};

export interface RewritePromptInput {
  brief: ReportBrief;
  action: RewriteAction;
  passage: string;
  sectionTitle?: string;
  instruction?: string;
  references: Reference[];
}

export function buildRewritePrompt({ brief, action, passage, sectionTitle, instruction, references }: RewritePromptInput): AiPrompt {
  const type = getReportType(brief.typeId);
  const task = action === 'custom' ? (instruction?.trim() || ACTION_INSTRUCTIONS.rewrite) : ACTION_INSTRUCTIONS[action];
  const extra = action !== 'custom' && instruction?.trim() ? `Additional instruction: ${instruction.trim()}` : '';
  const humanizer = action === 'humanize'
    ? { ...brief.humanizer, enabled: true, intensity: Math.max(brief.humanizer.intensity, 60) }
    : brief.humanizer;
  const prompt = [
    `Context: this passage is from a ${type.name}${brief.details.title ? ` titled "${brief.details.title}"` : ''}${sectionTitle ? `, section "${sectionTitle}"` : ''}.`,
    '',
    `Task: ${task}`,
    extra,
    '',
    'Writing style:',
    buildStyleRules(humanizer, brief.voice),
    '',
    references.length > 0 ? 'Keep citation markers such as [@key] exactly as they are.' : '',
    action === 'grammar' ? '' : MARKDOWN_CONTRACT,
    'Output only the resulting passage.',
    '',
    '<passage>',
    passage,
    '</passage>',
  ].filter((line) => line !== '').join('\n');
  return { system: WRITER_SYSTEM_PROMPT, prompt };
}

// Outline parsing ---------------------------------------------------------

const clampWords = (value: unknown, fallback: number): number => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(20_000, Math.max(50, number)) : fallback;
};

const FRONT_BACK_MATTER = /^(abstract|executive summary|summary|acknowledg(e)?ments?|references|bibliography|works cited|appendix|appendices|glossary|highlights|key messages)$/i;

function fromJson(value: unknown, totalWords: number): OutlineSection[] | null {
  const list = Array.isArray(value) ? value : (value as { sections?: unknown })?.sections;
  if (!Array.isArray(list) || list.length === 0) return null;
  const fallback = Math.round(totalWords / list.length);
  const sections = list
    .map((entry): OutlineSection | null => {
      if (typeof entry === 'string') {
        return { id: newSectionId(), title: entry.trim(), notes: '', targetWords: fallback, subsections: [], unnumbered: FRONT_BACK_MATTER.test(entry.trim()) };
      }
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Record<string, unknown>;
      const title = String(raw.title ?? raw.heading ?? raw.name ?? '').replace(/^[\d.\s]+/, '').trim();
      if (!title) return null;
      const subsections = Array.isArray(raw.subsections)
        ? raw.subsections.map((sub) => (typeof sub === 'string' ? sub : String((sub as Record<string, unknown>)?.title ?? ''))).map((sub) => sub.replace(/^[\d.\s]+/, '').trim()).filter(Boolean)
        : [];
      return {
        id: newSectionId(),
        title,
        notes: String(raw.notes ?? raw.description ?? raw.summary ?? '').trim(),
        targetWords: clampWords(raw.targetWords ?? raw.words ?? raw.wordCount, fallback),
        subsections,
        unnumbered: typeof raw.unnumbered === 'boolean' ? raw.unnumbered : FRONT_BACK_MATTER.test(title),
      };
    })
    .filter((section): section is OutlineSection => section !== null);
  return sections.length > 0 ? sections : null;
}

/** The first JSON value in a model reply: a fenced block first, then the raw text. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.search(/[{[]/);
    if (start < 0) continue;
    const open = candidate[start];
    const close = open === '{' ? '}' : ']';
    const end = candidate.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function fromMarkdown(text: string, totalWords: number): OutlineSection[] | null {
  const sections: OutlineSection[] = [];
  for (const line of text.split(/\r?\n/)) {
    const top = line.match(/^(?:#{1,2}\s+|\d+[.)]\s+|[-*]\s+)(.+)$/);
    const sub = line.match(/^(?:#{3,}\s+|\s{2,}(?:\d+(?:\.\d+)+[.)]?|[-*])\s+)(.+)$/);
    if (sub && sections.length > 0) {
      sections[sections.length - 1].subsections.push(sub[1].replace(/^[\d.\s]+/, '').trim());
    } else if (top) {
      const title = top[1].replace(/\*\*/g, '').replace(/^[\d.\s]+/, '').replace(/[:—-].*$/, '').trim();
      if (title) sections.push({ id: newSectionId(), title, notes: '', targetWords: 0, subsections: [], unnumbered: FRONT_BACK_MATTER.test(title) });
    }
  }
  if (sections.length < 2) return null;
  const each = Math.round(totalWords / sections.length);
  return sections.map((section) => ({ ...section, targetWords: each }));
}

/** Parses the outline the model returned: JSON first, then a Markdown or numbered list. */
export function parseOutline(text: string, totalWords: number): OutlineSection[] | null {
  return fromJson(extractJson(text), totalWords) ?? fromMarkdown(text, totalWords);
}
