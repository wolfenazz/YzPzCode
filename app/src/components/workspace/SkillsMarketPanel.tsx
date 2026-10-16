import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  Check,
  DownloadSimple,
  GearSix,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Star,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAppStore } from '../../stores/appStore';
import { isSkillsKeyError, stripSkillsKeyPrefix, useSkillStore } from '../../stores/skillStore';
import type { SkillTrendingView } from '../../stores/skillStore';
import type { InstalledSkill, SkillSummary } from '../../types';
import { SkillInstallDialog } from './SkillInstallDialog';
import { SkillMarkdownPreview } from './SkillMarkdownPreview';
import './SkillsMarket.css';

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

/** Compact "1.2K / 3.4M" formatting shared by stars and installs. */
function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  const n = Math.floor(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

/** Backend detail id: "owner/repo/slug". */
function detailIdFor(skill: SkillSummary): string {
  return skill.id.trim() !== '' ? skill.id : `${skill.source}/${skill.slug}`;
}

/** Mirrors the install progress key (skill slug, falling back to source). */
function progressKeyFor(skill: SkillSummary): string {
  return skill.slug.trim() !== '' ? skill.slug : skill.source;
}

/** Stable hue (0-359) from the repository owner, so a publisher keeps its colour. */
function hueFor(source: string): number {
  const owner = source.split('/')[0] || source;
  let hash = 0;
  for (let i = 0; i < owner.length; i += 1) hash = (hash * 31 + owner.charCodeAt(i)) % 360;
  return hash;
}

function auditTone(level: string): string {
  const value = level.toLowerCase();
  if (/(high|critical|fail|unsafe)/.test(value)) return 'sk-badge--bad';
  if (/(medium|moderate|warn)/.test(value)) return 'sk-badge--warn';
  if (/(low|safe|pass|ok|none)/.test(value)) return 'sk-badge--ok';
  return '';
}

/** One-tap searches shown when the leaderboard is unavailable without a key. */
const SUGGESTED_QUERIES = ['react', 'design', 'python', 'nextjs', 'testing', 'productivity'];

interface InstalledGroup {
  key: string;
  name: string;
  global: boolean;
  agents: InstalledSkill[];
}

function groupInstalled(project: InstalledSkill[], global: InstalledSkill[]): InstalledGroup[] {
  const groups = new Map<string, InstalledGroup>();
  const add = (items: InstalledSkill[], isGlobal: boolean): void => {
    for (const item of items) {
      const key = `${isGlobal ? 'global' : 'project'}:${item.name}`;
      const existing = groups.get(key);
      if (existing) existing.agents.push(item);
      else groups.set(key, { key, name: item.name, global: isGlobal, agents: [item] });
    }
  };
  add(project, false);
  add(global, true);
  return [...groups.values()];
}

function SkeletonRows({ count = 5 }: { count?: number }): React.JSX.Element {
  return (
    <div className="sk-list" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="sk-skel">
          <i style={{ width: 32, height: 32, borderRadius: 8, flex: 'none' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <i style={{ height: 12, width: `${55 + ((index * 13) % 30)}%` }} />
            <i style={{ height: 9, width: '38%' }} />
            <i style={{ height: 9, width: '62%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

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
  const [sourceOpen, setSourceOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [dialogTarget, setDialogTarget] = useState<{ skill: SkillSummary | null; source: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The leaderboard is key-gated (skills.sh removed anonymous access after
    // scraper abuse). Search uses the same public endpoint as the terminal's
    // `npx skills find`, so it works with no key.
    if (hasSkillsKey) void loadTrending('trending');
    void refreshInstalled(workspacePath);
  }, [loadTrending, refreshInstalled, workspacePath, hasSkillsKey]);

  const onInstalledTab = activeTab === 'installed';
  const query = searchInput.trim();

  useEffect(() => {
    if (query.length === 0 || onInstalledTab) {
      clearSearch();
      return;
    }
    if (query.length < 2) return;
    const timer = window.setTimeout(() => { void search(query); }, 300);
    return () => window.clearTimeout(timer);
  }, [query, onInstalledTab, search, clearSearch]);

  // A pending "are you sure?" must not outlive a click elsewhere.
  useEffect(() => {
    if (confirmRemove === null) return;
    const timer = window.setTimeout(() => setConfirmRemove(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmRemove]);

  const searching = !onInstalledTab && query.length >= 2;
  const list = searching ? searchResults : trending;

  const groups = useMemo(() => groupInstalled(installed.project, installed.global), [installed]);
  const installedNames = useMemo(() => new Set(groups.map((group) => group.name.toLowerCase())), [groups]);
  const visibleGroups = useMemo(() => {
    if (!onInstalledTab || query === '') return groups;
    const needle = query.toLowerCase();
    return groups.filter((group) => group.name.toLowerCase().includes(needle) || group.agents.some((agent) => agent.agent.toLowerCase().includes(needle)));
  }, [groups, onInstalledTab, query]);

  const handleTab = (tab: Tab): void => {
    setActiveTab(tab);
    setExpandedId(null);
    setConfirmRemove(null);
    if (tab === 'installed') void refreshInstalled(workspacePath);
    // Without a key the leaderboard tabs render the key gate; no request.
    else if (hasSkillsKey) void loadTrending(tab);
  };

  const handleRefresh = (): void => {
    if (onInstalledTab) void refreshInstalled(workspacePath);
    else if (searching) void search(query);
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

  const handleRemoveGroup = async (group: InstalledGroup): Promise<void> => {
    setConfirmRemove(null);
    for (const item of group.agents) {
      await remove(item.name, item.agent, workspacePath, group.global);
    }
  };

  const installedCount = groups.length;

  // Leaderboard tabs without any key: the backend would only return the
  // key-required marker, so render the gate (with key-free search shortcuts).
  const showGate = !searching && !onInstalledTab && (isSkillsKeyError(error) || !hasSkillsKey);
  const showError = error != null && !isSkillsKeyError(error);
  const subtitle = onInstalledTab
    ? `${installedCount} installed`
    : searching
      ? `${list.length} result${list.length === 1 ? '' : 's'} for “${query}”`
      : 'Discover and install agent skills';

  const renderInstalled = (): React.JSX.Element => {
    if (loading && groups.length === 0) return <SkeletonRows count={3} />;
    if (visibleGroups.length === 0) {
      return (
        <div className="sk-empty">
          <div className="sk-empty__icon"><Sparkle size={18} aria-hidden="true" /></div>
          {query !== '' ? (
            <><strong>No installed skill matches “{query}”</strong><span>Clear the search to see everything installed.</span></>
          ) : (
            <><strong>Nothing installed yet</strong><span>Browse the market and install a skill, or add one from a repository.</span>
              <button type="button" className="sk-btn sk-btn--primary" style={{ marginTop: 8 }} onClick={() => handleTab('trending')}>Browse skills</button></>
          )}
        </div>
      );
    }
    return (
      <>
        <div className="sk-section-label">
          <span>{visibleGroups.length} skill{visibleGroups.length === 1 ? '' : 's'}</span>
          <button type="button" className="sk-btn sk-btn--ghost" disabled={loading || installedCount === 0} onClick={() => void update(undefined)} title="Update every installed skill">
            <ArrowClockwise size={12} aria-hidden="true" /> Update all
          </button>
        </div>
        <div className="sk-list">
          {visibleGroups.map((group) => {
            const confirming = confirmRemove === group.key;
            return (
              <article key={group.key} className="sk-card">
                <div className="sk-card__main">
                  <div className="sk-avatar" style={{ ['--sk-hue' as string]: hueFor(group.name) }} aria-hidden="true">{group.name.charAt(0) || '?'}</div>
                  <div className="sk-card__body">
                    <div className="sk-card__top">
                      <h3 className="sk-name">{group.name}</h3>
                      <span className="sk-badge">{group.global ? 'Global' : 'Project'}</span>
                    </div>
                    <div className="sk-meta" aria-label="Installed for">
                      {group.agents.map((item) => <span key={item.agent} className="sk-badge" title={item.path}>{item.agent}</span>)}
                    </div>
                    <div className="sk-actions">
                      <span className="sk-spacer" />
                      {confirming ? (
                        <>
                          <button type="button" className="sk-btn sk-btn--ghost" onClick={() => setConfirmRemove(null)}>Cancel</button>
                          <button type="button" className="sk-btn sk-btn--danger" disabled={loading} onClick={() => void handleRemoveGroup(group)}><Trash size={12} aria-hidden="true" /> Remove</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="sk-btn" disabled={loading} onClick={() => void update([group.name], group.global)} title={`Update ${group.name}`}><ArrowClockwise size={12} aria-hidden="true" /> Update</button>
                          <button type="button" className="sk-btn sk-btn--ghost sk-btn--icon" disabled={loading} onClick={() => setConfirmRemove(group.key)} title={`Remove ${group.name}`} aria-label={`Remove ${group.name}`}><Trash size={13} /></button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </>
    );
  };

  const renderGate = (): React.JSX.Element => (
    <div className="sk-gate">
      <h3>Leaderboards need an API key</h3>
      <p>
        skills.sh turned off anonymous catalog access. Search and installing from a repository work without a key, the same as
        {' '}<span style={{ fontFamily: 'var(--font-mono, monospace)' }}>npx skills find</span>.
      </p>
      <div className="sk-chips" aria-label="Suggested searches" style={{ marginTop: 10 }}>
        {SUGGESTED_QUERIES.map((suggestion) => (
          <button key={suggestion} type="button" className="sk-chip" onClick={() => { setSearchInput(suggestion); searchRef.current?.focus(); }}>{suggestion}</button>
        ))}
      </div>
      <ol>
        <li>Request a key at skills.sh/contact.</li>
        <li>Paste it in Settings → Agents → Skills Market.</li>
        <li>Come back and refresh.</li>
      </ol>
      <div className="sk-chips">
        <button type="button" className="sk-btn sk-btn--primary" onClick={openSettings}><GearSix size={12} aria-hidden="true" /> Open Settings</button>
        <button type="button" className="sk-btn" onClick={() => void openUrl('https://skills.sh/contact')}>Request a key</button>
        <button type="button" className="sk-btn sk-btn--ghost" onClick={() => void openUrl('https://skills.sh/docs/api')}>API docs</button>
      </div>
    </div>
  );

  const renderSkill = (skill: SkillSummary, index: number): React.JSX.Element => {
    const id = detailIdFor(skill);
    const key = progressKeyFor(skill);
    const busy = installing.includes(key);
    const status = progress[key];
    const expanded = expandedId === id;
    const isInstalled = installedNames.has(skill.slug.toLowerCase()) || installedNames.has(skill.name.toLowerCase());
    const files = detail?.files ?? null;
    const showingDetail = expanded && detail && (detail.id === id || detail.id === skill.slug);
    const previewFile = files?.find((file) => file.path.toUpperCase().endsWith('SKILL.MD')) ?? files?.[0] ?? null;
    const audits = audit && audit.id !== '' && (audit.id === id || audit.slug === skill.slug) ? audit.audits : [];
    const title = skill.name || skill.slug;
    return (
      <article key={id} className="sk-card" data-open={expanded} style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}>
        <div className="sk-card__main">
          <div className="sk-avatar" style={{ ['--sk-hue' as string]: hueFor(skill.source) }} aria-hidden="true">{title.charAt(0) || '?'}</div>
          <div className="sk-card__body">
            <div className="sk-card__top">
              <div style={{ minWidth: 0 }}>
                <h3 className="sk-name">{title}</h3>
                <p className="sk-source-line" title={skill.source}>{skill.source}{skill.isDuplicate ? ' · duplicate' : ''}</p>
              </div>
              {skill.url.trim() !== '' && (
                <button type="button" className="sk-btn sk-btn--ghost sk-btn--icon" onClick={() => void openUrl(skill.url)} title={`Open ${title} in browser`} aria-label={`Open ${title} in browser`}>
                  <ArrowSquareOut size={13} />
                </button>
              )}
            </div>
            <div className="sk-meta">
              {skill.stars != null && (
                <span title={`${skill.stars.toLocaleString()} GitHub stars`}>
                  <Star size={11} weight="fill" style={{ color: '#fbbf24' }} aria-hidden="true" />
                  <span aria-label={`${skill.stars.toLocaleString()} stars`}>{formatCount(skill.stars)}</span>
                </span>
              )}
              <span title={`${skill.installs.toLocaleString()} installs`}>
                <DownloadSimple size={11} aria-hidden="true" />
                <span aria-label={`${skill.installs.toLocaleString()} installs`}>{formatCount(skill.installs)}</span>
              </span>
              {skill.sourceType && <span className="sk-badge">{skill.sourceType}</span>}
              {isInstalled && <span className="sk-badge sk-badge--ok"><Check size={10} weight="bold" aria-hidden="true" /> Installed</span>}
            </div>
            <div className="sk-actions">
              <button type="button" className="sk-btn sk-btn--ghost" onClick={() => handleToggleDetail(skill)} aria-expanded={expanded}>
                {expanded ? <CaretDown size={12} aria-hidden="true" /> : <CaretRight size={12} aria-hidden="true" />} Preview
              </button>
              <span className="sk-spacer" />
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialogTarget({ skill, source: skill.source })}
                className={`sk-btn ${isInstalled ? '' : 'sk-btn--primary'}`}
              >
                {!busy && <DownloadSimple size={12} aria-hidden="true" />}
                {busy ? 'Installing…' : status?.stage === 'failed' ? 'Retry' : isInstalled ? 'Reinstall' : 'Install'}
              </button>
            </div>
            {busy && (
              <div role="status">
                {status && <p className="sk-note sk-note--muted">{status.message}{status.percent != null ? ` · ${status.percent}%` : ''}</p>}
                <div className={`sk-bar ${status?.percent == null ? 'sk-bar--indeterminate' : ''}`}><i style={status?.percent != null ? { width: `${status.percent}%` } : undefined} /></div>
              </div>
            )}
            {!busy && status?.stage === 'failed' && <p role="alert" className="sk-note sk-note--error">{status.message}</p>}
          </div>
        </div>
        {expanded && (
          <div className="sk-detail">
            {audits.length > 0 && (
              <div className="sk-audits" aria-label="Security audits">
                {audits.map((entry) => {
                  const level = entry.riskLevel ?? entry.status;
                  return (
                    <span key={`${entry.provider}:${entry.slug}`} className={`sk-badge ${auditTone(level)}`} title={entry.summary}>
                      {auditTone(level) === 'sk-badge--bad' || auditTone(level) === 'sk-badge--warn' ? <Warning size={10} aria-hidden="true" /> : <Check size={10} weight="bold" aria-hidden="true" />}
                      {entry.provider}: {level}
                    </span>
                  );
                })}
              </div>
            )}
            {!hasSkillsKey && <p className="sk-note sk-note--muted" style={{ marginTop: 0 }}>Security audits need a skills.sh API key. The preview below comes straight from the public repository.</p>}
            {!showingDetail || !previewFile ? (
              loading ? <SkeletonRows count={1} /> : <p className="sk-note sk-note--muted" style={{ marginTop: 0 }}>No SKILL.md preview available for this skill.</p>
            ) : (
              <div className="sk-preview">
                <div className="sk-preview__path" title={previewFile.path}>{previewFile.path}</div>
                <div className="sk-preview__scroll">
                  <SkillMarkdownPreview text={previewFile.contents.slice(0, 12000)} />
                  {previewFile.contents.length > 12000 && <p className="sk-note sk-note--muted">Preview truncated. Open the skill in the browser for the rest.</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  const renderBrowse = (): React.JSX.Element => {
    if (loading && list.length === 0) return <SkeletonRows />;
    if (list.length === 0) {
      return (
        <div className="sk-empty">
          <div className="sk-empty__icon"><MagnifyingGlass size={18} aria-hidden="true" /></div>
          <strong>{searching ? `No skills match “${query}”` : 'No skills found'}</strong>
          <span>{searching ? 'Try a broader keyword, or add a repository directly.' : 'Pull to refresh, or search for something specific.'}</span>
          <div className="sk-chips">
            {searching && <button type="button" className="sk-chip" onClick={() => setSearchInput('')}>Clear search</button>}
            {!searching && <button type="button" className="sk-chip" onClick={handleRefresh}>Refresh</button>}
          </div>
        </div>
      );
    }
    return (
      <>
        <div className="sk-list">{list.map(renderSkill)}</div>
        {!searching && hasMore && (
          <button type="button" className="sk-btn sk-more" disabled={loading} onClick={() => void loadTrending(activeTab as SkillTrendingView, true)}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </>
    );
  };

  return (
    <section className="sk" aria-label="Skills Market">
      <div className="sk-head">
        <Sparkle size={16} weight="fill" style={{ color: 'var(--accent)' }} aria-hidden="true" />
        <div className="sk-head__title">
          <h2>Skills Market</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="sk-btn sk-btn--ghost sk-btn--icon" onClick={handleRefresh} disabled={loading} title="Refresh" aria-label="Refresh skills">
          <ArrowClockwise size={14} className={loading ? 'sk-spin' : undefined} />
        </button>
        <button type="button" className="sk-btn sk-btn--ghost sk-btn--icon" onClick={onClose} title="Close" aria-label="Close skills market"><X size={14} /></button>
      </div>

      <div className="sk-controls">
        <label className="sk-search">
          <MagnifyingGlass size={14} aria-hidden="true" />
          <input
            ref={searchRef}
            id={`skills-search-${workspaceId}`}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape' && searchInput !== '') { event.preventDefault(); event.stopPropagation(); setSearchInput(''); } }}
            placeholder={onInstalledTab ? 'Filter installed skills' : 'Search skills'}
            aria-label={onInstalledTab ? 'Filter installed skills' : 'Search skills'}
          />
          {searchInput !== '' && (
            <button type="button" className="sk-clear" onClick={() => { setSearchInput(''); searchRef.current?.focus(); }} title="Clear search" aria-label="Clear search"><X size={11} /></button>
          )}
        </label>

        <div className="sk-tabs" role="tablist" aria-label="Skills views">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" role="tab" className="sk-tab" aria-selected={activeTab === tab.id} onClick={() => handleTab(tab.id)}>
              {tab.label}
              {tab.id === 'installed' && installedCount > 0 && <span className="sk-count">{installedCount}</span>}
            </button>
          ))}
        </div>

        <div className="sk-source">
          <button type="button" className="sk-source__toggle" aria-expanded={sourceOpen} onClick={() => setSourceOpen((open) => !open)}>
            <Plus size={12} aria-hidden="true" /> Add from a repository or URL
          </button>
          {sourceOpen && (
            <div className="sk-source__body">
              <input
                id={`skills-custom-${workspaceId}`}
                value={customInput}
                onChange={(event) => setCustomInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleAddCustom(); }}
                placeholder="owner/repo or skill URL"
                aria-label="Custom skill source"
                autoFocus
              />
              <button type="button" className="sk-btn sk-btn--primary" disabled={customInput.trim() === ''} onClick={handleAddCustom}>Add</button>
            </div>
          )}
        </div>
      </div>

      <div className="sk-scroll" aria-busy={loading}>
        {showError && (
          <div role="alert" className="sk-alert">
            <span>{stripSkillsKeyPrefix(error)}</span>
            <button type="button" className="sk-btn" onClick={handleRefresh}>Try again</button>
          </div>
        )}
        {onInstalledTab ? renderInstalled() : showGate ? renderGate() : renderBrowse()}
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
