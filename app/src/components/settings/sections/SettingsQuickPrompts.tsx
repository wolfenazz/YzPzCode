import React from 'react';
import { useAppStore } from '../../../stores/appStore';
import type { InspectorQuickPrompt, InspectorQuickPromptGroup } from '../../../types';

const GROUP_META: { group: InspectorQuickPromptGroup; label: string; description: string }[] = [
  { group: 'enhance', label: 'Enhance', description: 'Polish and refine the selected element' },
  { group: 'adjust', label: 'Adjust / Edit', description: 'Common tweaks for sizing, color, and layout' },
];

export const SettingsQuickPrompts: React.FC = () => {
  const {
    inspectorQuickPrompts,
    addInspectorQuickPrompt,
    updateInspectorQuickPrompt,
    removeInspectorQuickPrompt,
    resetInspectorQuickPrompts,
  } = useAppStore();

  const promptsByGroup = (group: InspectorQuickPromptGroup): InspectorQuickPrompt[] =>
    inspectorQuickPrompts.filter((prompt) => prompt.group === group);

  return (
    <div className="space-y-8 font-mono">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em] mb-1">
            Quick Prompts
          </h2>
          <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">
            Preset prompts for the element inspector — clickable from the panel
          </p>
        </div>
        <button
          onClick={resetInspectorQuickPrompts}
          className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
        >
          Reset to defaults
        </button>
      </div>

      <div className="space-y-6">
        {GROUP_META.map(({ group, label, description }) => {
          const prompts = promptsByGroup(group);
          return (
            <div key={group} className="bg-[#262626]/60 border border-[#3e3e38]/50 backdrop-blur-sm rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
                    {label}
                  </h3>
                  <p className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider mt-0.5">{description}</p>
                </div>
                <button
                  onClick={() => addInspectorQuickPrompt(group)}
                  className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase text-zinc-400 hover:text-zinc-200 hover:bg-[#3e3e38]/60 transition-colors cursor-pointer"
                >
                  + Add
                </button>
              </div>

              {prompts.length === 0 ? (
                <p className="text-[10px] text-zinc-600 font-mono">No prompts in this group.</p>
              ) : (
                <div className="space-y-3">
                  {prompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className="rounded-lg border border-[#3e3e38]/50 bg-[#1f1f1f]/40 p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={prompt.label}
                          onChange={(event) => updateInspectorQuickPrompt(prompt.id, { label: event.target.value })}
                          placeholder="Prompt label"
                          className="flex-1 bg-[#1f1f1f]/60 border border-[#3e3e38]/50 rounded-md px-3 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-700 focus:outline-none focus:border-[var(--accent)] transition-colors"
                        />
                        <button
                          onClick={() => removeInspectorQuickPrompt(prompt.id)}
                          title="Remove prompt"
                          className="px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase text-zinc-600 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        value={prompt.text}
                        onChange={(event) => updateInspectorQuickPrompt(prompt.id, { text: event.target.value })}
                        placeholder="Prompt text sent to the agent when clicked"
                        rows={3}
                        className="w-full resize-y bg-[#1f1f1f]/60 border border-[#3e3e38]/50 rounded-md px-3 py-2 text-[11px] leading-5 text-zinc-300 font-mono placeholder-zinc-700 focus:outline-none focus:border-[var(--accent)] transition-colors"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#3e3e38]/40 pt-4">
        <p className="text-[9px] text-zinc-600 font-mono leading-4">
          These prompts appear as one-click chips in the element inspector panel (below the instruction box).
          Selecting one fills the instruction editor, which you can edit before sending.
        </p>
      </div>
    </div>
  );
};
