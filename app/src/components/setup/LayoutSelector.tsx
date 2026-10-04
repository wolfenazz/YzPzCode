import { Check, Code } from '@phosphor-icons/react';
import { TerminalPreviewDemo } from './TerminalPreviewDemo';
import type { LayoutConfig, AgentFleet } from '../../types';

interface LayoutSelectorProps {
  selectedLayout: LayoutConfig;
  onSelectLayout: (layout: LayoutConfig) => void;
  agentFleet?: AgentFleet;
  showPreview?: boolean;
}

// Selectable grid layouts. `sessions: 0` is the editor-only workspace, so it is
// labelled "Editor" instead of a pane count.
const TERMINAL_OPTIONS = [
  { sessions: 0, label: 'Editor', hint: 'No terminals' },
  { sessions: 1, label: '1', hint: 'Single' },
  { sessions: 2, label: '2', hint: 'Split' },
  { sessions: 4, label: '4', hint: '2 × 2' },
  { sessions: 6, label: '6', hint: '3 × 2' },
  { sessions: 8, label: '8', hint: '4 × 2' },
];

export function LayoutSelector({ selectedLayout, onSelectLayout, agentFleet, showPreview = true }: LayoutSelectorProps): React.JSX.Element {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-3 text-sm font-medium text-[var(--text-primary)]">Terminal layout</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {TERMINAL_OPTIONS.map(({ sessions, label, hint }) => {
          const selected = selectedLayout.sessions === sessions;
          return (
            <button key={sessions} type="button" aria-pressed={selected}
              // Each option draws its own pane arrangement (1 column, 2 × 2, 3 × 2,
              // 4 × 2) so the grid shape is readable without launching a workspace.
              aria-label={sessions === 0 ? 'No terminals, editor only' : `${sessions} terminal${sessions === 1 ? '' : 's'}, ${hint}`}
              // External launch only makes sense when terminals actually exist.
              onClick={() => onSelectLayout({ type: 'grid', sessions, openExternally: sessions > 0 && selectedLayout.openExternally })}
              className={`relative flex min-h-22 flex-col items-start justify-between rounded-lg border p-3 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${selected
                ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--text-primary)]'
                : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'}`}>
              <span className="flex w-full items-center justify-between">
                {sessions === 0 ? <Code size={20} /> : <span aria-hidden="true" className={`grid h-5 w-6 gap-0.5 ${sessions === 1 ? 'grid-cols-1' : sessions <= 4 ? 'grid-cols-2' : sessions === 6 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                  {Array.from({ length: sessions }, (_, index) => <span key={index} className={`rounded-[1px] border ${selected ? 'border-[var(--accent)] bg-[var(--accent-border)]' : 'border-[var(--text-secondary)]/50'}`} />)}
                </span>}
                {selected && <Check size={12} weight="bold" className="text-[var(--accent)]" />}
              </span>
              <span className="mt-2 block text-sm font-semibold">{label}<span className="mt-0.5 block text-[10px] font-normal text-[var(--text-secondary)]">{hint}</span></span>
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{selectedLayout.sessions === 0
        ? 'Open the editor and extensions without starting a terminal.'
        : 'Unassigned terminals open as plain shells. Add agents below.'}</p>
      {showPreview && <TerminalPreviewDemo sessions={selectedLayout.sessions} agentFleet={agentFleet} />}
    </fieldset>
  );
}
