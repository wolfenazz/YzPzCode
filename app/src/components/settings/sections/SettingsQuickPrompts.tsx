import React, { useCallback, useState } from 'react';
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
import {
  ArrowCounterClockwise,
  ChatsCircle,
  DotsSixVertical,
  MagicWand,
  Plus,
  Sliders,
  Trash,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import type { InspectorQuickPrompt, InspectorQuickPromptGroup } from '../../../types';
import {
  Button,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SettingsTabs,
} from '../SettingsKit';

const GROUP_META: { group: InspectorQuickPromptGroup; label: string; description: string; icon: React.ElementType }[] = [
  { group: 'enhance', label: 'Enhance', description: 'Polish and refine the selected element.', icon: MagicWand },
  { group: 'adjust', label: 'Adjust and edit', description: 'Common tweaks for size, color and layout.', icon: Sliders },
];

/* ── Single sortable prompt ─────────────────────────────────────────── */

interface SortablePromptProps {
  prompt: InspectorQuickPrompt;
  onUpdate: (id: string, patch: Partial<Pick<InspectorQuickPrompt, 'label' | 'text'>>) => void;
  onRemove: (id: string) => void;
}

const SortablePrompt: React.FC<SortablePromptProps> = ({ prompt, onUpdate, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: prompt.id });

  const style: React.CSSProperties = {
    transform:
      transform && (transform.x !== 0 || transform.y !== 0 || transform.scaleX !== 1 || transform.scaleY !== 1)
        ? CSS.Transform.toString(transform)
        : undefined,
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative',
    background: 'var(--bg-secondary)',
  };

  return (
    <div className="st-row st-row--top" ref={setNodeRef} style={{ ...style, gap: '0.75rem' }}>
      <button
        aria-label={`Reorder ${prompt.label || 'prompt'}`}
        className="st-btn st-btn--ghost st-btn--icon st-btn--sm"
        style={{ cursor: 'grab', marginTop: '0.125rem' }}
        title="Drag to reorder"
        type="button"
        {...attributes}
        {...listeners}
      >
        <DotsSixVertical size={16} aria-hidden="true" />
      </button>
      <div style={{ display: 'grid', flex: 1, gap: '0.5rem', minWidth: 0 }}>
        <input
          aria-label="Prompt name"
          className="st-input"
          onChange={(event) => onUpdate(prompt.id, { label: event.target.value })}
          placeholder="Name shown on the button"
          type="text"
          value={prompt.label}
        />
        <textarea
          aria-label="Prompt text"
          className="st-textarea"
          onChange={(event) => onUpdate(prompt.id, { text: event.target.value })}
          placeholder="Text sent to the agent when the button is clicked"
          rows={2}
          value={prompt.text}
        />
      </div>
      <Button
        aria-label={`Delete ${prompt.label || 'prompt'}`}
        icon={Trash}
        iconOnly
        onClick={() => onRemove(prompt.id)}
        size="sm"
        title="Delete prompt"
        variant="ghost"
      />
    </div>
  );
};

/* ── Sortable list for one group ────────────────────────────────────── */

interface PromptListProps {
  group: InspectorQuickPromptGroup;
  prompts: InspectorQuickPrompt[];
  onUpdate: SortablePromptProps['onUpdate'];
  onRemove: SortablePromptProps['onRemove'];
  onReorder: (group: InspectorQuickPromptGroup, fromIndex: number, toIndex: number) => void;
}

const PromptList: React.FC<PromptListProps> = ({ group, prompts, onUpdate, onRemove, onReorder }) => {
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={prompts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        {prompts.map((prompt) => (
          <SortablePrompt key={prompt.id} onRemove={onRemove} onUpdate={onUpdate} prompt={prompt} />
        ))}
      </SortableContext>
    </DndContext>
  );
};

/* ── Settings page ──────────────────────────────────────────────────── */

export const SettingsQuickPrompts: React.FC = () => {
  const {
    inspectorQuickPrompts,
    addInspectorQuickPrompt,
    updateInspectorQuickPrompt,
    removeInspectorQuickPrompt,
    reorderInspectorQuickPrompts,
    resetInspectorQuickPrompts,
  } = useAppStore();

  const [activeGroup, setActiveGroup] = useState<InspectorQuickPromptGroup>('enhance');

  const promptsByGroup = (group: InspectorQuickPromptGroup): InspectorQuickPrompt[] =>
    inspectorQuickPrompts.filter((prompt) => prompt.group === group);

  const meta = GROUP_META.find((item) => item.group === activeGroup) ?? GROUP_META[0];
  const prompts = promptsByGroup(meta.group);

  return (
    <>
      <SettingsTabs
        label="Prompt groups"
        onChange={setActiveGroup}
        tabs={GROUP_META.map(({ group, label, icon }) => ({
          id: group,
          label,
          icon,
          count: promptsByGroup(group).length,
        }))}
        value={activeGroup}
      />

      <SettingsStack>
        <SettingsGroup
          action={
            <Button icon={Plus} onClick={() => addInspectorQuickPrompt(meta.group)} size="sm">
              Add prompt
            </Button>
          }
          description={meta.description}
          footer="Prompts appear as one-click buttons in the element inspector and the agent input. Clicking one fills the text box so you can edit it before sending."
          title={meta.label}
        >
          {prompts.length === 0 ? (
            <SettingsEmpty icon={ChatsCircle} title="No prompts yet">
              Add one to get a shortcut in the inspector.
            </SettingsEmpty>
          ) : (
            <PromptList
              group={meta.group}
              onRemove={removeInspectorQuickPrompt}
              onReorder={reorderInspectorQuickPrompts}
              onUpdate={updateInspectorQuickPrompt}
              prompts={prompts}
            />
          )}
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            description="Bring back the built-in prompts and remove your changes in every group."
            icon={<ArrowCounterClockwise size={16} aria-hidden="true" />}
            label="Reset to defaults"
          >
            <Button onClick={resetInspectorQuickPrompts} size="sm" variant="danger">Reset all</Button>
          </SettingsRow>
        </SettingsGroup>
      </SettingsStack>
    </>
  );
};
