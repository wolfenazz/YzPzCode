import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@iconify/react';
import { CaretDown, Check, Copy, MagnifyingGlass, PencilSimpleLine, Play } from '@phosphor-icons/react';
import { INIT_CATEGORIES } from '../../data/initTemplates';
import type { InitTemplate } from '../../data/initTemplates';
import { InlineTerminal } from './InlineTerminal';
import { SETUP_EASE, useSetupMotion } from './useSetupMotion';

interface InitializeWorkspaceProps {
  selectedPath: string;
}

function CommandBlock({ command, onRun }: { command: string; onRun: (autoRun: boolean) => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="ws-cmd">
      <code title={command}>{command}</code>
      <button type="button" onClick={() => onRun(true)} title="Run in the project folder"><Play size={12} weight="fill" />Run</button>
      <button type="button" onClick={() => onRun(false)} title="Paste into a terminal to edit first" aria-label="Edit before running"><PencilSimpleLine size={13} /></button>
      <button type="button" onClick={copy} title="Copy command" aria-label="Copy command">{copied ? <Check size={13} /> : <Copy size={13} />}</button>
    </div>
  );
}

/** Scaffold a new project (create-vite, cargo new, …) into the chosen folder. */
export function InitializeWorkspace({ selectedPath }: InitializeWorkspaceProps): React.JSX.Element {
  const motionEnabled = useSetupMotion();
  const [activeCategory, setActiveCategory] = useState(INIT_CATEGORIES[0]?.id ?? '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [terminal, setTerminal] = useState<{ command: string; autoRun: boolean } | null>(null);

  const templates = useMemo<InitTemplate[]>(() => {
    const query = search.toLowerCase().trim();
    if (!query) return INIT_CATEGORIES.find((category) => category.id === activeCategory)?.templates ?? [];
    return INIT_CATEGORIES.flatMap((category) => category.templates.filter((template) =>
      template.name.toLowerCase().includes(query) || template.description.toLowerCase().includes(query) || template.tags.some((tag) => tag.includes(query))));
  }, [activeCategory, search]);

  if (!selectedPath) return <p className="ws-help" style={{ marginTop: 0 }}>Choose a project folder first. Scaffolds run inside it.</p>;

  if (terminal) {
    return <InlineTerminal command={terminal.command} cwd={selectedPath} autoRun={terminal.autoRun} onClose={() => setTerminal(null)} />;
  }

  return (
    <div>
      <div className="ws-toolbar">
        <label className="ws-search">
          <MagnifyingGlass size={14} />
          <input type="search" className="ws-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search scaffolds" aria-label="Search project scaffolds" />
        </label>
      </div>
      {!search && (
        <div className="ws-presets mb-2.5" role="group" aria-label="Scaffold categories">
          {INIT_CATEGORIES.map((category) => (
            <button key={category.id} type="button" className="ws-preset" aria-pressed={activeCategory === category.id}
              onClick={() => { setActiveCategory(category.id); setExpandedId(null); }}>
              <span className="ws-preset__icon"><Icon icon={category.icon} width={12} /></span>
              {category.label}
              <span className="ws-preset__count">{category.templates.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="ws-list">
        {templates.map((template) => {
          const expanded = expandedId === template.id;
          return (
            <div key={template.id} className="border-t border-[var(--border-primary)] first:border-t-0">
              <button type="button" className="ws-row w-full border-0 bg-transparent text-left" data-active={expanded} aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : template.id)}>
                <span className="ws-row__logo"><Icon icon={template.icon} width={16} style={{ color: template.iconColor }} /></span>
                <span className="ws-row__body">
                  <span className="ws-row__name block">{template.name}</span>
                  <span className="ws-row__status"><span className="truncate">{template.description}</span></span>
                </span>
                <CaretDown size={12} className={`shrink-0 text-[var(--text-secondary)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: motionEnabled ? 0.24 : 0, ease: SETUP_EASE }} className="overflow-hidden">
                    <div className="space-y-2 px-3.5 pb-3.5">
                      <CommandBlock command={template.command} onRun={(autoRun) => setTerminal({ command: template.command, autoRun })} />
                      {template.tags.length > 0 && <div className="ws-mini-agents">{template.tags.map((tag) => <span key={tag} className="ws-mini-agent" style={{ padding: '0 0.5rem' }}>{tag}</span>)}</div>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {templates.length === 0 && <p className="ws-empty">Nothing matches “{search}”.</p>}
      </div>
    </div>
  );
}
