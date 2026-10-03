import { useState } from 'react';
import { ExtensionLogo } from '../common/ExtensionLogo';
import { useExtensionStore } from '../../stores/extensionStore';

interface WorkspaceExtensionsConfigProps {
  selectedIds: string[];
  onToggle: (id: string, selected?: boolean) => void;
}

export function WorkspaceExtensionsConfig({ selectedIds, onToggle }: WorkspaceExtensionsConfigProps): React.JSX.Element {
  const catalog = useExtensionStore((state) => state.catalog);
  const loading = useExtensionStore((state) => state.loading);
  const backendReady = useExtensionStore((state) => state.backendReady);
  const error = useExtensionStore((state) => state.error);
  const installing = useExtensionStore((state) => state.installing);
  const progress = useExtensionStore((state) => state.progress);
  const [search, setSearch] = useState('');
  const installAndSelect = async (id: string): Promise<void> => {
    await useExtensionStore.getState().install(id);
    if (useExtensionStore.getState().catalog.find((extension) => extension.id === id)?.installedVersion) onToggle(id, true);
  };
  const filtered = catalog.filter((extension) => extension.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input type="search" aria-label="Find an extension" placeholder="Find an extension…" value={search} onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-theme bg-theme-main px-3 py-2 text-sm text-theme-main" />
        <button type="button" disabled={loading} onClick={() => void useExtensionStore.getState().refreshCatalog()}
          className="text-xs text-[var(--text-secondary)] disabled:opacity-50">{loading ? 'Checking…' : 'Refresh'}</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {filtered.map((extension) => {
          const selected = selectedIds.includes(extension.id);
          const busy = installing.includes(extension.id);
          const installation = progress[extension.id];
          return (
            <div key={extension.id} className={`rounded-lg border p-3 ${selected ? 'border-[var(--accent)] bg-[var(--bg-tertiary)]' : 'border-theme'}`}>
              <div className="flex min-w-0 items-center gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={selected} disabled={!selected && (!extension.installedVersion || !backendReady || busy)} onChange={() => onToggle(extension.id)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
                  <ExtensionLogo extensionId={extension.id} name={extension.name} />
                  <span className="min-w-0"><span className="block truncate text-sm text-[var(--text-primary)]">{extension.name}</span>
                    <span className="block text-xs text-[var(--text-secondary)]">{extension.installedVersion ? 'Installed' : 'Install to use'}</span></span>
                </label>
                {!extension.installedVersion && <button type="button" disabled={!backendReady || busy || loading} onClick={() => void installAndSelect(extension.id)}
                  className="shrink-0 text-xs text-[var(--accent)] disabled:opacity-50">{busy ? 'Installing…' : 'Install & add'}</button>}
              </div>
              {(busy || installation?.stage === 'failed') && <p role={installation?.stage === 'failed' ? 'alert' : 'status'} className={`mt-2 text-xs break-words ${installation?.stage === 'failed' ? 'text-rose-400' : 'text-[var(--text-secondary)]'}`}>{installation?.message ?? 'Preparing installation…'}</p>}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="py-4 text-sm text-[var(--text-secondary)]">No matching extensions.</p>}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">Selected extensions open in the workspace. They do not use terminal slots.</p>
    </div>
  );
}
