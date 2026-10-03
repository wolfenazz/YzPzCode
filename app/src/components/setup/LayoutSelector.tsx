import type { LayoutConfig } from '../../types';

interface LayoutSelectorProps {
  selectedLayout: LayoutConfig;
  onSelectLayout: (layout: LayoutConfig) => void;
}

export function LayoutSelector({ selectedLayout, onSelectLayout }: LayoutSelectorProps): React.JSX.Element {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-[var(--text-primary)]">Terminals</legend>
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 4, 6, 8].map((sessions) => (
          <button key={sessions} type="button" aria-pressed={selectedLayout.sessions === sessions}
            onClick={() => onSelectLayout({ type: 'grid', sessions, openExternally: sessions > 0 && selectedLayout.openExternally })}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${selectedLayout.sessions === sessions
              ? 'border-[var(--accent)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
              : 'border-theme text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}>
            {sessions === 0 ? 'No terminals' : sessions}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">{selectedLayout.sessions === 0
        ? 'Open the editor and extensions without starting a terminal.'
        : 'Assign agents below. Unassigned terminals open as plain shells.'}</p>
    </fieldset>
  );
}
