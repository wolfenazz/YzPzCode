import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowClockwise, Check, DownloadSimple, MagnifyingGlass } from '@phosphor-icons/react';
import { ExtensionLogo } from '../common/ExtensionLogo';
import { useExtensionStore } from '../../stores/extensionStore';
import { SETUP_EASE, useSetupMotion } from './useSetupMotion';

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
  const motionEnabled = useSetupMotion();
  const [search, setSearch] = useState('');
  const installAndSelect = async (id: string): Promise<void> => {
    await useExtensionStore.getState().install(id);
    if (useExtensionStore.getState().catalog.find((extension) => extension.id === id)?.installedVersion) onToggle(id, true);
  };
  const query = search.trim().toLowerCase();
  const filtered = catalog.filter((extension) => !query || extension.name.toLowerCase().includes(query) || extension.publisher.toLowerCase().includes(query));

  return (
    <div>
      <div className="ws-toolbar">
        <label className="ws-search">
          <MagnifyingGlass size={14} />
          <input type="search" className="ws-input" aria-label="Search extensions" placeholder="Search extensions" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button type="button" className="ws-btn ws-btn--icon" disabled={loading} onClick={() => void useExtensionStore.getState().refreshCatalog()} aria-label="Refresh extensions" title="Refresh">
          <ArrowClockwise size={15} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>
      {error && <p role="alert" className="ws-error ws-error--block">{error}</p>}
      <div className="ws-list">
        <div className="ws-list__scroll">
          {filtered.map((extension, index) => {
            const selected = selectedIds.includes(extension.id);
            const busy = installing.includes(extension.id);
            const installation = progress[extension.id];
            const failed = installation?.stage === 'failed';
            const percent = installation?.totalBytes ? Math.round((installation.downloadedBytes / installation.totalBytes) * 100) : null;
            const canToggle = selected || (Boolean(extension.installedVersion) && backendReady && !busy);
            return (
              <motion.div key={extension.id} className="ws-row" data-active={selected}
                initial={motionEnabled ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: SETUP_EASE, delay: motionEnabled ? Math.min(index, 10) * 0.025 : 0 }}>
                <label className={`flex min-w-0 flex-1 items-center gap-3 ${canToggle ? 'cursor-pointer' : ''}`}>
                  <input type="checkbox" className="sr-only" checked={selected} disabled={!canToggle} onChange={() => onToggle(extension.id)} />
                  <span className="ws-check" data-checked={selected} aria-hidden="true">
                    {selected && <motion.span initial={motionEnabled ? { scale: 0.4, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}><Check size={11} weight="bold" /></motion.span>}
                  </span>
                  <span className="ws-row__logo" aria-hidden="true"><ExtensionLogo extensionId={extension.id} name={extension.name} small /></span>
                  <span className="ws-row__body">
                    <span className="ws-row__name block">{extension.name}</span>
                    <span className="ws-row__status">
                      <span className="ws-status-dot" data-tone={failed ? 'warn' : busy ? 'busy' : extension.installedVersion ? 'ok' : 'muted'} />
                      {failed || busy
                        ? <span className="truncate" role={failed ? 'alert' : 'status'}>{installation?.message ?? 'Preparing installation…'}</span>
                        : extension.installedVersion ? <><code>v{extension.installedVersion}</code><span className="truncate opacity-70">· {extension.publisher}</span></> : <span className="truncate">{extension.publisher}</span>}
                    </span>
                    {busy && percent !== null && <span className="ws-progress block"><span style={{ width: `${percent}%` }} /></span>}
                  </span>
                </label>
                {!extension.installedVersion && (
                  <button type="button" className="ws-btn ws-btn--sm" disabled={!backendReady || busy || loading} onClick={() => void installAndSelect(extension.id)}>
                    {busy ? <span className="ws-spinner" /> : <DownloadSimple size={13} />}
                    {busy ? 'Installing' : 'Install & add'}
                  </button>
                )}
              </motion.div>
            );
          })}
          {filtered.length === 0 && <p className="ws-empty">{catalog.length === 0 ? (loading ? 'Loading extensions…' : 'No extensions available.') : `Nothing matches “${search}”.`}</p>}
        </div>
      </div>
      <p className="ws-help">Extensions open as panels next to your terminals and don’t use a terminal slot.</p>
    </div>
  );
}
