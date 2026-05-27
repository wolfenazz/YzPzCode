import React, { useState } from 'react';
import type { DesignerSkill } from './types';

interface SkillsManagerProps {
  skills: DesignerSkill[];
  onAddSkill: (text: string) => void;
  onRemoveSkill: (skillId: string) => void;
}

const examples = [
  'Always use dark mode.',
  'Prefer modern SaaS layouts.',
  'Use large rounded cards.',
  'Generate mobile-first designs.',
  'Use Arabic RTL layout when needed.',
  'Use terminal-style typography.',
];

export const SkillsManager: React.FC<SkillsManagerProps> = ({ skills, onAddSkill, onRemoveSkill }) => {
  const [draft, setDraft] = useState('');

  const submitSkill = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddSkill(trimmed);
    setDraft('');
  };

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70">
      <div className="border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-100">Design skills</h2>
        <p className="mt-1 text-[10px] text-zinc-500">Persistent preferences that influence future generations.</p>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitSkill();
              }
            }}
            className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-500/40"
            placeholder="Always use terminal-inspired dark themes."
          />
          <button
            onClick={submitSkill}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 cursor-pointer"
            aria-label="Add design skill"
            title="Add design skill"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {examples.map((example) => (
            <button
              key={example}
              onClick={() => setDraft(example)}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[9px] text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 cursor-pointer"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          {skills.map((skill) => (
            <div key={skill.id} className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <p className="min-w-0 flex-1 text-[10px] leading-4 text-zinc-400">{skill.text}</p>
              <button
                onClick={() => onRemoveSkill(skill.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-800 hover:text-rose-300 cursor-pointer"
                aria-label="Remove design skill"
                title="Remove design skill"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
