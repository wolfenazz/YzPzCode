import React from 'react';
import { LayoutConfig } from '../../types';
import { HelpTooltip } from '../common/HelpTooltip';

interface LayoutSelectorProps {
  selectedLayout: LayoutConfig;
  onSelectLayout: (layout: LayoutConfig) => void;
}

const LAYOUT_OPTIONS: { sessions: number; label: string }[] = [
  { sessions: 1, label: '1 Terminal' },
  { sessions: 2, label: '2 Terminals' },
  { sessions: 4, label: '4 Terminals' },
  { sessions: 6, label: '6 Terminals' },
  { sessions: 8, label: '8 Terminals' },
];

const GRID_DIMENSIONS: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  8: { cols: 4, rows: 2 },
};

const MiniTerminal: React.FC<{ index: number }> = ({ index }) => (
  <div className="flex flex-col h-full border border-zinc-800/60 rounded-[2px] overflow-hidden bg-zinc-950">
    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-zinc-900/80 border-b border-zinc-800/40 shrink-0">
      <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
      <span className="text-[4px] text-zinc-600 font-mono tracking-wider uppercase">tty{index + 1}</span>
    </div>
    <div className="flex-1 bg-[#09090b] relative min-h-0 p-0.5">
      <div className="absolute left-0.5 top-0.5 right-0.5 h-1.5 flex flex-col gap-px">
        <div className="h-px bg-zinc-800/30 w-full" />
        <div className="flex items-center">
          <div className="w-0.5 h-1 bg-zinc-600" />
          <div className="h-px bg-zinc-800/20 flex-1 ml-0.5" />
        </div>
      </div>
    </div>
  </div>
);

export const LayoutSelector: React.FC<LayoutSelectorProps> = ({
  selectedLayout,
  onSelectLayout,
}) => {
  const renderGridPreview = (sessions: number) => {
    const dimensions = GRID_DIMENSIONS[sessions] || { cols: 1, rows: 1 };

    return (
      <div
        className="grid gap-[2px] w-full h-full"
        style={{
          gridTemplateColumns: `repeat(${dimensions.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${dimensions.rows}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: sessions }, (_, i) => (
          <MiniTerminal key={i} index={i} />
        ))}
      </div>
    );
  };

  const handleToggleExternal = () => {
    onSelectLayout({
      ...selectedLayout,
      openExternally: !selectedLayout.openExternally,
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
          Terminal Layout
        </label>
        <HelpTooltip text="Choose how many terminal sessions to open. Each terminal runs independently and can be assigned a different AI agent." />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.sessions}
            type="button"
            onClick={() =>
              onSelectLayout({ type: 'grid', sessions: option.sessions, openExternally: selectedLayout.openExternally })
            }
            className={`group p-3 rounded-md border transition-colors duration-150 cursor-pointer ${
              selectedLayout.sessions === option.sessions
                ? 'border-zinc-500 bg-zinc-800/60'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-900/40'
            }`}
          >
            <div className="aspect-square mb-2 flex items-center justify-center p-1.5 bg-zinc-950 border border-zinc-800/50 rounded">
              {renderGridPreview(option.sessions)}
            </div>
            <p className="text-[10px] font-mono text-zinc-400 text-center">
              {option.label}
            </p>
          </button>
        ))}
      </div>

      {/* External Mode Toggle */}
      <div className="mt-3 flex items-center gap-3 p-3 bg-zinc-900/30 border border-zinc-800/60 rounded-md">
        <button
          type="button"
          onClick={handleToggleExternal}
          className={`relative w-4 h-4 flex items-center justify-center border rounded transition-colors duration-150 cursor-pointer ${
            selectedLayout.openExternally
              ? 'border-zinc-400 bg-zinc-200'
              : 'border-zinc-600 hover:border-zinc-500'
          }`}
        >
          {selectedLayout.openExternally && (
            <svg className="w-2.5 h-2.5 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <div className="flex flex-col">
          <span className="text-xs font-mono text-zinc-300">Open Terminals Externally</span>
          <span className="text-[10px] text-zinc-600 font-mono">Launch terminals in separate windows</span>
        </div>
        <div className="ml-auto">
          <HelpTooltip text="Opens terminals as separate system windows outside the app. They will be automatically tiled on your screen in a grid layout matching your selection." />
        </div>
      </div>
    </div>
  );
};
