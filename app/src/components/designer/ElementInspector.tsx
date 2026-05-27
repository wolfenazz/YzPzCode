import React from 'react';
import type { DesignerLayer } from './types';

interface ElementInspectorProps {
  layers: DesignerLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onToggleLayer: (layerId: string) => void;
}

const layerIcon = (type: DesignerLayer['type']) => {
  if (type === 'button') {
    return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 9h12a3 3 0 010 6H6a3 3 0 010-6z" />;
  }
  if (type === 'card') {
    return <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={1.5} />;
  }
  if (type === 'form') {
    return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 5h12v14H6zM9 9h6M9 13h4" />;
  }
  if (type === 'image') {
    return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5h16v14H4zM8 15l2.5-3 2 2.5 1.5-1.5L18 18" />;
  }
  return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />;
};

export const ElementInspector: React.FC<ElementInspectorProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onRenameLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onToggleLayer,
}) => (
  <aside className="flex h-full min-h-0 flex-col border-r border-zinc-800/80 bg-zinc-950/80">
    <div className="border-b border-zinc-800/80 px-3 py-3">
      <h2 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-100">Component tree</h2>
      <p className="mt-1 text-[10px] text-zinc-500">Select, rename, duplicate, delete, or hide layers.</p>
    </div>

    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
      {layers.map((layer) => {
        const isSelected = selectedLayerId === layer.id;
        return (
          <div
            key={layer.id}
            className={`rounded-lg border transition-colors ${
              isSelected ? 'border-emerald-500/35 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'
            }`}
          >
            <button
              onClick={() => onSelectLayer(layer.id)}
              className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left cursor-pointer"
            >
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                isSelected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-zinc-800 bg-zinc-900 text-zinc-500'
              }`}>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {layerIcon(layer.type)}
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold text-zinc-200">{layer.name}</span>
                <span className="mt-0.5 block truncate text-[9px] uppercase tracking-[0.14em] text-zinc-600">{layer.selector}</span>
              </span>
            </button>

            {isSelected && (
              <div className="border-t border-zinc-800/70 px-2.5 py-2">
                <input
                  value={layer.name}
                  onChange={(event) => onRenameLayer(layer.id, event.target.value)}
                  className="mb-2 h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-200 outline-none focus:border-emerald-500/35"
                  aria-label="Layer name"
                />
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => onToggleLayer(layer.id)}
                    className="flex h-7 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-100 cursor-pointer"
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                    aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                      <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDuplicateLayer(layer.id)}
                    className="flex h-7 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-100 cursor-pointer"
                    title="Duplicate layer"
                    aria-label="Duplicate layer"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 8h10v10H8zM6 16H4V4h12v2" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteLayer(layer.id)}
                    className="flex h-7 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:text-rose-300 cursor-pointer"
                    title="Delete layer"
                    aria-label="Delete layer"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 7h12M9 7V5h6v2M9 10v7M15 10v7M7 7l1 13h8l1-13" />
                    </svg>
                  </button>
                  <button
                    className="flex h-7 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 hover:text-zinc-100 cursor-pointer"
                    title="Layer settings"
                    aria-label="Layer settings"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v8M8 12h8" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </aside>
);
