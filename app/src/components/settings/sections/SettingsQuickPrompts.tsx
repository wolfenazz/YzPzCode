import React, { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVertical } from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import type { InspectorQuickPrompt, InspectorQuickPromptGroup } from '../../../types';

const GROUP_META: { group: InspectorQuickPromptGroup; label: string; description: string }[] = [
  { group: 'enhance', label: 'Enhance', description: 'Polish and refine the selected element' },
  { group: 'adjust', label: 'Adjust / Edit', description: 'Common tweaks for sizing, color, and layout' },
];

/* ── Single sortable prompt card ────────────────────────────────────── */

interface SortablePromptCardProps {
  prompt: InspectorQuickPrompt;
  onUpdate: (id: string, patch: Partial<Pick<InspectorQuickPrompt, 'label' | 'text'>>) => void;
  onRemove: (id: string) => void;
}

const SortablePromptCard: React.FC<SortablePromptCardProps> = ({ prompt, onUpdate, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prompt.id });

  const style: React.CSSProperties = {
    transform: transform && (transform.x !== 0 || transform.y !== 0 || transform.scaleX !== 1 || transform.scaleY !== 1)
      ? CSS.Transform.toString(transform)
      : undefined,
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 p-3 space-y-2"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 cursor-grab active:cursor-grabbing items-center justify-center rounded text-[var(--text-secondary)]/50 hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <DotsSixVertical size={14} />
        </button>
        <input
          type="text"
          value={prompt.label}
          onChange={(event) => onUpdate(prompt.id, { label: event.target.value })}
          placeholder="Prompt label"
          className="flex-1 bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-md px-3 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-700 focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          onClick={() => onRemove(prompt.id)}
          title="Remove prompt"
          className="px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase text-[var(--text-secondary)] hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          Remove
        </button>
      </div>
      <textarea
        value={prompt.text}
        onChange={(event) => onUpdate(prompt.id, { text: event.target.value })}
        placeholder="Prompt text sent to the agent when clicked"
        rows={3}
        className="w-full resize-y bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-md px-3 py-2 text-[11px] leading-5 text-[var(--text-primary)] font-mono placeholder-zinc-700 focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
    </div>
  );
};

/* ── Sortable group section ─────────────────────────────────────────── */

interface SortableGroupProps {
  group: InspectorQuickPromptGroup;
  label: string;
  description: string;
  prompts: InspectorQuickPrompt[];
  onAdd: (group: InspectorQuickPromptGroup) => void;
  onUpdate: (id: string, patch: Partial<Pick<InspectorQuickPrompt, 'label' | 'text'>>) => void;
  onRemove: (id: string) => void;
  onReorder: (group: InspectorQuickPromptGroup, fromIndex: number, toIndex: number) => void;
}

const SortableGroup: React.FC<SortableGroupProps> = ({
  group,
  label,
  description,
  prompts,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = prompts.findIndex((p) => p.id === active.id);
      const newIndex = prompts.findIndex((p) => p.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(group, oldIndex, newIndex);
      }
    },
    [group, onReorder, prompts],
  );

  return (
    <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
            {label}
          </h3>
          <p className="text-[9px] text-[var(--text-secondary)] font-mono uppercase tracking-wider mt-0.5">{description}</p>
        </div>
        <button
          onClick={() => onAdd(group)}
          className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-primary)]/60 transition-colors cursor-pointer"
        >
          + Add
        </button>
      </div>

      {prompts.length === 0 ? (
        <p className="text-[10px] text-[var(--text-secondary)] font-mono">No prompts in this group.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={prompts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {prompts.map((prompt) => (
                <SortablePromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

/* ── Main settings section ──────────────────────────────────────────── */

export const SettingsQuickPrompts: React.FC = () => {
  const {
    inspectorQuickPrompts,
    addInspectorQuickPrompt,
    updateInspectorQuickPrompt,
    removeInspectorQuickPrompt,
    reorderInspectorQuickPrompts,
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
          <p className="text-[10px] text-[var(--text-secondary)] font-mono uppercase tracking-wider">
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
        {GROUP_META.map(({ group, label, description }) => (
          <SortableGroup
            key={group}
            group={group}
            label={label}
            description={description}
            prompts={promptsByGroup(group)}
            onAdd={addInspectorQuickPrompt}
            onUpdate={updateInspectorQuickPrompt}
            onRemove={removeInspectorQuickPrompt}
            onReorder={reorderInspectorQuickPrompts}
          />
        ))}
      </div>

      <div className="border-t border-[var(--border-primary)]/40 pt-4">
        <p className="text-[9px] text-[var(--text-secondary)] font-mono leading-4">
          These prompts appear as one-click chips in the element inspector panel and agent input areas.
          Drag the grip handle to reorder. Selecting one fills the text box, which you can edit before sending.
        </p>
      </div>
    </div>
  );
};

