import { useEffect, useMemo, useRef } from 'react';
import { CheckCircle, DownloadSimple, Star, WarningCircle, X } from '@phosphor-icons/react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../../stores/appStore';
import { useSkillStore } from '../../stores/skillStore';
import { skillsAgents, skillsSlugForAgent } from '../../data/skillsAgents';
import type { AgentType, SkillInstallProgress, SkillSummary } from '../../types';
import './SkillsMarket.css';

interface SkillInstallDialogProps {
  skill: SkillSummary | null;
  defaultSource: string;
  workspacePath: string;
  onClose: () => void;
  onInstalled?: () => void;
}

export function SkillInstallDialog({ skill, defaultSource, workspacePath, onClose, onInstalled }: SkillInstallDialogProps): React.JSX.Element {
  const cliStatuses = useAppStore((state) => state.cliStatuses);
  const selectedAgents = useSkillStore((state) => state.selectedAgents);
  const toggleAgent = useSkillStore((state) => state.toggleAgent);
  const setSelectedAgents = useSkillStore((state) => state.setSelectedAgents);
  const scope = useSkillStore((state) => state.scope);
  const setScope = useSkillStore((state) => state.setScope);
  const useCopy = useSkillStore((state) => state.useCopy);
  const setUseCopy = useSkillStore((state) => state.setUseCopy);
  const installing = useSkillStore((state) => state.installing);
  const progress = useSkillStore((state) => state.progress);
  const install = useSkillStore((state) => state.install);
  const setProgress = useSkillStore((state) => state.setProgress);
  const preselected = useRef(false);

  const source = skill?.source?.trim() ? skill.source : defaultSource;
  const skillSlug = skill?.slug?.trim() ? skill.slug : undefined;
  const key = skillSlug ?? source;

  // Agents the skills CLI can install to, the ones on this machine first.
  const mappedAgents = useMemo((): AgentType[] => {
    const known = skillsAgents().filter((agent) => agent in cliStatuses);
    const isInstalled = (agent: AgentType): boolean => cliStatuses[agent]?.status === 'Installed';
    return [...known.filter(isInstalled), ...known.filter((agent) => !isInstalled(agent))];
  }, [cliStatuses]);

  // Agents of this app that skills.sh has no slug for yet.
  const unsupportedAgents = useMemo((): AgentType[] => (
    (Object.keys(cliStatuses) as AgentType[]).filter((agent) => skillsSlugForAgent(agent) === undefined)
  ), [cliStatuses]);

  const allSlugs = useMemo(
    () => mappedAgents.flatMap((agent) => skillsSlugForAgent(agent) ?? []),
    [mappedAgents],
  );

  useEffect(() => {
    if (preselected.current || allSlugs.length === 0) return;
    preselected.current = true;
    // Keep last time's choice (minus agents that no longer exist); otherwise
    // start with the agents installed here, not every agent in the list.
    const remembered = selectedAgents.filter((slug) => allSlugs.includes(slug));
    if (remembered.length > 0) {
      if (remembered.length !== selectedAgents.length) setSelectedAgents(remembered);
      return;
    }
    setSelectedAgents(
      mappedAgents
        .filter((agent) => cliStatuses[agent]?.status === 'Installed')
        .flatMap((agent) => skillsSlugForAgent(agent) ?? []),
    );
  }, [allSlugs, mappedAgents, cliStatuses, selectedAgents, setSelectedAgents]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<SkillInstallProgress>('skill-install-progress', (event) => {
      if (event.payload.skillId === key) setProgress(event.payload);
    }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    }).catch((err: unknown) => console.error('Could not subscribe to skill installation:', err));
    return () => { disposed = true; unlisten?.(); };
  }, [key, setProgress]);

  const status = progress[key];
  const busy = installing.includes(key);
  const failed = status?.stage === 'failed';
  const completed = status?.stage === 'completed';

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const chosen = selectedAgents.filter((slug) => allSlugs.includes(slug));
  const allSelected = allSlugs.length > 0 && allSlugs.every((slug) => selectedAgents.includes(slug));

  const handleInstall = async (): Promise<void> => {
    const output = await install({ skill: skillSlug, source, workspacePath, agents: chosen });
    if (output !== null) onInstalled?.();
  };

  return (
    <div className="sk-dialog-scrim" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={skill ? `Install ${skill.name}` : 'Install skill from source'} className="sk-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="sk-dialog__head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>{skill ? `Install ${skill.name}` : 'Install from source'}</h2>
            <p>{source}{skillSlug ? ` · ${skillSlug}` : ''}</p>
            {skill && (skill.stars != null || skill.installs > 0) && (
              <div className="sk-meta">
                {skill.stars != null && <span><Star size={11} weight="fill" style={{ color: '#fbbf24' }} aria-hidden="true" />{skill.stars.toLocaleString()} stars</span>}
                {skill.installs > 0 && <span><DownloadSimple size={11} aria-hidden="true" />{skill.installs.toLocaleString()} installs</span>}
              </div>
            )}
          </div>
          <button type="button" className="sk-btn sk-btn--ghost sk-btn--icon" onClick={onClose} title="Close (Esc)" aria-label="Close"><X size={15} aria-hidden="true" /></button>
        </div>

        <div className="sk-dialog__body">
          <fieldset className="sk-field">
            <legend>Where to install</legend>
            <div className="sk-segment">
              <label>
                <input type="radio" name="skill-scope" checked={scope === 'global'} onChange={() => setScope('global')} />
                Global<small>Every project</small>
              </label>
              <label>
                <input type="radio" name="skill-scope" checked={scope === 'project'} onChange={() => setScope('project')} />
                This project<small>Only this workspace</small>
              </label>
            </div>
            {scope === 'project' && <p className="sk-note sk-note--muted">{workspacePath}</p>}
          </fieldset>

          <fieldset className="sk-field">
            <legend>
              <span>Agents · {chosen.length} selected</span>
              <button type="button" className="sk-btn sk-btn--ghost" style={{ height: '1.4rem' }} onClick={() => setSelectedAgents(allSelected ? [] : allSlugs)}>{allSelected ? 'Clear' : 'Select all'}</button>
            </legend>
            <div className="sk-agents">
              {mappedAgents.map((agent) => {
                const slug = skillsSlugForAgent(agent);
                if (slug === undefined) return null;
                const info = cliStatuses[agent];
                return (
                  <label key={agent} className="sk-agent" title={info?.status === 'Installed' ? `${info.displayName ?? agent} · installed on this machine` : (info?.displayName ?? agent)}>
                    <input type="checkbox" checked={selectedAgents.includes(slug)} onChange={() => toggleAgent(slug)} />
                    <span>{info?.displayName ?? agent}</span>
                    {info?.status === 'Installed' && <i className="sk-dot" title="Installed on this machine" />}
                  </label>
                );
              })}
            </div>
            {chosen.length === 0 && <p className="sk-note sk-note--muted">Pick at least one agent. Green dots mark the ones installed on this machine.</p>}
            {unsupportedAgents.length > 0 && (
              <p className="sk-note sk-note--muted">
                skills.sh cannot install to {unsupportedAgents.map((agent) => cliStatuses[agent]?.displayName ?? agent).join(', ')} yet.
              </p>
            )}
          </fieldset>

          <label className="sk-linkrow">
            <span>Copy files instead of linking<small>By default the skill is symlinked so updates apply everywhere.</small></span>
            <input type="checkbox" checked={useCopy} onChange={(event) => setUseCopy(event.target.checked)} />
          </label>

          {status && !failed && (
            <div className="sk-status" role="status">
              <p>
                {completed && <CheckCircle size={14} weight="fill" style={{ color: '#10b981', flex: 'none' }} aria-hidden="true" />}
                <span>{status.message}{status.percent != null && !completed ? ` · ${status.percent}%` : ''}</span>
              </p>
              {!completed && (
                <div className={`sk-bar ${status.percent == null ? 'sk-bar--indeterminate' : ''}`} aria-hidden="true"><i style={status.percent != null ? { width: `${status.percent}%` } : undefined} /></div>
              )}
            </div>
          )}
          {failed && !busy && (
            <div role="alert" className="sk-status sk-status--error">
              <p><WarningCircle size={14} weight="fill" style={{ color: '#f43f5e', flex: 'none' }} aria-hidden="true" /><span className="sk-status__text">{status.message}</span></p>
            </div>
          )}
        </div>

        <div className="sk-dialog__foot">
          <button type="button" className="sk-btn" style={{ height: '2rem' }} onClick={onClose}>{completed ? 'Done' : 'Cancel'}</button>
          <button
            type="button"
            className="sk-btn sk-btn--primary"
            style={{ height: '2rem' }}
            disabled={busy || chosen.length === 0}
            onClick={() => void handleInstall()}
          >
            {!busy && <DownloadSimple size={13} aria-hidden="true" />}
            {busy ? 'Installing…' : failed ? 'Retry' : completed ? 'Install again' : 'Install'}
          </button>
        </div>
      </section>
    </div>
  );
}
