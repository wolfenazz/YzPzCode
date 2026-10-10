import { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { Node as PmNode, type Fragment } from '@tiptap/pm/model';
import { useWritingSessionStore, type AiCallRecord } from '../../stores/writingSessionStore';
import { useWritingStore } from '../../stores/writingStore';
import { startAiRun, type AiRun, type AiRunResult } from '../../utils/writing/aiClient';
import { blocksToMarkdown, countWords, parseBlocks, sectionToNodes } from '../../utils/writing/markdown';
import {
  buildOutlinePrompt,
  buildRewritePrompt,
  buildSectionPrompt,
  parseOutline,
  parseOutlineTitle,
  type RewriteAction,
  type WrittenSection,
} from '../../utils/writing/prompts';
import { getReportType } from '../../utils/writing/reportTypes';
import { gatherSources } from '../../utils/writing/sources';
import { fileName, joinPath, parentPath } from '../../utils/writing/document';
import { commonPrefixLength } from '../../utils/writing/pageFlow';
import { MAX_WEB_PHOTOS } from '../../utils/writing/pictures';
import { fetchWebPictures, webPicturesEnabled } from '../../utils/webPictures';
import { buildRestylePrompt, parseRestyle, type RestyleResult } from '../../utils/writing/styleAi';
import type { DocNode, OutlineSection, Reference, ReportBrief } from '../../utils/writing/types';
import { aiStreamKey, findSectionRange } from './editor/extensions';

const STREAM_INTERVAL_MS = 120;

let callCounter = 0;
const newCallId = (): string => `call-${Date.now().toString(36)}-${(callCounter += 1).toString(36)}`;

/** Converts JSON blocks to schema nodes, dropping any the schema rejects. */
function toNodes(editor: Editor, blocks: DocNode[]): PmNode[] {
  const nodes: PmNode[] = [];
  for (const block of blocks) {
    try {
      const node = PmNode.fromJSON(editor.schema, block);
      node.check();
      nodes.push(node);
    } catch {
      const text = blocksToMarkdown([block]).trim();
      if (text) nodes.push(editor.schema.nodes.paragraph.create(null, editor.schema.text(text)));
    }
  }
  return nodes;
}

/**
 * Replaces a section's body (everything after its heading) with `blocks`.
 * Blocks that are already there unchanged are left alone, so a streaming
 * update only redraws the paragraph that is still being written.
 */
export function replaceSectionBody(editor: Editor, sectionId: string, blocks: DocNode[], addToHistory: boolean): boolean {
  const { doc } = editor.state;
  const range = findSectionRange(doc, sectionId);
  if (!range) return false;
  let nodes = toNodes(editor, blocks);
  if (nodes.length === 0) nodes = [editor.schema.nodes.paragraph.create()];
  const existing: PmNode[] = [];
  doc.nodesBetween(range.bodyFrom, range.to, (node, pos) => {
    if (pos >= range.bodyFrom) existing.push(node);
    return false;
  });
  const kept = commonPrefixLength(existing, nodes, (a, b) => a.eq(b));
  if (kept === existing.length && kept === nodes.length) return true;
  const from = existing.slice(0, kept).reduce((pos, node) => pos + node.nodeSize, range.bodyFrom);
  const tr = editor.state.tr
    .replaceWith(from, range.to, nodes.slice(kept) as unknown as Fragment)
    .setMeta('aiStreamWrite', true)
    .setMeta('addToHistory', addToHistory);
  editor.view.dispatch(tr);
  return true;
}

export function setStreamingSection(editor: Editor, sectionId: string | null): void {
  editor.view.dispatch(editor.state.tr.setMeta(aiStreamKey, { sectionId }).setMeta('addToHistory', false));
}

/** The JSON of a section's body as it stands in the editor (user edits included). */
export function sectionBodyJson(editor: Editor, sectionId: string): DocNode[] {
  const range = findSectionRange(editor.state.doc, sectionId);
  if (!range) return [];
  const blocks: DocNode[] = [];
  editor.state.doc.nodesBetween(range.bodyFrom, range.to, (node, pos) => {
    if (pos >= range.bodyFrom) blocks.push(node.toJSON() as DocNode);
    return false;
  });
  return blocks;
}

/** Appends a heading for a section that is in the outline but not yet in the document. */
function ensureSectionHeading(editor: Editor, section: OutlineSection, after: OutlineSection | null): void {
  if (findSectionRange(editor.state.doc, section.id)) return;
  const heading = editor.schema.nodes.heading.create(
    { level: 1, sectionId: section.id, unnumbered: Boolean(section.unnumbered) },
    editor.schema.text(section.title),
  );
  const paragraph = editor.schema.nodes.paragraph.create();
  const anchor = after ? findSectionRange(editor.state.doc, after.id) : null;
  const position = anchor ? anchor.to : editor.state.doc.content.size;
  editor.view.dispatch(editor.state.tr.insert(position, [heading, paragraph] as unknown as Fragment).setMeta('addToHistory', false));
}

export interface GenerateOptions {
  /** Only these sections; all by default. */
  sectionIds?: string[];
  /** Skip sections that already have text. */
  skipWritten?: boolean;
}

export interface RewriteRequest {
  action: RewriteAction;
  passage: string;
  sectionTitle?: string;
  instruction?: string;
  onText?: (text: string) => void;
}

/** The writer may ask for web photos in this report. */
const photosOn = (brief: ReportBrief): boolean => brief.pictures !== 'none' && webPicturesEnabled();

export interface OutlineDesign {
  outline: OutlineSection[];
  /** The title the AI proposed, when the brief had none. */
  title: { title: string; subtitle: string } | null;
}

export function useReportGenerator(workspaceId: string, getEditor: () => Editor | null) {
  const activeRun = useRef<AiRun | null>(null);
  const cancelled = useRef(false);

  const session = useCallback(() => useWritingSessionStore.getState().sessions[workspaceId], [workspaceId]);
  const store = useWritingSessionStore.getState;

  const recordCall = useCallback((label: string): string => {
    const id = newCallId();
    store().updateRun(workspaceId, (run) => ({
      calls: [...run.calls.slice(-40), { id, label, status: 'running', startedAt: Date.now(), endedAt: null, error: null }],
    }));
    return id;
  }, [store, workspaceId]);

  const finishCall = useCallback((id: string, result: AiRunResult): void => {
    const status: AiCallRecord['status'] = result.ok ? 'done' : result.cancelled ? 'cancelled' : 'failed';
    store().updateRun(workspaceId, (run) => ({
      calls: run.calls.map((call) => (call.id === id ? { ...call, status, endedAt: Date.now(), error: result.error } : call)),
    }));
  }, [store, workspaceId]);

  const runAi = useCallback(async (label: string, system: string, prompt: string, onText?: (text: string) => void): Promise<AiRunResult> => {
    const brief = session()?.brief;
    if (!brief) return { ok: false, cancelled: false, text: '', error: 'No report is open.' };
    const callId = recordCall(label);
    const run = startAiRun({
      engine: brief.engine.engine,
      model: brief.engine.model,
      effort: brief.engine.effort,
      system,
      prompt,
      timeoutSecs: useWritingStore.getState().aiTimeoutSecs,
      onText,
    });
    activeRun.current = run;
    const result = await run.result;
    if (activeRun.current === run) activeRun.current = null;
    finishCall(callId, result);
    return result;
  }, [finishCall, recordCall, session]);

  const cancel = useCallback((): void => {
    cancelled.current = true;
    activeRun.current?.cancel();
  }, []);

  useEffect(() => () => {
    // Closing the workspace (unmount) stops any run in flight.
    activeRun.current?.cancel();
  }, []);

  /** Asks the AI for an outline (and a title). Returns null (with the run marked failed) when it cannot. */
  const generateOutline = useCallback(async (brief: ReportBrief, bibliography: Reference[]): Promise<OutlineDesign | null> => {
    cancelled.current = false;
    store().update(workspaceId, { brief });
    store().updateRun(workspaceId, { phase: 'outline', startedAt: Date.now(), endedAt: null, error: null, calls: [], sectionStatus: {}, currentSectionId: null, wordsWritten: 0 });
    const { text: sources } = await gatherSources(brief.details.sourceNotes, brief.details.sourceFiles);
    const { system, prompt } = buildOutlinePrompt(brief, sources, bibliography);
    const result = await runAi('Designing the outline', system, prompt);
    if (!result.ok) {
      store().updateRun(workspaceId, { phase: result.cancelled ? 'cancelled' : 'failed', endedAt: Date.now(), error: result.error });
      return null;
    }
    const outline = parseOutline(result.text, brief.details.targetWords);
    if (!outline) {
      store().updateRun(workspaceId, { phase: 'failed', endedAt: Date.now(), error: 'The AI did not return a usable outline. Try again or edit the outline by hand.' });
      return null;
    }
    store().updateRun(workspaceId, { phase: 'idle', endedAt: Date.now() });
    return { outline, title: brief.details.title.trim() ? null : parseOutlineTitle(result.text) };
  }, [runAi, store, workspaceId]);

  // Web photos: every figure the writer asked for with [Photo: …] gets a real, credited photo.
  const fetching = useRef(new Set<string>());
  const notFound = useRef(new Set<string>());
  const fillPictures = useCallback(async (): Promise<void> => {
    const editor = getEditor();
    const current = session();
    const docPath = current?.docPath;
    if (!editor || !docPath || !current.brief || !photosOn(current.brief)) return;
    let placed = 0;
    const queries: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name !== 'figure') return true;
      if (node.attrs.credit) placed += 1;
      const query = typeof node.attrs.query === 'string' ? node.attrs.query : '';
      if (!node.attrs.src && query && !fetching.current.has(query) && !notFound.current.has(query) && !queries.includes(query)) queries.push(query);
      return false;
    });
    const wanted = queries.slice(0, Math.max(0, MAX_WEB_PHOTOS - placed - fetching.current.size));
    if (wanted.length === 0) return;
    wanted.forEach((query) => fetching.current.add(query));
    const found = await fetchWebPictures(wanted, joinPath(parentPath(docPath), 'assets'));
    wanted.forEach((query, index) => {
      fetching.current.delete(query);
      if (!found[index]) notFound.current.add(query);
    });
    const live = getEditor();
    if (!live || session()?.docPath !== docPath) return;
    const byQuery = new Map(wanted.map((query, index) => [query, found[index]] as const));
    const tr = live.state.tr;
    live.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'figure') return true;
      const picture = !node.attrs.src ? byQuery.get(String(node.attrs.query ?? '')) : null;
      if (picture) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: `assets/${fileName(picture.path)}`, query: null, credit: picture.credit });
        byQuery.delete(String(node.attrs.query));
      }
      return false;
    });
    if (tr.docChanged) live.view.dispatch(tr.setMeta('aiStreamWrite', true).setMeta('addToHistory', false));
  }, [getEditor, session]);

  /** Writes sections one after another, streaming each into the page. */
  const generateSections = useCallback(async (options: GenerateOptions = {}): Promise<void> => {
    const editor = getEditor();
    const current = session();
    if (!editor || !current?.brief) return;
    cancelled.current = false;
    const { brief, outline, bibliography } = current;
    const targets = outline.filter((section) => !options.sectionIds || options.sectionIds.includes(section.id));
    const sectionStatus = Object.fromEntries(targets.map((section) => [section.id, 'queued' as const]));
    store().updateRun(workspaceId, (run) => ({
      phase: 'writing',
      startedAt: Date.now(),
      endedAt: null,
      error: null,
      calls: run.phase === 'outline' || run.phase === 'idle' ? run.calls : [],
      sectionStatus,
      currentSectionId: null,
      wordsWritten: 0,
    }));

    const { text: sources, errors } = await gatherSources(brief.details.sourceNotes, brief.details.sourceFiles);
    if (errors.length > 0) console.warn('Some source files could not be read:', errors);

    let previous: OutlineSection | null = null;
    let failure: string | null = null;
    for (const section of outline) {
      const index = outline.indexOf(section);
      ensureSectionHeading(editor, section, previous);
      previous = section;
      if (!targets.includes(section)) continue;
      if (cancelled.current) break;
      if (options.skipWritten && countWords(sectionBodyJson(editor, section.id)) > 20) {
        store().updateRun(workspaceId, (run) => ({ sectionStatus: { ...run.sectionStatus, [section.id]: 'done' } }));
        continue;
      }

      const written: WrittenSection[] = outline.slice(0, index)
        .map((entry) => ({ title: entry.title, markdown: blocksToMarkdown(sectionBodyJson(editor, entry.id)) }))
        .filter((entry) => entry.markdown.trim().length > 0);
      const { system, prompt } = buildSectionPrompt({ brief, outline, index, written, sources, references: bibliography, photos: photosOn(brief) });

      store().updateRun(workspaceId, (run) => ({ currentSectionId: section.id, sectionStatus: { ...run.sectionStatus, [section.id]: 'writing' } }));
      setStreamingSection(editor, section.id);

      let latest = '';
      let flushed = '';
      const flush = (): void => {
        if (latest === flushed) return;
        flushed = latest;
        const nodes = sectionToNodes(section, latest).slice(1);
        replaceSectionBody(editor, section.id, nodes, false);
      };
      // Writes land on a frame boundary, at most every STREAM_INTERVAL_MS.
      let frame = 0;
      const timer = window.setInterval(() => {
        if (latest !== flushed && !frame) frame = requestAnimationFrame(() => { frame = 0; flush(); });
      }, STREAM_INTERVAL_MS);
      const result = await runAi(`Writing ${section.title}`, system, prompt, (text) => { latest = text; });
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
      setStreamingSection(editor, null);

      if (result.ok) {
        const body = sectionToNodes(section, result.text).slice(1);
        // One undo step removes the whole written section.
        replaceSectionBody(editor, section.id, [], false);
        replaceSectionBody(editor, section.id, body, true);
        const words = countWords(body);
        store().updateRun(workspaceId, (run) => ({
          wordsWritten: run.wordsWritten + words,
          sectionStatus: { ...run.sectionStatus, [section.id]: 'done' },
        }));
        store().update(workspaceId, { dirty: true });
        void fillPictures();
      } else {
        flush();
        const status = result.cancelled ? 'cancelled' : 'failed';
        store().updateRun(workspaceId, (run) => ({ sectionStatus: { ...run.sectionStatus, [section.id]: status } }));
        if (result.cancelled || cancelled.current) break;
        failure = result.error ?? 'The AI run failed.';
        break;
      }
    }

    setStreamingSection(editor, null);
    store().updateRun(workspaceId, (run) => ({
      phase: failure ? 'failed' : cancelled.current ? 'cancelled' : 'done',
      endedAt: Date.now(),
      currentSectionId: null,
      error: failure,
      sectionStatus: Object.fromEntries(Object.entries(run.sectionStatus).map(([id, status]) => [id, status === 'queued' ? (cancelled.current ? 'cancelled' : status) : status])),
    }));
  }, [fillPictures, getEditor, runAi, session, store, workspaceId]);

  /** Runs a rewrite on a passage and returns the new Markdown (the caller shows it for review). */
  const rewrite = useCallback(async ({ action, passage, sectionTitle, instruction, onText }: RewriteRequest): Promise<AiRunResult> => {
    const current = session();
    if (!current?.brief) return { ok: false, cancelled: false, text: '', error: 'No report is open.' };
    cancelled.current = false;
    const { system, prompt } = buildRewritePrompt({ brief: current.brief, action, passage, sectionTitle, instruction, references: current.bibliography, photos: photosOn(current.brief) });
    const label = action === 'custom' ? 'Applying your instruction' : `${action[0].toUpperCase()}${action.slice(1)}`;
    return runAi(label, system, prompt, onText);
  }, [runAi, session]);

  /** Asks the AI to restyle the open report; the caller applies the result. */
  const restyle = useCallback(async (instruction: string): Promise<{ ok: true; result: RestyleResult } | { ok: false; cancelled: boolean; error: string }> => {
    const current = session();
    if (!current?.brief) return { ok: false, cancelled: false, error: 'No report is open.' };
    cancelled.current = false;
    const { brief } = current;
    const { system, prompt } = buildRestylePrompt(brief.style, instruction, { typeName: getReportType(brief.typeId).name, title: brief.details.title });
    const reply = await runAi('Restyling', system, prompt);
    if (!reply.ok) return { ok: false, cancelled: reply.cancelled, error: reply.error ?? 'The AI run failed.' };
    const result = parseRestyle(reply.text, useWritingSessionStore.getState().sessions[workspaceId]?.brief?.style ?? brief.style);
    return result ? { ok: true, result } : { ok: false, cancelled: false, error: 'The AI did not suggest a change it could apply. Try describing the look differently.' };
  }, [runAi, session, workspaceId]);

  return { generateOutline, generateSections, rewrite, restyle, fillPictures, cancel };
}

/** Parses rewritten Markdown into blocks for the review diff and for insertion. */
export const rewriteToBlocks = (markdown: string): DocNode[] => parseBlocks(markdown, { minHeadingLevel: 2 });
