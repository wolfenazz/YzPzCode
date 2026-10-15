import { useEffect, useState } from 'react';
import { ArrowClockwise, ArrowSquareOut, CaretDown, CaretUp, DownloadSimple, GearSix, MagnifyingGlass, Sparkle, Star, Trash, X } from '@phosphor-icons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAppStore } from '../../stores/appStore';
import { isSkillsKeyError, stripSkillsKeyPrefix, useSkillStore } from '../../stores/skillStore';
import type { SkillTrendingView } from '../../stores/skillStore';
import type { SkillSummary } from '../../types';
import { SkillInstallDialog } from './SkillInstallDialog';

interface SkillsMarketPanelProps {
  workspaceId: string;
  workspacePath: string;
  onClose: () => void;
}

type Tab = SkillTrendingView | 'installed';

const TABS: { id: Tab; label: string }[] = [
  { id: 'trending', label: 'Trending' },
  { id: 'hot', label: 'Hot' },
  { id: 'all-time', label: 'All-time' },
  { id: 'installed', label: 'Installed' },
];

function formatInstalls(installs: number): string {
  if (installs >= 1_000_000) return `${(installs / 1_000_000).toFixed(1)}M`;
  if (installs >= 1_000) return `${(installs / 1_000).toFixed(1)}K`;
  return `${installs}`;
}

/** Compact "1.2K / 3.4M" formatting shared by stars and installs. */
function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  return formatInstalls(Math.floor(value));
}

/** Backend detail id: "owner/repo/slug". */
function detailIdFor(skill: SkillSummary): string {
  return skill.id.trim() !== '' ? skill.id : `${skill.source}/${skill.slug}`;
}

/** Mirrors the install progress key (skill slug, falling back to source). */
function progressKeyFor(skill: SkillSummary): string {
  return skill.slug.trim() !== '' ? skill.slug : skill.source;
}

/** One-tap searches shown when the leaderboard is unavailable without a key. */
const SUGGESTED_QUERIES = ['react', 'design', 'python', 'nextjs', 'testing', 'productivity'];

export function SkillsMarketPanel({ workspaceId, workspacePath, onClose }: SkillsMarketPanelProps): React.JSX.Element {
  const trending = useSkillStore((state) => state.trending);
  const searchResults = useSkillStore((state) => state.searchResults);
  const hasMore = useSkillStore((state) => state.hasMore);
  const loading = useSkillStore((state) => state.loading);
  const error = useSkillStore((state) => state.error);
  const detail = useSkillStore((state) => state.detail);
  const audit = useSkillStore((state) => state.audit);
  const installed = useSkillStore((state) => state.installed);
  const installing = useSkillStore((state) => state.installing);
  const progress = useSkillStore((state) => state.progress);
  const loadTrending = useSkillStore((state) => state.loadTrending);
  const search = useSkillStore((state) => state.search);
  const clearSearch = useSkillStore((state) => state.clearSearch);
  const loadDetail = useSkillStore((state) => state.loadDetail);
  const loadAudit = useSkillStore((state) => state.loadAudit);
  const refreshInstalled = useSkillStore((state) => state.refreshInstalled);
  const remove = useSkillStore((state) => state.remove);
  const update = useSkillStore((state) => state.update);
  const setCustomSource = useSkillStore((state) => state.setCustomSource);
  const hasSkillsKey = useAppStore((state) => state.skillsApiKey.trim() !== '');

  const [activeTab, setActiveTab] = useState<Tab>('trending');
  const [searchInput, setSearchInput] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogTarget, setDialogTarget] = useState<{ skill: SkillSummary | null; source: string } | null>(null);

  useEffect(() => {
    // The leaderboard is key-gated (skills.sh removed anonymous access after
    // scraper abuse). Search uses the same public endpoint as the terminal's
    // `npx skills find`, so it works with no key.
    if (hasSkillsKey) void loadTrending('trending');
    void refreshInstalled(workspacePath);
  }, [loadTrending, refreshInstalled, workspacePath, hasSkillsKey]);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      clearSearch();
      return;
    }
    if (trimmed.length < 2) return;
    const timer = window.setTimeout(() => { void search(trimmed); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, clearSearch]);

  const searching = searchInput.trim().length >= 2;
  const list = searching ? searchResults : trending;

  const handleTab = (tab: Tab): void => {
    setActiveTab(tab);
    setExpandedId(null);
    if (tab === 'installed') void refreshInstalled(workspacePath);
    // Without a key the leaderboard tabs render the key gate; no request.
    else if (hasSkillsKey) void loadTrending(tab);
  };

  const handleRefresh = (): void => {
    if (activeTab === 'installed') void refreshInstalled(workspacePath);
    else if (hasSkillsKey) void loadTrending(activeTab);
  };

  const openSettings = (): void => {
    useAppStore.getState().setViewWithPrevious('settings');
  };

  const handleToggleDetail = (skill: SkillSummary): void => {
    const id = detailIdFor(skill);
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    void loadDetail(id);
    void loadAudit(id);
  };

  const handleAddCustom = (): void => {
    const trimmed = customInput.trim();
    if (trimmed === '') return;
    setCustomSource(trimmed);
    setDialogTarget({ skill: null, source: trimmed });
  };

  const installedCount = installed.project.length + installed.global.length;

  // Leaderboard tabs without any key: the backend would only return the
  // key-required marker, so render the gate (with key-free search shortcuts).
  const showGate = !searching && activeTab !== 'installed' && (isSkillsKeyError(error) || !hasSkillsKey);

  return (
    <section className="flex h-full min-w-0 flex-col bg-[var(--bg-secondary)]" aria-label="Skills Market">
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-3 py-3">
        <Sparkle size={16} aria-hidden="true" />
        <h2 className="flex-1 text-xs font-medium">Skills Market</h2>
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={handleRefresh} disabled={loading} title="Refresh skills" aria-label="Refresh skills"><ArrowClockwise size={14} /></button>
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={onClose} title="Close skills market" aria-label="Close skills market"><X size={14} /></button>
      </div>

      <div className="space-y-3 p-3">
        <label className="flex items-center gap-2 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-2 focus-within:border-[var(--accent)]">
          <MagnifyingGlass size={14} className="shrink-0 text-[var(--text-secondary)]" />
          <input id={`skills-search-${workspaceId}`} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="w-full min-w-0 bg-transparent text-xs outline-none" placeholder="Search skills (min 2 chars)" aria-label="Search skills" />
        </label>
        <div className="flex items-center gap-1" role="tablist" aria-label="Skills views">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => handleTab(tab.id)}
              className={`rounded px-2 py-1 text-[11px] ${activeTab === tab.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              {tab.label}{tab.id === 'installed' && installedCount > 0 ? ` (${installedCount})` : ''}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input id={`skills-custom-${workspaceId}`} value={customInput} onChange={(event) => setCustomInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleAddCustom(); }} className="w-full min-w-0 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]" placeholder="owner/repo or skill URL" aria-label="Custom skill source" />
          <button type="button" className="app-button h-7 min-h-0 shrink-0 px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={customInput.trim() === ''} onClick={handleAddCustom}>Add</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" aria-busy={loading}>
        {error && !isSkillsKeyError(error) && <div role="alert" className="m-3 space-y-2 text-xs text-rose-500"><p className="break-words">{stripSkillsKeyPrefix(error)}</p><button type="button" className="app-button" onClick={handleRefresh}>Retry</button></div>}
        {loading && list.length === 0 && activeTab !== 'installed' && !showGate && <p className="px-3 py-4 text-xs text-[var(--text-secondary)]">Loading skills…</p>}

        {activeTab === 'installed' ? (
          <div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] text-[var(--text-secondary)]">{installedCount} installed</span>
              <button type="button" className="app-button h-7 min-h-0 px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={loading || installedCount === 0} onClick={() => void update(undefined)} title="Update all skills">
                <ArrowClockwise size={13} /> Update all
              </button>
            </div>
            {installedCount === 0 && !loading && <p className="px-3 py-4 text-xs text-[var(--text-secondary)]">No skills installed yet. Install one from Trending, Hot or All-time.</p>}
            {[...installed.project.map((item) => ({ ...item, scopeLabel: 'project' as const })), ...installed.global.map((item) => ({ ...item, scopeLabel: 'global' as const }))].map((item) => (
              <article key={`${item.scopeLabel}:${item.agent}:${item.name}`} className="border-t border-[var(--border-primary)] px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">{item.name}</h3>
                    <p className="mt-0.5 truncate text-[10px] text-[var(--text-secondary)]">{item.agent} · {item.scopeLabel} · {item.path}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" disabled={loading} onClick={() => void update([item.name], item.scopeLabel === 'global')} className="app-icon-button app-icon-button--compact h-7 w-7 disabled:cursor-not-allowed disabled:opacity-60" title={`Update ${item.name}`} aria-label={`Update ${item.name}`}>
                      <ArrowClockwise size={13} />
                    </button>
                    <button type="button" disabled={loading} onClick={() => void remove(item.name, item.agent, workspacePath, item.scopeLabel === 'global')} className="app-icon-button app-icon-button--compact h-7 w-7 disabled:cursor-not-allowed disabled:opacity-60" title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`}>
                      <Trash size={13} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : showGate ? (
          <div className="m-3 space-y-3 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
            <h3 className="text-xs font-medium">Trending needs an API key</h3>
            <p className="text-[11px] leading-4 text-[var(--text-secondary)]">
              skills.sh switched off anonymous catalog access, so the leaderboard charts need a key.
              Search uses the same public endpoint as the terminal&apos;s <span className="font-mono">npx skills find</span>,
              and installing from a source never touches the catalog — both work with no key.
            </p>
            <div className="flex flex-wrap gap-1.5" aria-label="Suggested searches">
              {SUGGESTED_QUERIES.map((suggestion) => (
                <button key={suggestion} type="button" className="app-button h-7 min-h-0 px-2.5 text-xs" onClick={() => setSearchInput(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-4 text-[var(--text-secondary)]">
              <li>Request a key at skills.sh/contact (issued from a queue).</li>
              <li>Paste it in Settings → Agents → Skills Market.</li>
              <li>Come back and refresh.</li>
            </ol>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="app-button h-7 min-h-0 px-2.5 text-xs" onClick={openSettings}>
                <GearSix size={13} /> Open Settings
              </button>
              <button type="button" className="app-button h-7 min-h-0 px-2.5 text-xs" onClick={() => void openUrl('https://skills.sh/docs/api')}>
                API docs
              </button>
              <button type="button" className="app-button h-7 min-h-0 px-2.5 text-xs" onClick={() => void openUrl('https://skills.sh/contact')}>
                Request a key
              </button>
            </div>
          </div>
        ) : (
          <div>
            {!loading && list.length === 0 && <p className="px-3 py-4 text-xs text-[var(--text-secondary)]">{searching ? `No skills match “${searchInput.trim()}”.` : 'No skills found.'}</p>}
            {list.map((skill) => {
              const id = detailIdFor(skill);
              const key = progressKeyFor(skill);
              const busy = installing.includes(key);
              const status = progress[key];
              const expanded = expandedId === id;
              const files = detail?.files ?? null;
              const showingDetail = expanded && detail && (detail.id === id || detail.id === skill.slug);
              const previewFile = files?.find((file) => file.path.toUpperCase().endsWith('SKILL.MD')) ?? files?.[0] ?? null;
              return (
                <article key={id} className="border-t border-[var(--border-primary)] px-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium">{skill.name || skill.slug}</h3>
                      <p className="mt-0.5 truncate text-[10px] text-[var(--text-secondary)]">{skill.source}{skill.isDuplicate ? ' · duplicate' : ''}</p>
                    </div>
                    {skill.url.trim() !== '' && (
                      <button type="button" className="app-icon-button app-icon-button--compact shrink-0" onClick={() => void openUrl(skill.url)} title={`Open ${skill.name}`} aria-label={`Open ${skill.name}`}>
                        <ArrowSquareOut size={13} />
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[var(--text-secondary)]">
                      {skill.stars != null && (
                        <span className="inline-flex items-center gap-1" title={`${skill.stars.toLocaleString()} GitHub stars on ${skill.source}`}>
                          <Star size={11} weight="fill" className="text-amber-400" aria-hidden="true" />
                          <span aria-label={`${skill.stars.toLocaleString()} stars`}>{formatCount(skill.stars)}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1" title={`${skill.installs.toLocaleString()} installs`}>
                        <DownloadSimple size={11} aria-hidden="true" />
                        <span aria-label={`${skill.installs.toLocaleString()} installs`}>{formatCount(skill.installs)} installs</span>
                      </span>
                      <span className="truncate">{skill.sourceType || 'skill'}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => handleToggleDetail(skill)} className="app-button h-7 min-h-0 px-2.5 text-xs" aria-expanded={expanded}>
                        {expanded ? <CaretUp size={13} /> : <CaretDown size={13} />}{expanded ? 'Hide' : 'Detail'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setDialogTarget({ skill, source: skill.source })} className="app-button h-7 min-h-0 px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60">
                        {!busy && <DownloadSimple size={13} />}{busy ? 'Installing…' : status?.stage === 'failed' ? 'Retry install' : 'Install'}
                      </button>
                    </div>
                  </div>
                  {busy && status && <p className="mt-2 text-[10px] leading-4 text-[var(--text-secondary)]" role="status">{status.message}{status.percent != null ? ` ${status.percent}%` : ''}</p>}
                  {!busy && status?.stage === 'failed' && <p role="alert" className="mt-2 break-words text-[11px] leading-4 text-rose-500">{status.message}</p>}
                  {expanded && (
                    <div className="mt-3 space-y-2 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] p-2.5">
                      {audit && audit.id !== '' && (audit.id === id || audit.slug === skill.slug) && audit.audits.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {audit.audits.map((entry) => (
                            <span key={`${entry.provider}:${entry.slug}`} className="rounded border border-[var(--border-primary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]" title={entry.summary}>
                              {entry.provider}: {entry.riskLevel ?? entry.status}
                            </span>
                          ))}
                        </div>
                      )}
                      {!hasSkillsKey && (
                        <p className="text-[10px] text-[var(--text-secondary)]">Security audits need a skills.sh API key — previews above come straight from the public repo.</p>
                      )}
                      {!showingDetail || !previewFile ? (
                        <p className="text-[11px] text-[var(--text-secondary)]">Loading SKILL.md preview…</p>
                      ) : (
                        <div>
                          <p className="mb-1 truncate text-[10px] text-[var(--text-secondary)]">{previewFile.path}</p>
                          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-[var(--text-primary)]">{previewFile.contents.slice(0, 2000)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {!searching && hasMore && (
              <div className="p-3">
                <button type="button" className="app-button w-full" disabled={loading} onClick={() => void loadTrending(activeTab, true)}>
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {dialogTarget && (
        <SkillInstallDialog
          skill={dialogTarget.skill}
          defaultSource={dialogTarget.source}
          workspacePath={workspacePath}
          onClose={() => setDialogTarget(null)}
          onInstalled={() => void refreshInstalled(workspacePath)}
        />
      )}
    </section>
  );
}
