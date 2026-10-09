// The `.yzdoc` report file: creation, the editor skeleton, section lookup,
// serialisation and validation. Dependency-free (tested by `npm run test:writing`).

import { defaultHumanizer } from './humanizer';
import { getReportType } from './reportTypes';
import { sanitizeStyle, styleFromTheme } from './stylePresets';
import type {
  DocNode,
  EngineChoice,
  OutlineSection,
  Reference,
  ReportBrief,
  ReportDetails,
  ReportProfile,
  VoiceSettings,
  YzDoc,
} from './types';

export const YZDOC_EXTENSION = '.yzdoc';
export const REPORTS_FOLDER = 'Reports';

export const DEFAULT_VOICE: VoiceSettings = { tone: 'formal', readingLevel: 'professional', person: 'auto', spelling: 'us' };
export const DEFAULT_ENGINE: EngineChoice = { engine: 'claude', model: '', allowWebResearch: false };

export function emptyDetails(targetWords = 4000): ReportDetails {
  return {
    title: '',
    subtitle: '',
    brief: '',
    audience: '',
    authors: '',
    organization: '',
    date: new Date().toISOString().slice(0, 10),
    language: 'English',
    targetWords,
    fields: {},
    sourceNotes: '',
    sourceFiles: [],
  };
}

/** A fresh brief for a report type, optionally starting from a saved profile. */
export function createBrief(typeId: string, profile?: ReportProfile | null, engine?: EngineChoice): ReportBrief {
  const type = getReportType(profile?.typeId ?? typeId);
  const details = { ...emptyDetails(type.targetWords), ...(profile?.details ?? {}) };
  details.fields = { ...(profile?.details?.fields ?? {}) };
  details.date = new Date().toISOString().slice(0, 10);
  const style = profile
    ? sanitizeStyle(profile.style)
    : styleFromTheme(type.themeId, {
      citationStyle: type.citationStyle,
      includeToc: type.includeToc !== false,
      sectionBreaks: type.includeToc !== false,
      cover: type.includeToc === false ? 'none' : undefined,
    });
  if (!profile && type.includeToc === false) style.cover = 'none';
  return {
    typeId: type.id,
    details,
    style,
    voice: profile ? { ...profile.voice } : { ...DEFAULT_VOICE, tone: type.tone },
    humanizer: profile ? { ...profile.humanizer, bannedPhrases: [...profile.humanizer.bannedPhrases] } : defaultHumanizer(),
    engine: { ...(profile?.engine ?? engine ?? DEFAULT_ENGINE) },
  };
}

let docCounter = 0;
export function newDocId(): string {
  docCounter += 1;
  return `doc-${Date.now().toString(36)}-${docCounter.toString(36)}`;
}

const emptyParagraph = (): DocNode => ({ type: 'paragraph' });

/** The editor content for an outline before anything is written. */
export function skeletonContent(brief: ReportBrief, outline: OutlineSection[]): DocNode {
  const content: DocNode[] = [];
  if (brief.style.cover !== 'none') content.push({ type: 'coverPage' });
  const leading: OutlineSection[] = [];
  const rest: OutlineSection[] = [];
  let reachedNumbered = false;
  for (const section of outline) {
    if (!reachedNumbered && section.unnumbered) leading.push(section);
    else {
      reachedNumbered = true;
      rest.push(section);
    }
  }
  const heading = (section: OutlineSection): DocNode => ({
    type: 'heading',
    attrs: { level: 1, sectionId: section.id, unnumbered: Boolean(section.unnumbered) },
    content: [{ type: 'text', text: section.title }],
  });
  for (const section of leading) content.push(heading(section), emptyParagraph());
  if (brief.style.includeToc) content.push({ type: 'tableOfContents' });
  for (const section of rest) content.push(heading(section), emptyParagraph());
  if (content.length === 0) content.push(emptyParagraph());
  return { type: 'doc', content };
}

export function createDoc(brief: ReportBrief, outline: OutlineSection[], bibliography: Reference[] = []): YzDoc {
  const now = Date.now();
  return {
    format: 'yzdoc',
    version: 1,
    meta: {
      id: newDocId(),
      title: brief.details.title.trim() || getReportType(brief.typeId).name,
      typeId: brief.typeId,
      createdAt: now,
      updatedAt: now,
    },
    brief,
    outline,
    bibliography,
    content: skeletonContent(brief, outline),
  };
}

/** Top-level index range [start, end) of a section's blocks in the doc content. */
export function sectionBlockRange(content: DocNode[], sectionId: string): [number, number] | null {
  const start = content.findIndex((node) => node.type === 'heading' && node.attrs?.sectionId === sectionId);
  if (start < 0) return null;
  let end = start + 1;
  while (end < content.length) {
    const node = content[end];
    if (node.type === 'heading' && node.attrs?.sectionId) break;
    if (node.type === 'tableOfContents') break;
    end += 1;
  }
  return [start, end];
}

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'report';
}

export function pathSeparator(base: string): string {
  return base.includes('\\') && !base.includes('/') ? '\\' : '/';
}

export function joinPath(base: string, ...parts: string[]): string {
  const sep = pathSeparator(base);
  return [base.replace(/[\\/]+$/, ''), ...parts.map((part) => part.replace(/^[\\/]+|[\\/]+$/g, ''))].join(sep);
}

export function parentPath(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index > 0 ? path.slice(0, index) : path;
}

export function fileName(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index >= 0 ? path.slice(index + 1) : path;
}

/** `<workspace>/Reports/<slug>/<slug>.yzdoc`, with a numeric suffix if `taken` has it. */
export function reportPath(workspacePath: string, title: string, taken: Set<string> = new Set()): string {
  const base = slugify(title);
  let slug = base;
  let counter = 2;
  const candidate = (): string => joinPath(workspacePath, REPORTS_FOLDER, slug, `${slug}${YZDOC_EXTENSION}`);
  while (taken.has(candidate().toLowerCase())) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return candidate();
}

export function serializeDoc(doc: YzDoc): string {
  return `${JSON.stringify({ ...doc, meta: { ...doc.meta, updatedAt: Date.now() } }, null, 1)}\n`;
}

/** Parses and repairs a `.yzdoc` file. Throws with a readable message when it is not one. */
export function parseDoc(text: string): YzDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a valid report (it is not JSON).');
  }
  const value = raw as Partial<YzDoc>;
  if (!value || typeof value !== 'object' || value.format !== 'yzdoc') {
    throw new Error('This file is not a YzPzCode report.');
  }
  if (value.version !== 1) throw new Error(`Report format version ${String(value.version)} is not supported.`);
  const content = value.content && typeof value.content === 'object' && (value.content as DocNode).type === 'doc'
    ? value.content as DocNode
    : { type: 'doc', content: [{ type: 'paragraph' }] };
  const fallbackBrief = createBrief(value.meta?.typeId ?? 'custom');
  const brief = value.brief ?? fallbackBrief;
  return {
    format: 'yzdoc',
    version: 1,
    meta: {
      id: String(value.meta?.id ?? newDocId()),
      title: String(value.meta?.title ?? 'Untitled report'),
      typeId: String(value.meta?.typeId ?? brief.typeId ?? 'custom'),
      createdAt: Number(value.meta?.createdAt ?? Date.now()),
      updatedAt: Number(value.meta?.updatedAt ?? Date.now()),
    },
    brief: {
      ...fallbackBrief,
      ...brief,
      details: { ...fallbackBrief.details, ...(brief.details ?? {}), fields: { ...(brief.details?.fields ?? {}) } },
      style: sanitizeStyle(brief.style),
      voice: { ...DEFAULT_VOICE, ...(brief.voice ?? {}) },
      humanizer: { ...fallbackBrief.humanizer, ...(brief.humanizer ?? {}) },
      engine: { ...DEFAULT_ENGINE, ...(brief.engine ?? {}) },
    },
    outline: Array.isArray(value.outline) ? value.outline : [],
    bibliography: Array.isArray(value.bibliography) ? value.bibliography : [],
    content,
  };
}

/** Headings for the navigator and the table of contents, with display numbers. */
export interface HeadingEntry {
  level: number;
  text: string;
  number: string;
  sectionId: string | null;
  /** Index of the top-level block. */
  index: number;
}

export function headingEntries(content: DocNode[], numbering: ReportBrief['style']['headingNumbering'], maxLevel = 3): HeadingEntry[] {
  const counters = [0, 0, 0, 0, 0];
  const entries: HeadingEntry[] = [];
  let inUnnumbered = false;
  content.forEach((node, index) => {
    if (node.type !== 'heading') return;
    const level = Number(node.attrs?.level ?? 1);
    const text = (node.content ?? []).map((child) => child.text ?? '').join('').trim();
    if (level === 1) inUnnumbered = Boolean(node.attrs?.unnumbered);
    let number = '';
    if (numbering !== 'none' && !inUnnumbered) {
      counters[level - 1] += 1;
      for (let i = level; i < counters.length; i += 1) counters[i] = 0;
      number = counters.slice(0, level).join('.');
      if (numbering === 'chapter' && level === 1) number = `Chapter ${counters[0]}`;
    }
    if (level <= maxLevel && text) {
      entries.push({ level, text, number, sectionId: (node.attrs?.sectionId as string) ?? null, index });
    }
  });
  return entries;
}
