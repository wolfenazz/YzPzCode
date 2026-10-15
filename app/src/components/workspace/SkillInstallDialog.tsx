import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, DownloadSimple, WarningCircle, X } from '@phosphor-icons/react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../../stores/appStore';
import { useSkillStore } from '../../stores/skillStore';
import { AGENT_TO_SKILLS_SLUG, skillsSlugForAgent } from '../../data/skillsAgents';
import type { AgentType, SkillInstallProgress, SkillSummary } from '../../types';

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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={skill ? `Install ${skill.name}` : 'Install skill from source'} className="app-surface app-surface--raised flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-5 py-4">
          <div>
            <h2 className="text-sm">{skill ? `Install ${skill.name}` : 'Install skill'}</h2>
            <p className="mt-0.5 break-words text-xs text-[var(--text-secondary)]">{source}{skillSlug ? ` · ${skillSlug}` : ''}</p>
            {skill && (skill.stars != null || skill.installs > 0) && (
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {skill.stars != null && `★ ${skill.stars.toLocaleString()} stars`}
                {skill.stars != null && skill.installs > 0 && ' · '}
                {skill.installs > 0 && `${skill.installs.toLocaleString()} installs`}
              </p>
            )}
          </div>
          <button type="button" className="app-icon-button" onClick={onClose} title="Close"><X size={16} aria-hidden="true" /><span className="sr-only">Close</span></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Scope</legend>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input type="radio" name="skill-scope" checked={scope === 'global'} onChange={() => setScope('global')} className="accent-[var(--accent)]" />
                Global (all projects)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input type="radio" name="skill-scope" checked={scope === 'project'} onChange={() => setScope('project')} className="accent-[var(--accent)]" />
                Project only
              </label>
              {scope === 'project' && <p className="break-words text-[11px] leading-4 text-[var(--text-secondary)]">{workspacePath}</p>}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Agents ({selectedAgents.length} selected)</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {mappedAgents.map((agent) => {
                const slug = skillsSlugForAgent(agent);
                const info = cliStatuses[agent];
                return (
                  <label key={agent} className="flex cursor-pointer items-center gap-2 rounded border border-[var(--border-primary)] px-2 py-1.5 text-xs" title={info?.displayName ?? agent}>
                    <input type="checkbox" checked={selectedAgents.includes(slug)} onChange={() => toggleAgent(slug)} className="accent-[var(--accent)]" />
                    <span className="min-w-0 flex-1 truncate">{info?.displayName ?? agent}</span>
                    {info?.status === 'Installed' && <span className="shrink-0 text-[10px] text-emerald-500">●</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <input type="checkbox" checked={useCopy} onChange={(event) => setUseCopy(event.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
            <span>Copy files instead of symlink<span className="block text-[11px] text-[var(--text-secondary)]">Default installs symlink the skill; enable to copy.</span></span>
          </label>

          {status && (
            <div className="space-y-1.5" role="status">
              <p className="flex items-center gap-1.5 text-[11px] leading-4 text-[var(--text-secondary)]">
                {completed && <CheckCircle size={13} className="shrink-0 text-emerald-500" aria-hidden="true" />}
                {failed && <WarningCircle size={13} className="shrink-0 text-rose-500" aria-hidden="true" />}
                <span>{status.stage}: {status.message}{status.percent != null ? ` ${status.percent}%` : ''}</span>
              </p>
              {status.percent != null && <progress max={100} value={status.percent} className="h-1 w-full accent-[var(--accent)]" aria-label="Skill install progress" />}
            </div>
          )}
          {(error ?? (failed && !busy ? status?.message : null)) && (
            <p role="alert" className="break-words text-[11px] leading-4 text-rose-500">{error ?? status?.message}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-primary)] px-5 py-3">
          <button type="button" className="app-button" onClick={onClose}>{completed ? 'Close' : 'Cancel'}</button>
          {failed && !busy ? (
            <button type="button" className="app-button app-button--primary" onClick={() => void handleInstall()}>
              <DownloadSimple size={13} aria-hidden="true" /> Retry
            </button>
          ) : (
            <button type="button" className="app-button app-button--primary" disabled={busy || selectedAgents.length === 0} onClick={() => void handleInstall()}>
              {!busy && <DownloadSimple size={13} aria-hidden="true" />}{busy ? 'Installing…' : completed ? 'Install again' : 'Install'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
