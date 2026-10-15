import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDesignSessionStore } from '../../stores/designSessionStore';
import { useDesignStore } from '../../stores/designStore';
import { resolveFormat } from '../../utils/design/formats';
import { applyPhotos, sanitizeHtml } from '../../utils/design/htmlSafe';
import {
  buildBoardPrompt, buildDirectionPrompt, buildRestylePrompt, buildSystemFromPicturePrompt, buildSystemFromUrlPrompt, extractBoardBlocks, fitTypeScale, parseDirection, parseSystem,
  type AiPrompt, type FormatInfo,
} from '../../utils/design/prompts';
import { describeTokens } from '../../utils/design/kits';
import { belowPosition } from '../../utils/design/flow';
import { restyleSvg } from '../../utils/design/svgRestyle';
import { deriveDarkPalette, recolorHexes, refontSvg } from '../../utils/design/color';
import { paletteColorMap } from '../../utils/presentation/slideEdit';
import { normalizeValues, parseTweaks, splitTweaks } from '../../utils/design/tweaks';
import { layoutBoards, newDesignId, parentPath, joinPath } from '../../utils/design/project';
import type { Board, DesignAttachment, DesignKind, DesignProject, DesignTokens } from '../../utils/design/types';
import { DESIGN_FONTS, fontStack, getStyle, type VisualStyle } from '../../utils/presentation/designStyles';
import { sanitizeSvg } from '../../utils/presentation/svgSafe';
import { assetName } from '../../utils/presentation/designPictures';
import { base64ToBytes, writeFileBytes } from '../../utils/presentation/assets';
import { fetchWebPictures, webPicturesEnabled } from '../../utils/webPictures';
import { startAiRun, type AiRun, type AiRunResult } from '../../utils/writing/aiClient';
import { gatherSources } from '../../utils/writing/sources';
import { hasRtl, isRtlLanguage, languageOfScript } from '../../utils/writing/rtl';
import type { EngineChoice, WritingEngineId } from '../../utils/writing/types';

const SEES_IMAGES = new Set(['claude', 'codex']);
const MAX_IMAGES = 6;
/** Boards drawn at once, after the first one has set the look. */
const PARALLEL_BOARDS = 4;
/** Streamed HTML is re-rendered at most this often. */
const STREAM_INTERVAL_MS = 400;
const ASSETS_FOLDER = 'assets';

export interface GenerateInput {
  kind: DesignKind;
  prompt: string;
  /** Preset ids or custom sizes, as chosen in the composer. */
  formats: string[];
  /** `VISUAL_STYLES` id, or null. */
  style: string | null;
  /** Pictures and documents attached in the composer (absolute paths). */
  files: Array<{ path: string; name: string; kind: 'image' | 'document'; use: 'auto' | 'slides' | 'style' }>;
  /** A saved or recent design system the screens must keep to. */
  kit?: DesignTokens | null;
  /** Offer three looks and wait for a choice before drawing. */
  explore?: boolean;
  /** The boards are the cards of one series (a carousel). */
  series?: boolean;
  /** How a graphic is drawn (SVG unless told otherwise). */
  format?: 'svg' | 'html';
}

const styleHint = (style: VisualStyle | null): string => (style
  ? `${style.label}: ${style.character}\nShape: ${style.shape}\nComposition: ${style.composition}\nTypography: ${style.typography}\nColour: ${style.color}\nTexture: ${style.texture}`
  : '');

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** True while the title is still the one made from the description. */
function isAutoTitle(title: string, prompt: string): boolean {
  const flat = (value: string): string => value.replace(/…$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const current = flat(title);
  return !current || current === 'untitled design' || flat(prompt).startsWith(current);
}

/** Drawing the Design studio's boards with the AI: art direction, then one call per board. */
export function useDesignGenerator(workspaceId: string) {
  const runs = useRef<Set<AiRun>>(new Set());
  const cancelled = useRef(false);
  const chooser = useRef<((index: number | null) => void) | null>(null);
  const session = useDesignSessionStore;

  const project = (): DesignProject | null => session.getState().sessions[workspaceId]?.project ?? null;
  const projectPath = (): string | null => session.getState().sessions[workspaceId]?.projectPath ?? null;
  const assetsDir = (): string | null => {
    const path = projectPath();
    return path ? joinPath(parentPath(path), ASSETS_FOLDER) : null;
  };

  const patchBoard = useCallback((id: string, patch: Partial<Board>): void => {
    session.getState().edit(workspaceId, (current) => ({
      ...current,
      boards: current.boards.map((board) => (board.id === id ? { ...board, ...patch } : board)),
    }), { skipHistory: true });
  }, [session, workspaceId]);

  const updateRun = useCallback((patch: Partial<NonNullable<ReturnType<typeof useDesignSessionStore.getState>['sessions'][string]['run']>>): void => {
    session.getState().update(workspaceId, (current) => ({ run: current.run ? { ...current.run, ...patch } : current.run }));
  }, [session, workspaceId]);

  const log = useCallback((text: string): void => {
    session.getState().edit(workspaceId, (current) => ({
      ...current,
      chat: [...current.chat, { id: newDesignId('c'), role: 'log' as const, text, at: Date.now() }].slice(-200),
    }), { skipHistory: true });
  }, [session, workspaceId]);

  const runAi = useCallback(async (engine: EngineChoice, ai: AiPrompt, options: { images?: string[]; onText?: (text: string) => void; webSearch?: boolean } = {}): Promise<AiRunResult> => {
    const handle = startAiRun({
      engine: engine.engine as WritingEngineId,
      model: engine.model || undefined,
      effort: engine.effort || undefined,
      system: ai.system,
      prompt: ai.prompt,
      timeoutSecs: useDesignStore.getState().aiTimeoutSecs,
      images: options.images?.slice(0, MAX_IMAGES),
      onText: options.onText,
      webSearch: options.webSearch,
    });
    runs.current.add(handle);
    try {
      return await handle.result;
    } finally {
      runs.current.delete(handle);
    }
  }, []);

  const cancel = useCallback((): void => {
    cancelled.current = true;
    for (const handle of runs.current) handle.cancel();
    chooser.current?.(null);
    chooser.current = null;
  }, []);

  /** Picks one of the proposed looks (drawing continues), or null to stop. */
  const chooseDirection = useCallback((index: number | null): void => {
    const resolve = chooser.current;
    chooser.current = null;
    resolve?.(index);
  }, []);

  // Leaving the studio stops what is running.
  useEffect(() => () => {
    for (const handle of runs.current) handle.cancel();
  }, []);

  /** Copies a picture into the project's assets and returns its project-relative path. */
  const importPicture = useCallback(async (source: string, used: Set<string>): Promise<string | null> => {
    const dir = assetsDir();
    if (!dir) return null;
    try {
      const name = assetName(source, used);
      const base64 = await invoke<string>('read_file_as_base64', { path: source });
      const bytes = base64ToBytes(base64.includes(',') ? base64.split(',')[1] : base64);
      await writeFileBytes(joinPath(dir, name), bytes);
      return `${ASSETS_FOLDER}/${name}`;
    } catch (error) {
      console.warn('Could not copy a picture into the design:', error);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Real photos for `photo:` placeholders found in a drawing; words → project-relative paths. */
  const fetchPhotos = useCallback(async (words: string[], board: Board, engine: EngineChoice): Promise<Record<string, string>> => {
    const dir = assetsDir();
    if (!dir || words.length === 0 || !webPicturesEnabled()) return {};
    try {
      const prefer = board.width > board.height * 1.15 ? 'landscape' : board.height > board.width * 1.15 ? 'portrait' : 'any';
      const found = await fetchWebPictures(words, dir, engine, { prefer });
      const out: Record<string, string> = {};
      const credits: DesignAttachment[] = [];
      found.forEach((picture, index) => {
        if (!picture) return;
        const path = `${ASSETS_FOLDER}/${baseName(picture.path)}`;
        out[words[index]] = path;
        credits.push({ path, name: baseName(picture.path), kind: 'image', use: 'auto', credit: picture.credit || undefined });
      });
      if (credits.length > 0) {
        session.getState().edit(workspaceId, (current) => ({
          ...current,
          attachments: [...current.attachments.filter((entry) => !credits.some((credit) => credit.path === entry.path)), ...credits],
        }), { skipHistory: true });
      }
      return out;
    } catch (error) {
      console.warn('Web photos could not be fetched:', error);
      return {};
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Turns the final reply for one board into its stored source (HTML or SVG), with photos fetched. */
  const finishBoard = useCallback(async (board: Board, reply: string, engine: EngineChoice): Promise<void> => {
    const block = extractBoardBlocks(reply, true).find((entry) => entry.source) ?? null;
    if (!block) throw new Error('The AI returned no drawing for this board.');
    if (board.format === 'svg') {
      const splitSvg = splitTweaks(block.source);
      const svgTweaks = parseTweaks(splitSvg.json);
      const previousValues = project()?.boards.find((entry) => entry.id === board.id)?.tweakValues;
      const photoWords = Array.from(splitSvg.markup.matchAll(/href="photo:([^"]+)"/gi)).map((match) => match[1].trim());
      const found = await fetchPhotos(Array.from(new Set(photoWords)), board, engine);
      // An unmatched placeholder is dropped: a missing photo leaves the graphic without it.
      const withPhotos = splitSvg.markup.replace(/<image\b[^>]*href="photo:([^"]+)"[^>]*\/?>(?:<\/image>)?/gi, (whole, words: string) => {
        const path = found[words.trim()];
        return path ? whole.replace(/href="photo:[^"]+"/i, `href="${path}"`) : '';
      });
      const cleaned = sanitizeSvg(withPhotos, { width: board.width, height: board.height });
      patchBoard(board.id, {
        source: cleaned.svg,
        status: 'done',
        tweaks: svgTweaks.length > 0 ? svgTweaks : undefined,
        tweakValues: svgTweaks.length > 0 ? normalizeValues(svgTweaks, previousValues) : undefined,
      });
      return;
    }
    const split = splitTweaks(block.source);
    const cleaned = sanitizeHtml(split.markup);
    const found = await fetchPhotos(cleaned.photos, board, engine);
    const tweaks = parseTweaks(split.json);
    const previous = project()?.boards.find((entry) => entry.id === board.id)?.tweakValues;
    patchBoard(board.id, {
      source: applyPhotos(cleaned.html, found),
      status: 'done',
      tweaks: tweaks.length > 0 ? tweaks : undefined,
      // What the person already set survives a redraw where the control still exists.
      tweakValues: tweaks.length > 0 ? normalizeValues(tweaks, previous) : undefined,
    });
  }, [fetchPhotos, patchBoard]);

  const drawBoard = useCallback(async (boardId: string, engine: EngineChoice, images: string[], extra: { current?: string; instruction?: string; picked?: { id: string; html: string } | null; reference?: string } = {}): Promise<boolean> => {
    const current = project();
    const board = current?.boards.find((entry) => entry.id === boardId);
    if (!current || !board) return false;
    patchBoard(boardId, { status: 'drawing' });
    const rtl = isRtlLanguage(current.language) || hasRtl(current.prompt);
    const reference = current.boards.find((entry) => entry.id !== boardId && entry.status === 'done' && entry.source);
    const ai = buildBoardPrompt({
      kind: current.kind,
      name: board.name,
      brief: board.brief,
      width: board.width,
      height: board.height,
      tokens: current.system,
      project: current.prompt,
      siblings: current.boards.filter((entry) => entry.id !== boardId).map((entry) => ({ name: entry.name, brief: entry.brief })),
      reference: extra.reference ?? (reference ? reference.source : ''),
      current: extra.current,
      instruction: extra.instruction,
      picked: extra.picked ?? null,
      language: current.language || languageOfScript(current.prompt) || '',
      rtl,
      photos: webPicturesEnabled(),
      assets: current.attachments.filter((entry) => entry.kind === 'image' && entry.path.startsWith(`${ASSETS_FOLDER}/`) && entry.use !== 'style').map((entry) => `- ${entry.path}${entry.caption ? ` — ${entry.caption}` : ''}`),
      fontStacks: { heading: fontStack(current.system.fonts.heading), body: fontStack(current.system.fonts.body) },
      tweaks: board.tweaks,
      format: board.format,
    });
    let lastPaint = 0;
    const onText = (text: string): void => {
      if (board.format !== 'html') return;
      const now = Date.now();
      if (now - lastPaint < STREAM_INTERVAL_MS) return;
      const block = extractBoardBlocks(text)[0];
      if (!block) return;
      lastPaint = now;
      patchBoard(boardId, { source: sanitizeHtml(splitTweaks(block.source).markup).html, status: 'drawing' });
    };
    const result = await runAi(engine, ai, { images, onText });
    if (cancelled.current || result.cancelled) {
      // A stopped draw leaves an empty canvas, not a failure.
      patchBoard(boardId, { status: board.source ? 'done' : 'blank' });
      return false;
    }
    if (!result.ok && !result.text.trim()) {
      patchBoard(boardId, { status: board.source ? 'done' : 'failed' });
      log(`"${board.name}" failed: ${result.error ?? 'the AI returned nothing'}`);
      return false;
    }
    try {
      await finishBoard(board, result.text, engine);
      return true;
    } catch (error) {
      patchBoard(boardId, { status: board.source ? 'done' : 'failed' });
      log(`"${board.name}" could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishBoard, log, patchBoard, runAi]);

  /** Draws boards: the first alone (it sets the look), the rest a few at a time. */
  const drawBoards = useCallback(async (ids: string[], engine: EngineChoice, images: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const hasReference = project()?.boards.some((board) => board.status === 'done' && board.source && !ids.includes(board.id));
    let queue = ids.slice();
    const finished = (): void => {
      const done = (session.getState().sessions[workspaceId]?.run?.done ?? 0) + 1;
      updateRun({ done });
    };
    if (!hasReference) {
      const first = queue.shift() as string;
      await drawBoard(first, engine, images);
      finished();
    }
    const worker = async (): Promise<void> => {
      while (queue.length > 0 && !cancelled.current) {
        const id = queue.shift() as string;
        await drawBoard(id, engine, images);
        finished();
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_BOARDS, queue.length) }, () => worker()));
  }, [drawBoard, session, updateRun, workspaceId]);

  /** The whole creation: pictures into assets, art direction, boards placed, then every board drawn. */
  const generate = useCallback(async (input: GenerateInput): Promise<void> => {
    cancelled.current = false;
    const store = useDesignStore.getState();
    const engine = project()?.engine ? { ...store.defaultEngine, ...(project()?.engine as EngineChoice) } : store.defaultEngine;
    session.getState().update(workspaceId, { run: { phase: 'direction', label: 'Designing the system', total: 0, done: 0, startedAt: Date.now() } });
    try {
      const used = new Set<string>();
      const attachments: DesignAttachment[] = [];
      for (const file of input.files) {
        if (file.kind === 'document') {
          attachments.push({ path: file.path, name: file.name, kind: 'document', use: 'auto' });
          continue;
        }
        const copied = await importPicture(file.path, used);
        if (copied) attachments.push({ path: copied, name: file.name, kind: 'image', use: file.use });
      }
      if (attachments.length > 0) {
        session.getState().edit(workspaceId, (current) => ({ ...current, attachments }), { skipHistory: true });
      }
      const pictures = input.files.filter((file) => file.kind === 'image').map((file) => file.path);
      const images = SEES_IMAGES.has(engine.engine) ? pictures.slice(0, MAX_IMAGES) : [];
      const sources = await gatherSources('', input.files.filter((file) => file.kind === 'document').map((file) => file.path));
      const formats: FormatInfo[] = input.formats
        .map((id) => resolveFormat(id))
        .filter((entry): entry is NonNullable<ReturnType<typeof resolveFormat>> => entry !== null);
      const current = project();
      if (!current || formats.length === 0) throw new Error('There is nothing to design: no project or size.');
      const rtl = isRtlLanguage(current.language) || hasRtl(input.prompt);
      const request = {
        kind: input.kind,
        prompt: input.prompt,
        formats,
        sources: sources.text,
        pictures: attachments.filter((entry) => entry.kind === 'image').map((entry) => `- ${entry.path} (${entry.name}, ${entry.use === 'style' ? 'inspiration for the look' : entry.use === 'slides' ? 'place it in the design' : 'use where it fits'})`),
        language: current.language || languageOfScript(input.prompt) || '',
        rtl,
        styleHint: [input.kit ? describeTokens(input.kit) : '', styleHint(input.style ? getStyle(input.style) : null)].filter(Boolean).join('\n\n'),
        fonts: DESIGN_FONTS.filter((font) => !rtl || font.arabic).map((font) => font.name),
        photos: webPicturesEnabled(),
        boardCount: null,
        alternatives: input.explore && !input.kit ? 2 : 0,
        series: input.series,
      };
      const result = await runAi(engine, buildDirectionPrompt(request), { images });
      if (cancelled.current || result.cancelled) {
        updateRun({ phase: 'cancelled', label: 'Stopped', endedAt: Date.now() });
        return;
      }
      if (!result.ok && !result.text.trim()) throw new Error(result.error ?? 'The AI did not answer.');
      const direction = parseDirection(result.text, request);
      if (input.kit) direction.tokens = { ...input.kit, type: fitTypeScale(input.kit.type, input.kind, formats[0].width, formats[0].height) };

      const sized = direction.boards.map((entry): Board => {
        const format = formats.find((candidate) => candidate.id === entry.format) ?? formats[0];
        return {
          id: newDesignId('b'),
          name: entry.name,
          brief: entry.photo ? `${entry.brief}\nPhoto: use a real photograph (search words: ${entry.photo}).` : entry.brief,
          format: input.kind === 'graphic' ? (input.format ?? 'svg') : 'html',
          width: format.width,
          height: format.height,
          preset: format.id,
          x: 0,
          y: 0,
          source: '',
          status: 'pending',
        };
      });
      session.getState().edit(workspaceId, (state) => ({
        ...state,
        // A project the user never named takes the AI's title instead of the first words of the prompt.
        title: direction.title && isAutoTitle(state.title, state.prompt) ? direction.title : state.title,
        system: direction.tokens,
        boards: layoutBoards(sized),
        chat: direction.summary ? [...state.chat, { id: newDesignId('c'), role: 'assistant' as const, text: direction.summary, at: Date.now() }] : state.chat,
      }), { skipHistory: true });
      session.getState().update(workspaceId, { fitted: false, selectedIds: [] });
      if (input.explore && !input.kit && direction.alternatives.length > 0) {
        const options = [
          { id: 'main', name: direction.tokens.name, mood: direction.mood, tokens: direction.tokens },
          ...direction.alternatives.map((alternative, index) => ({ id: `alt-${index}`, name: alternative.tokens.name, mood: alternative.mood, tokens: alternative.tokens })),
        ];
        session.getState().update(workspaceId, { directions: { options } });
        updateRun({ phase: 'choosing', label: 'Choose a direction' });
        const chosen = await new Promise<number | null>((resolve) => { chooser.current = resolve; });
        session.getState().update(workspaceId, { directions: null });
        if (chosen === null || cancelled.current) {
          updateRun({ phase: 'cancelled', label: 'Stopped', endedAt: Date.now() });
          return;
        }
        session.getState().edit(workspaceId, (state) => ({ ...state, system: options[chosen].tokens }), { skipHistory: true });
      }
      updateRun({ phase: 'drawing', label: 'Drawing', total: sized.length, done: 0 });

      await drawBoards(sized.map((board) => board.id), engine, images);
      if (cancelled.current) {
        updateRun({ phase: 'cancelled', label: 'Stopped', endedAt: Date.now() });
        return;
      }
      const failed = project()?.boards.filter((board) => board.status === 'failed').length ?? 0;
      if (failed < sized.length) {
        const finished = project();
        if (finished) useDesignStore.getState().rememberSystem(finished.system);
      }
      updateRun({ phase: failed === sized.length ? 'failed' : 'done', label: failed > 0 ? `${failed} could not be drawn` : 'Done', endedAt: Date.now(), error: failed === sized.length ? 'None of the boards could be drawn.' : null });
    } catch (error) {
      updateRun({ phase: 'failed', label: 'Failed', endedAt: Date.now(), error: error instanceof Error ? error.message : String(error) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawBoards, importPicture, runAi, session, updateRun, workspaceId]);

  /** Draws (or draws again) the given boards of the open project. */
  const redraw = useCallback(async (ids: string[]): Promise<void> => {
    cancelled.current = false;
    const store = useDesignStore.getState();
    const engine = project()?.engine ? { ...store.defaultEngine, ...(project()?.engine as EngineChoice) } : store.defaultEngine;
    session.getState().update(workspaceId, { run: { phase: 'drawing', label: 'Drawing', total: ids.length, done: 0, startedAt: Date.now() } });
    await drawBoards(ids, engine, []);
    updateRun({ phase: cancelled.current ? 'cancelled' : 'done', label: cancelled.current ? 'Stopped' : 'Done', endedAt: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawBoards, session, updateRun, workspaceId]);

  /** Starts a reviewable change: remembers the project as it is, to be kept or discarded afterwards. */
  const beginProposal = (ids: string[], instruction: string, total: number): void => {
    cancelled.current = false;
    const baseline = project();
    if (!baseline) return;
    session.getState().update(workspaceId, {
      proposal: { baseline, ids, instruction },
      run: { phase: 'drawing', label: 'Drawing', total, done: 0, startedAt: Date.now() },
    });
  };

  const finishProposal = (): void => {
    const state = session.getState().sessions[workspaceId];
    if (cancelled.current && state?.proposal) {
      session.getState().update(workspaceId, {
        project: state.proposal.baseline,
        proposal: null,
        run: state.run ? { ...state.run, phase: 'cancelled', label: 'Stopped', endedAt: Date.now() } : null,
      });
      return;
    }
    updateRun({ phase: 'done', label: 'Done', endedAt: Date.now() });
  };

  const engineFor = (): EngineChoice => {
    const store = useDesignStore.getState();
    const own = project()?.engine;
    return own ? { ...store.defaultEngine, ...(own as EngineChoice) } : store.defaultEngine;
  };

  type DrawExtra = Parameters<typeof drawBoard>[3];
  const runDrawn = async (jobs: Array<{ id: string; extra: DrawExtra }>): Promise<void> => {
    const queue = jobs.slice();
    const engine = engineFor();
    const worker = async (): Promise<void> => {
      while (queue.length > 0 && !cancelled.current) {
        const job = queue.shift() as (typeof jobs)[number];
        await drawBoard(job.id, engine, [], job.extra);
        updateRun({ done: (session.getState().sessions[workspaceId]?.run?.done ?? 0) + 1 });
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_BOARDS, jobs.length) }, () => worker()));
  };

  /** Changes boards (or one element of one) as asked; the result waits for Keep or Discard. */
  const refine = async (ids: string[], instruction: string, picked: { id: string; html: string } | null = null): Promise<void> => {
    const current = project();
    if (!current || ids.length === 0) return;
    beginProposal(ids, instruction, ids.length);
    await runDrawn(ids.map((id) => ({ id, extra: { current: current.boards.find((board) => board.id === id)?.source || undefined, instruction, picked } })));
    finishProposal();
  };

  /** Adds a board (a new screen, or a graphic at another size) drawn in the same system. */
  const addBoard = async (input: { name: string; brief: string; format: string; fromId?: string; instruction?: string; placement?: 'right' | 'below'; group?: string }): Promise<void> => {
    const current = project();
    const format = resolveFormat(input.format);
    if (!current || !format) return;
    const right = current.boards.reduce((edge, board) => Math.max(edge, board.x + board.width), 0);
    const original = input.fromId ? current.boards.find((board) => board.id === input.fromId) : undefined;
    const board: Board = {
      id: newDesignId('b'),
      name: input.name,
      brief: input.brief,
      format: original?.format ?? (current.kind === 'graphic' ? 'svg' : 'html'),
      width: format.width,
      height: format.height,
      preset: format.id,
      x: right + 120,
      y: 0,
      source: '',
      status: 'pending',
      theme: original?.theme,
      frame: original?.frame,
      group: input.group,
    };
    if (input.placement === 'below' && original) {
      const spot = belowPosition(original, current.boards.map((entry) => ({ x: entry.x, y: entry.y, width: entry.width, height: entry.height })), format);
      board.x = spot.x;
      board.y = spot.y;
    }
    beginProposal([board.id], input.instruction ?? input.brief, 1);
    session.getState().edit(workspaceId, (state) => ({ ...state, boards: [...state.boards, board] }), { skipHistory: true });
    session.getState().update(workspaceId, { selectedIds: [board.id] });
    await runDrawn([{ id: board.id, extra: { current: original?.source || undefined, instruction: input.instruction, reference: original?.source } }]);
    finishProposal();
  };

  /** Alternatives of one board, placed beside the row; keep the ones you like. */
  const variations = async (boardId: string, count = 3, note?: string | null): Promise<void> => {
    const current = project();
    const original = current?.boards.find((board) => board.id === boardId);
    if (!current || !original || !original.source) return;
    const wanted = Math.min(6, Math.max(1, Math.round(count) || 3));
    let edge = current.boards.reduce((max, board) => Math.max(max, board.x + board.width), 0);
    const made: Board[] = Array.from({ length: wanted }, (_value, index) => {
      const board: Board = { ...original, id: newDesignId('b'), name: `${original.name} · option ${index + 1}`, x: edge + 120, y: 0, status: 'pending' };
      edge += original.width + 120;
      return board;
    });
    const angles = ['a different composition and hierarchy', 'a bolder, more expressive treatment', 'a calmer, more minimal treatment'];
    const direction = note?.trim() ? ` Also follow this direction: ${note.trim()}` : '';
    beginProposal(made.map((board) => board.id), note?.trim() ? `Variations: ${note.trim()}` : 'Variations', made.length);
    session.getState().edit(workspaceId, (state) => ({ ...state, boards: [...state.boards, ...made] }), { skipHistory: true });
    session.getState().update(workspaceId, { selectedIds: made.map((board) => board.id) });
    await runDrawn(made.map((board, index) => ({
      id: board.id,
      extra: { current: original.source, instruction: `Make an alternative to this board with ${angles[index % angles.length]}. Same content, same design system; clearly different layout.${direction}` },
    })));
    finishProposal();
  };

  /** An empty canvas beside the others, at a preset or custom size; nothing is drawn until asked. */
  const addBlankBoard = (input: { format: string; name?: string }): string | null => {
    const current = project();
    const format = resolveFormat(input.format);
    if (!current || !format) return null;
    const last = current.boards[current.boards.length - 1];
    const right = current.boards.reduce((edge, board) => Math.max(edge, board.x + board.width), 0);
    const board: Board = {
      id: newDesignId('b'),
      name: input.name || (current.kind === 'graphic' ? format.label : `Screen ${current.boards.length + 1}`),
      brief: '',
      format: last?.format ?? (current.kind === 'graphic' ? 'svg' : 'html'),
      width: format.width,
      height: format.height,
      preset: format.id,
      x: right + 120,
      y: 0,
      source: '',
      status: 'blank',
    };
    session.getState().edit(workspaceId, (state) => ({ ...state, boards: [...state.boards, board] }));
    session.getState().update(workspaceId, { selectedIds: [board.id], picked: null, fitted: false });
    return board.id;
  };

  /** Copies a picture from disk into the project and lists it as an attachment; returns its `assets/…` path. */
  const addPicture = async (source: string): Promise<string | null> => {
    const current = project();
    if (!current) return null;
    const used = new Set(current.attachments.map((entry) => baseName(entry.path).toLowerCase()));
    const path = await importPicture(source, used);
    if (!path) return null;
    session.getState().edit(workspaceId, (state) => ({
      ...state,
      attachments: [...state.attachments, { path, name: baseName(source), kind: 'image' as const, use: 'auto' as const }],
    }), { skipHistory: true });
    return path;
  };

  /** Changes the design system as asked (colours, type, shape); the screens follow it. Waits for Keep or Discard. */
  const restyle = async (instruction: string): Promise<void> => {
    const current = project();
    if (!current || !instruction.trim()) return;
    beginProposal([], instruction.trim(), 1);
    let failure: string | null = null;
    try {
      const rtl = isRtlLanguage(current.language) || hasRtl(current.prompt);
      const first = current.boards[0];
      const result = await runAi(engineFor(), buildRestylePrompt({
        current: current.system,
        instruction,
        fonts: DESIGN_FONTS.filter((font) => !rtl || font.arabic).map((font) => font.name),
        language: current.language || '',
      }));
      if (!cancelled.current && !result.cancelled) {
        if (!result.ok && !result.text.trim()) throw new Error(result.error ?? 'The AI did not answer.');
        const parsed = parseSystem(result.text);
        const next: DesignTokens = {
          ...parsed,
          type: first ? fitTypeScale(parsed.type, current.kind, first.width, first.height) : parsed.type,
          darkPalette: current.system.darkPalette ? deriveDarkPalette(parsed.palette) : undefined,
          motif: parsed.motif || current.system.motif,
          imagery: parsed.imagery || current.system.imagery,
        };
        const map = paletteColorMap(current.system.palette, next.palette);
        session.getState().edit(workspaceId, (state) => ({
          ...state,
          system: next,
          // HTML boards follow the variables on their own; drawn graphics are recoloured.
          boards: state.boards.map((board) => (board.format === 'svg' && board.source ? { ...board, source: refontSvg(restyleSvg(recolorHexes(board.source, map), current.system, next, { width: board.width, height: board.height }), current.system.fonts, next.fonts, current.system.type.h2 * 0.9) } : board)),
        }), { skipHistory: true });
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      cancelled.current = true;
      log(`Restyle failed: ${failure}`);
    }
    finishProposal();
    if (failure) updateRun({ phase: 'failed', label: 'Failed', error: failure, endedAt: Date.now() });
  };

  /** The design system a web page is drawn with, read by an engine with web access. */
  const deriveSystemFromUrl = async (address: string): Promise<DesignTokens> => {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`);
    } catch {
      throw new Error('That is not a web address.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Use an http or https address.');
    cancelled.current = false;
    const current = project();
    const rtl = current ? isRtlLanguage(current.language) : false;
    const result = await runAi(engineFor(), buildSystemFromUrlPrompt({
      url: url.toString(),
      fonts: DESIGN_FONTS.filter((font) => !rtl || font.arabic).map((font) => font.name),
      language: current?.language ?? '',
    }), { webSearch: true });
    if (!result.ok && !result.text.trim()) throw new Error(result.error ?? 'The AI could not read that page. Check that the engine can use the web.');
    return parseSystem(result.text);
  };

  /** The design system behind a picture (a screenshot, a brand board). Needs an engine that sees pictures. */
  const deriveSystem = async (path: string): Promise<DesignTokens> => {
    const engine = engineFor();
    if (!SEES_IMAGES.has(engine.engine)) throw new Error('Reading a picture needs Claude or Codex. Choose one as the engine in Settings → Design.');
    cancelled.current = false;
    const current = project();
    const rtl = current ? isRtlLanguage(current.language) : false;
    const result = await runAi(engine, buildSystemFromPicturePrompt({
      fonts: DESIGN_FONTS.filter((font) => !rtl || font.arabic).map((font) => font.name),
      language: current?.language ?? '',
    }), { images: [path] });
    if (!result.ok && !result.text.trim()) throw new Error(result.error ?? 'The AI did not answer.');
    return parseSystem(result.text);
  };

  return { generate, redraw, refine, addBoard, addBlankBoard, variations, addPicture, cancel, chooseDirection, deriveSystem, restyle, deriveSystemFromUrl };
}
