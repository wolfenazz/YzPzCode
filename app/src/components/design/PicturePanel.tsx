import React from 'react';
import { ArrowsClockwise, ArrowsHorizontal, ArrowsVertical, Check, Image as ImageIcon, Trash, X } from '@phosphor-icons/react';
import { DEFAULT_PICTURE_OPTIONS, PICTURE_BLENDS, type PictureAlign, type PictureBlend, type PictureOptions, type PictureShape } from '../../utils/design/svgPicture';
import { ColorInput, Field, Hint, Section, Segmented, Select, Slider } from '../studio/Inspector';

/** A picture being placed or adjusted: shown live on the board, final only on Keep. */
export interface PictureEdit {
  boardId: string;
  yz: string;
  path: string;
  shapes: PictureShape[];
  shapeIndex: number;
  options: Required<Omit<PictureOptions, 'shapeIndex'>>;
  /** The drawing without this picture: every preview is made from it. */
  baseSource: string;
  /** The drawing as it was when the panel opened: Cancel puts it back. */
  original: string;
  /** An already placed picture is being adjusted (not a new one). */
  editing: boolean;
}

type Options = PictureEdit['options'];

interface PicturePanelProps {
  edit: PictureEdit;
  onChange: (next: PictureEdit) => void;
  onKeep: () => void;
  onCancel: () => void;
  onReplace: () => void;
  onRemove: () => void;
}

const ALIGN_GRID: PictureAlign[][] = [
  ['xMinYMin', 'xMidYMin', 'xMaxYMin'],
  ['xMinYMid', 'xMidYMid', 'xMaxYMid'],
  ['xMinYMax', 'xMidYMax', 'xMaxYMax'],
];

const BLEND_LABELS: Record<PictureBlend, string> = {
  normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', 'soft-light': 'Soft light', luminosity: 'Luminosity',
};

/** One-click looks: a set of tone options laid over the neutral ones. */
const LOOKS: Array<{ id: string; label: string; options: Partial<Options> }> = [
  { id: 'original', label: 'Original', options: {} },
  { id: 'mono', label: 'Black & white', options: { saturation: 0, contrast: 1.1 } },
  { id: 'warm', label: 'Warm', options: { tint: '#ff9f43', tintOpacity: 0.16, saturation: 1.1 } },
  { id: 'cool', label: 'Cool', options: { tint: '#4a90e2', tintOpacity: 0.16 } },
  { id: 'faded', label: 'Faded', options: { contrast: 0.85, brightness: 1.1, saturation: 0.8 } },
  { id: 'vivid', label: 'Vivid', options: { contrast: 1.15, saturation: 1.35 } },
  { id: 'dim', label: 'Dim for text', options: { brightness: 0.6, contrast: 1.05 } },
  { id: 'soft', label: 'Soft focus', options: { blur: 2.5, brightness: 1.05 } },
];

const TONE_KEYS = ['brightness', 'contrast', 'saturation', 'hue', 'blur', 'tint', 'tintOpacity'] as const;

const pct = (value: number): string => `${Math.round(value * 100)}%`;

/** The right-hand panel for putting a picture inside a drawn shape and adjusting it. */
export const PicturePanel: React.FC<PicturePanelProps> = ({ edit, onChange, onKeep, onCancel, onReplace, onRemove }) => {
  const o = edit.options;
  const set = (patch: Partial<Options>): void => onChange({ ...edit, options: { ...o, ...patch } });
  const toneChanged = TONE_KEYS.some((key) => o[key] !== DEFAULT_PICTURE_OPTIONS[key]);
  const placementChanged = o.zoom !== 1 || o.offsetX !== 0 || o.offsetY !== 0 || o.rotate !== 0 || o.flipX || o.flipY || o.fit !== 'fill' || o.align !== 'xMidYMid' || o.inset !== 0;
  const name = edit.path.split('/').pop() ?? edit.path;

  const lookActive = (look: (typeof LOOKS)[number]): boolean => TONE_KEYS.every((key) => o[key] === ({ ...DEFAULT_PICTURE_OPTIONS, ...look.options } as Options)[key]);

  return (
    <aside className="dz-picpanel" aria-label="Picture">
      <div className="dz-picpanel__head">
        <span className="dz-picpanel__title"><ImageIcon size={15} /> {edit.editing ? 'Adjust picture' : 'Place picture'}</span>
        <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-label="Cancel" title="Cancel (Esc)" onClick={onCancel}><X size={14} /></button>
      </div>
      <div className="dz-picpanel__file" dir="auto" title={edit.path}>
        <span>{name}</span>
        <button type="button" className="dz-btn dz-btn--sm dz-btn--ghost" onClick={onReplace}>Replace…</button>
      </div>

      <div className="dz-side__body dz-picpanel__body">
        {edit.shapes.length > 1 && (
          <Section title="Shape">
            <div className="dz-picturechoice__list" role="radiogroup" aria-label="Which shape holds the picture">
              {edit.shapes.map((shape) => (
                <label key={shape.index} className="dz-picturechoice__item" data-active={edit.shapeIndex === shape.index || undefined}>
                  <input type="radio" name="picture-shape" checked={edit.shapeIndex === shape.index} onChange={() => onChange({ ...edit, shapeIndex: shape.index })} />
                  <span>{shape.index === 0 ? 'Innermost' : shape.index === edit.shapes.length - 1 ? 'Outer frame' : `Shape ${shape.index + 1}`}</span>
                  <span className="dz-picturechoice__meta">{shape.width} × {shape.height} · {Math.round(shape.share * 100)}%</span>
                </label>
              ))}
            </div>
            <Slider label="Gap from the border" value={o.inset} min={0} max={120} display={`${o.inset}px`} onChange={(value) => set({ inset: value })} />
          </Section>
        )}
        {edit.shapes.length <= 1 && (
          <Section title="Shape">
            <Slider label="Gap from the border" value={o.inset} min={0} max={120} display={`${o.inset}px`} onChange={(value) => set({ inset: value })} />
          </Section>
        )}

        <Section title="Looks">
          <div className="dz-picpanel__looks">
            {LOOKS.map((look) => (
              <button
                key={look.id}
                type="button"
                className="dz-btn dz-btn--sm"
                data-active={lookActive(look) || undefined}
                onClick={() => set({ ...Object.fromEntries(TONE_KEYS.map((key) => [key, DEFAULT_PICTURE_OPTIONS[key]])), ...look.options })}
              >
                {look.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Position">
          <Segmented
            label="How the picture fills the shape"
            value={o.fit}
            options={[{ id: 'fill', label: 'Fill' }, { id: 'fit', label: 'Fit' }, { id: 'stretch', label: 'Stretch' }]}
            onChange={(fit) => set({ fit })}
          />
          <Hint>{o.fit === 'fill' ? 'Covers the whole shape and crops the edges.' : o.fit === 'fit' ? 'Shows the whole picture inside the shape.' : 'Stretches the picture to the shape, changing its proportions.'}</Hint>
          <Field label="Focus" stack>
            <div className="dz-picpanel__focus" role="radiogroup" aria-label="Which part of the picture stays in view">
              {ALIGN_GRID.flat().map((align) => (
                <button key={align} type="button" role="radio" aria-checked={o.align === align} disabled={o.fit === 'stretch'} aria-label={align.replace('x', '').replace('Y', ' ')} onClick={() => set({ align })} />
              ))}
            </div>
          </Field>
          <Slider label="Size" value={Math.round(o.zoom * 100)} min={50} max={400} display={pct(o.zoom)} onChange={(value) => set({ zoom: value / 100 })} />
          <Slider label="Left · Right" value={Math.round(o.offsetX * 100)} min={-50} max={50} display={pct(o.offsetX)} onChange={(value) => set({ offsetX: value / 100 })} />
          <Slider label="Up · Down" value={Math.round(o.offsetY * 100)} min={-50} max={50} display={pct(o.offsetY)} onChange={(value) => set({ offsetY: value / 100 })} />
          <Slider label="Rotate" value={o.rotate} min={-180} max={180} display={`${o.rotate}°`} onChange={(value) => set({ rotate: value })} />
          {o.rotate % 90 !== 0 && o.fit === 'fill' && o.zoom < 1.4 && <Hint>A turned picture can leave the corners of the shape empty. Raise the size to cover them.</Hint>}
          <div className="dz-picpanel__row">
            <button type="button" className="dz-btn dz-btn--sm" aria-pressed={o.flipX} onClick={() => set({ flipX: !o.flipX })}><ArrowsHorizontal size={13} /> Flip</button>
            <button type="button" className="dz-btn dz-btn--sm" aria-pressed={o.flipY} onClick={() => set({ flipY: !o.flipY })}><ArrowsVertical size={13} /> Flip</button>
            <button type="button" className="dz-btn dz-btn--sm" onClick={() => set({ rotate: ((o.rotate + 90 + 180) % 360) - 180 })}><ArrowsClockwise size={13} /> 90°</button>
            <span className="dz-picturechoice__spacer" />
            <button type="button" className="dz-btn dz-btn--sm dz-btn--ghost" disabled={!placementChanged} onClick={() => set({ inset: 0, zoom: 1, offsetX: 0, offsetY: 0, rotate: 0, flipX: false, flipY: false, fit: 'fill', align: 'xMidYMid' })}>Centre</button>
          </div>
        </Section>

        <Section title="Tone" collapsible defaultOpen aside={toneChanged ? <span className="sx-hint">edited</span> : undefined}>
          <Slider label="Brightness" value={Math.round(o.brightness * 100)} min={20} max={200} display={pct(o.brightness)} onChange={(value) => set({ brightness: value / 100 })} />
          <Slider label="Contrast" value={Math.round(o.contrast * 100)} min={20} max={200} display={pct(o.contrast)} onChange={(value) => set({ contrast: value / 100 })} />
          <Slider label="Saturation" value={Math.round(o.saturation * 100)} min={0} max={300} display={pct(o.saturation)} onChange={(value) => set({ saturation: value / 100 })} />
          <Slider label="Hue" value={o.hue} min={-180} max={180} display={`${o.hue}°`} onChange={(value) => set({ hue: value })} />
          <Slider label="Blur" value={o.blur} min={0} max={30} step={0.5} display={`${o.blur}px`} onChange={(value) => set({ blur: value })} />
          <div className="dz-picpanel__row">
            <button type="button" className="dz-btn dz-btn--sm dz-btn--ghost" disabled={!toneChanged} onClick={() => set(Object.fromEntries(TONE_KEYS.map((key) => [key, DEFAULT_PICTURE_OPTIONS[key]])) as Partial<Options>)}>Reset tone</button>
          </div>
        </Section>

        <Section title="Colour wash" collapsible defaultOpen={o.tintOpacity > 0}>
          <Field label="Colour"><ColorInput value={o.tint} label="Wash colour" onChange={(tint) => set({ tint, tintOpacity: o.tintOpacity > 0 ? o.tintOpacity : 0.25 })} /></Field>
          <Slider label="Strength" value={Math.round(o.tintOpacity * 100)} min={0} max={100} display={pct(o.tintOpacity)} onChange={(value) => set({ tintOpacity: value / 100 })} />
        </Section>

        <Section title="Blend" collapsible defaultOpen={o.opacity < 1 || o.blend !== 'normal'}>
          <Slider label="Opacity" value={Math.round(o.opacity * 100)} min={0} max={100} display={pct(o.opacity)} onChange={(value) => set({ opacity: value / 100 })} />
          <Field label="Mode">
            <Select value={o.blend} onChange={(event) => set({ blend: event.target.value as PictureBlend })}>
              {PICTURE_BLENDS.map((mode) => <option key={mode} value={mode}>{BLEND_LABELS[mode]}</option>)}
            </Select>
          </Field>
        </Section>
      </div>

      <div className="dz-picpanel__foot">
        {edit.editing && (
          <button type="button" className="dz-btn dz-btn--sm" data-danger="true" title="Take the picture out of the shape" onClick={onRemove}><Trash size={13} /> Remove</button>
        )}
        <span className="dz-picturechoice__spacer" />
        <button type="button" className="dz-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="dz-btn dz-btn--primary" onClick={onKeep}><Check size={13} weight="bold" /> Keep</button>
      </div>
    </aside>
  );
};
