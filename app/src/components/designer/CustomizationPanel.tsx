import React from 'react';
import type { DesignerLayer, DesignerLayerStyle } from './types';

interface CustomizationPanelProps {
  layer: DesignerLayer | null;
  onUpdateStyle: (layerId: string, updates: Partial<DesignerLayerStyle>) => void;
  onRegenerateLayer: (layerId: string) => void;
}

interface FieldConfig {
  key: keyof DesignerLayerStyle;
  label: string;
  type?: 'text' | 'color' | 'select';
  options?: string[];
}

const layoutFields: FieldConfig[] = [
  { key: 'display', label: 'Display', type: 'select', options: ['flex', 'grid', 'block', 'inline-flex'] },
  { key: 'flexDirection', label: 'Direction', type: 'select', options: ['column', 'row', 'column-reverse', 'row-reverse'] },
  { key: 'justifyContent', label: 'Justify', type: 'select', options: ['flex-start', 'center', 'space-between', 'space-around', 'flex-end'] },
  { key: 'alignItems', label: 'Align', type: 'select', options: ['stretch', 'flex-start', 'center', 'flex-end'] },
  { key: 'gridTemplateColumns', label: 'Grid columns' },
  { key: 'position', label: 'Position', type: 'select', options: ['relative', 'static', 'absolute', 'sticky'] },
];

const spacingFields: FieldConfig[] = [
  { key: 'padding', label: 'Padding' },
  { key: 'margin', label: 'Margin' },
  { key: 'gap', label: 'Gap' },
  { key: 'width', label: 'Width' },
  { key: 'minHeight', label: 'Min height' },
  { key: 'imageSize', label: 'Image size' },
];

const typeFields: FieldConfig[] = [
  { key: 'fontFamily', label: 'Font family' },
  { key: 'fontSize', label: 'Font size' },
  { key: 'fontWeight', label: 'Font weight' },
  { key: 'textAlign', label: 'Text align', type: 'select', options: ['left', 'center', 'right', 'start', 'end'] },
  { key: 'color', label: 'Text color' },
  { key: 'background', label: 'Background' },
];

const visualFields: FieldConfig[] = [
  { key: 'borderRadius', label: 'Radius' },
  { key: 'border', label: 'Border' },
  { key: 'boxShadow', label: 'Shadow' },
];

const fieldGroups: Array<{ title: string; fields: FieldConfig[] }> = [
  { title: 'Layout', fields: layoutFields },
  { title: 'Spacing', fields: spacingFields },
  { title: 'Typography and color', fields: typeFields },
  { title: 'Borders and shadows', fields: visualFields },
];

const isColorValue = (value: string): boolean => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());

export const CustomizationPanel: React.FC<CustomizationPanelProps> = ({
  layer,
  onUpdateStyle,
  onRegenerateLayer,
}) => {
  if (!layer) {
    return (
      <aside className="flex h-full min-h-0 flex-col border-l border-zinc-800/80 bg-zinc-950/80">
        <div className="border-b border-zinc-800/80 px-3 py-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-100">Inspector</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <p className="text-[11px] leading-5 text-zinc-500">Select a layer to edit spacing, layout, typography, colors, and responsive behavior.</p>
        </div>
      </aside>
    );
  }

  const renderField = (field: FieldConfig) => {
    const value = layer.style[field.key];

    if (field.type === 'select' && field.options) {
      return (
        <select
          value={value}
          onChange={(event) => onUpdateStyle(layer.id, { [field.key]: event.target.value } as Partial<DesignerLayerStyle>)}
          className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-200 outline-none focus:border-emerald-500/35"
        >
          {field.options.map((option) => (
            <option key={option} value={option} className="bg-zinc-950 text-zinc-100">
              {option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <div className="flex gap-1.5">
        {field.type === 'color' || isColorValue(value) ? (
          <input
            type="color"
            value={isColorValue(value) ? value : '#22c55e'}
            onChange={(event) => onUpdateStyle(layer.id, { [field.key]: event.target.value } as Partial<DesignerLayerStyle>)}
            className="h-8 w-9 shrink-0 rounded-md border border-zinc-800 bg-zinc-950 p-1 cursor-pointer"
            aria-label={`${field.label} color`}
          />
        ) : null}
        <input
          value={value}
          onChange={(event) => onUpdateStyle(layer.id, { [field.key]: event.target.value } as Partial<DesignerLayerStyle>)}
          className="h-8 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-emerald-500/35"
        />
      </div>
    );
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-zinc-800/80 bg-zinc-950/80">
      <div className="border-b border-zinc-800/80 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-100">Inspector</h2>
            <p className="mt-1 truncate text-[10px] text-zinc-500">{layer.name} / {layer.selector}</p>
          </div>
          <button
            onClick={() => onRegenerateLayer(layer.id)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 cursor-pointer"
            title="Regenerate selected section"
            aria-label="Regenerate selected section"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006.7 5.4L4 10M4 15a8 8 0 0013.3 3.6L20 14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          {fieldGroups.map((group) => (
            <section key={group.title} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              <h3 className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">{group.title}</h3>
              <div className="space-y-2.5">
                {group.fields.map((field) => (
                  <label key={field.key} className="grid gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-600">{field.label}</span>
                    {renderField(field)}
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
};
