import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  ArrowClockwise, ArrowDown, ArrowUp, ArrowsOutSimple, Drop, Eye, EyeSlash, Heartbeat, MagnifyingGlassPlus, PaperPlaneTilt, Play, Sparkle, SidebarSimple, Stop, Trash, Wind,
} from '@phosphor-icons/react';
import {
  animatableElements, CLASS_LABEL, defaultDirection, effectInfo, effectLabel, EFFECTS, ensureTarget, listFromPlan, makeAnimation, MAX_ANIMATIONS, MAX_DELAY, MAX_DURATION,
  selectionIdOf, slidePlan, TRIGGER_LABEL, withEffect,
  type AnimClass, type AnimDir, type AnimEffect, type AnimPlan, type AnimTrigger, type ElementAnimation,
} from '../../utils/presentation/slideAnimation';

const EFFECT_ICONS: Record<AnimEffect, React.ReactNode> = {
  appear: <Eye size={14} />,
  fade: <Drop size={14} />,
  fly: <PaperPlaneTilt size={14} />,
  float: <Wind size={14} />,
  zoom: <MagnifyingGlassPlus size={14} />,
  wipe: <SidebarSimple size={14} />,
  grow: <ArrowsOutSimple size={14} />,
  spin: <ArrowClockwise size={14} />,
  pulse: <Heartbeat size={14} />,
};

const CLASS_ORDER: AnimClass[] = ['entr', 'emph', 'exit'];
const TRIGGERS: AnimTrigger[] = ['click', 'with', 'after'];
const TRIGGER_SHORT: Record<AnimTrigger, string> = { click: 'On click', with: 'With', after: 'After' };
const TRIGGER_NOTE: Record<AnimTrigger, string> = {
  click: 'Plays when the presenter clicks.',
  with: 'Plays together with the animation before it.',
  after: 'Plays when the animation before it has finished.',
};

const SIDES: Array<{ dir: AnimDir; label: string }> = [
  { dir: 'up', label: 'Top' },
  { dir: 'right', label: 'Right' },
  { dir: 'down', label: 'Bottom' },
  { dir: 'left', label: 'Left' },
];

interface AnimationPanelProps {
  /** The slide as it is now. */
  svg: string;
  /** The slide's authored animations; undefined means automatic. */
  list: ElementAnimation[] | undefined;
  /** Whether the deck animates at all (slideshow and PowerPoint file). */
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  /** Elements selected on the slide (the editor's selection ids). */
  selection: string[];
  /** The animation being edited. */
  active: string | null;
  onActive: (id: string | null) => void;
  /** A changed list, with the slide's SVG when drawn artwork had to be marked. */
  onChange: (list: ElementAnimation[] | undefined, svg?: string) => void;
  /** Selects an element on the slide. */
  onSelectElement: (selectionId: string) => void;
  previewing: boolean;
  onPreview: () => void;
  /** The slide has a drawing. */
  ready: boolean;
  /** An AI run is in flight (the AI buttons turn into Stop). */
  busy: boolean;
  /** The deck's engine, for the caption. */
  engine: string;
  /** Slides in the deck that are drawn. */
  slideCount: number;
  /** Asks the AI to design the animation of this slide or of every slide, steered by `direction` (may be empty). */
  onAi: (scope: 'current' | 'all', direction: string) => void;
  onStop: () => void;
}

const seconds = (ms: number): string => (Math.round(ms / 10) / 100).toString();

/** The Animate tab: effects to add to the selected elements, the slide's animation order, and the options of one animation. */
export const AnimationPanel: React.FC<AnimationPanelProps> = ({ svg, list, enabled, onEnabled, selection, active, onActive, onChange, onSelectElement, previewing, onPreview, ready, busy, engine, slideCount, onAi, onStop }) => {
  const elements = useMemo(() => animatableElements(svg), [svg]);
  const plan = useMemo(() => slidePlan(svg, list), [svg, list]);
  const authored = list !== undefined && (list.length === 0 || plan.custom === true);
  const shownList = authored ? list! : [];
  const chosen = useMemo(() => selection.filter((id) => elements.some((entry) => entry.selectionId === id)), [elements, selection]);
  const [category, setCategory] = React.useState<AnimClass>('entr');
  const [direction, setDirection] = React.useState('');

  const elementOf = (animation: ElementAnimation) => elements.find((entry) => entry.keys.includes(animation.target)) ?? null;
  const selected = authored ? shownList.find((animation) => animation.id === active) ?? null : null;
  const selectedElement = selected ? elementOf(selected) : null;

  const rows = authored
    ? shownList.map((animation) => {
      const element = elementOf(animation);
      return { key: animation.id, cls: animation.cls, effect: animation.effect, trigger: animation.trigger, label: element?.label ?? 'Element removed', missing: !element, target: animation.target, id: animation.id };
    })
    : plan.items.map((item, position) => {
      const element = elements.find((entry) => entry.index === item.index);
      return { key: `auto-${position}`, cls: item.cls, effect: item.effect, trigger: item.trigger, label: element?.label ?? 'Element', missing: false, target: '', id: '' };
    });

  const update = (id: string, change: (animation: ElementAnimation) => ElementAnimation): void => {
    onChange(shownList.map((animation) => (animation.id === id ? change(animation) : animation)));
  };

  const add = (cls: AnimClass, effect: AnimEffect): void => {
    if (chosen.length === 0 || !ready) return;
    let current = svg;
    let base = shownList;
    // An automatic slide becomes an authored one first, so what the pane showed stays.
    if (!authored) {
      const seeded = listFromPlan(svg);
      current = seeded.svg;
      base = seeded.list;
    }
    const next = [...base];
    let last: string | null = null;
    chosen.forEach((id, position) => {
      if (next.length >= MAX_ANIMATIONS) return;
      const ensured = ensureTarget(current, id);
      if (!ensured) return;
      current = ensured.svg;
      const made = makeAnimation(ensured.target, cls, effect, position === 0 ? 'click' : 'with');
      next.push(made);
      last = made.id;
    });
    if (last === null) return;
    onChange(next, current !== svg ? current : undefined);
    onActive(last);
  };

  const customize = (): void => {
    const seeded = listFromPlan(svg);
    onChange(seeded.list, seeded.svg !== svg ? seeded.svg : undefined);
    onActive(seeded.list[0]?.id ?? null);
  };

  const move = (id: string, by: -1 | 1): void => {
    const index = shownList.findIndex((animation) => animation.id === id);
    const target = index + by;
    if (index < 0 || target < 0 || target >= shownList.length) return;
    const next = [...shownList];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (id: string): void => {
    onChange(shownList.filter((animation) => animation.id !== id));
    if (active === id) onActive(null);
  };

  const pickRow = (row: (typeof rows)[number]): void => {
    if (!authored) return;
    onActive(row.id);
    const selectionId = selectionIdOf(svg, row.target);
    if (selectionId) onSelectElement(selectionId);
  };

  const info = selected ? effectInfo(selected.cls, selected.effect) : undefined;
  const paragraphs = selectedElement?.paragraphs.length ?? 0;
  const sideWord = selected?.cls === 'exit' ? 'To' : 'From';

  return (
    <div className="pd-ai pd-anim">
      <section className="pd-ai__block pd-anim__ai">
        <div className="pd-section__head">
          <span className="pd-ai__label">Design with AI</span>
          <button type="button" className="pr-btn pr-btn--sm" disabled={!ready || plan.items.length === 0} onClick={onPreview} title="Play this slide's animation">
            {previewing ? <><Stop size={12} weight="fill" /> Stop</> : <><Play size={12} weight="fill" /> Preview</>}
          </button>
        </div>
        <textarea dir="auto"
          className="pr-input pd-brief"
          rows={2}
          value={direction}
          disabled={!ready || busy}
          placeholder="Optional: how it should move, e.g. cards fly in one after another, keep the title still"
          aria-label="Direction for the animation"
          onChange={(event) => setDirection(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <div className="pd-anim__ai-actions">
          {busy ? (
            <button type="button" className="pr-btn pr-btn--sm" onClick={onStop}><Stop size={12} weight="fill" /> Stop</button>
          ) : (
            <>
              <button type="button" className="pr-btn pr-btn--sm pr-btn--primary" disabled={!ready} onClick={() => onAi('current', direction.trim())}><Sparkle size={12} weight="fill" /> Animate this slide</button>
              <button type="button" className="pr-btn pr-btn--sm" disabled={!ready || slideCount < 2} onClick={() => onAi('all', direction.trim())} title="One AI call per slide; one Undo takes it all back">Whole deck ({slideCount})</button>
            </>
          )}
        </div>
        <p className="pr-hint">The AI plans what comes in, in what order and with which clicks. {authored ? 'It starts from this slide’s current animation.' : 'The drawing stays as it is.'} {engine}.</p>
      </section>

      <section className="pd-ai__block">
        <div className="pd-section__head">
          <span className="pd-ai__label">Add an effect</span>
        </div>
        <div className="pd-scope" role="tablist" aria-label="Kind of effect">
          {CLASS_ORDER.map((cls) => (
            <button key={cls} type="button" role="tab" aria-checked={category === cls} onClick={() => setCategory(cls)}>{CLASS_LABEL[cls]}</button>
          ))}
        </div>
        <div className="pd-quick pd-quick--three">
          {EFFECTS[category].map((effect) => (
            <button
              key={effect.effect}
              type="button"
              className="pd-quick__item"
              disabled={chosen.length === 0 || !ready}
              title={chosen.length === 0 ? 'Select an element on the slide first' : `${effect.label} on ${chosen.length === 1 ? 'the selected element' : `${chosen.length} elements`}`}
              onClick={() => add(category, effect.effect)}
            >
              {EFFECT_ICONS[effect.effect]} {effect.label}
            </button>
          ))}
        </div>
        <p className="pr-hint">
          {!ready ? 'This slide is not drawn yet.' : chosen.length === 0 ? 'Select text, a picture or any shape on the slide, then pick an effect.' : `${chosen.length} element${chosen.length === 1 ? '' : 's'} selected. The effect is added to the list below.`}
        </p>
      </section>

      <section className="pd-ai__block">
        <div className="pd-section__head">
          <span className="pd-ai__label">Animation order</span>
          <span className="pd-anim__mode" data-auto={!authored || undefined}>{authored ? (rows.length === 0 ? 'None' : 'Custom') : plan.items.length === 0 ? 'None' : 'Automatic'}</span>
        </div>
        {rows.length === 0 ? (
          <p className="pr-hint">{authored ? 'Nothing on this slide moves. Add an effect above.' : 'This slide has nothing to animate.'}</p>
        ) : (
          <ol className="pd-anim__list">
            {rows.map((row, position) => (
              <li key={row.key}>
                <button
                  type="button"
                  className="pd-anim__row"
                  data-active={(authored && row.id === active) || undefined}
                  data-cls={row.cls}
                  data-missing={row.missing || undefined}
                  disabled={!authored}
                  onClick={() => pickRow(row)}
                >
                  <span className="pd-anim__num">{position + 1}</span>
                  <span className="pd-anim__icon">{EFFECT_ICONS[row.effect]}</span>
                  <span className="pd-anim__text">
                    <strong>{row.label}</strong>
                    <em>{CLASS_LABEL[row.cls]} · {effectLabel(row.cls, row.effect)}</em>
                  </span>
                  <span className="pd-anim__start" data-trigger={row.trigger}>{TRIGGER_SHORT[row.trigger]}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="ps-row">
          {!authored && plan.items.length > 0 && <button type="button" className="pr-btn pr-btn--sm" onClick={customize}>Customize</button>}
          {authored && <button type="button" className="pr-btn pr-btn--sm" onClick={() => { onChange(undefined); onActive(null); }}>Reset to automatic</button>}
          {(authored ? rows.length > 0 : plan.items.length > 0) && <button type="button" className="pr-btn pr-btn--sm" onClick={() => { onChange([]); onActive(null); }}>Remove all</button>}
        </div>
      </section>

      {selected && (
        <section className="pd-section pd-anim__card">
          <div className="pd-section__head">
            <span className="pr-label">{selectedElement?.label ?? 'Element removed'}</span>
            <span className="pd-section__tools">
              <button type="button" className="pr-icon-btn pr-icon-btn--xs" aria-label="Earlier" title="Move earlier" disabled={shownList[0]?.id === selected.id} onClick={() => move(selected.id, -1)}><ArrowUp size={13} /></button>
              <button type="button" className="pr-icon-btn pr-icon-btn--xs" aria-label="Later" title="Move later" disabled={shownList[shownList.length - 1]?.id === selected.id} onClick={() => move(selected.id, 1)}><ArrowDown size={13} /></button>
              <button type="button" className="pr-icon-btn pr-icon-btn--xs" aria-label="Remove" title="Remove this animation" onClick={() => remove(selected.id)}><Trash size={13} /></button>
            </span>
          </div>

          <label className="pd-anim__field">
            <span>Effect</span>
            <select
              className="pr-select"
              value={`${selected.cls}:${selected.effect}`}
              onChange={(event) => {
                const [cls, effect] = event.target.value.split(':') as [AnimClass, AnimEffect];
                update(selected.id, (animation) => withEffect(animation, cls, effect));
              }}
            >
              {CLASS_ORDER.map((cls) => (
                <optgroup key={cls} label={CLASS_LABEL[cls]}>
                  {EFFECTS[cls].map((effect) => <option key={effect.effect} value={`${cls}:${effect.effect}`}>{effect.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          {info?.dirs === 'side' && (
            <div className="pd-anim__field">
              <span>{sideWord}</span>
              <div className="pd-segmented" role="radiogroup" aria-label={`${sideWord} which side`}>
                {SIDES.map((side) => (
                  <button key={side.dir} type="button" role="radio" aria-checked={(selected.dir ?? defaultDirection(selected.cls, selected.effect)) === side.dir} onClick={() => update(selected.id, (animation) => ({ ...animation, dir: side.dir }))}>{side.label}</button>
                ))}
              </div>
            </div>
          )}
          {info?.dirs === 'motion' && (
            <div className="pd-anim__field">
              <span>Direction</span>
              <div className="pd-segmented" role="radiogroup" aria-label="Direction">
                {(['up', 'down'] as const).map((dir) => (
                  <button key={dir} type="button" role="radio" aria-checked={(selected.dir ?? defaultDirection(selected.cls, selected.effect)) === dir} onClick={() => update(selected.id, (animation) => ({ ...animation, dir }))}>{dir === 'up' ? 'Up' : 'Down'}</button>
                ))}
              </div>
            </div>
          )}

          <div className="pd-anim__field pd-anim__field--stack">
            <span>Start</span>
            <div className="pd-segmented pd-segmented--wide" role="radiogroup" aria-label="Start">
              {TRIGGERS.map((trigger) => (
                <button key={trigger} type="button" role="radio" aria-checked={selected.trigger === trigger} title={TRIGGER_LABEL[trigger]} onClick={() => update(selected.id, (animation) => ({ ...animation, trigger }))}>
                  {TRIGGER_SHORT[trigger]}
                </button>
              ))}
            </div>
            <em className="pd-anim__note">{TRIGGER_NOTE[selected.trigger]}</em>
          </div>

          <div className="ps-grid">
            <SecondsField label="Duration" value={selected.duration} max={MAX_DURATION} disabled={selected.effect === 'appear'} onCommit={(duration) => update(selected.id, (animation) => ({ ...animation, duration }))} />
            <SecondsField label="Delay" value={selected.delay} max={MAX_DELAY} onCommit={(delay) => update(selected.id, (animation) => ({ ...animation, delay }))} />
          </div>

          {paragraphs > 1 && selected.effect !== 'appear' && (
            <label className="ps-check">
              <input type="checkbox" checked={Boolean(selected.paragraphs)} onChange={(event) => update(selected.id, (animation) => ({ ...animation, paragraphs: event.target.checked || undefined }))} />
              Animate paragraph by paragraph ({paragraphs})
            </label>
          )}
          {selected.trigger !== 'click' && shownList[0]?.id === selected.id && <p className="pr-hint">The first animation starts by itself when the slide opens.</p>}
        </section>
      )}

      <section className="pd-section">
        <label className="ps-check">
          <input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} />
          {enabled ? <Eye size={13} /> : <EyeSlash size={13} />} Animate this deck
        </label>
        <p className="pr-hint">Applies to the slideshow and to the PowerPoint file. Effects use PowerPoint's own presets, so they open as editable animations there.</p>
      </section>
    </div>
  );
};

/** Seconds, committed on Enter or blur. */
function SecondsField({ label, value, max, disabled, onCommit }: { label: string; value: number; max: number; disabled?: boolean; onCommit: (ms: number) => void }): React.JSX.Element {
  const [draft, setDraft] = React.useState(seconds(value));
  React.useEffect(() => setDraft(seconds(value)), [value]);
  const commit = (): void => {
    const next = Number(draft.replace(',', '.'));
    if (!Number.isFinite(next)) { setDraft(seconds(value)); return; }
    const ms = Math.min(max, Math.max(0, Math.round(next * 1000)));
    if (ms !== value) onCommit(ms);
    else setDraft(seconds(value));
  };
  return (
    <label className="ps-num">
      <span>{label}</span>
      <input
        className="pr-input"
        inputMode="decimal"
        disabled={disabled}
        value={disabled ? '—' : draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const next = Math.max(0, Math.round(((Number(draft) || 0) + (event.key === 'ArrowUp' ? 0.1 : -0.1)) * 10) / 10);
            setDraft(String(next));
            onCommit(Math.min(max, Math.round(next * 1000)));
          }
        }}
      />
      <em>s</em>
    </label>
  );
}

/**
 * Numbers on the slide itself, at the corner of each animated element, in the
 * order they play (PowerPoint's tags). Measured from the drawn slide, so they
 * follow moves and resizes.
 */
export const AnimationBadges: React.FC<{ frame: React.RefObject<HTMLElement | null>; svg: string; plan: AnimPlan; width: number }> = ({ frame, svg, plan, width }) => {
  const [spots, setSpots] = useState<Array<{ key: string; x: number; y: number; label: string }>>([]);
  const numbers = useMemo(() => {
    const map = new Map<number, number[]>();
    plan.items.forEach((item, position) => map.set(item.index, [...(map.get(item.index) ?? []), position + 1]));
    return map;
  }, [plan]);

  useLayoutEffect(() => {
    const host = frame.current;
    const root = host?.querySelector('.ps-stage__svg > svg') ?? host?.querySelector('svg');
    if (!host || !root) { setSpots([]); return; }
    const origin = host.getBoundingClientRect();
    const next: Array<{ key: string; x: number; y: number; label: string }> = [];
    for (const [index, list] of numbers) {
      const node = root.children[index];
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      next.push({ key: String(index), x: rect.left - origin.left, y: rect.top - origin.top, label: list.length > 2 ? `${list[0]}–${list[list.length - 1]}` : list.join(', ') });
    }
    setSpots(next);
  }, [frame, numbers, svg, width]);

  return (
    <div className="pd-anim__badges" aria-hidden="true">
      {spots.map((spot) => <span key={spot.key} className="pd-anim__badge" style={{ left: Math.max(2, spot.x), top: Math.max(2, spot.y) }}>{spot.label}</span>)}
    </div>
  );
};
