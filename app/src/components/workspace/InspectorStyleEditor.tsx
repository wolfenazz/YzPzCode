import { memo, useMemo, useState } from 'react';
import { ArrowCounterClockwise, CaretDown } from '@phosphor-icons/react';

interface InspectorStyleEditorProps {
  values: Record<string, string>;
  changedCount: number;
  onChange: (property: string, value: string) => void;
  onReset: () => void;
}

const COLOR_SWATCHES = [
  '#111827',
  '#ffffff',
  '#64748b',
  '#2563eb',
  '#7c3aed',
  '#dc2626',
  '#16a34a',
  '#f59e0b',
];

const SHADOWS = [
  { label: 'None', value: 'none' },
  { label: 'SM', value: '0 1px 3px rgba(0, 0, 0, 0.18)' },
  { label: 'MD', value: '0 8px 22px rgba(0, 0, 0, 0.22)' },
  { label: 'LG', value: '0 18px 48px rgba(0, 0, 0, 0.28)' },
];

const DISPLAY_OPTIONS = [
  { label: 'Block', value: 'block' },
  { label: 'Inline', value: 'inline' },
  { label: 'Inline block', value: 'inline-block' },
  { label: 'Flex', value: 'flex' },
  { label: 'Inline flex', value: 'inline-flex' },
  { label: 'Grid', value: 'grid' },
  { label: 'Inline grid', value: 'inline-grid' },
  { label: 'None', value: 'none' },
];

const OVERFLOW_OPTIONS = [
  { label: 'Visible', value: 'visible' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Clip', value: 'clip' },
  { label: 'Auto', value: 'auto' },
  { label: 'Scroll', value: 'scroll' },
];

const BOX_SIZING_OPTIONS = [
  { label: 'Border box', value: 'border-box' },
  { label: 'Content box', value: 'content-box' },
];

const FLEX_DIRECTION_OPTIONS = [
  { label: 'Row', value: 'row' },
  { label: 'Row reverse', value: 'row-reverse' },
  { label: 'Column', value: 'column' },
  { label: 'Column reverse', value: 'column-reverse' },
];

const FLEX_WRAP_OPTIONS = [
  { label: 'No wrap', value: 'nowrap' },
  { label: 'Wrap', value: 'wrap' },
  { label: 'Wrap reverse', value: 'wrap-reverse' },
];

const JUSTIFY_CONTENT_OPTIONS = [
  { label: 'Start', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'End', value: 'flex-end' },
  { label: 'Space between', value: 'space-between' },
  { label: 'Space around', value: 'space-around' },
  { label: 'Space evenly', value: 'space-evenly' },
];

const ALIGN_ITEMS_OPTIONS = [
  { label: 'Start', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'End', value: 'flex-end' },
  { label: 'Stretch', value: 'stretch' },
  { label: 'Baseline', value: 'baseline' },
];

const BORDER_STYLE_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
  { label: 'Double', value: 'double' },
];

const POSITION_OPTIONS = [
  { label: 'Static', value: 'static' },
  { label: 'Relative', value: 'relative' },
  { label: 'Absolute', value: 'absolute' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Sticky', value: 'sticky' },
];

const TEXT_TRANSFORM_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Uppercase', value: 'uppercase' },
  { label: 'Lowercase', value: 'lowercase' },
  { label: 'Capitalize', value: 'capitalize' },
];

const TEXT_DECORATION_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Underline', value: 'underline' },
  { label: 'Overline', value: 'overline' },
  { label: 'Line through', value: 'line-through' },
];

const WHITE_SPACE_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'No wrap', value: 'nowrap' },
  { label: 'Pre', value: 'pre' },
  { label: 'Pre wrap', value: 'pre-wrap' },
  { label: 'Break spaces', value: 'break-spaces' },
];

const CURSOR_OPTIONS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Default', value: 'default' },
  { label: 'Pointer', value: 'pointer' },
  { label: 'Text', value: 'text' },
  { label: 'Grab', value: 'grab' },
  { label: 'Move', value: 'move' },
  { label: 'Not allowed', value: 'not-allowed' },
];

const BLEND_MODE_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Multiply', value: 'multiply' },
  { label: 'Screen', value: 'screen' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Darken', value: 'darken' },
  { label: 'Lighten', value: 'lighten' },
  { label: 'Difference', value: 'difference' },
];

const toHexColor = (value: string): string => {
  const hex = value.trim().match(/^#([\da-f]{6})$/i);
  if (hex) return `#${hex[1]}`;
  const rgb = value.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
  if (!rgb) return '#000000';
  return `#${[rgb[1], rgb[2], rgb[3]]
    .map((channel) => Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, '0'))
    .join('')}`;
};

const sectionLabelClass =
  'text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]/65';

const controlClass =
  'h-7 min-w-0 rounded-md border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 font-mono text-[10px] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-border)] focus:ring-1 focus:ring-[var(--accent-border)]';

const CssField = memo(function CssField({
  label,
  property,
  value,
  onChange,
}: {
  label: string;
  property: string;
  value: string;
  onChange: (property: string, value: string) => void;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-[9px] text-[var(--text-secondary)]/60">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(property, event.target.value)}
        spellCheck={false}
        className={`${controlClass} w-full`}
      />
    </label>
  );
});

const SelectField = memo(function SelectField({
  label,
  property,
  value,
  options,
  onChange,
}: {
  label: string;
  property: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (property: string, value: string) => void;
}) {
  const includesCurrentValue = options.some((option) => option.value === value);

  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-[9px] text-[var(--text-secondary)]/60">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(property, event.target.value)}
        className={`${controlClass} w-full cursor-pointer appearance-none pr-6`}
      >
        {value && !includesCurrentValue ? <option value={value}>{value}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
});

const SegmentedControl = memo(function SegmentedControl({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-[var(--border-primary)]" role="group" aria-label={label}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`h-7 border-r border-[var(--border-primary)] px-2 text-[9px] font-medium transition-colors last:border-r-0 ${
                active
                  ? 'bg-[var(--accent-light)] text-[var(--accent-text)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});

const BoxSides = memo(function BoxSides({
  prefix,
  values,
  onChange,
}: {
  prefix: 'padding' | 'margin';
  values: Record<string, string>;
  onChange: (property: string, value: string) => void;
}) {
  const sides = [
    ['T', 'top'],
    ['R', 'right'],
    ['B', 'bottom'],
    ['L', 'left'],
  ] as const;

  return (
    <div>
      <div className="mb-1.5 text-[10px] capitalize text-[var(--text-secondary)]">{prefix}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {sides.map(([shortLabel, side]) => {
          const property = `${prefix}-${side}`;
          return (
            <label key={property} className="relative min-w-0">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-semibold text-[var(--text-secondary)]/45">
                {shortLabel}
              </span>
              <input
                type="text"
                value={values[property] ?? ''}
                onChange={(event) => onChange(property, event.target.value)}
                aria-label={`${prefix} ${side}`}
                spellCheck={false}
                className={`${controlClass} w-full pl-5 pr-1`}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
});

const ColorControl = memo(function ColorControl({
  label,
  property,
  value,
  onChange,
}: {
  label: string;
  property: string;
  value: string;
  onChange: (property: string, value: string) => void;
}) {
  const pickerValue = useMemo(() => toHexColor(value), [value]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
        <span className="max-w-40 truncate font-mono text-[9px] text-[var(--text-secondary)]/50" title={value}>
          {value}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {COLOR_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(property, color)}
            aria-label={`Set ${label.toLowerCase()} to ${color}`}
            title={color}
            className={`h-5 w-5 rounded-[6px] border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              pickerValue.toLowerCase() === color ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-white/15'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        <label className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-[6px] border border-dashed border-[var(--border-primary)] bg-[var(--bg-tertiary)]" title="Custom color">
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-secondary)]">+</span>
          <input
            type="color"
            value={pickerValue}
            onChange={(event) => onChange(property, event.target.value)}
            aria-label={`Choose custom ${label.toLowerCase()}`}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
});

export const InspectorStyleEditor = memo(function InspectorStyleEditor({
  values,
  changedCount,
  onChange,
  onReset,
}: InspectorStyleEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const opacity = Math.round(Math.max(0, Math.min(1, Number(values.opacity) || 0)) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] leading-4 text-[var(--text-secondary)]/65">
          Temporary preview only. Send the exact changes to an agent when it looks right.
        </p>
        <button
          type="button"
          onClick={onReset}
          disabled={changedCount === 0}
          className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-[var(--border-primary)] px-2 text-[9px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ArrowCounterClockwise size={11} aria-hidden="true" />
          Reset
        </button>
      </div>

      <div className="space-y-3 border-t border-[var(--border-primary)]/60 pt-3">
        <div className={sectionLabelClass}>Layout</div>
        <div className="flex gap-2">
          <CssField label="Width" property="width" value={values.width ?? ''} onChange={onChange} />
          <CssField label="Height" property="height" value={values.height ?? ''} onChange={onChange} />
        </div>
        <BoxSides prefix="padding" values={values} onChange={onChange} />
        <BoxSides prefix="margin" values={values} onChange={onChange} />
      </div>

      <div className="space-y-3 border-t border-[var(--border-primary)]/60 pt-3">
        <div className={sectionLabelClass}>Typography</div>
        <div className="flex gap-2">
          <CssField label="Size" property="font-size" value={values['font-size'] ?? ''} onChange={onChange} />
          <CssField label="Line height" property="line-height" value={values['line-height'] ?? ''} onChange={onChange} />
          <CssField label="Tracking" property="letter-spacing" value={values['letter-spacing'] ?? ''} onChange={onChange} />
        </div>
        <SegmentedControl
          label="Weight"
          value={values['font-weight'] ?? ''}
          onChange={(value) => onChange('font-weight', value)}
          options={[
            { label: 'Regular', value: '400' },
            { label: 'Medium', value: '500' },
            { label: 'Semi', value: '600' },
            { label: 'Bold', value: '700' },
          ]}
        />
        <SegmentedControl
          label="Align"
          value={values['text-align'] ?? ''}
          onChange={(value) => onChange('text-align', value)}
          options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
            { label: 'Justify', value: 'justify' },
          ]}
        />
      </div>

      <div className="space-y-3 border-t border-[var(--border-primary)]/60 pt-3">
        <div className={sectionLabelClass}>Color</div>
        <ColorControl label="Text" property="color" value={values.color ?? ''} onChange={onChange} />
        <ColorControl label="Fill" property="background-color" value={values['background-color'] ?? ''} onChange={onChange} />
      </div>

      <div className="space-y-3 border-t border-[var(--border-primary)]/60 pt-3">
        <div className={sectionLabelClass}>Appearance</div>
        <div className="flex gap-2">
          <CssField label="Radius" property="border-radius" value={values['border-radius'] ?? ''} onChange={onChange} />
        </div>
        <SegmentedControl
          label="Shadow"
          value={values['box-shadow'] ?? ''}
          onChange={(value) => onChange('box-shadow', value)}
          options={SHADOWS}
        />
        <label className="block">
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
            <span>Opacity</span>
            <span className="font-mono text-[9px] text-[var(--text-primary)]">{opacity}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={opacity}
            onChange={(event) => onChange('opacity', String(Number(event.target.value) / 100))}
            className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
          />
        </label>
      </div>

      <div className="border-t border-[var(--border-primary)]/60 pt-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((current) => !current)}
          aria-expanded={showAdvanced}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/55 px-3 py-2 text-left transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--bg-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
        >
          <span>
            <span className="block text-[10px] font-semibold text-[var(--text-primary)]">Advanced adjustments</span>
            <span className="mt-0.5 block text-[9px] text-[var(--text-secondary)]/60">
              Flow, constraints, borders, positioning and effects
            </span>
          </span>
          <CaretDown
            size={13}
            aria-hidden="true"
            className={`shrink-0 text-[var(--text-secondary)] transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>

        {showAdvanced ? (
          <div className="mt-4 space-y-5">
            <section className="space-y-3">
              <div className={sectionLabelClass}>Constraints and flow</div>
              <div className="grid grid-cols-2 gap-2">
                <CssField label="Min width" property="min-width" value={values['min-width'] ?? ''} onChange={onChange} />
                <CssField label="Max width" property="max-width" value={values['max-width'] ?? ''} onChange={onChange} />
                <CssField label="Min height" property="min-height" value={values['min-height'] ?? ''} onChange={onChange} />
                <CssField label="Max height" property="max-height" value={values['max-height'] ?? ''} onChange={onChange} />
                <CssField label="Aspect ratio" property="aspect-ratio" value={values['aspect-ratio'] ?? ''} onChange={onChange} />
                <CssField label="Gap" property="gap" value={values.gap ?? ''} onChange={onChange} />
                <SelectField label="Display" property="display" value={values.display ?? ''} options={DISPLAY_OPTIONS} onChange={onChange} />
                <SelectField label="Overflow" property="overflow" value={values.overflow ?? ''} options={OVERFLOW_OPTIONS} onChange={onChange} />
                <SelectField label="Box sizing" property="box-sizing" value={values['box-sizing'] ?? ''} options={BOX_SIZING_OPTIONS} onChange={onChange} />
              </div>
            </section>

            <section className="space-y-3 border-t border-[var(--border-primary)]/60 pt-4">
              <div>
                <div className={sectionLabelClass}>Flex and grid</div>
                <p className="mt-1 text-[9px] leading-4 text-[var(--text-secondary)]/55">
                  Flex controls take effect when display is flex. Grid tracks take effect when display is grid.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectField label="Direction" property="flex-direction" value={values['flex-direction'] ?? ''} options={FLEX_DIRECTION_OPTIONS} onChange={onChange} />
                <SelectField label="Wrap" property="flex-wrap" value={values['flex-wrap'] ?? ''} options={FLEX_WRAP_OPTIONS} onChange={onChange} />
                <SelectField label="Justify" property="justify-content" value={values['justify-content'] ?? ''} options={JUSTIFY_CONTENT_OPTIONS} onChange={onChange} />
                <SelectField label="Align" property="align-items" value={values['align-items'] ?? ''} options={ALIGN_ITEMS_OPTIONS} onChange={onChange} />
                <CssField label="Grid columns" property="grid-template-columns" value={values['grid-template-columns'] ?? ''} onChange={onChange} />
                <CssField label="Grid rows" property="grid-template-rows" value={values['grid-template-rows'] ?? ''} onChange={onChange} />
              </div>
            </section>

            <section className="space-y-3 border-t border-[var(--border-primary)]/60 pt-4">
              <div className={sectionLabelClass}>Border and outline</div>
              <div className="grid grid-cols-2 gap-2">
                <CssField label="Border width" property="border-width" value={values['border-width'] ?? ''} onChange={onChange} />
                <SelectField label="Border style" property="border-style" value={values['border-style'] ?? ''} options={BORDER_STYLE_OPTIONS} onChange={onChange} />
              </div>
              <ColorControl label="Border" property="border-color" value={values['border-color'] ?? ''} onChange={onChange} />
              <div className="grid grid-cols-2 gap-2">
                <CssField label="Outline width" property="outline-width" value={values['outline-width'] ?? ''} onChange={onChange} />
                <SelectField label="Outline style" property="outline-style" value={values['outline-style'] ?? ''} options={BORDER_STYLE_OPTIONS} onChange={onChange} />
              </div>
              <ColorControl label="Outline" property="outline-color" value={values['outline-color'] ?? ''} onChange={onChange} />
            </section>

            <section className="space-y-3 border-t border-[var(--border-primary)]/60 pt-4">
              <div className={sectionLabelClass}>Advanced type</div>
              <CssField label="Font family" property="font-family" value={values['font-family'] ?? ''} onChange={onChange} />
              <div className="grid grid-cols-2 gap-2">
                <SelectField label="Transform" property="text-transform" value={values['text-transform'] ?? ''} options={TEXT_TRANSFORM_OPTIONS} onChange={onChange} />
                <SelectField label="Decoration" property="text-decoration-line" value={values['text-decoration-line'] ?? ''} options={TEXT_DECORATION_OPTIONS} onChange={onChange} />
                <SelectField label="White space" property="white-space" value={values['white-space'] ?? ''} options={WHITE_SPACE_OPTIONS} onChange={onChange} />
              </div>
            </section>

            <section className="space-y-3 border-t border-[var(--border-primary)]/60 pt-4">
              <div>
                <div className={sectionLabelClass}>Position</div>
                <p className="mt-1 text-[9px] leading-4 text-[var(--text-secondary)]/55">
                  Positioning can move the element outside its normal layout. Reset always restores the original preview.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectField label="Mode" property="position" value={values.position ?? ''} options={POSITION_OPTIONS} onChange={onChange} />
                <CssField label="Z index" property="z-index" value={values['z-index'] ?? ''} onChange={onChange} />
                <CssField label="Top" property="top" value={values.top ?? ''} onChange={onChange} />
                <CssField label="Right" property="right" value={values.right ?? ''} onChange={onChange} />
                <CssField label="Bottom" property="bottom" value={values.bottom ?? ''} onChange={onChange} />
                <CssField label="Left" property="left" value={values.left ?? ''} onChange={onChange} />
              </div>
            </section>

            <section className="space-y-3 border-t border-[var(--border-primary)]/60 pt-4">
              <div className={sectionLabelClass}>Effects and interaction</div>
              <div className="grid grid-cols-2 gap-2">
                <CssField label="Transform" property="transform" value={values.transform ?? ''} onChange={onChange} />
                <CssField label="Transform origin" property="transform-origin" value={values['transform-origin'] ?? ''} onChange={onChange} />
                <CssField label="Filter" property="filter" value={values.filter ?? ''} onChange={onChange} />
                <CssField label="Backdrop filter" property="backdrop-filter" value={values['backdrop-filter'] ?? ''} onChange={onChange} />
                <SelectField label="Blend mode" property="mix-blend-mode" value={values['mix-blend-mode'] ?? ''} options={BLEND_MODE_OPTIONS} onChange={onChange} />
                <SelectField label="Cursor" property="cursor" value={values.cursor ?? ''} options={CURSOR_OPTIONS} onChange={onChange} />
              </div>
              <CssField label="Transition" property="transition" value={values.transition ?? ''} onChange={onChange} />
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
});
