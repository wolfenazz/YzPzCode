import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, DownloadSimple, Star, WarningCircle, X } from '@phosphor-icons/react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../../stores/appStore';
import { useSkillStore } from '../../stores/skillStore';
import { AGENT_TO_SKILLS_SLUG, skillsSlugForAgent } from '../../data/skillsAgents';
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
  const [error, setError] = useState<string | null>(null);
  const preselected = useRef(false);

  const source = skill?.source?.trim() ? skill.source : defaultSource;
  const skillSlug = skill?.slug?.trim() ? skill.slug : undefined;
  const key = skillSlug ?? source;

  const mappedAgents = useMemo((): AgentType[] => (
    (Object.keys(AGENT_TO_SKILLS_SLUG) as AgentType[]).filter((agent) => agent in cliStatuses)
  ), [cliStatuses]);

  useEffect(() => {
    if (preselected.current) return;
    preselected.current = true;
    const installed = mappedAgents.filter((agent) => cliStatuses[agent]?.status === 'Installed');
    setSelectedAgents((installed.length > 0 ? installed : mappedAgents).map(skillsSlugForAgent));
  }, [mappedAgents, cliStatuses, setSelectedAgents]);

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

  const allSlugs = mappedAgents.map(skillsSlugForAgent);
  const allSelected = allSlugs.length > 0 && allSlugs.every((slug) => selectedAgents.includes(slug));

  const handleInstall = async (): Promise<void> => {
    setError(null);
    const output = await install({ skill: skillSlug, source, workspacePath });
    if (output === null) {
      setError(useSkillStore.getState().error ?? 'Install failed.');
    } else {
      onInstalled?.();
    }
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
              <span>Agents · {selectedAgents.length} selected</span>
              <button type="button" className="sk-btn sk-btn--ghost" style={{ height: '1.4rem' }} onClick={() => setSelectedAgents(allSelected ? [] : allSlugs)}>{allSelected ? 'Clear' : 'Select all'}</button>
            </legend>
            <div className="sk-agents">
              {mappedAgents.map((agent) => {
                const slug = skillsSlugForAgent(agent);
                const info = cliStatuses[agent];
                return (
                  <label key={agent} className="sk-agent" title={info?.displayName ?? agent}>
                    <input type="checkbox" checked={selectedAgents.includes(slug)} onChange={() => toggleAgent(slug)} />
                    <span>{info?.displayName ?? agent}</span>
                    {info?.status === 'Installed' && <i className="sk-dot" title="Installed on this machine" />}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="sk-linkrow">
            <span>Copy files instead of linking<small>By default the skill is symlinked so updates apply everywhere.</small></span>
            <input type="checkbox" checked={useCopy} onChange={(event) => setUseCopy(event.target.checked)} />
          </label>

          {status && (
            <div className="sk-status" role="status">
              <p>
                {completed && <CheckCircle size={14} weight="fill" style={{ color: '#10b981', flex: 'none' }} aria-hidden="true" />}
                {failed && <WarningCircle size={14} weight="fill" style={{ color: '#f43f5e', flex: 'none' }} aria-hidden="true" />}
                <span>{status.message}{status.percent != null ? ` · ${status.percent}%` : ''}</span>
              </p>
              {!completed && !failed && (
                <div className={`sk-bar ${status.percent == null ? 'sk-bar--indeterminate' : ''}`} aria-hidden="true"><i style={status.percent != null ? { width: `${status.percent}%` } : undefined} /></div>
              )}
            </div>
          )}
          {(error ?? (failed && !busy ? status?.message : null)) && (
            <p role="alert" className="sk-note sk-note--error" style={{ marginTop: 0 }}>{error ?? status?.message}</p>
          )}
        </div>

        <div className="sk-dialog__foot">
          <button type="button" className="sk-btn" style={{ height: '2rem' }} onClick={onClose}>{completed ? 'Done' : 'Cancel'}</button>
          <button
            type="button"
            className="sk-btn sk-btn--primary"
            style={{ height: '2rem' }}
            disabled={busy || selectedAgents.length === 0}
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
