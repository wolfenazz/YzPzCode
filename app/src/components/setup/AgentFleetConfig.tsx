import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@iconify/react';
import { ArrowClockwise, CaretDown, DownloadSimple, MagnifyingGlass, Minus, Plus } from '@phosphor-icons/react';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useToolCli } from '../../hooks/useToolCli';
import { AGENT_CATALOG, AGENT_IDS, TOOL_CATALOG, TOOL_IDS, isAgent } from './cliCatalog';
import { SETUP_EASE, useSetupMotion } from './useSetupMotion';
import type { AgentCliInfo, AgentFleet, CliType, ToolCliInfo } from '../../types';

interface AgentFleetConfigProps {
  fleet: AgentFleet;
  category: 'agents' | 'tools';
  onAllocationChange: (fleet: AgentFleet) => void;
}

const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

/** A count that slides when it changes, like an odometer digit. */
function AnimatedCount({ value, label }: { value: number; label: string }): React.JSX.Element {
  const motionEnabled = useSetupMotion();
  return (
    <output aria-label={label} aria-live="polite">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={value} initial={motionEnabled ? { y: 10, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} exit={motionEnabled ? { y: -10, opacity: 0 } : undefined}
          transition={{ duration: 0.18, ease: SETUP_EASE }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </output>
  );
}

function statusOf(info: AgentCliInfo | ToolCliInfo | null | undefined): { tone: 'ok' | 'warn' | 'busy' | 'muted'; text: React.ReactNode; usable: boolean } {
  if (!info || info.status === 'Checking') return { tone: 'busy', text: 'Checking…', usable: false };
  if (info.status === 'Installed') return { tone: 'ok', text: info.version ? <code>v{info.version}</code> : 'Installed', usable: true };
  if (info.status === 'Error') return { tone: 'warn', text: info.error || 'Could not be checked', usable: false };
  return { tone: 'muted', text: 'Not installed', usable: false };
}

export function AgentFleetConfig({ fleet, category, onAllocationChange }: AgentFleetConfigProps): React.JSX.Element {
  const { cliStatuses, detectAllClis, openInstallTerminal, loading: cliLoading, error: cliError } = useAgentCli();
  const { toolCliStatuses, detectAllToolClis, openToolInstallTerminal, loading: toolLoading, error: toolError } = useToolCli();
  const motionEnabled = useSetupMotion();
  const [search, setSearch] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  const [installingCli, setInstallingCli] = useState<CliType | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const launching = useRef(false);
  const remaining = fleet.totalSlots - Object.values(fleet.allocation).reduce((sum, count) => sum + count, 0);
  const checking = isRefreshing || (category === 'agents' ? cliLoading : toolLoading);
  const listError = installError || (category === 'agents' ? cliError : toolError);

  useEffect(() => {
    if (category === 'agents') void detectAllClis();
    else void detectAllToolClis();
  }, [category, detectAllClis, detectAllToolClis]);

  const refresh = async (): Promise<void> => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setInstallError(null);
    try {
      await invoke('clear_cli_cache');
      if (category === 'agents') await detectAllClis();
      else await detectAllToolClis();
    } catch (error) { setInstallError(String(error)); }
    finally { setIsRefreshing(false); }
  };

  const install = async (cli: CliType): Promise<void> => {
    if (launching.current) return;
    launching.current = true;
    setInstallingCli(cli);
    setInstallError(null);
    try {
      if (isAgent(cli)) {
        if (cli === 'amp' && isWindows) await openUrl('https://ampcode.com/docs/cli');
        else await openInstallTerminal(cli);
      } else await openToolInstallTerminal(cli);
    } catch (error) { setInstallError(String(error)); }
    finally { launching.current = false; setInstallingCli(null); }
  };

  const changeCount = (cli: CliType, count: number): void => {
    if (count < 0 || count > fleet.allocation[cli] + remaining) return;
    onAllocationChange({ ...fleet, allocation: { ...fleet.allocation, [cli]: count } });
  };

  const query = search.trim().toLowerCase();
  const entries = (category === 'agents' ? AGENT_IDS : TOOL_IDS).map((cli) => {
    const meta = category === 'agents' ? AGENT_CATALOG[cli as keyof typeof AGENT_CATALOG] : TOOL_CATALOG[cli as keyof typeof TOOL_CATALOG];
    const info = category === 'agents' ? cliStatuses[cli as keyof typeof cliStatuses] : toolCliStatuses[cli as keyof typeof toolCliStatuses];
    return { cli, meta, info, status: statusOf(info) };
  }).filter(({ meta }) => !query || meta.label.toLowerCase().includes(query) || meta.description.toLowerCase().includes(query));
  // Installed (or still being checked) tools lead; missing ones fold away so the
  // list stays about what can run today. Assigned tools never fold away.
  const isMissing = (entry: typeof entries[number]): boolean =>
    fleet.allocation[entry.cli] === 0 && (entry.info?.status === 'NotInstalled' || entry.info?.status === 'Error');
  const ready = entries.filter((entry) => !isMissing(entry));
  const missing = entries.filter(isMissing);
  const missingOpen = showMissing || query.length > 0 || ready.length === 0;

  const renderRow = (entry: typeof entries[number], index: number): React.JSX.Element => {
    const { cli, meta, status } = entry;
    const count = fleet.allocation[cli];
    const busy = installingCli === cli;
    return (
      <motion.div key={cli} className="ws-row" data-active={count > 0} data-installed={status.usable || status.tone === 'busy'}
        initial={motionEnabled ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: SETUP_EASE, delay: motionEnabled ? Math.min(index, 10) * 0.025 : 0 }}>
        <AnimatePresence>
          {count > 0 && (
            <motion.span className="ws-row__accent" style={{ background: meta.color }} aria-hidden="true"
              initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }} transition={{ duration: 0.2, ease: SETUP_EASE }} />
          )}
        </AnimatePresence>
        <span className={`ws-row__logo${cli === 'opencode' ? ' ws-row__logo--white' : ''}`} aria-hidden="true">
          {meta.logo
            ? <img src={meta.logo} alt="" draggable={false} />
            : <Icon icon={meta.icon ?? 'ph:terminal-window'} width={18} height={18} style={{ color: meta.color }} />}
        </span>
        <span className="ws-row__body">
          <span className="ws-row__name block">{meta.label}</span>
          <span className="ws-row__status" title={entry.info?.error ?? entry.info?.path ?? undefined}>
            <span className="ws-status-dot" data-tone={status.tone} />
            {status.text}
            {status.usable && <span className="truncate opacity-70">· {meta.description}</span>}
          </span>
        </span>
        {status.usable || count > 0 ? (
          <span className="ws-stepper">
            <button type="button" aria-label={`Remove one ${meta.label} terminal`} disabled={count === 0} onClick={() => changeCount(cli, count - 1)}><Minus size={12} weight="bold" /></button>
            <AnimatedCount value={count} label={`${meta.label} terminals`} />
            <button type="button" aria-label={`Add one ${meta.label} terminal`} disabled={remaining <= 0 || !status.usable} onClick={() => changeCount(cli, count + 1)}
              title={remaining <= 0 ? 'Every terminal is assigned. Add more terminals or remove an agent.' : undefined}><Plus size={12} weight="bold" /></button>
          </span>
        ) : status.tone !== 'busy' && (
          <button type="button" className="ws-btn ws-btn--sm" disabled={busy || checking} onClick={() => void install(cli)}>
            {busy ? <span className="ws-spinner" /> : <DownloadSimple size={13} />}
            {busy ? 'Opening…' : cli === 'amp' && isWindows ? 'Docs' : 'Install'}
          </button>
        )}
      </motion.div>
    );
  };

  return (
    <div>
      <div className="ws-toolbar">
        <label className="ws-search">
          <MagnifyingGlass size={14} />
          <input type="search" className="ws-input" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder={category === 'agents' ? 'Search agents' : 'Search tool CLIs'} aria-label={category === 'agents' ? 'Search CLI agents' : 'Search tool CLIs'} />
        </label>
        <button type="button" className="ws-btn ws-btn--icon" onClick={() => void refresh()} disabled={checking} aria-label="Check installed CLIs again" title="Check again">
          <ArrowClockwise size={15} className={checking ? 'animate-spin' : undefined} />
        </button>
      </div>
      {listError && <p role="alert" className="ws-error ws-error--block">{listError}</p>}
      <div className="ws-list">
        <div className="ws-list__scroll">
          {ready.map(renderRow)}
          {missing.length > 0 && (
            <>
              <button type="button" className="ws-list__group" aria-expanded={missingOpen} onClick={() => setShowMissing((open) => !open)} disabled={query.length > 0 || ready.length === 0}>
                <span>Not installed · {missing.length}</span>
                {!query && ready.length > 0 && <CaretDown size={12} className={`transition-transform duration-200 ${missingOpen ? 'rotate-180' : ''}`} />}
              </button>
              <AnimatePresence initial={false}>
                {missingOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: motionEnabled ? 0.28 : 0, ease: SETUP_EASE }} className="overflow-hidden border-t border-[var(--border-primary)]">
                    {missing.map(renderRow)}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
          {entries.length === 0 && <p className="ws-empty">Nothing matches “{search}”.</p>}
        </div>
      </div>
    </div>
  );
}
