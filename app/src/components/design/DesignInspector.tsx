import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowsClockwise, Copy, Image as ImageIcon, TextAlignCenter, TextAlignLeft, TextAlignRight, Trash, X } from '@phosphor-icons/react';
import { useDesignSessionStore, type PickedElement } from '../../stores/designSessionStore';
import { ancestry } from '../../utils/design/domTree';
import { elementText as elementTextOf, outerHtmlOf, setElementText } from '../../utils/design/htmlSafe';
import { duplicateElement, elementFacts, getInlineStyle, moveElement, removeElement, setElementAttr, setElementStyle } from '../../utils/design/styleEdit';
import type { Board, DesignPalette, DesignProject } from '../../utils/design/types';
import { resolveGoto } from '../../utils/design/flow';
import { pickElement } from './pick';
import { LiquidSlider } from '../common/LiquidSlider';

interface DesignInspectorProps {
  workspaceId: string;
  project: DesignProject;
  picked: PickedElement;
  busy: boolean;
  onReplacePicture: (boardId: string, yz: string) => void;
}

const ROLES: Array<keyof DesignPalette> = ['background', 'surface', 'text', 'muted', 'primary', 'secondary', 'accent'];

const SHADOWS: Array<[string, string]> = [
  ['None', 'none'],
  ['Soft', '0 1px 3px rgba(0,0,0,0.12)'],
  ['Medium', '0 6px 18px rgba(0,0,0,0.16)'],
  ['Strong', '0 18px 40px rgba(0,0,0,0.28)'],
];

/** `rgb(…)` as `#rrggbb`; null for transparent. */
function toHex(css: string | undefined): string | null {
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(css ?? '');
  if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

type Computed = Record<string, string>;
const READ = [
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'text-align', 'opacity', 'width', 'height',
  'padding-block-start', 'padding-inline-end', 'padding-block-end', 'padding-inline-start',
  'margin-block-start', 'margin-inline-end', 'margin-block-end', 'margin-inline-start',
  'border-top-width', 'border-top-color', 'border-top-left-radius', 'box-shadow', 'object-fit',
];

function readComputed(boardId: string, yz: string): Computed | null {
  const frame = document.querySelector<HTMLIFrameElement>(`[data-board-id="${boardId}"] iframe`);
  const element = frame?.contentDocument?.querySelector(`[data-yz="${yz}"]`);
  const view = frame?.contentWindow;
  if (!element || !view) return null;
  const style = view.getComputedStyle(element);
  return Object.fromEntries(READ.map((name) => [name, style.getPropertyValue(name)]));
}

const px = (value: string | undefined): string => {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value ?? '');
  return match ? String(Math.round(Number(match[1]) * 10) / 10) : '';
};

/** A number (or keyword) field that writes on Enter or blur, so typing makes one undo step. */
const Num: React.FC<{ label: string; value: string; placeholder?: string; unit?: string; keywords?: boolean; disabled?: boolean; onCommit: (value: string | null) => void }> = ({ label, value, placeholder, unit = 'px', keywords, disabled, onCommit }) => {
  const shown = unit && value.endsWith(unit) ? value.slice(0, -unit.length) : value;
  const commit = (input: HTMLInputElement): void => {
    const text = input.value.trim();
    if (text === shown) return;
    if (!text) onCommit(null);
    else if (/^-?\d+(\.\d+)?$/.test(text)) onCommit(`${text}${unit}`);
    else if (keywords && /^(auto|\d+(\.\d+)?(px|%|rem|em|vw|vh))$/.test(text)) onCommit(text);
    else input.value = shown;
  };
  return (
    <label className="dz-num">
      <span>{label}</span>
      <input
        key={`${value}|${placeholder ?? ''}`}
        className="dz-input"
        inputMode="decimal"
        defaultValue={shown}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const input = event.target as HTMLInputElement;
            const current = Number(input.value || placeholder || 0);
            if (!Number.isFinite(current)) return;
            event.preventDefault();
            input.value = String(Math.round((current + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1)) * 10) / 10);
          }
        }}
        onBlur={(event) => commit(event.target)}
      />
    </label>
  );
};

/** A colour: the system's tokens first (so a later restyle still reaches the element), then any colour. */
const ColorField: React.FC<{ label: string; value: string; fallback: string | null; palette: DesignPalette; disabled?: boolean; onCommit: (value: string | null) => void }> = ({ label, value, fallback, palette, disabled, onCommit }) => {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback ?? '#000000';
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);
  return (
    <div className="dz-colorfield">
      <div className="dz-colorfield__head">
        <span>{label}</span>
        {value && <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-label={`Clear ${label.toLowerCase()}`} title="Back to the default" onClick={() => onCommit(null)}><X size={11} /></button>}
      </div>
      <div className="dz-colorfield__row">
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className="dz-token"
            aria-label={`${label}: ${role}`}
            title={`${role[0].toUpperCase()}${role.slice(1)} (follows the system)`}
            aria-pressed={value === `var(--ds-${role})`}
            disabled={disabled}
            style={{ background: palette[role] }}
            onClick={() => onCommit(`var(--ds-${role})`)}
          />
        ))}
        <input
          type="color"
          className="dz-color"
          aria-label={`${label}: custom`}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => { if (draft.toLowerCase() !== hex.toLowerCase()) onCommit(draft); }}
        />
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="dz-insp__section">
    <div className="dz-section__heading">{title}</div>
    {children}
  </section>
);

/** Controls for the picked element of an HTML board; every change is written into the board's markup. */
export const DesignInspector: React.FC<DesignInspectorProps> = ({ workspaceId, project, picked, busy, onReplacePicture }) => {
  const edit = useDesignSessionStore((state) => state.edit);
  const update = useDesignSessionStore((state) => state.update);
  const board = project.boards.find((entry) => entry.id === picked.boardId) as Board | undefined;
  const source = board?.source ?? '';
  const [computed, setComputed] = useState<Computed | null>(null);
  const [opacity, setOpacity] = useState<number | null>(null);

  // The frame redraws after a change, so the computed values are read a moment later.
  useEffect(() => {
    setOpacity(null);
    const read = (): void => setComputed(readComputed(picked.boardId, picked.yz));
    read();
    const timers = [window.setTimeout(read, 120), window.setTimeout(read, 450)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [picked.boardId, picked.yz, source]);

  if (!board) return null;
  const facts = elementFacts(source, picked.yz);
  if (!facts) {
    return (
      <aside className="dz-inspector" aria-label="Element">
        <p className="dz-note">This element is gone. Pick another from Layers.</p>
      </aside>
    );
  }
  const inline = getInlineStyle(source, picked.yz);
  const own = (property: string): string => inline[property] ?? '';
  const live = computed ?? {};
  const disabled = busy;

  const commit = (change: (markup: string) => string | null, nextYz?: (markup: string) => string): void => {
    const written: { markup: string | null } = { markup: null };
    edit(workspaceId, (current) => ({
      ...current,
      boards: current.boards.map((entry) => {
        if (entry.id !== board.id) return entry;
        written.markup = change(entry.source);
        return written.markup === null ? entry : { ...entry, source: written.markup };
      }),
    }));
    if (written.markup === null) return;
    const yz = nextYz ? nextYz(written.markup) : picked.yz;
    update(workspaceId, { picked: { ...picked, yz, html: outerHtmlOf(written.markup, yz) || picked.html } });
  };
  // Style edits reach every picked element (Shift-click adds one).
  const everyId = [picked.yz, ...(picked.also ?? [])];
  const style = (patch: Record<string, string | null>): void => commit((markup) => everyId.reduce<string | null>((result, id) => (result === null ? null : setElementStyle(result, id, patch) ?? result), markup));

  const trail = ancestry(source, picked.yz);
  const tag = facts.tag;
  const isText = facts.leafText;
  const isImage = tag === 'img';
  const radiusToken = own('border-radius') === 'var(--ds-radius)';

  return (
    <aside className="dz-inspector" aria-label="Element">
      <header className="dz-inspector__head">
        <div className="dz-crumbs" aria-label="Path">
          {trail.map((step, index) => (
            <React.Fragment key={step.id}>
              {index > 0 && <span className="dz-crumbs__sep" aria-hidden="true">›</span>}
              <button type="button" className="dz-crumbs__item" data-current={step.id === picked.yz || undefined} onClick={() => pickElement(workspaceId, board, step.id)}>{step.label.replace(/ “.*”$/, '')}</button>
            </React.Fragment>
          ))}
        </div>
        {everyId.length > 1 && <span className="dz-crumbs__count" title="Style changes apply to all of them">{everyId.length} elements</span>}
        <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-label="Close" title="Done (Esc)" onClick={() => update(workspaceId, { picked: null })}><X size={13} /></button>
      </header>

      <div className="dz-inspector__body">
        {isText && (
          <Section title="Text">
            <textarea
              key={`${picked.yz}|${source.length}`}
              className="dz-code dz-code--short"
              dir="auto"
              spellCheck={false}
              defaultValue={(source && elementTextOf(source, picked.yz)) || ''}
              disabled={disabled}
              aria-label="Text"
              onKeyDown={(event) => event.stopPropagation()}
              onBlur={(event) => {
                const next = event.target.value;
                if (next.trim() && next !== elementTextOf(source, picked.yz)) commit((markup) => setElementText(markup, picked.yz, next));
              }}
            />
            <div className="dz-num-grid">
              <Num label="Size" value={own('font-size')} placeholder={px(live['font-size'])} disabled={disabled} onCommit={(value) => style({ 'font-size': value })} />
              <Num label="Line" value={own('line-height')} placeholder={px(live['line-height'])} unit="" disabled={disabled} keywords onCommit={(value) => style({ 'line-height': value })} />
              <Num label="Tracking" value={own('letter-spacing')} placeholder={px(live['letter-spacing'])} disabled={disabled} onCommit={(value) => style({ 'letter-spacing': value })} />
              <label className="dz-num">
                <span>Weight</span>
                <select className="dz-select" value={own('font-weight') || ''} disabled={disabled} onChange={(event) => style({ 'font-weight': event.target.value || null })}>
                  <option value="">{live['font-weight'] ? `Auto (${live['font-weight']})` : 'Auto'}</option>
                  {['300', '400', '500', '600', '700', '800'].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                </select>
              </label>
            </div>
            <div className="dz-seg" role="group" aria-label="Alignment">
              {([['start', TextAlignLeft, 'Start'], ['center', TextAlignCenter, 'Centre'], ['end', TextAlignRight, 'End']] as const).map(([value, Icon, name]) => (
                <button key={value} type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-pressed={own('text-align') === value} aria-label={`Align ${name.toLowerCase()}`} title={`Align ${name.toLowerCase()}`} disabled={disabled} onClick={() => style({ 'text-align': own('text-align') === value ? null : value })}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
            <ColorField label="Text colour" value={own('color')} fallback={toHex(live.color)} palette={project.system.palette} disabled={disabled} onCommit={(value) => style({ color: value })} />
          </Section>
        )}

        {isImage && (
          <Section title="Picture">
            <label className="dz-field"><span>Alt text</span>
              <input className="dz-input dz-input--wide" dir="auto" defaultValue={facts.attrs.alt ?? ''} key={`${picked.yz}|alt`} disabled={disabled} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }} onBlur={(event) => { if (event.target.value !== (facts.attrs.alt ?? '')) commit((markup) => setElementAttr(markup, picked.yz, 'alt', event.target.value)); }} />
            </label>
            <label className="dz-field"><span>Fit</span>
              <select className="dz-select" value={own('object-fit')} disabled={disabled} onChange={(event) => style({ 'object-fit': event.target.value || null })}>
                <option value="">{live['object-fit'] ? `Auto (${live['object-fit']})` : 'Auto'}</option>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
              </select>
            </label>
            <button type="button" className="dz-btn dz-btn--sm" disabled={disabled} onClick={() => onReplacePicture(board.id, picked.yz)}><ImageIcon size={13} /> Replace picture…</button>
          </Section>
        )}

        <Section title="Fill">
          <ColorField label="Background" value={own('background-color') || own('background')} fallback={toHex(live['background-color'])} palette={project.system.palette} disabled={disabled} onCommit={(value) => style({ background: null, 'background-color': value })} />
        </Section>

        <Section title="Size">
          <div className="dz-num-grid">
            <Num label="Width" value={own('width')} placeholder={px(live.width)} keywords disabled={disabled} onCommit={(value) => style({ width: value })} />
            <Num label="Height" value={own('height')} placeholder={px(live.height)} keywords disabled={disabled} onCommit={(value) => style({ height: value })} />
          </div>
        </Section>

        <Section title="Spacing">
          <div className="dz-insp__label">Padding</div>
          <div className="dz-num-grid dz-num-grid--4">
            <Num label="Top" value={own('padding-block-start')} placeholder={px(live['padding-block-start'])} disabled={disabled} onCommit={(value) => style({ 'padding-block-start': value })} />
            <Num label="End" value={own('padding-inline-end')} placeholder={px(live['padding-inline-end'])} disabled={disabled} onCommit={(value) => style({ 'padding-inline-end': value })} />
            <Num label="Bottom" value={own('padding-block-end')} placeholder={px(live['padding-block-end'])} disabled={disabled} onCommit={(value) => style({ 'padding-block-end': value })} />
            <Num label="Start" value={own('padding-inline-start')} placeholder={px(live['padding-inline-start'])} disabled={disabled} onCommit={(value) => style({ 'padding-inline-start': value })} />
          </div>
          <div className="dz-insp__label">Margin</div>
          <div className="dz-num-grid dz-num-grid--4">
            <Num label="Top" value={own('margin-block-start')} placeholder={px(live['margin-block-start'])} disabled={disabled} onCommit={(value) => style({ 'margin-block-start': value })} />
            <Num label="End" value={own('margin-inline-end')} placeholder={px(live['margin-inline-end'])} disabled={disabled} onCommit={(value) => style({ 'margin-inline-end': value })} />
            <Num label="Bottom" value={own('margin-block-end')} placeholder={px(live['margin-block-end'])} disabled={disabled} onCommit={(value) => style({ 'margin-block-end': value })} />
            <Num label="Start" value={own('margin-inline-start')} placeholder={px(live['margin-inline-start'])} disabled={disabled} onCommit={(value) => style({ 'margin-inline-start': value })} />
          </div>
        </Section>

        <Section title="Border">
          <div className="dz-num-grid">
            <Num label="Width" value={own('border-width')} placeholder={px(live['border-top-width'])} disabled={disabled} onCommit={(value) => style({ 'border-width': value, 'border-style': value ? 'solid' : null })} />
            <Num label="Radius" value={radiusToken ? '' : own('border-radius')} placeholder={radiusToken ? 'system' : px(live['border-top-left-radius'])} disabled={disabled} onCommit={(value) => style({ 'border-radius': value })} />
          </div>
          <button type="button" className="dz-btn dz-btn--sm" aria-pressed={radiusToken} disabled={disabled} onClick={() => style({ 'border-radius': radiusToken ? null : 'var(--ds-radius)' })}>Radius from the system</button>
          <ColorField label="Border colour" value={own('border-color')} fallback={toHex(live['border-top-color'])} palette={project.system.palette} disabled={disabled} onCommit={(value) => style({ 'border-color': value })} />
        </Section>

        <Section title="Effects">
          <label className="dz-field"><span>Opacity {Math.round((opacity ?? Number(own('opacity') || live.opacity || 1)) * 100)}%</span>
            <LiquidSlider
              min={0}
              max={100}
              value={Math.round((opacity ?? Number(own('opacity') || live.opacity || 1)) * 100)}
              disabled={disabled}
              onChange={(event) => setOpacity(Number(event.target.value) / 100)}
              onPointerUp={() => { if (opacity !== null) style({ opacity: opacity >= 1 ? null : String(opacity) }); }}
              onKeyUp={() => { if (opacity !== null) style({ opacity: opacity >= 1 ? null : String(opacity) }); }}
            />
          </label>
          <label className="dz-field"><span>Shadow</span>
            <select className="dz-select" value={SHADOWS.find(([, value]) => value === own('box-shadow'))?.[1] ?? (own('box-shadow') ? 'custom' : '')} disabled={disabled} onChange={(event) => style({ 'box-shadow': event.target.value === 'custom' ? null : event.target.value || null })}>
              <option value="">Auto</option>
              {SHADOWS.map(([name, value]) => <option key={name} value={value}>{name}</option>)}
              {own('box-shadow') && !SHADOWS.some(([, value]) => value === own('box-shadow')) && <option value="custom">Custom</option>}
            </select>
          </label>
        </Section>

        <Section title="Element">
          {project.kind !== 'graphic' && project.boards.filter((entry) => entry.id !== board.id && !entry.hidden).length > 0 && (
            <label className="dz-field"><span>Links to</span>
              <select
                className="dz-select"
                value={facts.attrs['data-goto'] ?? ''}
                disabled={disabled}
                title="In the preview, clicking this element opens that board"
                onChange={(event) => commit((markup) => setElementAttr(markup, picked.yz, 'data-goto', event.target.value))}
              >
                <option value="">Nothing</option>
                {facts.attrs['data-goto'] && !project.boards.some((entry) => entry.name === facts.attrs['data-goto']) && (
                  <option value={facts.attrs['data-goto']}>{facts.attrs['data-goto']}{resolveGoto(project.boards, facts.attrs['data-goto'], board.id) ? '' : ' (not found)'}</option>
                )}
                {project.boards.filter((entry) => entry.id !== board.id && !entry.hidden).map((entry) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}
              </select>
            </label>
          )}
          <div className="dz-actions">
            <button type="button" className="dz-btn dz-btn--sm" disabled={disabled} onClick={() => commit((markup) => duplicateElement(markup, picked.yz)?.html ?? null, () => duplicateElement(source, picked.yz)?.id ?? picked.yz)}><Copy size={13} /> Duplicate</button>
            <button type="button" className="dz-btn dz-btn--sm" disabled={disabled} aria-label="Move up" title="Move before the previous element" onClick={() => commit((markup) => moveElement(markup, picked.yz, -1))}><ArrowUp size={13} /></button>
            <button type="button" className="dz-btn dz-btn--sm" disabled={disabled} aria-label="Move down" title="Move after the next element" onClick={() => commit((markup) => moveElement(markup, picked.yz, 1))}><ArrowDown size={13} /></button>
            <button type="button" className="dz-btn dz-btn--sm" disabled={disabled || Object.keys(inline).length === 0} title="Remove every change made here" onClick={() => commit((markup) => setElementStyle(markup, picked.yz, Object.fromEntries(Object.keys(inline).map((name) => [name, null]))))}><ArrowsClockwise size={13} /> Reset style</button>
            <button type="button" className="dz-btn dz-btn--sm dz-btn--danger" disabled={disabled} onClick={() => {
              const next = removeElement(source, picked.yz);
              if (next === null) return;
              edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === board.id ? { ...entry, source: next } : entry)) }));
              update(workspaceId, { picked: null });
            }}><Trash size={13} /> Delete</button>
          </div>
          <p className="dz-note">Colours from the system keep following it when you restyle. Ask the AI below to change this element in other ways.</p>
        </Section>
      </div>
    </aside>
  );
};

