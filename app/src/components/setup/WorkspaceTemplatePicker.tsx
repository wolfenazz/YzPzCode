import React, { useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { WORKSPACE_TEMPLATES, WorkspaceTemplate } from '../../hooks/useWorkspace';
import { AgentType } from '../../types';

interface WorkspaceTemplatePickerProps {
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onReapplyTemplate?: (templateId: string) => void;
  customTemplates?: WorkspaceTemplate[];
  onDeleteCustomTemplate?: (id: string) => void;
  onSaveCustomTemplate?: (name: string) => void;
}

const ICON_MAP: Record<string, string> = {
  react: 'simple-icons:react',
  rust: 'simple-icons:rust',
  python: 'simple-icons:python',
  fullstack: 'simple-icons:codeberg',
  quick: 'simple-icons:lightning',
  custom: 'simple-icons:additive',
  nodejs: 'simple-icons:nodedotjs',
  go: 'simple-icons:go',
  typescript: 'simple-icons:typescript',
  vue: 'simple-icons:vuedotjs',
  svelte: 'simple-icons:svelte',
};

const AGENT_LABELS: Record<AgentType, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  kilo: 'Kilo',
};

const AgentPill: React.FC<{ agent: AgentType; count: number }> = ({ agent, count }) => {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/50 rounded-md text-[9px] font-mono text-zinc-400">
      {AGENT_LABELS[agent]}
      <span className="text-zinc-200 font-bold">×{count}</span>
    </span>
  );
};

const TemplateCard: React.FC<{
  template: WorkspaceTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onReapply?: () => void;
}> = ({ template, isSelected, onSelect, onDelete, onReapply }) => {
  const iconKey = ICON_MAP[template.icon] || 'simple-icons:code';
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer text-left w-full ${
          isSelected
            ? 'border-zinc-400/70 bg-zinc-800/90 shadow-[0_0_20px_rgba(161,161,170,0.06)]'
            : 'border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-600 hover:bg-zinc-900/50'
        }`}
      >
        {onDelete && isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-500 hover:text-rose-400 transition-all duration-150 cursor-pointer z-10"
            title="Delete template"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {isSelected && onReapply && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReapply();
            }}
            className="absolute top-2.5 right-10 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-500 hover:text-emerald-400 transition-all duration-150 cursor-pointer z-10"
            title="Re-apply template defaults"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-3 mb-3.5">
          <div
            className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-colors duration-200 ${
              isSelected
                ? 'border-zinc-500 bg-zinc-900'
                : 'border-zinc-800 bg-zinc-950 group-hover:border-zinc-600'
            }`}
          >
            <Icon icon={iconKey} className="w-5.5 h-5.5" style={{ color: template.iconColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <span
              className={`block text-xs font-mono font-bold tracking-wide uppercase truncate ${
                isSelected ? 'text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-200'
              }`}
            >
              {template.name}
            </span>
            <span className="block text-[10px] font-mono text-zinc-600 truncate">
              {template.layout.sessions} terminal{template.layout.sessions !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(template.allocation) as [AgentType, number][])
            .filter(([, count]) => count > 0)
            .map(([agent, count]) => (
              <AgentPill key={agent} agent={agent} count={count} />
            ))}
          {Object.values(template.allocation).every((c) => c === 0) && (
            <span className="text-[9px] font-mono text-zinc-700 italic">configure manually</span>
          )}
        </div>
      </button>

      {showTooltip && template.description && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl pointer-events-none">
          <span className="text-[10px] font-mono text-zinc-300 whitespace-nowrap">{template.description}</span>
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 bg-zinc-800 border-l border-t border-zinc-700 rotate-45" />
        </div>
      )}
    </div>
  );
};

export const WorkspaceTemplatePicker: React.FC<WorkspaceTemplatePickerProps> = ({
  selectedTemplateId,
  onSelectTemplate,
  onReapplyTemplate,
  customTemplates = [],
  onDeleteCustomTemplate,
  onSaveCustomTemplate,
}) => {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');

  const builtinCustom = WORKSPACE_TEMPLATES.find((t) => t.id === 'custom');
  const builtinOthers = WORKSPACE_TEMPLATES.filter((t) => t.id !== 'custom');
  const allTemplates = [...builtinOthers, ...customTemplates, ...(builtinCustom ? [builtinCustom] : [])];

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    onSaveCustomTemplate?.(saveName.trim());
    setShowSaveModal(false);
    setSaveName('');
  }, [saveName, onSaveCustomTemplate]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 text-xs font-mono">$</span>
          <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
            Template
          </label>
        </div>
        <button
          type="button"
          onClick={() => setShowSaveModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900/50 transition-all duration-150 cursor-pointer"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          Save Current
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {allTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplateId === template.id}
            onSelect={() => onSelectTemplate(template.id)}
            onReapply={onReapplyTemplate ? () => onReapplyTemplate(template.id) : undefined}
            onDelete={
              template.id.startsWith('custom-')
                ? () => onDeleteCustomTemplate?.(template.id)
                : undefined
            }
          />
        ))}
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider">
                Save as Template
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">
                Save your current configuration as a reusable template.
              </p>
            </div>
            <div className="px-5 py-4">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Template name..."
                autoFocus
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveName('');
                }}
                className="px-4 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 transition-colors duration-150 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="px-4 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider bg-white text-zinc-900 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
