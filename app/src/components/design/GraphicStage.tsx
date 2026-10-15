import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Image as ImageIcon, ImageBroken, SlidersHorizontal, TextAlignCenter, TextAlignLeft, TextAlignRight, TextB, TextItalic, TextT, Trash } from '@phosphor-icons/react';
import { deleteElements, duplicateElements, insertElement, listElements, moveElements, textBoxModel, updateModels } from '../../utils/presentation/slideEdit';
import { fontStack } from '../../utils/presentation/designStyles';
import { formatModelText, modelTextStyle, setSvgTextStyle, svgTextStyle, type TextStylePatch } from '../../utils/design/textFormat';
import { FontOptions } from '../studio/FontOptions';
import { hasPicture } from '../../utils/design/svgPicture';
import { sanitizeSvg } from '../../utils/presentation/svgSafe';
import type { Board, DesignTokens } from '../../utils/design/types';
import { measureSlideText } from '../presentation/deckFonts';
import { SlideStage, type EditTarget, type StageApi } from '../presentation/SlideStage';
// The stage is the presentation studio's: its frames, handles and in-place editor are styled by
// these sheets. Without them (a design opened before any deck) the editor has no containing
// block and the text being typed floats outside the board.
import '../presentation/presentation.css';
import '../presentation/design.css';

interface GraphicStageProps {
  board: Board;
  /** Nodes selected when the editor opens (the one that was double-clicked). */
  initialSelection?: string[];
  tokens: DesignTokens;
  /** Canvas zoom: the stage is drawn at screen size, so its pointer maths is exact. */
  zoom: number;
  /** Where the board is on screen, inside the canvas. */
  left: number;
  top: number;
  resolveHref: (href: string) => string;
  onCommit: (svg: string) => void;
  onExit: () => void;
  onPicture: (index: number) => void;
  /** Choose a picture for the selected element (`svg:<index>`), or null to add a new one. */
  onPutPicture?: (yz: string | null) => void;
  /** Take the picture out of the selected element. */
  onRemovePicture?: (yz: string | null) => void;
  /** Open the picture panel for the picture in the selected element. */
  onAdjustPicture?: (yz: string | null) => void;
}

/** The picked-element id (`svg:<child index>`) of a selected drawn node or art element, or null. */
function pickIdOf(svg: string, id: string | undefined): string | null {
  if (!id) return null;
  if (id.startsWith('raw:')) return `svg:${Number(id.slice(4))}`;
  if (typeof DOMParser === 'undefined') return null;
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const at = Array.from(root.children).findIndex((child) => child.getAttribute('data-el') === id);
  return at >= 0 ? `svg:${at}` : null;
}

/** The `<text>` elements (document order) inside the selected drawn nodes, and inside selected art elements. */
function textIndicesOf(svg: string, ids: string[]): number[] {
  if (ids.length === 0 || typeof DOMParser === 'undefined') return [];
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const all: Element[] = Array.from(root.getElementsByTagName('text'));
  const found = new Set<number>();
  for (const id of ids) {
    const node = id.startsWith('raw:')
      ? root.children[Number(id.slice(4))]
      : Array.from(root.children).find((child) => child.getAttribute('data-el') === id);
    if (!node) continue;
    const texts = node.localName === 'text' ? [node] : Array.from(node.getElementsByTagName('text'));
    for (const text of texts) {
      const at = all.indexOf(text);
      if (at >= 0) found.add(at);
    }
  }
  return Array.from(found).sort((a, b) => a - b);
}

/**
 * The layout editor of a graphic board: the presentation studio's slide stage drawn over the
 * board (move, resize with guides, marquee, type in place). Esc or Done leaves it.
 */
export const GraphicStage: React.FC<GraphicStageProps> = ({ board, initialSelection, tokens, zoom, left, top, resolveHref, onCommit, onExit, onPicture, onPutPicture, onRemovePicture, onAdjustPicture }) => {
  const [selection, setSelection] = useState<string[]>(initialSelection ?? []);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const pickId = pickIdOf(board.source, selection[0]);
  const holdsPicture = useMemo(() => (pickId ? hasPicture(board.source, pickId) : false), [board.source, pickId]);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const stageApi = useRef<StageApi | null>(null);
  const canvas = useMemo(() => ({ width: board.width, height: board.height }), [board.width, board.height]);
  const textDefaults = useMemo(() => ({ font: tokens.fonts.body, size: Math.max(24, Math.round(board.width / 28)), color: tokens.palette.text }), [board.width, tokens]);

  // What the format bar acts on: drawn texts of the selection, and the editor's own text boxes.
  const infos = useMemo(() => listElements(board.source), [board.source]);
  const textIndices = useMemo(() => textIndicesOf(board.source, selection), [board.source, selection]);
  const modelIds = useMemo(() => selection.filter((id) => modelTextStyle(infos.find((info) => info.id === id)?.model ?? null) !== null), [infos, selection]);
  const current = useMemo(() => {
    if (modelIds.length > 0) return modelTextStyle(infos.find((info) => info.id === modelIds[0])?.model ?? null);
    if (textIndices.length > 0) return svgTextStyle(board.source, textIndices[0]);
    return null;
  }, [board.source, infos, modelIds, textIndices]);
  const showFormat = modelIds.length > 0 || textIndices.length > 0;

  const commit = useCallback((svg: string): void => {
    if (!svg || svg === board.source) return;
    onCommit(sanitizeSvg(svg, canvas).svg);
  }, [board.source, canvas, onCommit]);

  /** Drawn artwork is wrapped into an element before it is changed; the ids are the ones to act on. */
  const adopted = (): { svg: string; ids: string[] } => stageApi.current?.adopt(selection) ?? { svg: board.source, ids: selection.filter((id) => !id.startsWith('raw:')) };

  const nudge = (dx: number, dy: number): void => {
    const { svg, ids } = adopted();
    if (ids.length > 0) commit(moveElements(svg, ids, dx, dy, { measure: measureSlideText }));
  };

  const remove = (): void => {
    const { svg, ids } = adopted();
    if (ids.length === 0) return;
    commit(deleteElements(svg, ids));
    setSelection([]);
  };

  const duplicate = (): void => {
    const { svg, ids } = adopted();
    if (ids.length === 0) return;
    const copy = duplicateElements(svg, ids, Math.round(board.width / 40), { measure: measureSlideText });
    commit(copy.svg);
    setSelection(copy.ids);
  };

  const format = (patch: TextStylePatch): void => {
    let svg = board.source;
    if (modelIds.length > 0) svg = updateModels(svg, modelIds, (model) => formatModelText(model, patch), { measure: measureSlideText });
    // Alignment of a drawn text would move it; only the editor's own boxes take it.
    const { align: _align, ...drawn } = patch;
    for (const index of textIndices) svg = setSvgTextStyle(svg, index, { ...drawn, font: drawn.font ? fontStack(drawn.font) : undefined });
    commit(svg);
  };

  const addText = (): void => {
    const box = { x: Math.round(board.width * 0.15), y: Math.round(board.height * 0.42), w: Math.round(board.width * 0.7), h: Math.round(textDefaults.size * 1.7) };
    const model = textBoxModel(box, 'Text', { font: tokens.fonts.heading, size: Math.round(textDefaults.size * 1.4), color: tokens.palette.text });
    const result = insertElement(board.source, model, { measure: measureSlideText });
    commit(result.svg);
    setSelection([result.id]);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (editing !== null || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const mod = event.ctrlKey || event.metaKey;
      const step = event.shiftKey ? 10 : 1;
      let handled = true;
      if (event.key === 'Escape') {
        if (selection.length > 0) setSelection([]);
        else onExit();
      } else if (event.key === 'Delete' || event.key === 'Backspace') remove();
      else if (event.key === 'ArrowLeft') nudge(-step, 0);
      else if (event.key === 'ArrowRight') nudge(step, 0);
      else if (event.key === 'ArrowUp') nudge(0, -step);
      else if (event.key === 'ArrowDown') nudge(0, step);
      else if (mod && event.key.toLowerCase() === 'd') duplicate();
      else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // Capture: the canvas shortcuts (nudging boards, Delete) must not also run.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <>
      <div className="dz-stagebar" role="toolbar" aria-label="Layout editing">
        <span className="dz-stagebar__hint">Editing the layout of {board.name}</span>
        <button type="button" className="dz-btn dz-btn--sm" onClick={addText}><TextT size={13} /> Add text</button>
        {onPutPicture && (
          <button type="button" className="dz-btn dz-btn--sm" title="Put a picture inside the selected shape, or add one if nothing is selected" onClick={() => onPutPicture(pickIdOf(board.source, selection[0]))}><ImageIcon size={13} /> Add picture</button>
        )}
        {onAdjustPicture && (
          <button type="button" className="dz-btn dz-btn--sm" disabled={!holdsPicture} title="Open the picture panel: fit, position, tone and blend" onClick={() => onAdjustPicture(pickId)}><SlidersHorizontal size={13} /> Adjust</button>
        )}
        {onRemovePicture && (
          <button type="button" className="dz-btn dz-btn--sm" disabled={!holdsPicture} title="Take the picture out of the selected element" onClick={() => onRemovePicture(pickId)}><ImageBroken size={13} /> Remove picture</button>
        )}
        <button type="button" className="dz-btn dz-btn--sm" disabled={selection.length === 0} onClick={duplicate}><Copy size={13} /> Duplicate</button>
        <button type="button" className="dz-btn dz-btn--sm" disabled={selection.length === 0} onClick={remove}><Trash size={13} /> Delete</button>
        <button type="button" className="dz-btn dz-btn--sm dz-btn--primary" onClick={onExit}><Check size={13} weight="bold" /> Done</button>
      </div>
      {showFormat && (
        <div className="dz-formatbar" role="toolbar" aria-label="Text format">
          <select className="dz-select" aria-label="Font" value={current?.font ?? ''} onChange={(event) => { if (event.target.value) format({ font: event.target.value }); }}>
            {current?.font ? null : <option value="">Font…</option>}
            <FontOptions current={[tokens.fonts.heading, tokens.fonts.body, ...(current?.font ? [current.font] : [])]} />
          </select>
          <input
            className="dz-input"
            type="number"
            min={4}
            max={600}
            aria-label="Size"
            key={`size-${current?.size ?? 0}-${selection.join(',')}`}
            defaultValue={current?.size ? Math.round(current.size) : ''}
            placeholder="Size"
            onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
            onBlur={(event) => { const size = Number(event.target.value); if (size > 0 && size !== current?.size) format({ size }); }}
          />
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-pressed={current?.bold} aria-label="Bold" title="Bold" onClick={() => format({ bold: !current?.bold })}><TextB size={14} weight="bold" /></button>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-pressed={current?.italic} aria-label="Italic" title="Italic" onClick={() => format({ italic: !current?.italic })}><TextItalic size={14} /></button>
          <input
            type="color"
            className="dz-color"
            aria-label="Text colour"
            value={/^#[0-9a-f]{6}$/i.test(current?.color ?? '') ? current?.color : '#000000'}
            onChange={(event) => format({ color: event.target.value })}
          />
          {modelIds.length > 0 && (
            <>
              <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-label="Align left" onClick={() => format({ align: 'l' })}><TextAlignLeft size={14} /></button>
              <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-label="Align centre" onClick={() => format({ align: 'c' })}><TextAlignCenter size={14} /></button>
              <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-label="Align right" onClick={() => format({ align: 'r' })}><TextAlignRight size={14} /></button>
            </>
          )}
        </div>
      )}
      <div className="dz-stage-layer" style={{ left, top, width: board.width * zoom, height: board.height * zoom }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => { if (!(event.target instanceof HTMLElement && event.target.closest('[contenteditable="true"], input, textarea'))) { event.preventDefault(); window.getSelection()?.removeAllRanges(); } }}>
        <SlideStage
          svg={board.source}
          canvas={canvas}
          width={board.width * zoom}
          resolveHref={resolveHref}
          measure={measureSlideText}
          editable
          selection={selection}
          onSelection={setSelection}
          onCommit={commit}
          editing={editing}
          onEditing={setEditing}
          editorRef={editorRef}
          textDefaults={textDefaults}
          apiRef={stageApi}
          onPicture={(target) => { if (target.imageIndex !== undefined) onPicture(target.imageIndex); }}
        />
      </div>
    </>
  );
};
