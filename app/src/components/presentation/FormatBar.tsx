import React, { useEffect, useRef, useState } from 'react';
import {
  AlignBottom, AlignCenterHorizontal, AlignCenterVertical, AlignLeft, AlignRight, AlignTop, ArrowRight, CaretDown, Circle, Copy, Diamond,
  ImageSquare, LineSegment, ListBullets, ListNumbers, Minus, PaintBucket, Plus, Rectangle, SelectionBackground, Square, Stack, Star, TextAlignCenter,
  TextAlignJustify, TextAlignLeft, TextAlignRight, TextB, TextItalic, TextStrikethrough, TextT, TextUnderline, Trash, Triangle,
} from '@phosphor-icons/react';
import type { Arrange } from '../../utils/presentation/slideEdit';
import type { SlideElement, TxBody, TxRun } from '../../utils/presentation/slideModel';
import { applySelectionFont, applySelectionSize, selectionInside } from './textEditing';

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'rightArrow' | 'chevron' | 'star5' | 'line' | 'arrow' | 'wedgeRoundRectCallout';
export type AlignHow = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hspace' | 'vspace';

const SHAPES: Array<{ kind: ShapeKind; label: string; icon: React.ReactNode }> = [
  { kind: 'rect', label: 'Rectangle', icon: <Square size={16} /> },
  { kind: 'roundRect', label: 'Rounded rectangle', icon: <Rectangle size={16} /> },
  { kind: 'ellipse', label: 'Oval', icon: <Circle size={16} /> },
  { kind: 'triangle', label: 'Triangle', icon: <Triangle size={16} /> },
  { kind: 'diamond', label: 'Diamond', icon: <Diamond size={16} /> },
  { kind: 'star5', label: 'Star', icon: <Star size={16} /> },
  { kind: 'rightArrow', label: 'Arrow', icon: <ArrowRight size={16} weight="bold" /> },
  { kind: 'chevron', label: 'Chevron', icon: <CaretDown size={16} style={{ transform: 'rotate(-90deg)' }} /> },
  { kind: 'wedgeRoundRectCallout', label: 'Callout', icon: <SelectionBackground size={16} /> },
  { kind: 'line', label: 'Line', icon: <LineSegment size={16} /> },
  { kind: 'arrow', label: 'Arrow line', icon: <ArrowRight size={16} /> },
];

const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 96];
const LINE_SPACING = [1, 1.15, 1.5, 2, 2.5, 3];
const STANDARD = ['#000000', '#404040', '#7F7F7F', '#BFBFBF', '#FFFFFF', '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];

/** First run of the first text body in an element (for showing the current format). */
export function firstRun(model: SlideElement | null): { run: TxRun | null; body: TxBody | null } {
  if (!model) return { run: null, body: null };
  if (model.k === 'shape' && model.tx) return { run: model.tx.p.flatMap((para) => para.r).find((run) => run.t.trim()) ?? null, body: model.tx };
  if (model.k === 'group') {
    for (const child of model.ch) {
      const found = firstRun(child);
      if (found.run) return found;
    }
  }
  if (model.k === 'table') {
    const cell = model.rows.flatMap((row) => row.cells).find((entry) => entry.tx.p.some((para) => para.r.some((run) => run.t.trim())));
    if (cell) return { run: cell.tx.p.flatMap((para) => para.r).find((run) => run.t.trim()) ?? null, body: cell.tx };
  }
  return { run: null, body: null };
}

/** A small popover anchored under its trigger; closes on outside clicks and Escape. */
function Popover({ label, title, icon, children, disabled, wide }: { label?: React.ReactNode; title: string; icon?: React.ReactNode; children: (close: () => void) => React.ReactNode; disabled?: boolean; wide?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey, true); };
  }, [open]);
  return (
    <div className="pf-pop" ref={ref}>
      <button type="button" className="pf-btn pf-btn--menu" title={title} aria-label={title} aria-expanded={open} disabled={disabled} data-active={open || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((value) => !value)}>
        {icon}{label}<CaretDown size={10} className="pf-caret" />
      </button>
      {open && <div className={`pf-pop__panel${wide ? ' pf-pop__panel--wide' : ''}`} role="menu" onMouseDown={(event) => { if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault(); }}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function ColorGrid({ palette, value, onPick, none }: { palette: string[]; value: string | null; onPick: (color: string | null) => void; none?: string }): React.JSX.Element {
  return (
    <div className="pf-colors">
      <span className="pf-colors__label">Deck colours</span>
      <div className="pf-colors__row">
        {palette.map((color) => <button key={`p${color}`} type="button" className="pf-swatch" style={{ background: color }} title={color} data-active={value?.toUpperCase() === color.toUpperCase() || undefined} onClick={() => onPick(color)} />)}
      </div>
      <span className="pf-colors__label">Standard</span>
      <div className="pf-colors__row">
        {STANDARD.map((color) => <button key={`s${color}`} type="button" className="pf-swatch" style={{ background: color }} title={color} data-active={value?.toUpperCase() === color || undefined} onClick={() => onPick(color)} />)}
      </div>
      <div className="pf-colors__foot">
        {none && <button type="button" className="pf-link" onClick={() => onPick(null)}>{none}</button>}
        <label className="pf-link pf-custom">
          Custom…
          <input type="color" value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(event) => onPick(event.target.value.toUpperCase())} />
        </label>
      </div>
    </div>
  );
}

export interface FormatBarProps {
  /** Selected modelled elements (first is the reference for the shown values). */
  models: SlideElement[];
  /** Count of everything selected, drawn artwork included. */
  selectedCount: number;
  editing: boolean;
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Screen px per slide px, for sizes typed while editing. */
  scale: number;
  palette: string[];
  fonts: string[];
  background: string | null;
  onRuns: (change: (run: TxRun) => TxRun) => void;
  onBodies: (change: (body: TxBody) => TxBody) => void;
  onModels: (change: (model: SlideElement) => SlideElement) => void;
  onInsertText: () => void;
  onInsertPicture: () => void;
  onInsertShape: (kind: ShapeKind) => void;
  onArrange: (how: Arrange) => void;
  onAlign: (how: AlignHow) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBackground: (color: string) => void;
}

export const FormatBar: React.FC<FormatBarProps> = ({
  models, selectedCount, editing, editorRef, scale, palette, fonts, background, onRuns, onBodies, onModels,
  onInsertText, onInsertPicture, onInsertShape, onArrange, onAlign, onDuplicate, onDelete, onBackground,
}) => {
  const [, setTick] = useState(0);
  // While typing, the buttons follow the caret.
  useEffect(() => {
    if (!editing) return;
    const onChange = (): void => setTick((value) => value + 1);
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [editing]);

  const reference = models[0] ?? null;
  const { run, body } = firstRun(reference);
  const hasText = editing || models.some((model) => firstRun(model).run !== null);
  const shapes = models.filter((model) => model.k === 'shape' && !(model.fill.t === 'none' && (!model.line || model.line.c.t === 'none') && model.tx));
  const lineCapable = models.filter((model) => model.k === 'shape' || model.k === 'pic');
  const live = editing && selectionInside(editorRef.current);
  const state = (command: string, fallback: boolean): boolean => (live ? document.queryCommandState(command) : fallback);
  const para = body?.p.find((entry) => entry.r.some((r) => r.t.trim())) ?? body?.p[0];
  const sizePt = run ? Math.round(run.sz * 0.75 * (body?.fs ?? 1) * 2) / 2 : 18;

  const exec = (command: string, value?: string): void => {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    setTick((tick) => tick + 1);
  };

  const toggle = (command: 'bold' | 'italic' | 'underline' | 'strikeThrough', key: 'b' | 'i' | 'u' | 's'): void => {
    if (live) { exec(command); return; }
    const on = !run?.[key];
    onRuns((entry) => ({ ...entry, [key]: on || undefined }));
  };

  const setSize = (pt: number): void => {
    const px = pt / 0.75;
    if (live && editorRef.current) { applySelectionSize(editorRef.current, px * scale); setTick((tick) => tick + 1); return; }
    // Like PowerPoint's size box: the whole text takes the size, and shrink-on-overflow starts again.
    onBodies((entry) => ({ ...entry, fs: undefined, lr: undefined, p: entry.p.map((p) => ({ ...p, esz: px, r: p.r.map((r) => ({ ...r, sz: px })) })) }));
  };

  const stepSize = (direction: 1 | -1): void => {
    const next = direction > 0 ? FONT_SIZES.find((value) => value > sizePt) ?? sizePt + 8 : [...FONT_SIZES].reverse().find((value) => value < sizePt) ?? Math.max(1, sizePt - 1);
    setSize(next);
  };

  const setFont = (family: string): void => {
    if (live && editorRef.current) { applySelectionFont(editorRef.current, family); return; }
    onRuns((entry) => ({ ...entry, f: family }));
    onBodies((entry) => ({ ...entry, p: entry.p.map((p) => ({ ...p, ef: family })) }));
  };

  const setColor = (color: string | null): void => {
    if (!color) return;
    if (live) { exec('foreColor', color); return; }
    onRuns((entry) => ({ ...entry, c: color, a: undefined }));
    onBodies((entry) => ({ ...entry, p: entry.p.map((p) => ({ ...p, ec: color, bu: p.bu ? { ...p.bu, c: p.bu.c ? color : undefined } : p.bu })) }));
  };

  const setAlign = (al: 'l' | 'c' | 'r' | 'j'): void => {
    if (live) { exec(al === 'l' ? 'justifyLeft' : al === 'c' ? 'justifyCenter' : al === 'r' ? 'justifyRight' : 'justifyFull'); return; }
    onBodies((entry) => ({ ...entry, p: entry.p.map((p) => ({ ...p, al })) }));
  };

  const setList = (kind: 'bullet' | 'number'): void => {
    onBodies((entry) => {
      const has = entry.p.some((p) => (kind === 'number' ? p.bu?.num : p.bu && !p.bu.num));
      return {
        ...entry,
        p: entry.p.map((p) => {
          if (has) return { ...p, bu: undefined, ml: undefined, ind: undefined };
          const size = p.r[0]?.sz ?? p.esz ?? 24;
          const indent = Math.round(size * 1.1);
          return { ...p, bu: kind === 'number' ? { num: 'arabicPeriod' } : { ch: '•' }, ml: indent * ((p.lv ?? 0) + 1), ind: -indent };
        }),
      };
    });
  };

  const setSpacing = (value: number): void => onBodies((entry) => ({ ...entry, lr: undefined, p: entry.p.map((p) => ({ ...p, ls: value })) }));

  const fillColor = shapes[0] && shapes[0].k === 'shape' && shapes[0].fill.t === 'solid' ? shapes[0].fill.c : null;
  const lineColor = lineCapable[0] && 'line' in lineCapable[0] && lineCapable[0].line?.c.t === 'solid' ? lineCapable[0].line.c.c : null;
  const lineWidth = lineCapable[0] && 'line' in lineCapable[0] && lineCapable[0].line ? lineCapable[0].line.w * 0.75 : 0;
  const fontList = run && !fonts.includes(run.f) ? [run.f, ...fonts] : fonts;
  const textColor = live ? null : run?.c ?? null;

  return (
    <div className="pf-bar" role="toolbar" aria-label="Format">
      <div className="pf-group" aria-label="Insert">
        <button type="button" className="pf-btn" title="Text box" onMouseDown={(event) => event.preventDefault()} onClick={onInsertText}><TextT size={16} /><span>Text</span></button>
        <button type="button" className="pf-btn" title="Picture" onClick={onInsertPicture}><ImageSquare size={16} /><span>Picture</span></button>
        <Popover title="Shapes" icon={<Square size={16} />} label={<span>Shape</span>}>
          {(close) => (
            <div className="pf-shapes">
              {SHAPES.map((shape) => (
                <button key={shape.kind} type="button" className="pf-shape" title={shape.label} aria-label={shape.label} onClick={() => { onInsertShape(shape.kind); close(); }}>{shape.icon}</button>
              ))}
            </div>
          )}
        </Popover>
      </div>

      {hasText && (
        <div className="pf-group" aria-label="Text">
          <span className="pf-sep" />
          <select className="pf-font" value={run?.f ?? ''} title="Font" onChange={(event) => setFont(event.target.value)} onMouseDown={(event) => event.stopPropagation()}>
            {!run && <option value="">Font</option>}
            {fontList.map((family) => <option key={family} value={family} style={{ fontFamily: `'${family}'` }}>{family}</option>)}
          </select>
          <div className="pf-size" title="Font size">
            <button type="button" className="pf-btn pf-btn--icon" aria-label="Smaller" onMouseDown={(event) => event.preventDefault()} onClick={() => stepSize(-1)}><Minus size={11} /></button>
            <Popover title="Font size" label={<span className="pf-size__value">{sizePt}</span>}>
              {(close) => <div className="pf-list">{FONT_SIZES.map((value) => <button key={value} type="button" data-active={value === sizePt || undefined} onClick={() => { setSize(value); close(); }}>{value}</button>)}</div>}
            </Popover>
            <button type="button" className="pf-btn pf-btn--icon" aria-label="Larger" onMouseDown={(event) => event.preventDefault()} onClick={() => stepSize(1)}><Plus size={11} /></button>
          </div>
          <button type="button" className="pf-btn pf-btn--icon" title="Bold (Ctrl+B)" data-active={state('bold', Boolean(run?.b)) || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle('bold', 'b')}><TextB size={15} weight="bold" /></button>
          <button type="button" className="pf-btn pf-btn--icon" title="Italic (Ctrl+I)" data-active={state('italic', Boolean(run?.i)) || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle('italic', 'i')}><TextItalic size={15} /></button>
          <button type="button" className="pf-btn pf-btn--icon" title="Underline (Ctrl+U)" data-active={state('underline', Boolean(run?.u)) || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle('underline', 'u')}><TextUnderline size={15} /></button>
          <button type="button" className="pf-btn pf-btn--icon" title="Strikethrough" data-active={state('strikeThrough', Boolean(run?.s)) || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle('strikeThrough', 's')}><TextStrikethrough size={15} /></button>
          <Popover title="Text colour" icon={<span className="pf-textcolor"><TextT size={14} weight="bold" /><i style={{ background: textColor ?? 'currentColor' }} /></span>}>
            {(close) => <ColorGrid palette={palette} value={textColor} onPick={(color) => { setColor(color); close(); }} />}
          </Popover>
          <span className="pf-sep" />
          <button type="button" className="pf-btn pf-btn--icon" title="Align left" data-active={(para?.al ?? 'l') === 'l' || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => setAlign('l')}><TextAlignLeft size={15} /></button>
          <button type="button" className="pf-btn pf-btn--icon" title="Centre" data-active={para?.al === 'c' || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => setAlign('c')}><TextAlignCenter size={15} /></button>
          <button type="button" className="pf-btn pf-btn--icon" title="Align right" data-active={para?.al === 'r' || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => setAlign('r')}><TextAlignRight size={15} /></button>
          <button type="button" className="pf-btn pf-btn--icon" title="Justify" data-active={para?.al === 'j' || undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => setAlign('j')}><TextAlignJustify size={15} /></button>
          {!editing && (
            <>
              <button type="button" className="pf-btn pf-btn--icon" title="Bullets" data-active={Boolean(para?.bu && !para.bu.num) || undefined} onClick={() => setList('bullet')}><ListBullets size={15} /></button>
              <button type="button" className="pf-btn pf-btn--icon" title="Numbering" data-active={Boolean(para?.bu?.num) || undefined} onClick={() => setList('number')}><ListNumbers size={15} /></button>
              <Popover title="Line spacing" icon={<AlignCenterVertical size={15} />}>
                {(close) => <div className="pf-list">{LINE_SPACING.map((value) => <button key={value} type="button" data-active={Math.abs((para?.ls ?? 1) - value) < 0.01 || undefined} onClick={() => { setSpacing(value); close(); }}>{value.toFixed(value % 1 ? 2 : 1).replace(/0$/, '')}</button>)}</div>}
              </Popover>
            </>
          )}
        </div>
      )}

      {!editing && (shapes.length > 0 || lineCapable.length > 0) && (
        <div className="pf-group" aria-label="Shape">
          <span className="pf-sep" />
          {shapes.length > 0 && (
            <Popover title="Fill" icon={<span className="pf-fill"><PaintBucket size={15} /><i style={{ background: fillColor ?? 'transparent' }} /></span>}>
              {(close) => <ColorGrid palette={palette} value={fillColor} none="No fill" onPick={(color) => { onModels((model) => (model.k === 'shape' ? { ...model, fill: color ? { t: 'solid', c: color } : { t: 'none' } } : model)); close(); }} />}
            </Popover>
          )}
          <Popover title="Outline" icon={<span className="pf-fill pf-fill--line"><Square size={15} /><i style={{ background: lineColor ?? 'transparent' }} /></span>}>
            {(close) => (
              <>
                <ColorGrid palette={palette} value={lineColor} none="No outline" onPick={(color) => {
                  onModels((model) => (model.k === 'shape' || model.k === 'pic' ? { ...model, line: color ? { ...(model.line ?? { w: 1.5 }), c: { t: 'solid', c: color } } : null } : model));
                  close();
                }} />
                <div className="pf-widths">
                  <span className="pf-colors__label">Weight</span>
                  {[0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((pt) => (
                    <button key={pt} type="button" data-active={Math.abs(lineWidth - pt) < 0.1 || undefined} onClick={() => onModels((model) => (model.k === 'shape' || model.k === 'pic' ? { ...model, line: { ...(model.line ?? { c: { t: 'solid', c: palette[2] ?? '#000000' } }), w: pt / 0.75 } } : model))}>
                      <i style={{ height: Math.max(1, pt) }} />{pt} pt
                    </button>
                  ))}
                </div>
              </>
            )}
          </Popover>
        </div>
      )}

      {selectedCount > 0 && !editing && (
        <div className="pf-group pf-group--end" aria-label="Arrange">
          <span className="pf-sep" />
          <Popover title="Arrange" icon={<Stack size={15} />} label={<span>Arrange</span>} wide>
            {(close) => (
              <div className="pf-arrange">
                <span className="pf-colors__label">Order</span>
                <button type="button" onClick={() => { onArrange('front'); close(); }}>Bring to front</button>
                <button type="button" onClick={() => { onArrange('forward'); close(); }}>Bring forward</button>
                <button type="button" onClick={() => { onArrange('backward'); close(); }}>Send backward</button>
                <button type="button" onClick={() => { onArrange('back'); close(); }}>Send to back</button>
                <span className="pf-colors__label">Align {selectedCount > 1 ? 'to each other' : 'to the slide'}</span>
                <div className="pf-align">
                  <button type="button" title="Left" onClick={() => onAlign('left')}><AlignLeft size={15} /></button>
                  <button type="button" title="Centre" onClick={() => onAlign('center')}><AlignCenterHorizontal size={15} /></button>
                  <button type="button" title="Right" onClick={() => onAlign('right')}><AlignRight size={15} /></button>
                  <button type="button" title="Top" onClick={() => onAlign('top')}><AlignTop size={15} /></button>
                  <button type="button" title="Middle" onClick={() => onAlign('middle')}><AlignCenterVertical size={15} /></button>
                  <button type="button" title="Bottom" onClick={() => onAlign('bottom')}><AlignBottom size={15} /></button>
                </div>
                {selectedCount > 2 && (
                  <>
                    <button type="button" onClick={() => { onAlign('hspace'); close(); }}>Distribute horizontally</button>
                    <button type="button" onClick={() => { onAlign('vspace'); close(); }}>Distribute vertically</button>
                  </>
                )}
              </div>
            )}
          </Popover>
          <button type="button" className="pf-btn pf-btn--icon" title="Duplicate (Ctrl+D)" onClick={onDuplicate}><Copy size={15} /></button>
          <button type="button" className="pf-btn pf-btn--icon pf-btn--danger" title="Delete (Del)" onClick={onDelete}><Trash size={15} /></button>
        </div>
      )}

      {selectedCount === 0 && !editing && (
        <div className="pf-group" aria-label="Slide">
          <span className="pf-sep" />
          <Popover title="Slide background" icon={<span className="pf-fill"><PaintBucket size={15} /><i style={{ background: background ?? 'transparent' }} /></span>} label={<span>Background</span>}>
            {(close) => <ColorGrid palette={palette} value={background} onPick={(color) => { if (color) onBackground(color); close(); }} />}
          </Popover>
          <span className="pf-hint">Click anything on the slide to select it · double-click text to type</span>
        </div>
      )}
    </div>
  );
};
