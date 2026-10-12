import { useCallback, useRef } from 'react';
import { selectSheetsSession, useSheetsSessionStore, type ChatTurn, type Proposal } from '../../stores/sheetsSessionStore';
import { useSheetsStore } from '../../stores/sheetsStore';
import { rangeText, normRange, quoteSheet } from '../../utils/sheets/address';
import { buildContext, readRequest, type AiScope } from '../../utils/sheets/ai/context';
import { parseReply, summarizeOps } from '../../utils/sheets/ai/parse';
import { buildPrompt, SYSTEM_PROMPT } from '../../utils/sheets/ai/prompts';
import { applyOps } from '../../utils/sheets/ops';
import type { Workbook } from '../../utils/sheets/types';
import { startAiRun, type AiRun } from '../../utils/writing/aiClient';
import { prepareAttachments, type SheetAttachment } from './attachments';

export interface AskInput {
  instruction: string;
  scope: AiScope;
  attachments?: SheetAttachment[];
  /** Shown in the transcript instead of the instruction (quick actions). */
  label?: string;
}

const newId = (): string => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** True when applying the operations changed nothing. */
function sameWorkbook(a: Workbook, b: Workbook): boolean {
  return a === b || (a.sheets.length === b.sheets.length && a.sheets.every((sheet, i) => sheet === b.sheets[i])
    && a.styles.length === b.styles.length && a.names.length === b.names.length && a.dxfs.length === b.dxfs.length && a.activeSheet === b.activeSheet);
}

const SCOPE_LABEL: Record<AiScope, string> = {
  selection: 'The selected cells',
  sheet: 'The whole active sheet',
  workbook: 'The whole workbook (every sheet)',
};

/** Runs the assistant against the open workbook and turns its answer into a proposal. */
export function useSheetsAssistant(workspaceId: string) {
  const store = useSheetsSessionStore.getState;
  const handle = useRef<AiRun | null>(null);
  const cancelled = useRef(false);

  const stop = useCallback((): void => {
    cancelled.current = true;
    handle.current?.cancel();
  }, []);

  const ask = useCallback(async (input: AskInput): Promise<void> => {
    const session = selectSheetsSession(workspaceId)(store());
    const wb = session.wb;
    if (!wb || session.run || session.proposal) return;
    const prefs = useSheetsStore.getState();
    const engine = prefs.defaultEngine;
    cancelled.current = false;
    const active = Math.min(wb.activeSheet, wb.sheets.length - 1);
    const last = session.selection.ranges[session.selection.ranges.length - 1];
    const selectionText = rangeText(normRange(last));
    const attachments = input.attachments ?? [];

    const userTurn: ChatTurn = { id: newId(), role: 'user', text: input.label ?? input.instruction, at: Date.now(), attachments: attachments.map((a) => a.name), outcome: 'none' };
    store().addChat(workspaceId, userTurn);
    const startedAt = Date.now();
    store().update(workspaceId, { run: { phase: 'thinking', label: 'Reading the workbook', startedAt, streamed: '', round: 0 }, error: null });

    const fail = (message: string): void => {
      store().addChat(workspaceId, { id: newId(), role: 'assistant', text: message, at: Date.now(), outcome: 'none', error: true });
      store().update(workspaceId, { run: null });
    };

    try {
      const prepared = await prepareAttachments(attachments);
      if (prepared.images.length > 0 && engine.engine !== 'claude' && engine.engine !== 'codex') {
        prepared.notes.push(`${engine.engine} cannot look at pictures. Choose Claude Code or Codex to transcribe a photo.`);
      }
      const reads: string[] = [];
      const history = session.chat.filter((turn) => !turn.error).slice(-6).map((turn) => ({ role: turn.role, text: turn.text }));
      let parsed = parseReply('');
      let finalText = '';
      const rounds = Math.max(0, prefs.maxReadRounds);

      for (let round = 0; round <= rounds; round += 1) {
        const context = buildContext(wb, { activeSheet: active, selection: selectionText, scope: input.scope });
        const prompt = buildPrompt({
          context,
          instruction: input.instruction,
          history,
          attachments: prepared.documents,
          pictureNames: attachments.filter((a) => a.kind === 'image').map((a) => a.name),
          reads,
          scopeLabel: SCOPE_LABEL[input.scope],
          language: prefs.language === 'auto' ? undefined : prefs.language,
        });
        store().update(workspaceId, (current) => ({
          run: { phase: round === 0 ? 'thinking' : 'reading', label: round === 0 ? 'Working on it' : 'Reading more cells', startedAt: current.run?.startedAt ?? startedAt, streamed: '', round },
        }));
        const run = startAiRun({
          engine: engine.engine,
          model: engine.model,
          effort: engine.effort,
          system: SYSTEM_PROMPT,
          prompt,
          images: prepared.images,
          timeoutSecs: prefs.aiTimeoutSecs,
          onText: (text) => store().update(workspaceId, (current) => (current.run ? { run: { ...current.run, streamed: text } } : {})),
        });
        handle.current = run;
        const result = await run.result;
        handle.current = null;
        if (cancelled.current || result.cancelled) {
          store().addChat(workspaceId, { id: newId(), role: 'assistant', text: 'Stopped.', at: Date.now(), outcome: 'none' });
          store().update(workspaceId, { run: null });
          return;
        }
        if (!result.ok && !result.text.trim()) {
          fail(result.error ?? 'The assistant did not answer. Check the engine in the panel footer.');
          return;
        }
        finalText = result.text;
        parsed = parseReply(finalText);
        if (parsed.reads.length > 0 && round < rounds && parsed.ops.length === 0) {
          for (const request of parsed.reads) reads.push(readRequest(wb, request.sheet, request.range, active));
          continue;
        }
        break;
      }

      const notes = [...prepared.notes, ...parsed.warnings];
      if (parsed.ops.length === 0) {
        const reply = parsed.reply || (parsed.warnings[0] ?? 'I could not work out a change from that. Try describing the result you want.');
        store().addChat(workspaceId, { id: newId(), role: 'assistant', text: notes.length && !parsed.reply ? reply : `${reply}${prepared.notes.length ? `\n\n${prepared.notes.join(' ')}` : ''}`, at: Date.now(), outcome: 'none' });
        store().update(workspaceId, { run: null });
        return;
      }

      store().update(workspaceId, (current) => ({ run: current.run ? { ...current.run, phase: 'applying', label: 'Applying the changes' } : null }));
      const result = applyOps(wb, parsed.ops);
      if (sameWorkbook(wb, result.wb)) {
        store().addChat(workspaceId, { id: newId(), role: 'assistant', text: parsed.reply || 'Nothing needed changing.', at: Date.now(), outcome: 'none' });
        store().update(workspaceId, { run: null });
        return;
      }
      const turnId = newId();
      const proposal: Proposal = {
        id: turnId,
        preview: result.wb,
        ops: parsed.ops,
        changed: result.changed,
        summary: summarizeOps(parsed.ops),
        warnings: [...notes, ...result.warnings],
        reply: parsed.reply,
      };
      store().addChat(workspaceId, {
        id: turnId,
        role: 'assistant',
        text: parsed.reply || 'Here is what I would change.',
        at: Date.now(),
        summary: proposal.summary.slice(0, 12),
        outcome: 'pending',
      });
      // Show the sheet that changed most when a new sheet was added.
      const added = result.wb.sheets.findIndex((s) => result.changed.sheets.includes(s.id));
      store().update(workspaceId, { proposal, run: null });
      if (added >= 0) store().setActiveSheet(workspaceId, added);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }, [store, workspaceId]);

  const keep = useCallback((): void => {
    const session = selectSheetsSession(workspaceId)(store());
    const proposal = session.proposal;
    if (!proposal || !session.wb) return;
    // The preview was computed from this workbook; it becomes the next undo step.
    store().commit(workspaceId, proposal.preview);
    // Pivot tables the assistant built are saved like ones made by hand, so they can be refreshed later.
    const kept = proposal.ops.flatMap((op) => {
      if (op.op !== 'pivot') return [];
      const targetSheet = op.sheet ?? session.wb?.sheets[session.wb.activeSheet]?.name ?? 'Sheet1';
      const qualified = (ref: string): string => (ref.includes('!') ? ref : `${quoteSheet(targetSheet)}!${ref}`);
      return [{
        id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`,
        name: op.pivot.name ?? targetSheet,
        source: qualified(op.pivot.source),
        target: qualified(op.pivot.target),
        rows: op.pivot.rows,
        columns: op.pivot.columns ?? [],
        values: op.pivot.values.map((v) => ({ field: v.field, agg: v.agg ?? 'sum' as const })),
        filters: op.pivot.filters,
      }];
    });
    if (kept.length) {
      store().update(workspaceId, (current) => ({
        pivots: [...current.pivots.filter((entry) => !kept.some((def) => def.target.toLowerCase() === entry.target.toLowerCase())), ...kept],
      }));
    }
    store().patchChat(workspaceId, proposal.id, { outcome: 'kept' });
    store().update(workspaceId, { proposal: null });
  }, [store, workspaceId]);

  const discard = useCallback((): void => {
    const session = selectSheetsSession(workspaceId)(store());
    const proposal = session.proposal;
    if (!proposal) return;
    store().patchChat(workspaceId, proposal.id, { outcome: 'discarded' });
    store().update(workspaceId, { proposal: null });
  }, [store, workspaceId]);

  return { ask, stop, keep, discard };
}
