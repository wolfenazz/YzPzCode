import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, ArrowSquareOut, DownloadSimple, MagnifyingGlass, PuzzlePiece, X } from '@phosphor-icons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isNewerVersion, useExtensionStore } from '../../stores/extensionStore';
import { ExtensionLogo } from '../common/ExtensionLogo';
import type { ExtensionInfo } from '../../types';

interface ExtensionsPanelProps {
  workspaceId: string;
  onOpen: (extension: ExtensionInfo) => void;
  onClose: () => void;
}

export function ExtensionsPanel({ workspaceId, onOpen, onClose }: ExtensionsPanelProps): React.JSX.Element {
  const catalog = useExtensionStore((state) => state.catalog);
  const loading = useExtensionStore((state) => state.loading);
  const backendReady = useExtensionStore((state) => state.backendReady);
  const error = useExtensionStore((state) => state.error);
  const installing = useExtensionStore((state) => state.installing);
  const progress = useExtensionStore((state) => state.progress);
  const latestVersions = useExtensionStore((state) => state.latestVersions);
  const refreshCatalog = useExtensionStore((state) => state.refreshCatalog);
  const install = useExtensionStore((state) => state.install);
  const panels = useExtensionStore((state) => state.panelsByWorkspace[workspaceId]);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void refreshCatalog(); searchRef.current?.focus(); }, [refreshCatalog]);
  const filtered = catalog.filter((extension) => `${extension.name} ${extension.publisher} ${extension.description}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="flex h-full min-w-0 flex-col bg-[var(--bg-secondary)]" aria-label="Extensions">
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-3 py-3">
        <PuzzlePiece size={16} aria-hidden="true" />
        <h2 className="flex-1 text-xs font-medium">Extensions</h2>
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={() => void refreshCatalog()} disabled={loading} title="Refresh installed extensions" aria-label="Refresh installed extensions"><ArrowClockwise size={14} /></button>
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={onClose} title="Close extensions" aria-label="Close extensions"><X size={14} /></button>
      </div>
      <div className="p-3">
        <label className="flex items-center gap-2 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-2 focus-within:border-[var(--accent)]">
          <MagnifyingGlass size={14} className="shrink-0 text-[var(--text-secondary)]" />
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} className="w-full min-w-0 bg-transparent text-xs outline-none" placeholder="Search extensions" aria-label="Search extensions" />
        </label>
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">Install an assistant, then open its graphical panel in the Extensions workspace.</p>
      </div>
      <div className="flex-1 overflow-y-auto" aria-busy={loading}>
        {error && <div role="alert" className="m-3 space-y-2 text-xs text-rose-500"><p className="break-words">{error}</p><button type="button" className="app-button" onClick={() => void refreshCatalog()}>Retry</button></div>}
        {loading && catalog.length === 0 && <p className="px-3 py-4 text-xs text-[var(--text-secondary)]">Checking installed extensions…</p>}
        {!loading && !error && filtered.length === 0 && <p className="px-3 py-4 text-xs text-[var(--text-secondary)]">No supported extensions match “{query}”.</p>}
        {filtered.map((extension) => {
          const busy = installing.includes(extension.id);
          const latest = latestVersions[extension.id];
          const updatable = isNewerVersion(latest, extension.installedVersion);
          const status = progress[extension.id];
          const opened = panels?.filter((panel) => panel.extensionId === extension.id).length ?? 0;
          const percent = status?.totalBytes ? Math.min(100, Math.round(status.downloadedBytes / status.totalBytes * 100)) : null;
          return (
            <article key={extension.id} className="border-t border-[var(--border-primary)] px-3 py-4">
              <div className="flex items-start justify-between gap-2">
                <ExtensionLogo extensionId={extension.id} name={extension.name} />
                <div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{extension.name}</h3><p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{extension.publisher}{extension.installedVersion ? ` · v${extension.installedVersion}` : ''}</p></div>
                <button type="button" className="app-icon-button app-icon-button--compact shrink-0" onClick={() => void openUrl(extension.registryUrl)} title={`View ${extension.name} on Open VSX`} aria-label={`View ${extension.name} on Open VSX`}><ArrowSquareOut size={13} /></button>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{extension.description}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[10px] text-[var(--text-secondary)]">{!backendReady ? 'Checking availability' : updatable ? `Update available · v${latest}` : extension.installedVersion ? (opened ? `${opened} open in workspace` : 'Installed') : 'Available from Open VSX'}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {updatable && (
                    <button type="button" disabled={busy || !backendReady} onClick={() => void install(extension.id)} className="app-button h-7 min-h-0 px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" title={`Update ${extension.name} to v${latest}`}>
                      {!busy && <ArrowClockwise size={13} />}{busy ? 'Updating…' : 'Update'}
                    </button>
                  )}
                  {!(busy && updatable) && (
                    <button type="button" disabled={busy || !backendReady} onClick={() => extension.installedVersion ? onOpen(extension) : void install(extension.id)} className="app-button h-7 min-h-0 px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60">
                      {!extension.installedVersion && !busy && <DownloadSimple size={13} />}
                      {busy ? 'Installing…' : extension.installedVersion ? (opened ? 'Open another' : 'Open') : status?.stage === 'failed' ? 'Retry install' : 'Install'}
                    </button>
                  )}
                </div>
              </div>
              {busy && status && <div className="mt-3 space-y-1.5" role="status"><p className="text-[10px] leading-4 text-[var(--text-secondary)]">{status.message}{percent !== null ? ` ${percent}%` : ''}</p>{percent !== null && <progress max={100} value={percent} className="h-1 w-full accent-[var(--accent)]" aria-label={`${extension.name} download progress`} />}</div>}
              {!busy && status?.stage === 'failed' && <p role="alert" className="mt-2 break-words text-[11px] leading-4 text-rose-500">{status.message}</p>}
            </article>
          );
        })}
      </div>
      <p className="border-t border-[var(--border-primary)] p-3 text-[10px] leading-4 text-[var(--text-secondary)]">The first install also downloads the extension runtime. Assistants use their own sign-in and have access to this workspace. Compatibility depends on the extension.</p>
    </section>
  );
}
