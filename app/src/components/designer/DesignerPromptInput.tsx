import React from 'react';
import type { DesignerDevice, DesignerFormState, DesignerPageType } from './types';
import { PAGE_TYPE_OPTIONS } from './designerGenerator';

interface DesignerPromptInputProps {
  form: DesignerFormState;
  onChange: (updates: Partial<DesignerFormState>) => void;
  onGenerate: () => void;
  isSaving: boolean;
  canSave: boolean;
}

const deviceOptions: Array<{ id: DesignerDevice; label: string }> = [
  { id: 'responsive', label: 'Responsive' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
];

export const DesignerPromptInput: React.FC<DesignerPromptInputProps> = ({
  form,
  onChange,
  onGenerate,
  isSaving,
  canSave,
}) => {
  const handleChange = (field: keyof DesignerFormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    onChange({ [field]: event.target.value } as Partial<DesignerFormState>);
  };

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-100">Design brief</h2>
            <p className="mt-1 text-[10px] leading-4 text-zinc-500">Describe the page, pick a theme, and Designer will generate editable HTML/CSS.</p>
          </div>
          <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            prompt first
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">What do you want to create?</span>
          <textarea
            value={form.prompt}
            onChange={handleChange('prompt')}
            className="mt-2 min-h-[142px] w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-[12px] leading-5 text-zinc-100 outline-none placeholder:text-zinc-700 transition-colors focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10"
            placeholder="Example: Create a landing page for a privacy-first analytics product with a bold hero, feature cards, social proof, pricing, and final CTA."
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Page type</span>
            <select
              value={form.pageType}
              onChange={(event) => onChange({ pageType: event.target.value as DesignerPageType })}
              className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-[11px] text-zinc-100 outline-none focus:border-emerald-500/40"
            >
              {PAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id} className="bg-zinc-950 text-zinc-100">
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Target device</span>
            <select
              value={form.targetDevice}
              onChange={(event) => onChange({ targetDevice: event.target.value as DesignerDevice })}
              className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-[11px] text-zinc-100 outline-none focus:border-emerald-500/40"
            >
              {deviceOptions.map((option) => (
                <option key={option.id} value={option.id} className="bg-zinc-950 text-zinc-100">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Brand colors</span>
            <input
              value={form.brandColors}
              onChange={handleChange('brandColors')}
              className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-500/40"
              placeholder="#22c55e #38bdf8"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Font preference</span>
            <input
              value={form.fontPreference}
              onChange={handleChange('fontPreference')}
              className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-500/40"
              placeholder="JetBrains Mono"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Required sections</span>
          <input
            value={form.requiredSections}
            onChange={handleChange('requiredSections')}
            className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-500/40"
            placeholder="Hero, features, pricing, FAQ"
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Preferred mood</span>
          <input
            value={form.mood}
            onChange={handleChange('mood')}
            className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-500/40"
            placeholder="modern, calm, premium, developer-focused"
          />
        </label>

        <button
          onClick={onGenerate}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-emerald-500/30 bg-emerald-500/12 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200 transition-all duration-200 hover:border-emerald-400/50 hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          disabled={isSaving}
        >
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,197,94,0.18),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
          <svg className="relative h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="relative">{isSaving ? 'saving to Design...' : canSave ? 'generate and save page' : 'generate preview'}</span>
        </button>
      </div>
    </section>
  );
};
