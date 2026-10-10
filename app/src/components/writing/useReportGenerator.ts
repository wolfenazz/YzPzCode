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
  type RewriteAction,
  type WrittenSection,
} from '../../utils/writing/prompts';
import { gatherSources } from '../../utils/writing/sources';
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

/** Replaces a section's body (everything after its heading) with `blocks`. */
export function replaceSectionBody(editor: Editor, sectionId: string, blocks: DocNode[], addToHistory: boolean): boolean {
  const range = findSectionRange(editor.state.doc, sectionId);
  if (!range) return false;
  let nodes = toNodes(editor, blocks);
  if (nodes.length === 0) nodes = [editor.schema.nodes.paragraph.create()];
  const tr = editor.state.tr
    .replaceWith(range.bodyFrom, range.to, nodes as unknown as Fragment)
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

  /** Asks the AI for an outline. Returns null (with the run marked failed) when it cannot. */
  const generateOutline = useCallback(async (brief: ReportBrief, bibliography: Reference[]): Promise<OutlineSection[] | null> => {
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
    return outline;
  }, [runAi, store, workspaceId]);

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
      const { system, prompt } = buildSectionPrompt({ brief, outline, index, written, sources, references: bibliography });

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
      const timer = window.setInterval(flush, STREAM_INTERVAL_MS);
      const result = await runAi(`Writing ${section.title}`, system, prompt, (text) => { latest = text; });
      window.clearInterval(timer);
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
  }, [getEditor, runAi, session, store, workspaceId]);

  /** Runs a rewrite on a passage and returns the new Markdown (the caller shows it for review). */
  const rewrite = useCallback(async ({ action, passage, sectionTitle, instruction, onText }: RewriteRequest): Promise<AiRunResult> => {
    const current = session();
    if (!current?.brief) return { ok: false, cancelled: false, text: '', error: 'No report is open.' };
    cancelled.current = false;
    const { system, prompt } = buildRewritePrompt({ brief: current.brief, action, passage, sectionTitle, instruction, references: current.bibliography });
    const label = action === 'custom' ? 'Applying your instruction' : `${action[0].toUpperCase()}${action.slice(1)}`;
    return runAi(label, system, prompt, onText);
  }, [runAi, session]);

  return { generateOutline, generateSections, rewrite, cancel };
}

/** Parses rewritten Markdown into blocks for the review diff and for insertion. */
export const rewriteToBlocks = (markdown: string): DocNode[] => parseBlocks(markdown, { minHeadingLevel: 2 });
