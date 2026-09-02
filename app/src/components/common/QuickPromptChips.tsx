import React, { useMemo } from 'react';
import { MagicWand } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import type { InspectorQuickPrompt, InspectorQuickPromptGroup } from '../../types';

interface QuickPromptChipsProps {
  /** Called when the user clicks a prompt chip. Receives the full prompt object. */
  onSelect: (prompt: InspectorQuickPrompt) => void;
  /** Optional extra class on the outer wrapper. */
  className?: string;
  /** Compact mode: tighter spacing, smaller chips. */
  compact?: boolean;
}

const GROUP_ICON: Record<InspectorQuickPromptGroup, React.ReactNode> = {
  enhance: <MagicWand size={10} className="text-[var(--accent-text)]" aria-hidden="true" />,
  adjust: <MagicWand size={10} className="text-[var(--text-secondary)]" aria-hidden="true" />,
};

/**
 * Horizontal scrollable row of quick-prompt chips, shared between the YZPZ Agent
 * input area and the Terminal CLI prompt strip. Reads prompts from the global store.
 */
export const QuickPromptChips: React.FC<QuickPromptChipsProps> = ({
  onSelect,
  className = '',
  compact = false,
}) => {
  const inspectorQuickPrompts = useAppStore((s) => s.inspectorQuickPrompts);

  // Group prompts by group, preserving insertion order.
  const grouped = useMemo(() => {
    const map = new Map<InspectorQuickPromptGroup, InspectorQuickPrompt[]>();
    for (const prompt of inspectorQuickPrompts) {
      const arr = map.get(prompt.group) ?? [];
      arr.push(prompt);
      map.set(prompt.group, arr);
    }
    return map;
  }, [inspectorQuickPrompts]);

  if (inspectorQuickPrompts.length === 0) return null;

  return (
    <div className={`quick-prompt-chips flex items-center gap-1.5 overflow-x-auto overflow-y-hidden scrollbar-none ${className}`}>
      {Array.from(grouped.entries()).map(([group, prompts]) => (
        <React.Fragment key={group}>
          {prompts.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => onSelect(prompt)}
              title={prompt.text}
              className={`quick-prompt-chip shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)] hover:text-[var(--text-primary)] cursor-pointer ${
                compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'
              }`}
            >
              <span className="opacity-60" aria-hidden="true">
                {GROUP_ICON[group]}
              </span>
              {prompt.label}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};
