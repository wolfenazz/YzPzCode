import { CaretDown, CaretUp, ListChecks } from '@phosphor-icons/react';
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemDescription,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '../ai-elements/queue';
import type { AgentTodo } from '../../types';

interface TodoPanelProps {
  todos: AgentTodo[];
  open: boolean;
  running: boolean;
  onToggle: () => void;
}

export const TodoPanel = ({ todos, open, running, onToggle }: TodoPanelProps) => {
  if (todos.length === 0) return null;

  const doneCount = todos.filter((todo) => todo.status === 'completed').length;
  const allDone = doneCount === todos.length;

  if (!open) {
    return (
      <button
        aria-label="Show task progress"
        className="app-button absolute right-4 top-4 z-30 h-8 bg-[var(--bg-secondary)]/95 shadow-[var(--shadow-float)]"
        onClick={onToggle}
        title="Show task progress"
        type="button"
      >
        <ListChecks size={15} />
        <span>{doneCount}/{todos.length}</span>
        <CaretDown size={12} />
      </button>
    );
  }

  return (
    <aside className="absolute right-4 top-4 z-30 w-[min(19rem,calc(100%-2rem))]" aria-label="Task progress">
      <Queue className="gap-0 rounded-xl border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 p-0 shadow-[var(--shadow-float)] backdrop-blur-xl">
        <QueueSection defaultOpen>
          <QueueSectionTrigger className="rounded-t-xl rounded-b-none bg-transparent px-3 py-2.5 hover:bg-[var(--bg-tertiary)]">
            <QueueSectionLabel
              count={todos.length}
              icon={<ListChecks size={15} />}
              label={allDone ? 'tasks complete' : running ? 'tasks in progress' : 'tasks'}
            />
          </QueueSectionTrigger>
          <button
            aria-label="Hide task progress"
            className="app-icon-button absolute right-2 top-1.5 z-10 h-7 w-7"
            onClick={onToggle}
            title="Hide task progress"
            type="button"
          >
            <CaretUp size={13} />
          </button>
          <QueueSectionContent>
            <QueueList className="m-0 border-t border-[var(--border-primary)]">
              {todos.map((todo) => {
                const completed = todo.status === 'completed';
                return (
                  <QueueItem className="rounded-none px-3 py-2.5" key={todo.id}>
                    <div className="flex items-start gap-2.5">
                      <QueueItemIndicator className="mt-1" completed={completed} />
                      <div className="min-w-0 flex-1">
                        <QueueItemContent className="line-clamp-2 text-xs" completed={completed}>
                          {todo.content}
                        </QueueItemContent>
                        {todo.status === 'in_progress' ? (
                          <QueueItemDescription className="ml-0 mt-1 text-[10px]">
                            Working now
                          </QueueItemDescription>
                        ) : null}
                      </div>
                    </div>
                  </QueueItem>
                );
              })}
            </QueueList>
          </QueueSectionContent>
        </QueueSection>
      </Queue>
    </aside>
  );
};
