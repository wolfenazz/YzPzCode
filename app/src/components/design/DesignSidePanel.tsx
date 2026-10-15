import React, { useEffect, useState } from 'react';
import { Copy, Eye, EyeSlash, Trash, ArrowsClockwise, Stack, PushPin, CaretRight } from '@phosphor-icons/react';
import { useDesignSessionStore } from '../../stores/designSessionStore';
import { DesignLayers } from './DesignLayers';
import { DesignSystemPanel } from './DesignSystemPanel';
import { BoardSizePicker } from './BoardSizePicker';
import { SCREEN_STATES, versionTargets } from '../../utils/design/flow';
import { TweaksPanel } from './TweaksPanel';
import type { SavedKit } from './useDesignKits';
import { presetsFor, sizeLabel } from '../../utils/design/formats';
import { sanitizeHtml } from '../../utils/design/htmlSafe';
import { newDesignId } from '../../utils/design/project';
import type { Board, DesignProject, DesignTokens } from '../../utils/design/types';
import { sanitizeSvg } from '../../utils/presentation/svgSafe';

type Tab = 'chat' | 'layers' | 'design' | 'board';

interface DesignSidePanelProps {
  workspaceId: string;
  project: DesignProject;
  selectedIds: string[];
  busy: boolean;
  runError: string | null;
  failed: Board[];
  /** The pointer reached the left edge of the studio, revealing the panel. */
  revealed: boolean;
  /** The pointer is near the edge, activating the beam cue. */
  near: boolean;
  onReveal: () => void;
  /** Hides the panel a moment later, so a pointer that only brushed past does not close it at once. */
  onHide: () => void;
  onRedraw: (ids: string[]) => void;
  onVariations: (id: string) => void;
  onAddSize: (fromId: string, preset: string) => void;
  /** An empty canvas at a preset or custom size. */
  onAddBlank: (format: string) => void;
  kits: SavedKit[];
  onSaveKit: (name: string, tokens: DesignTokens) => Promise<unknown>;
  onDeleteKit: (kit: SavedKit) => Promise<void>;
  onDeriveFromPicture: (path: string) => Promise<DesignTokens>;
  onAddTweaks: (boardId: string) => void;
  onDeriveFromUrl: (address: string) => Promise<DesignTokens>;
  onRestyle: (instruction: string) => void;
  onAddVersion: (fromId: string, presetId: string, mode: 'copy' | 'ai') => void;
  onAddState: (fromId: string, stateId: string) => void;
  onConvert: (boardId: string, format: 'svg' | 'html') => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="dz-field"><span>{label}</span>{children}</label>
);

/** Left panel of the studio: the conversation, design system, and selected board. It opens on selection or hover and stays while pinned. */
export const DesignSidePanel: React.FC<DesignSidePanelProps> = ({ workspaceId, project, selectedIds, busy, runError, failed, revealed, near, onReveal, onHide, onRedraw, onVariations, onAddSize, onAddBlank, kits, onSaveKit, onDeleteKit, onDeriveFromPicture, onAddTweaks, onAddVersion, onAddState, onDeriveFromUrl, onRestyle, onConvert }) => {
  const [tab, setTab] = useState<Tab>('chat');
  const [pinned, setPinned] = useState(false);
  const open = pinned || revealed || selectedIds.length > 0;
  const [versionPreset, setVersionPreset] = useState('');
  const edit = useDesignSessionStore((state) => state.edit);
  const picked = useDesignSessionStore((state) => state.sessions[workspaceId]?.picked ?? null);
  const selected = project.boards.filter((board) => selectedIds.includes(board.id));
  const board = selected.length === 1 ? selected[0] : null;

  // Picking a board brings its tab forward.
  useEffect(() => {
    if (board) setTab((current) => (current === 'chat' ? 'board' : current));
  }, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchBoard = (id: string, patch: Partial<Board>, history = true): void => {
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) }), { skipHistory: !history });
  };

  const duplicate = (source: Board): void => {
    const right = project.boards.reduce((edge, entry) => Math.max(edge, entry.x + entry.width), 0);
    const copy: Board = { ...source, id: newDesignId('b'), name: `${source.name} copy`, x: right + 120, y: 0, status: 'done' };
    edit(workspaceId, (current) => ({ ...current, boards: [...current.boards, copy] }));
    useDesignSessionStore.getState().update(workspaceId, { selectedIds: [copy.id] });
  };

  const remove = (ids: string[]): void => {
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.filter((entry) => !ids.includes(entry.id)) }));
    useDesignSessionStore.getState().update(workspaceId, { selectedIds: [], picked: null });
  };

  // Code -------------------------------------------------------------------------------

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  useEffect(() => {
    setCode(board?.source ?? '');
    setCodeError(null);
  }, [board?.id, board?.source]);

  const applyCode = (): void => {
    if (!board) return;
    try {
      const cleaned = board.format === 'svg' ? sanitizeSvg(code, { width: board.width, height: board.height }).svg : sanitizeHtml(code).html;
      patchBoard(board.id, { source: cleaned, status: 'done' });
      setCodeError(null);
    } catch (reason) {
      setCodeError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const assistant = project.chat.filter((entry) => entry.role === 'assistant');
  const logs = project.chat.filter((entry) => entry.role === 'log');
  const presets = presetsFor(project.kind).filter((preset) => !project.boards.some((entry) => entry.preset === preset.id));

  return (
    <>
      <button
        type="button"
        className="dz-side-edge"
        data-near={near || undefined}
        aria-controls="design-side-panel"
        aria-expanded={open}
        aria-label="Open design panel"
        title="Open design panel"
        onPointerEnter={onReveal}
        onFocus={onReveal}
        onClick={onReveal}
      >
        <CaretRight size={15} weight="bold" aria-hidden="true" />
      </button>
      <aside
        id="design-side-panel"
        className="dz-side"
        aria-label="Design panel"
        data-open={open || undefined}
        onPointerEnter={onReveal}
        onPointerLeave={onHide}
        onFocus={onReveal}
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) onHide();
        }}
      >
      <div className="dz-side__tabs">
        <div className="dz-tabs" role="tablist">
          {(['chat', 'layers', 'design', 'board'] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className="dz-tab" onClick={() => setTab(value)}>
              {value === 'chat' ? 'Brief' : value === 'layers' ? 'Layers' : value === 'design' ? 'Design' : selected.length > 0 ? 'Board' : 'Boards'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`dz-btn dz-btn--icon dz-btn--ghost${pinned ? ' is-on' : ''}`}
          aria-pressed={pinned}
          aria-label={pinned ? 'Unpin the panel' : 'Keep the panel open'}
          title={pinned ? 'Unpin: the panel hides again when the pointer leaves' : 'Keep the panel open'}
          onClick={() => setPinned((value) => !value)}
        >
          <PushPin size={14} weight={pinned ? 'fill' : 'regular'} />
        </button>
      </div>

      <div className={`dz-side__body${tab === 'design' ? ' dz-side__body--flush' : ''}`}>
        {tab === 'chat' && (
          <>
            <div className="dz-prompt" dir="auto">{project.prompt || 'No description.'}</div>
            {assistant.map((entry) => <p key={entry.id} className="dz-note" dir="auto">{entry.text}</p>)}
            {runError && <p className="dz-error">{runError}</p>}
            {logs.length > 0 && (
              <details className="dz-note">
                <summary>Agent log ({logs.length})</summary>
                {logs.map((entry) => <p key={entry.id} dir="auto">{entry.text}</p>)}
              </details>
            )}
            {!busy && failed.length > 0 && (
              <p className="dz-note">
                <button type="button" className="dz-btn dz-btn--sm" onClick={() => onRedraw(failed.map((entry) => entry.id))}>
                  Draw {failed.length === 1 ? 'it' : String(failed.length)} again
                </button>
              </p>
            )}
          </>
        )}

        {tab === 'layers' && (
          <DesignLayers
            workspaceId={workspaceId}
            boards={project.boards}
            selectedIds={selectedIds}
            picked={picked}
            onToggleHidden={(id) => patchBoard(id, { hidden: !project.boards.find((entry) => entry.id === id)?.hidden })}
          />
        )}

        {tab === 'design' && (
          <DesignSystemPanel
            workspaceId={workspaceId}
            project={project}
            busy={busy}
            kits={kits}
            onSaveKit={onSaveKit}
            onDeleteKit={onDeleteKit}
            onDeriveFromPicture={onDeriveFromPicture}
            onDeriveFromUrl={onDeriveFromUrl}
            onRestyle={onRestyle}
          />
        )}

        {tab === 'board' && (
          board ? (
            <>
              <Row label="Name">
                <input className="dz-input dz-input--wide" dir="auto" defaultValue={board.name} key={board.id} onBlur={(event) => { if (event.target.value.trim() && event.target.value !== board.name) patchBoard(board.id, { name: event.target.value.trim() }); }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }} />
              </Row>
              <p className="dz-note">{sizeLabel(board.width, board.height)} · {board.format === 'svg' ? 'SVG' : 'HTML'}</p>
              {project.system.darkPalette && board.format === 'html' && (
                <Row label="Theme">
                  <select className="dz-select" value={board.theme ?? 'light'} onChange={(event) => patchBoard(board.id, { theme: event.target.value === 'dark' ? 'dark' : undefined })}>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </Row>
              )}
              <Row label="Device frame">
                <select className="dz-select" value={board.frame ?? 'none'} onChange={(event) => patchBoard(board.id, { frame: event.target.value === 'phone' || event.target.value === 'browser' ? event.target.value : undefined })}>
                  <option value="none">None</option>
                  <option value="phone">Phone</option>
                  <option value="browser">Browser</option>
                </select>
              </Row>
              {project.kind === 'graphic' && board.source && (
                <div className="dz-versions">
                  <div className="dz-section__heading">Drawn as</div>
                  <p className="dz-note">{board.format === 'svg'
                    ? 'Free layout (SVG): exact positions, vector export, drag-and-resize editing.'
                    : 'Text layout (HTML): the words wrap by themselves; edit with the inspector.'}</p>
                  <div className="dz-actions">
                    <button type="button" className="dz-btn dz-btn--sm" disabled={busy} title="The AI draws this board again in the other way; undo brings the old drawing back" onClick={() => onConvert(board.id, board.format === 'svg' ? 'html' : 'svg')}>
                      Draw again as {board.format === 'svg' ? 'text layout' : 'free layout'}
                    </button>
                  </div>
                </div>
              )}
              {board.format === 'html' && board.source && project.kind !== 'graphic' && (
                <div className="dz-versions">
                  <div className="dz-section__heading">Versions</div>
                  <Row label="Another size">
                    <select className="dz-select" value={versionPreset || versionTargets(project.kind, board.preset)[0]?.id || ''} onChange={(event) => setVersionPreset(event.target.value)}>
                      {versionTargets(project.kind, board.preset).map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
                    </select>
                  </Row>
                  <div className="dz-actions">
                    <button type="button" className="dz-btn dz-btn--sm" disabled={busy} title="Copy the screen; the page reflows to the new width" onClick={() => onAddVersion(board.id, versionPreset || versionTargets(project.kind, board.preset)[0]?.id, 'copy')}>Reflow copy</button>
                    <button type="button" className="dz-btn dz-btn--sm" disabled={busy} title="The AI recomposes the screen for the new width" onClick={() => onAddVersion(board.id, versionPreset || versionTargets(project.kind, board.preset)[0]?.id, 'ai')}>Adapt with AI</button>
                  </div>
                  {project.kind === 'app' && (
                    <>
                      <div className="dz-insp__label">Add a state</div>
                      <div className="dz-actions">
                        {SCREEN_STATES.map((state) => (
                          <button key={state.id} type="button" className="dz-btn dz-btn--sm" disabled={busy} onClick={() => onAddState(board.id, state.id)}>{state.label}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {board.source && (
                <TweaksPanel workspaceId={workspaceId} board={board} busy={busy} onAskForTweaks={onAddTweaks} />
              )}
              <div className="dz-actions">
                <button type="button" className="dz-btn dz-btn--sm" disabled={busy} onClick={() => onRedraw([board.id])}><ArrowsClockwise size={13} /> Draw again</button>
                <button type="button" className="dz-btn dz-btn--sm" disabled={busy || !board.source} onClick={() => onVariations(board.id)}><Stack size={13} /> Variations</button>
                <button type="button" className="dz-btn dz-btn--sm" onClick={() => duplicate(board)} disabled={!board.source}><Copy size={13} /> Duplicate</button>
                <button type="button" className="dz-btn dz-btn--sm" onClick={() => patchBoard(board.id, { hidden: !board.hidden })}>{board.hidden ? <Eye size={13} /> : <EyeSlash size={13} />} {board.hidden ? 'Show' : 'Hide'}</button>
                <button type="button" className="dz-btn dz-btn--sm dz-btn--danger" onClick={() => remove([board.id])}><Trash size={13} /> Delete</button>
              </div>
              {project.kind === 'graphic' && board.source && presets.length > 0 && (
                <Row label="Also make at">
                  <select className="dz-select" value="" disabled={busy} onChange={(event) => { if (event.target.value) onAddSize(board.id, event.target.value); }}>
                    <option value="">Another size…</option>
                    {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} · {sizeLabel(preset.width, preset.height)}</option>)}
                  </select>
                </Row>
              )}
              <div className="dz-section__heading" style={{ marginTop: 16 }}>Code</div>
              <textarea className="dz-code" spellCheck={false} dir="ltr" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => event.stopPropagation()} aria-label="Board code" />
              {codeError && <p className="dz-error">{codeError}</p>}
              <div className="dz-actions">
                <button type="button" className="dz-btn dz-btn--sm dz-btn--primary" disabled={busy || code === board.source} onClick={applyCode}>Apply</button>
                <button type="button" className="dz-btn dz-btn--sm" onClick={() => void navigator.clipboard.writeText(code).catch(() => undefined)}>Copy</button>
              </div>
            </>
          ) : selected.length > 1 ? (
            <>
              <p className="dz-note">{selected.length} boards selected.</p>
              <div className="dz-actions">
                <button type="button" className="dz-btn dz-btn--sm" disabled={busy} onClick={() => onRedraw(selected.map((entry) => entry.id))}><ArrowsClockwise size={13} /> Draw again</button>
                <button type="button" className="dz-btn dz-btn--sm dz-btn--danger" onClick={() => remove(selected.map((entry) => entry.id))}><Trash size={13} /> Delete</button>
              </div>
            </>
          ) : (
            <>
              <p className="dz-note">Pick a board to rename it, see its code or make variations. The Layers tab lists every board and the elements inside it.</p>
              <div className="dz-actions">
                <button type="button" className="dz-btn dz-btn--sm" onClick={() => setTab('layers')}><Stack size={13} /> Open Layers</button>
              </div>
              <div className="dz-section__heading" style={{ marginTop: 16 }}>New board</div>
              <p className="dz-note">Add another canvas beside the others, at any size. Fill it with the Draw button on the canvas, or describe it in the composer.</p>
              <BoardSizePicker kind={project.kind} label="Add blank board" onCreate={onAddBlank} disabled={busy} />
            </>
          )
        )}
      </div>
      </aside>
    </>
  );
};
