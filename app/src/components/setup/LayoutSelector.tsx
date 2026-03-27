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
  <div className="flex flex-col h-full border border-zinc-700/60 rounded-[2px] overflow-hidden bg-zinc-950">
    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-zinc-900 border-b border-zinc-700/50 shrink-0">
      <span className="w-1 h-1 bg-emerald-500 rounded-full shadow-[0_0_2px_rgba(16,185,129,0.6)]" />
      <span className="text-[5px] text-zinc-500 font-mono tracking-wider uppercase">TTY{index + 1}</span>
    </div>
    <div className="flex-1 bg-[#09090b] relative min-h-0 p-0.5">
      <div className="absolute left-0.5 top-0.5 right-0.5 h-1.5 flex flex-col gap-px">
        <div className="h-px bg-zinc-700/30 w-full" />
        <div className="flex items-center">
          <div className="w-0.5 h-1 bg-zinc-500 animate-pulse" />
          <div className="h-px bg-zinc-700/20 flex-1 ml-0.5" />
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
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-sm font-medium text-zinc-400 font-mono">
          Terminal Layout
        </label>
        <HelpTooltip text="Choose how many terminal sessions to open. Each terminal runs independently and can be assigned a different AI agent." />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.sessions}
            type="button"
            onClick={() =>
              onSelectLayout({ type: 'grid', sessions: option.sessions, openExternally: selectedLayout.openExternally })
            }
            className={`p-4 rounded-sm border transition-all ${selectedLayout.sessions === option.sessions
                ? 'border-zinc-400 bg-zinc-800/80 shadow-[0_0_10px_rgba(161,161,170,0.1)]'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-900/50'
              }`}
          >
            <div className="aspect-square mb-3 flex items-center justify-center p-2 bg-zinc-950 border border-zinc-800 rounded-sm">
              {renderGridPreview(option.sessions)}
            </div>
            <p className="text-xs font-mono text-zinc-300">
              {option.label}
            </p>
          </button>
        ))}
      </div>
      
      <div className="mt-4 flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-sm">
        <button
          type="button"
          onClick={handleToggleExternal}
          className={`relative w-5 h-5 flex items-center justify-center border rounded-sm transition-all cursor-pointer ${
            selectedLayout.openExternally
              ? 'border-emerald-500 bg-emerald-500/20'
              : 'border-zinc-600 hover:border-zinc-500'
          }`}
        >
          {selectedLayout.openExternally && (
            <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <div className="flex flex-col">
          <span className="text-sm font-mono text-zinc-300">Open Terminals Externally</span>
          <span className="text-xs text-zinc-500">Launch terminals in separate windows instead of workspace</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <HelpTooltip text="Opens terminals as separate system windows outside the app. They will be automatically tiled on your screen in a grid layout matching your selection." />
          <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      </div>
    </div>
  );
};
