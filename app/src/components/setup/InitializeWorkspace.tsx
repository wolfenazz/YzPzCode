import React, { useState, useMemo, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { INIT_CATEGORIES, InitTemplate, InitCategory } from '../../data/initTemplates';
import { InlineTerminal } from './InlineTerminal';

interface InitializeWorkspaceProps {
  selectedPath: string;
}

const CommandBlock: React.FC<{
  command: string;
  visible: boolean;
  onInitialize: (autoRun: boolean) => void;
}> = ({ command, visible, onInitialize }) => {
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mt-2 flex items-stretch rounded border border-zinc-800 overflow-hidden group/cmd">
      <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-zinc-950 min-w-0">
        <span className="text-zinc-600 text-[10px] font-mono select-none flex-shrink-0">$</span>
        <code className="text-[11px] font-mono text-zinc-300 truncate">{command}</code>
      </div>
      <button
        type="button"
        onClick={() => onInitialize(true)}
        className="px-3 flex items-center bg-zinc-900 border-l border-zinc-800 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer flex-shrink-0"
        title="Run immediately"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onInitialize(false)}
        className="px-3 flex items-center bg-zinc-900 border-l border-zinc-800 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer flex-shrink-0"
        title="Paste command (edit before running)"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="px-3 flex items-center bg-zinc-900 border-l border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer flex-shrink-0"
        title="Copy command"
      >
        {copied ? (
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
};

const TemplateCard: React.FC<{
  template: InitTemplate;
  isExpanded: boolean;
  onToggle: () => void;
  onInitialize: (autoRun: boolean) => void;
}> = ({ template, isExpanded, onToggle, onInitialize }) => {
  return (
    <div
      className={`rounded-lg border transition-all duration-200 ${
        isExpanded
          ? 'border-zinc-500 bg-zinc-900/80'
          : 'border-zinc-800/70 bg-zinc-950/40 hover:border-zinc-600 hover:bg-zinc-900/40'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3.5 cursor-pointer text-left"
      >
        <div
          className="w-8 h-8 flex items-center justify-center rounded-md border border-zinc-800 flex-shrink-0 transition-colors duration-200"
          style={{ backgroundColor: template.iconColor + '22' }}
        >
          <Icon icon={template.icon} className="w-4.5 h-4.5" style={{ color: template.iconColor }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-semibold tracking-wide ${isExpanded ? 'text-zinc-100' : 'text-zinc-300'}`}>
              {template.name}
            </span>
            <span className="text-[9px] font-mono text-zinc-600 truncate hidden sm:inline">
              {template.description}
            </span>
          </div>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="px-3.5 pb-3.5">
          <CommandBlock command={template.command} visible={true} onInitialize={onInitialize} />
          <div className="flex flex-wrap gap-1 mt-2">
            {template.tags.map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 bg-zinc-800/60 border border-zinc-700/40 rounded text-[9px] font-mono text-zinc-500">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const CategoryTab: React.FC<{
  category: InitCategory;
  isActive: boolean;
  onClick: () => void;
}> = ({ category, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer whitespace-nowrap ${
      isActive
        ? 'border-zinc-500 bg-zinc-800/80 text-zinc-200'
        : 'border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/40'
    }`}
  >
    <Icon icon={category.icon} className="w-3.5 h-3.5" />
    <span>{category.label}</span>
    <span className={`text-[9px] ${isActive ? 'text-zinc-400' : 'text-zinc-600'}`}>
      {category.templates.length}
    </span>
  </button>
);

export const InitializeWorkspace: React.FC<InitializeWorkspaceProps> = ({ selectedPath }) => {
  const [activeCategory, setActiveCategory] = useState<string>('react');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [initTerminal, setInitTerminal] = useState<{ id: string; command: string; autoRun: boolean } | null>(null);

  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      const category = INIT_CATEGORIES.find((c) => c.id === activeCategory);
      return category?.templates ?? [];
    }
    return INIT_CATEGORIES.flatMap((cat) =>
      cat.templates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q))
      )
    );
  }, [activeCategory, search]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (!selectedPath) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-zinc-600 text-xs font-mono">$</span>
          <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
            Initialize Workspace
          </label>
        </div>
        <div className="px-5 py-10 border border-dashed border-zinc-800/60 rounded-xl text-center bg-zinc-950/30">
          <Icon icon="simple-icons:codeberg" className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-[11px] font-mono text-zinc-600">Select a directory first to initialize a project</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 text-xs font-mono">$</span>
          <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
            Initialize Workspace
          </label>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-xs font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors duration-150"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-3 scrollbar-thin">
        {INIT_CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat.id}
            category={cat}
            isActive={activeCategory === cat.id}
            onClick={() => {
              setActiveCategory(cat.id);
              setExpandedId(null);
              setSearch('');
            }}
          />
        ))}
      </div>

      {/* Terminal or Templates Grid */}
      {initTerminal ? (
        <InlineTerminal
          command={initTerminal.command}
          cwd={selectedPath}
          autoRun={initTerminal.autoRun}
          onClose={() => setInitTerminal(null)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isExpanded={expandedId === template.id}
              onToggle={() => handleToggle(template.id)}
              onInitialize={(autoRun) => setInitTerminal({ id: template.id, command: template.command, autoRun })}
            />
          ))}
          {filteredTemplates.length === 0 && (
            <div className="col-span-full py-6 text-center">
              <p className="text-[11px] font-mono text-zinc-600">No templates match "{search}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
