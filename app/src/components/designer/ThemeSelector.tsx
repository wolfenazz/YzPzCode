import React from 'react';
import type { DesignerThemeId } from './types';
import { DESIGNER_THEMES } from './designerGenerator';

interface ThemeSelectorProps {
  selectedThemeId: DesignerThemeId;
  onSelect: (themeId: DesignerThemeId) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ selectedThemeId, onSelect }) => (
  <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70">
    <div className="border-b border-zinc-800/80 px-4 py-3">
      <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-100">Theme selector</h2>
      <p className="mt-1 text-[10px] text-zinc-500">Choose the visual style before generating.</p>
    </div>

    <div className="grid max-h-[430px] grid-cols-1 gap-2 overflow-y-auto p-3">
      {DESIGNER_THEMES.map((theme) => {
        const isSelected = selectedThemeId === theme.id;
        return (
          <button
            key={theme.id}
            onClick={() => onSelect(theme.id)}
            className={`group flex items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150 cursor-pointer ${
              isSelected
                ? 'border-emerald-400/40 bg-emerald-500/10 text-zinc-100 shadow-[0_0_24px_rgba(16,185,129,0.08)]'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/70 hover:text-zinc-200'
            }`}
          >
            <span
              className="mt-0.5 h-7 w-7 shrink-0 rounded-md border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
              style={{ background: `linear-gradient(135deg, ${theme.background}, ${theme.accent})` }}
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.16em]">{theme.label}</span>
              <span className="mt-1 block text-[10px] leading-4 text-zinc-500 group-hover:text-zinc-400">{theme.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  </section>
);
