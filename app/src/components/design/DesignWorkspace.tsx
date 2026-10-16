import React, { useCallback, useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowClockwise, ArrowCounterClockwise, Export, Play } from '@phosphor-icons/react';
import type { WorkspaceConfig } from '../../types';
import { emptyDesignSession, useDesignSessionStore } from '../../stores/designSessionStore';
import { useDesignStore } from '../../stores/designStore';
import { DEFAULT_PRESET, resolveFormat } from '../../utils/design/formats';
import { setElementText, setImageSrc } from '../../utils/design/htmlSafe';
import { elementFacts, removeElement, setElementStyle } from '../../utils/design/styleEdit';
import { DEFAULT_PICTURE_OPTIONS, placePicture, picturePlan, pictureShapes, readPicture, removePicture } from '../../utils/design/svgPicture';
import { PicturePanel, type PictureEdit } from './PicturePanel';
import { sanitizeSvg } from '../../utils/presentation/svgSafe';
import { setSvgImage, setSvgText, svgTextItems } from '../../utils/presentation/svgText';
import { IMAGE_EXTENSIONS } from '../presentation/designAssets';
import { createProject, layoutBoards, newDesignId, parentPath } from '../../utils/design/project';
import { belowPosition, SCREEN_STATES, versionName } from '../../utils/design/flow';
import { ADD_SVG_TWEAKS_INSTRUCTION, ADD_TWEAKS_INSTRUCTION } from '../../utils/design/quickActions';
import { planComposerAction } from '../../utils/design/intents';
import { pasteOrigin } from '../../utils/design/snap';
import type { Board, DesignKind, DesignProject } from '../../utils/design/types';
import type { EngineChoice } from '../../utils/writing/types';
import { BarSeparator, StudioTopBar, type StudioRun, type StudioSaveState } from '../studio/StudioTopBar';
import { DesignCanvas, type MovePhase } from './DesignCanvas';
import { DesignComposer, type ComposerInput } from './DesignComposer';
import { DesignInspector } from './DesignInspector';
import { DesignPreview } from './DesignPreview';
import { DirectionCards } from './DirectionCards';
import { useDesignKits } from './useDesignKits';
import { DesignExportDialog } from './DesignExportDialog';
import { DesignPromptBar } from './DesignPromptBar';
import { DesignSidePanel } from './DesignSidePanel';
import { useDesignDocument } from './useDesignDocument';
import { useDesignGenerator } from './useDesignGenerator';
import './design-studio.css';

interface DesignWorkspaceProps {
  workspace: WorkspaceConfig;
  visible: boolean;
}

const KIND_LABEL: Record<DesignKind, string> = { app: 'App design', web: 'Web design', graphic: 'Graphic' };

/** How close to the left edge the pointer must come for the side panel to slide out. */
const SIDE_EDGE = 28;

/** A short title from the first words of the description. */
function titleFrom(prompt: string): string {
  const words = prompt.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  return words.length > 48 ? `${words.slice(0, 47)}…` : words || 'Untitled design';
}

/** The empty boards a new project starts with: one per chosen size for a graphic, a first screen otherwise. */
function startingBoards(kind: DesignKind, formats: string[], drawAs: 'svg' | 'html' = 'svg'): Board[] {
  const resolved = formats.map((id) => resolveFormat(id)).filter((entry): entry is NonNullable<ReturnType<typeof resolveFormat>> => entry !== null);
  const used = kind === 'graphic' ? resolved : resolved.slice(0, 1);
  const boards = used.map((format, index): Board => ({
    id: newDesignId('b'),
    name: kind === 'graphic' ? format.label : `Screen ${index + 1}`,
    brief: '',
    format: kind === 'graphic' ? drawAs : 'html',
    width: format.width,
    height: format.height,
    preset: format.id,
    x: 0,
    y: 0,
    source: '',
  }));
  return layoutBoards(boards);
}

/** The engine a project draws with: its own choice, else the studio default (as the generator reads it). */
function engineOf(project: DesignProject, fallback: EngineChoice): EngineChoice {
  return project.engine ? { ...fallback, ...(project.engine as EngineChoice) } : fallback;
}

/** The Design studio: the describe-it home, then the canvas of the open project. */
const DesignWorkspace: React.FC<DesignWorkspaceProps> = ({ workspace, visible }) => {
  const workspaceId = workspace.id;
  const documents = useDesignDocument(workspaceId, workspace.path);
  const kitStore = useDesignKits(workspace.path);
  const generator = useDesignGenerator(workspaceId);
  const session = useDesignSessionStore((state) => state.sessions[workspaceId]) ?? emptyDesignSession();
  const edit = useDesignSessionStore((state) => state.edit);
  const update = useDesignSessionStore((state) => state.update);
  const undo = useDesignSessionStore((state) => state.undo);
  const redo = useDesignSessionStore((state) => state.redo);
  const keepProposal = useDesignSessionStore((state) => state.keepProposal);
  const discardProposal = useDesignSessionStore((state) => state.discardProposal);
  const defaultEngine = useDesignStore((state) => state.defaultEngine);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pictureNote, setPictureNote] = useState<string | null>(null);
  /** A picture waiting for the choice of which shape of a stacked frame holds it. */
  const [pictureChoice, setPictureChoice] = useState<PictureEdit | null>(null);
  const [holdBefore, setHoldBefore] = useState(false);
  const [textEdit, setTextEdit] = useState<{ boardId: string; index: number; text: string } | null>(null);
  /** Pointer reveal state; selection and pinning also keep the side panel open. */
  const [sideRevealed, setSideRevealed] = useState(false);
  const [sideNear, setSideNear] = useState(false);
  const sideHideTimer = useRef<number | null>(null);
  const restored = useRef(false);
  const cancelPictureRef = useRef<() => void>(() => undefined);
  const dragBaseline = useRef<ReturnType<typeof useDesignSessionStore.getState>['sessions'][string]['project']>(null);
  const project = session.project;

  // Reopen the project this workspace had open.
  useEffect(() => {
    if (restored.current || documents.loadingList) return;
    restored.current = true;
    if (useDesignSessionStore.getState().sessions[workspaceId]?.project) return;
    const last = useDesignStore.getState().lastProjectByWorkspace[workspaceId];
    if (last && documents.projects.some((entry) => entry.path === last)) void documents.open(last);
  }, [documents, workspaceId]);

  const create = useCallback(async (input: ComposerInput): Promise<void> => {
    setCreating(true);
    setCreateError(null);
    try {
      const store = useDesignStore.getState();
      const created = createProject({
        title: titleFrom(input.prompt),
        kind: input.kind,
        prompt: input.prompt,
        language: store.language === 'auto' ? '' : store.language,
        boards: startingBoards(input.kind, input.formats, input.format),
        engine: store.defaultEngine,
      });
      await documents.create(created);
      // The studio opens at once; the AI works while the boards fill in.
      void generator.generate({ kind: input.kind, prompt: input.extra ? `${input.prompt}\n\n${input.extra}` : input.prompt, formats: input.formats, style: input.style, files: input.files, kit: input.kit, explore: input.explore, series: input.series, format: input.format });
    } catch (error) {
      setCreateError(`Could not create the design: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreating(false);
    }
  }, [documents, generator]);

  const running = session.run?.phase === 'direction' || session.run?.phase === 'choosing' || session.run?.phase === 'drawing';
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const setBoardHeight = useCallback((id: string, height: number, exact = false): void => {
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((board) => (board.id === id && (exact ? board.height !== height : board.height < height) ? { ...board, height } : board)) }), { skipHistory: true });
  }, [edit, workspaceId]);

  const moveBoards = useCallback((positions: Record<string, { x: number; y: number }>, phase: MovePhase): void => {
    if (phase === 'start') {
      dragBaseline.current = useDesignSessionStore.getState().sessions[workspaceId]?.project ?? null;
    } else if (phase === 'move') {
      edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((board) => (positions[board.id] ? { ...board, ...positions[board.id] } : board)) }), { skipHistory: true });
    } else if (dragBaseline.current) {
      const baseline = dragBaseline.current;
      dragBaseline.current = null;
      update(workspaceId, (state) => ({ past: [...state.past, baseline].slice(-50), future: [], dirty: true }));
    }
  }, [edit, update, workspaceId]);

  const editText = useCallback((boardId: string, yz: string, text: string): void => {
    edit(workspaceId, (current) => ({
      ...current,
      boards: current.boards.map((board) => {
        if (board.id !== boardId) return board;
        const next = setElementText(board.source, yz, text);
        return next === null ? board : { ...board, source: next };
      }),
    }));
  }, [edit, workspaceId]);

  const choosePicture = useCallback(async (boardId: string, target: { kind: 'html'; yz: string } | { kind: 'svg'; index: number }): Promise<void> => {
    const picked = await open({ multiple: false, filters: [{ name: 'Pictures', extensions: IMAGE_EXTENSIONS }] });
    if (!picked || Array.isArray(picked)) return;
    const path = await generator.addPicture(picked);
    if (!path) return;
    edit(workspaceId, (current) => ({
      ...current,
      boards: current.boards.map((board) => {
        if (board.id !== boardId) return board;
        const next = target.kind === 'html' ? setImageSrc(board.source, target.yz, path) : setSvgImage(board.source, target.index, path);
        return next === null ? board : { ...board, source: next };
      }),
    }));
  }, [edit, generator, workspaceId]);

  const beginSvgText = useCallback((boardId: string, index: number): void => {
    const board = useDesignSessionStore.getState().sessions[workspaceId]?.project?.boards.find((entry) => entry.id === boardId);
    const item = board ? svgTextItems(board.source)[index] : undefined;
    if (item) setTextEdit({ boardId, index, text: item.lines.join('\n') });
  }, [workspaceId]);

  const commitSvgText = (): void => {
    if (!textEdit) return;
    const { boardId, index, text } = textEdit;
    setTextEdit(null);
    edit(workspaceId, (current) => ({
      ...current,
      boards: current.boards.map((board) => (board.id === boardId ? { ...board, source: setSvgText(board.source, index, text.split('\n')) } : board)),
    }));
  };

  const pickedBoard = project?.boards.find((board) => board.id === session.picked?.boardId) ?? null;

  const boardClipboard = useRef<Board[]>([]);

  /** Copies boards beside everything else (used by Ctrl+D, Ctrl+V and the board menu). */
  const duplicateBoards = useCallback((source: Board[]): void => {
    if (source.length === 0) return;
    const current = useDesignSessionStore.getState().sessions[workspaceId]?.project;
    if (!current) return;
    const spot = pasteOrigin(source, current.boards);
    const copies = source.map((board): Board => ({ ...board, id: newDesignId('b'), name: `${board.name} copy`, x: board.x + spot.dx, y: board.y + spot.dy, hidden: false }));
    edit(workspaceId, (state) => ({ ...state, boards: [...state.boards, ...copies] }));
    update(workspaceId, { selectedIds: copies.map((board) => board.id), picked: null });
  }, [edit, update, workspaceId]);

  const duplicateIds = useCallback((ids: string[]): void => {
    const boards = useDesignSessionStore.getState().sessions[workspaceId]?.project?.boards ?? [];
    duplicateBoards(boards.filter((board) => ids.includes(board.id) && board.source));
  }, [duplicateBoards, workspaceId]);

  const removeSelected = useCallback((): void => {
    const current = useDesignSessionStore.getState().sessions[workspaceId];
    // With an element picked, Delete removes that element, not the board.
    const target = current?.picked;
    if (target) {
      edit(workspaceId, (state) => ({
        ...state,
        boards: state.boards.map((board) => {
          if (board.id !== target.boardId) return board;
          const next = removeElement(board.source, target.yz);
          return next === null ? board : { ...board, source: next };
        }),
      }));
      update(workspaceId, { picked: null });
      return;
    }
    const ids = current?.selectedIds ?? [];
    if (ids.length === 0) return;
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.filter((board) => !ids.includes(board.id)) }));
    update(workspaceId, { selectedIds: [], picked: null });
  }, [edit, update, workspaceId]);

  // Ctrl+Z / Ctrl+Y, Delete on the canvas.
  useEffect(() => {
    if (!visible || !project || exporting || previewing) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault();
          undo(workspaceId);
        } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
          event.preventDefault();
          redo(workspaceId);
        } else if (key === 'e' && event.shiftKey) {
          event.preventDefault();
          setExporting(true);
        } else if (key === 'd' && !running) {
          event.preventDefault();
          duplicateIds(useDesignSessionStore.getState().sessions[workspaceId]?.selectedIds ?? []);
        } else if (key === 'c') {
          const state = useDesignSessionStore.getState().sessions[workspaceId];
          boardClipboard.current = (state?.project?.boards ?? []).filter((board) => state?.selectedIds.includes(board.id) && board.source);
        } else if (key === 'v' && !running && boardClipboard.current.length > 0) {
          event.preventDefault();
          duplicateBoards(boardClipboard.current);
        } else if (key === 'a') {
          event.preventDefault();
          update(workspaceId, { selectedIds: (useDesignSessionStore.getState().sessions[workspaceId]?.project?.boards ?? []).filter((board) => !board.hidden).map((board) => board.id), picked: null });
        }
      } else if (key === 'f5') {
        event.preventDefault();
        setPreviewing(true);
      } else if (key === 'delete' && !running) {
        event.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exporting, project, redo, removeSelected, running, undo, visible, workspaceId]);

  /** Shows the waiting picture in the chosen shape as the options change; nothing is final until Place. */
  const pictureKey = pictureChoice ? `${pictureChoice.boardId}|${pictureChoice.yz}|${pictureChoice.path}|${pictureChoice.shapeIndex}|${JSON.stringify(pictureChoice.options)}` : '';
  useEffect(() => {
    const choice = pictureChoice;
    if (!choice) return undefined;
    // Sliders move faster than the drawing can be measured: the latest value wins.
    const timer = window.setTimeout(() => {
      const board = useDesignSessionStore.getState().sessions[workspaceId]?.project?.boards.find((entry) => entry.id === choice.boardId);
      if (!board) return;
      const placed = placePicture(choice.baseSource, choice.yz, choice.path, { ...choice.options, shapeIndex: choice.shapeIndex });
      const source = placed ? sanitizeSvg(placed, { width: board.width, height: board.height }).svg : null;
      if (!source) return;
      edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === board.id ? { ...entry, source } : entry)) }), { skipHistory: true });
    }, 24);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pictureKey]);

  // Esc leaves the picture panel without keeping anything.
  useEffect(() => {
    if (!pictureChoice) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      event.preventDefault();
      event.stopPropagation();
      cancelPictureRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [Boolean(pictureChoice)]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The side panel follows the pointer: it slides in at the left edge, and leaves again a moment after the pointer is gone. */
  const revealSide = useCallback((): void => {
    if (sideHideTimer.current !== null) {
      window.clearTimeout(sideHideTimer.current);
      sideHideTimer.current = null;
    }
    setSideRevealed(true);
  }, []);

  const hideSideSoon = useCallback((): void => {
    if (sideHideTimer.current !== null) window.clearTimeout(sideHideTimer.current);
    sideHideTimer.current = window.setTimeout(() => {
      sideHideTimer.current = null;
      setSideRevealed(false);
    }, 240);
  }, []);

  useEffect(() => () => {
    if (sideHideTimer.current !== null) window.clearTimeout(sideHideTimer.current);
  }, []);

  const nearEdge = (event: React.PointerEvent<HTMLDivElement>): boolean => event.clientX - event.currentTarget.getBoundingClientRect().left <= SIDE_EDGE;

  const onStudioMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons !== 0) return; // A drag on the canvas must not pull the panel out.
    const near = nearEdge(event);
    setSideNear((current) => (current === near ? current : near));
    if (near) revealSide();
  };

  // A tap at the edge (touch) opens the panel as well; a mouse already reveals it on hover.
  const onStudioDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'touch' && nearEdge(event)) revealSide();
  };

  const onStudioLeave = (): void => {
    setSideNear(false);
    hideSideSoon();
  };

  if (!project) {
    return (
      <div className="dz-root">
        <DesignComposer
          workspaceName={workspace.name}
          workspacePath={workspace.path}
          projects={documents.projects}
          busy={creating}
          error={createError ?? session.error}
          onCreate={(input) => void create(input)}
          onCancel={() => undefined}
          onOpen={(path) => void documents.open(path)}
          onDelete={(path) => void documents.remove(path)}
          kits={kitStore.kits}
        />
      </div>
    );
  }

  const saveState: StudioSaveState = session.error
    ? { text: 'Not saved', state: 'error', title: session.error }
    : session.saving ? { text: 'Saving…', state: 'saving' }
      : session.dirty ? { text: 'Unsaved', state: 'unsaved' }
        : { text: 'Saved', state: 'saved' };
  const meta = `${KIND_LABEL[project.kind]} · ${project.boards.length} ${project.boards.length === 1 ? 'board' : 'boards'}`;
  const runState = session.run;
  const elapsedSeconds = runState ? Math.max(0, Math.round(((runState.endedAt ?? now) - runState.startedAt) / 1000)) : 0;
  const run: StudioRun | null = running && runState
    ? {
      label: runState.label,
      detail: runState.phase === 'drawing' ? `${runState.done} of ${runState.total}` : undefined,
      elapsed: `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`,
      progress: runState.phase === 'drawing' && runState.total > 0 ? runState.done / runState.total : null,
      onStop: generator.cancel,
    }
    : null;

  const proposal = session.proposal;
  const reviewing = Boolean(proposal) && !running;
  const shownBoards = holdBefore && proposal ? proposal.baseline.boards : project.boards;
  const visibleBoards = project.boards.filter((board) => !board.hidden);
  const failed = project.boards.filter((board) => board.status === 'failed');
  const runError = runState?.phase === 'failed' ? (runState.error ?? 'The design could not be made.') : null;
  const status = pictureNote ?? (runState?.phase === 'cancelled' ? 'Stopped' : runState?.phase === 'failed' ? 'Failed' : null);

  const targetIds = (): string[] => {
    if (session.picked) return [session.picked.boardId];
    const selected = visibleBoards.filter((board) => session.selectedIds.includes(board.id)).map((board) => board.id);
    return selected.length > 0 ? selected : visibleBoards.map((board) => board.id);
  };

  /** Puts a picture inside the picked element: clipped into a drawn shape, or as the picture / background of an HTML element. */
  const putPicture = async (assetPath: string | null, at?: { boardId: string; yz: string | null }): Promise<void> => {
    const picked = useDesignSessionStore.getState().sessions[workspaceId]?.picked;
    const target = at ?? (picked ? { boardId: picked.boardId, yz: picked.yz as string | null } : null);
    if (!target) return;
    const note = (text: string): void => {
      setPictureNote(text);
      window.setTimeout(() => setPictureNote((current) => (current === text ? null : current)), 4000);
    };
    let path = assetPath;
    if (!path) {
      const chosen = await open({ multiple: false, filters: [{ name: 'Pictures', extensions: IMAGE_EXTENSIONS }] });
      if (!chosen || Array.isArray(chosen)) return;
      path = await generator.addPicture(chosen);
      if (!path) {
        note('The picture could not be copied into the design.');
        return;
      }
    }
    const board = useDesignSessionStore.getState().sessions[workspaceId]?.project?.boards.find((entry) => entry.id === target.boardId);
    if (!board || !board.source) return;
    let next: string | null = null;
    if (board.format === 'svg' && target.yz === null) {
      // No element chosen: the picture is added as its own element, centred, about half the canvas.
      const side = Math.round(Math.min(board.width, board.height) * 0.5);
      const image = `<image href="${path}" x="${Math.round((board.width - side) / 2)}" y="${Math.round((board.height - side) / 2)}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid slice"/>`;
      next = sanitizeSvg(board.source.replace(/<\/svg>\s*$/i, `${image}</svg>`), { width: board.width, height: board.height }).svg;
    } else if (board.format === 'svg') {
      const plan = picturePlan(board.source, target.yz as string);
      if (!plan.ok) {
        note(plan.reason);
        return;
      }
      const found = pictureShapes(board.source, target.yz as string);
      if (found.shapes.length > 0) {
        // The picture panel opens on the right: the shape (of a frame of stacked shapes, innermost first),
        // its fit, position, tone and blend are the user's to set before it is kept.
        setPictureChoice({ boardId: board.id, yz: target.yz as string, path, shapes: found.shapes, shapeIndex: found.defaultIndex, options: { ...DEFAULT_PICTURE_OPTIONS }, baseSource: board.source, original: board.source, editing: false });
        return;
      }
      const placed = placePicture(board.source, target.yz as string, path);
      next = placed ? sanitizeSvg(placed, { width: board.width, height: board.height }).svg : null;
    } else {
      const facts = target.yz ? elementFacts(board.source, target.yz) : null;
      if (facts?.tag === 'img' && target.yz) next = setImageSrc(board.source, target.yz, path);
      else if (facts && target.yz) next = setElementStyle(board.source, target.yz, { 'background-image': `url(${path})`, 'background-size': 'cover', 'background-position': 'center', 'background-repeat': 'no-repeat' });
    }
    if (!next) {
      note('The picture could not be placed in that element.');
      return;
    }
    const source = next;
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === board.id ? { ...entry, source } : entry)) }));
    note('Picture placed inside the element.');
  };

  /** Keeps the previewed picture as one undo step. */
  const confirmPicture = (): void => {
    const choice = pictureChoice;
    if (!choice) return;
    setPictureChoice(null);
    const state = useDesignSessionStore.getState().sessions[workspaceId];
    const project = state?.project;
    if (!project) return;
    const before = { ...project, boards: project.boards.map((entry) => (entry.id === choice.boardId ? { ...entry, source: choice.original } : entry)) };
    update(workspaceId, { past: [...(state?.past ?? []), before].slice(-50), future: [], dirty: true });
    setPictureNote(choice.editing ? 'Picture adjusted.' : 'Picture placed inside the shape.');
    window.setTimeout(() => setPictureNote(null), 4000);
  };

  /** Puts the drawing back as it was before the panel opened. */
  const cancelPicture = (): void => {
    const choice = pictureChoice;
    setPictureChoice(null);
    if (!choice) return;
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === choice.boardId ? { ...entry, source: choice.original } : entry)) }), { skipHistory: true });
  };
  cancelPictureRef.current = cancelPicture;

  /** Opens the picture panel on a picture that is already placed in the picked element. */
  const adjustPicture = (at?: { boardId: string; yz: string | null }): void => {
    const picked = useDesignSessionStore.getState().sessions[workspaceId]?.picked;
    const target = at ?? (picked ? { boardId: picked.boardId, yz: picked.yz as string | null } : null);
    const board = target ? useDesignSessionStore.getState().sessions[workspaceId]?.project?.boards.find((entry) => entry.id === target.boardId) : null;
    const note = (text: string): void => {
      setPictureNote(text);
      window.setTimeout(() => setPictureNote((current) => (current === text ? null : current)), 4000);
    };
    if (!target || !board || !board.source || board.format !== 'svg' || !target.yz) {
      note('Select the shape that holds the picture first.');
      return;
    }
    const read = readPicture(board.source, target.yz);
    if (!read) {
      note('That element holds no picture yet. Use Add picture.');
      return;
    }
    const base = removePicture(board.source, target.yz);
    if (!base) return;
    const found = pictureShapes(base, target.yz);
    if (found.shapes.length === 0) return;
    setPictureChoice({
      boardId: board.id, yz: target.yz, path: read.href, shapes: found.shapes,
      shapeIndex: Math.min(found.shapes.length - 1, read.shapeIndex),
      options: { ...DEFAULT_PICTURE_OPTIONS, ...read.options } as PictureEdit['options'],
      baseSource: base, original: board.source, editing: true,
    });
  };

  /** Swaps the picture in the open panel for another file; the settings stay. */
  const replacePictureFile = async (): Promise<void> => {
    const choice = pictureChoice;
    if (!choice) return;
    const chosen = await open({ multiple: false, filters: [{ name: 'Pictures', extensions: IMAGE_EXTENSIONS }] });
    if (!chosen || Array.isArray(chosen)) return;
    const path = await generator.addPicture(chosen);
    if (!path) {
      setPictureNote('The picture could not be copied into the design.');
      return;
    }
    setPictureChoice((current) => (current && current.boardId === choice.boardId && current.yz === choice.yz ? { ...current, path } : current));
  };

  /** Takes the picture being adjusted out of its shape: one undo step. */
  const removeAdjusted = (): void => {
    const choice = pictureChoice;
    if (!choice) return;
    setPictureChoice(null);
    const state = useDesignSessionStore.getState().sessions[workspaceId];
    const current = state?.project;
    if (!current) return;
    const board = current.boards.find((entry) => entry.id === choice.boardId);
    if (!board) return;
    const cleaned = removePicture(choice.original, choice.yz);
    const source = cleaned ? sanitizeSvg(cleaned, { width: board.width, height: board.height }).svg : choice.baseSource;
    const before = { ...current, boards: current.boards.map((entry) => (entry.id === choice.boardId ? { ...entry, source: choice.original } : entry)) };
    edit(workspaceId, (project) => ({ ...project, boards: project.boards.map((entry) => (entry.id === choice.boardId ? { ...entry, source } : entry)) }), { skipHistory: true });
    update(workspaceId, { past: [...(state?.past ?? []), before].slice(-50), future: [], dirty: true });
    setPictureNote('Picture removed.');
    window.setTimeout(() => setPictureNote(null), 4000);
  };

  /** Takes a placed picture out of an element (one undo step). */
  const takePictureOut = (boardId: string, yz: string | null): void => {
    const board = useDesignSessionStore.getState().sessions[workspaceId]?.project?.boards.find((entry) => entry.id === boardId);
    const note = (text: string): void => {
      setPictureNote(text);
      window.setTimeout(() => setPictureNote((current) => (current === text ? null : current)), 4000);
    };
    if (!board || !board.source || !yz) {
      note('Select the element that holds the picture first.');
      return;
    }
    let next: string | null = null;
    if (board.format === 'svg') {
      const cleaned = removePicture(board.source, yz);
      next = cleaned ? sanitizeSvg(cleaned, { width: board.width, height: board.height }).svg : null;
    } else if (elementFacts(board.source, yz)?.tag !== 'img') {
      next = setElementStyle(board.source, yz, { 'background-image': null, 'background-size': null, 'background-position': null, 'background-repeat': null });
    }
    if (!next) {
      note('There is no picture in that element.');
      return;
    }
    const source = next;
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === board.id ? { ...entry, source } : entry)) }));
    note('Picture removed.');
  };

  const send = (instruction: string): void => {
    const picked = session.picked ? { id: session.picked.yz, html: session.picked.html } : null;
    const action = planComposerAction(instruction, { picked: Boolean(picked), lastPreset: project.boards[project.boards.length - 1]?.preset, kind: project.kind });
    // "Make 3 versions", "create another image at 1200x628" and friends are about
    // boards, not edits: the plan routes them instead of sending a change request.
    if (action.kind === 'variations') {
      const source = versionsTarget();
      update(workspaceId, { picked: null });
      if (source) void generator.variations(source, action.count ?? 3, action.note ?? null);
      return;
    }
    if (action.kind === 'newBoard') {
      update(workspaceId, { picked: null });
      if (action.blank) generator.addBlankBoard({ format: action.format ?? DEFAULT_PRESET[project.kind] });
      else addDrawn(action.brief ?? '', action.format ?? DEFAULT_PRESET[project.kind]);
      return;
    }
    void generator.refine(targetIds(), action.instruction ?? instruction, picked);
    update(workspaceId, { picked: null });
  };

  /** The board versions are made from: the selection, else the first drawn board in view. */
  const versionsTarget = (): string | null => {
    const drawn = (id: string): boolean => Boolean(project.boards.find((board) => board.id === id)?.source);
    const scoped = targetIds().filter(drawn);
    return scoped[0] ?? visibleBoards.find((board) => board.source)?.id ?? null;
  };

  const makeVersions = (count = 3, note?: string | null): void => {
    const source = versionsTarget();
    if (source) void generator.variations(source, count, note);
  };

  /** A new board described in the composer, drawn by the AI at the chosen size. */
  const addDrawn = (brief: string, format?: string): void => {
    const size = format ?? project.boards[project.boards.length - 1]?.preset ?? DEFAULT_PRESET[project.kind];
    const name = brief.replace(/\s+/g, ' ').split(' ').slice(0, 4).join(' ');
    void generator.addBoard({ name: name || `Board ${project.boards.length + 1}`, brief, format: size });
  };

  /** An empty canvas at a preset or custom size; it is drawn later on request. */
  const addBlank = (format: string): void => {
    generator.addBlankBoard({ format });
  };

  /** A screen at another size: a reflowed copy (no AI) or recomposed by the AI. */
  const addVersion = (fromId: string, presetId: string, mode: 'copy' | 'ai'): void => {
    const from = project.boards.find((board) => board.id === fromId);
    const format = resolveFormat(presetId);
    if (!from || !format) return;
    const name = versionName(from.name, format.label);
    if (mode === 'ai') {
      void generator.addBoard({
        name,
        brief: from.brief,
        format: presetId,
        fromId,
        placement: 'below',
        instruction: `Recompose this screen for ${format.width}px wide (${format.label}): the same content, copy and look, laid out for the new width.`,
      });
      return;
    }
    const spot = belowPosition({ x: from.x, y: from.y, width: from.width, height: from.height }, project.boards.map((board) => ({ x: board.x, y: board.y, width: board.width, height: board.height })), format);
    const copy: Board = { ...from, id: newDesignId('b'), name, width: format.width, height: format.height, preset: format.id, x: spot.x, y: spot.y, hidden: false, status: 'done' };
    edit(workspaceId, (state) => ({ ...state, boards: [...state.boards, copy] }));
    update(workspaceId, { selectedIds: [copy.id], picked: null });
  };

  /** The empty, loading, error or success state of a screen, drawn beneath it. */
  const addState = (fromId: string, stateId: string): void => {
    const from = project.boards.find((board) => board.id === fromId);
    const state = SCREEN_STATES.find((entry) => entry.id === stateId);
    if (!from || !state) return;
    const group = from.group ?? from.id;
    if (!from.group) edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((board) => (board.id === from.id ? { ...board, group } : board)) }), { skipHistory: true });
    void generator.addBoard({
      group,
      name: versionName(from.name, state.label),
      brief: `${state.label} state of "${from.name}". ${from.brief}`.trim(),
      format: from.preset ?? `${from.width}x${from.height}`,
      fromId,
      placement: 'below',
      instruction: state.instruction,
    });
  };

  /** A graphic drawn again in the other way (free layout or text layout); one undo step brings the old drawing back. */
  const convertBoard = (id: string, drawAs: 'svg' | 'html'): void => {
    const from = project.boards.find((board) => board.id === id);
    if (!from || from.format === drawAs) return;
    edit(workspaceId, (state) => ({
      ...state,
      boards: state.boards.map((board) => (board.id === id ? { ...board, format: drawAs, source: '', status: 'pending' as const, tweaks: undefined, tweakValues: undefined } : board)),
    }));
    void generator.redraw([id]);
  };

  const addSize = (fromId: string, preset: string): void => {
    const from = project.boards.find((board) => board.id === fromId);
    const format = resolveFormat(preset);
    if (!from || !format) return;
    void generator.addBoard({
      name: `${from.name.split(' · ')[0]} · ${format.label}`,
      brief: from.brief,
      format: preset,
      fromId,
      instruction: `Recompose this graphic for ${format.width}×${format.height}: same message, copy and look, laid out for the new proportions.`,
    });
  };

  return (
    <div className="dz-root">
      <StudioTopBar
        backLabel="Designs"
        onBack={() => void documents.close()}
        title={project.title}
        onTitle={(title) => edit(workspaceId, (current) => ({ ...current, title }), { skipHistory: true })}
        onTitleCommit={() => void documents.flush()}
        meta={meta}
        save={saveState}
        run={run}
      >
        <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={session.past.length === 0 || running} onClick={() => undo(workspaceId)}><ArrowCounterClockwise size={15} /></button>
        <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={session.future.length === 0 || running} onClick={() => redo(workspaceId)}><ArrowClockwise size={15} /></button>
        <BarSeparator />
        <button type="button" className="dz-btn" disabled={running || visibleBoards.every((board) => !board.source)} title="Preview (F5)" onClick={() => setPreviewing(true)}><Play size={14} /> Preview</button>
        <button type="button" className="dz-btn" disabled={running || visibleBoards.every((board) => !board.source)} title="Export (Ctrl+Shift+E)" onClick={() => setExporting(true)}><Export size={14} /> Export</button>
      </StudioTopBar>

      <div className="dz-studio" onPointerMove={onStudioMove} onPointerDown={onStudioDown} onPointerLeave={onStudioLeave}>
        <DesignSidePanel
          workspaceId={workspaceId}
          project={project}
          selectedIds={session.selectedIds}
          busy={running}
          runError={runError}
          failed={failed}
          revealed={sideRevealed}
          near={sideNear}
          onReveal={revealSide}
          onHide={hideSideSoon}
          onRedraw={(ids) => void generator.redraw(ids)}
          onVariations={(id) => void generator.variations(id)}
          onAddSize={addSize}
          onAddBlank={addBlank}
          kits={kitStore.kits}
          onSaveKit={kitStore.save}
          onDeleteKit={kitStore.remove}
          onDeriveFromPicture={(path) => generator.deriveSystem(path)}
          onDeriveFromUrl={(address) => generator.deriveSystemFromUrl(address)}
          onRestyle={(instruction) => void generator.restyle(instruction)}
          onAddTweaks={(id) => void generator.refine([id], project.boards.find((board) => board.id === id)?.format === 'svg' ? ADD_SVG_TWEAKS_INSTRUCTION : ADD_TWEAKS_INSTRUCTION)}
          onAddVersion={addVersion}
          onConvert={convertBoard}
          onAddState={addState}
        />

        <div className="dz-stage">
          <DesignCanvas
            workspaceId={workspaceId}
            boards={shownBoards}
            tokens={proposal && holdBefore ? proposal.baseline.system : project.system}
            kind={project.kind}
            viewport={session.viewport}
            tool={session.tool}
            selectedIds={session.selectedIds}
            picked={session.picked}
            fitted={session.fitted}
            visible={visible && !previewing}
            projectDir={session.projectPath ? parentPath(session.projectPath) : ''}
            locked={running || reviewing}
            onBoardHeight={setBoardHeight}
            onMove={moveBoards}
            onEditText={editText}
            onPicture={(boardId, target) => void choosePicture(boardId, target)}
            onPutPicture={(boardId, yz) => void putPicture(null, { boardId, yz })}
            onRemovePicture={takePictureOut}
            onAdjustPicture={(boardId, yz) => adjustPicture({ boardId, yz })}
            onSvgText={beginSvgText}
            onRedraw={(ids) => void generator.redraw(ids)}
            onDuplicate={duplicateIds}
            onVariations={(id) => void generator.variations(id)}
            onExport={() => setExporting(true)}
            onVersion={(id, preset) => addVersion(id, preset, 'copy')}
          />
          {textEdit && (
            <div className="dz-textedit" role="dialog" aria-label="Edit text">
              <textarea
                autoFocus
                dir="auto"
                className="dz-bar__input"
                rows={Math.min(6, textEdit.text.split('\n').length + 1)}
                value={textEdit.text}
                onChange={(event) => setTextEdit({ ...textEdit, text: event.target.value })}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Escape') setTextEdit(null);
                  else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commitSvgText();
                }}
              />
              <button type="button" className="dz-btn dz-btn--sm" onClick={() => setTextEdit(null)}>Cancel</button>
              <button type="button" className="dz-btn dz-btn--sm dz-btn--primary" onClick={commitSvgText}>Apply</button>
            </div>
          )}
          {session.directions && (
            <DirectionCards choice={session.directions} onChoose={(index) => generator.chooseDirection(index)} onStop={generator.cancel} />
          )}
          <DesignPromptBar
            kind={project.kind}
            boardCount={visibleBoards.length}
            selectedCount={session.selectedIds.length}
            picked={session.picked}
            busy={running}
            reviewing={reviewing}
            status={status}
            engine={engineOf(project, defaultEngine)}
            onEngineChange={(next) => edit(workspaceId, (current) => ({
              ...current,
              engine: { engine: next.engine, model: next.model, effort: next.effort || undefined, allowWebResearch: next.allowWebResearch },
            }), { skipHistory: true })}
            onSend={send}
            onAddDrawn={addDrawn}
            onAddBlank={addBlank}
            onVersions={() => makeVersions(3)}
            onStop={generator.cancel}
            onKeep={() => keepProposal(workspaceId)}
            onDiscard={() => discardProposal(workspaceId)}
            onClearPicked={() => update(workspaceId, { picked: null })}
            onHoldBefore={setHoldBefore}
            pictures={project.attachments.filter((entry) => entry.kind === 'image').map((entry) => ({ path: entry.path, name: entry.name }))}
            onPutPicture={(path) => void putPicture(path)}
            onRemovePicture={() => { const picked = useDesignSessionStore.getState().sessions[workspaceId]?.picked; if (picked) takePictureOut(picked.boardId, picked.yz); }}
            onAdjustPicture={() => adjustPicture()}
          />
        </div>

        {pictureChoice && (
          <PicturePanel
            edit={pictureChoice}
            onChange={setPictureChoice}
            onKeep={confirmPicture}
            onCancel={cancelPicture}
            onReplace={() => void replacePictureFile()}
            onRemove={removeAdjusted}
          />
        )}

        {!pictureChoice && session.picked && pickedBoard?.format === 'html' && (
          <DesignInspector
            workspaceId={workspaceId}
            project={project}
            picked={session.picked}
            busy={running || reviewing}
            onReplacePicture={(boardId, yz) => void choosePicture(boardId, { kind: 'html', yz })}
          />
        )}
      </div>

      {previewing && session.projectPath && (
        <DesignPreview project={project} projectDir={parentPath(session.projectPath)} startId={session.selectedIds[0] ?? null} onClose={() => setPreviewing(false)} />
      )}

      {exporting && session.projectPath && (
        <DesignExportDialog project={project} projectDir={parentPath(session.projectPath)} selectedIds={session.selectedIds} onClose={() => setExporting(false)} />
      )}
    </div>
  );
};

export default DesignWorkspace;
