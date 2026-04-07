import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import { WorkspaceTemplate } from '../../hooks/useWorkspace';
import { AgentType } from '../../types';

interface WorkspaceTemplatePickerProps {
  selectedTemplateId: string;
  templates: WorkspaceTemplate[];
  onSelectTemplate: (templateId: string) => void;
  onReapplyTemplate?: (templateId: string) => void;
  onDeleteTemplate?: (id: string) => void;
  onSaveCustomTemplate?: (name: string) => void;
  onUpdateTemplate?: (id: string, updates: Partial<Omit<WorkspaceTemplate, 'id'>>) => void;
  onRestoreDefaults?: () => void;
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

const ICON_OPTIONS = [
  { key: 'react', color: '#61DAFB' },
  { key: 'rust', color: '#CE422B' },
  { key: 'python', color: '#3776AB' },
  { key: 'typescript', color: '#3178C6' },
  { key: 'nodejs', color: '#339933' },
  { key: 'go', color: '#00ADD8' },
  { key: 'vue', color: '#4FC08D' },
  { key: 'svelte', color: '#FF3E00' },
  { key: 'fullstack', color: '#A855F7' },
  { key: 'quick', color: '#10B981' },
  { key: 'custom', color: '#71717A' },
];

const AGENT_LABELS: Record<AgentType, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  kilo: 'Kilo',
  hermes: 'Hermes',
};

const AGENT_COLORS: Record<AgentType, string> = {
  claude: '#F97316',
  codex: '#22C55E',
  gemini: '#3B82F6',
  opencode: '#A855F7',
  cursor: '#EC4899',
  kilo: '#14B8A6',
  hermes: '#F59E0B',
};

const EMPTY_ALLOCATION: Record<AgentType, number> = {
  claude: 0, codex: 0, gemini: 0, opencode: 0, cursor: 0, kilo: 0, hermes: 0,
};

const AgentPill: React.FC<{ agent: AgentType; count: number }> = ({ agent, count }) => {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/50 rounded-md text-[9px] font-mono text-zinc-400">
      {AGENT_LABELS[agent]}
      <span className="text-zinc-200 font-bold">x{count}</span>
    </span>
  );
};

const TemplateCard: React.FC<{
  template: WorkspaceTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onReapply?: () => void;
  onEdit: () => void;
  isEditing: boolean;
  editName: string;
  editAllocation: Record<AgentType, number>;
  editSessions: number;
  onEditNameChange: (name: string) => void;
  onEditAllocationChange: (agent: AgentType, count: number) => void;
  onEditSessionsChange: (sessions: number) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onOpenAdvanced: () => void;
}> = ({
  template,
  isSelected,
  onSelect,
  onDelete,
  onReapply,
  onEdit,
  isEditing,
  editName,
  editAllocation,
  editSessions,
  onEditNameChange,
  onEditAllocationChange,
  onEditSessionsChange,
  onEditSave,
  onEditCancel,
  onOpenAdvanced,
}) => {
  const iconKey = ICON_MAP[template.icon] || 'simple-icons:code';
  const [showTooltip, setShowTooltip] = React.useState(false);

  const editAllocated = Object.values(editAllocation).reduce((s, c) => s + c, 0);
  const editOverAllocated = editAllocated > editSessions;

  if (isEditing) {
    return (
      <div className="col-span-1 sm:col-span-2 lg:col-span-2 p-4 rounded-xl border border-zinc-400/70 bg-zinc-900/95 shadow-[0_0_30px_rgba(161,161,170,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950">
              <Icon icon={ICON_MAP[template.icon] || 'simple-icons:code'} className="w-4.5 h-4.5" style={{ color: template.iconColor }} />
            </div>
            <input
              type="text"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="px-2 py-1 bg-zinc-950 border border-zinc-600 rounded-md text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide focus:outline-none focus:border-zinc-400 w-40"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onEditCancel}
              className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
              title="Cancel editing"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onEditSave}
              disabled={editOverAllocated || !editName.trim()}
              className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
              title="Save changes"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Terminals</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEditSessionsChange(Math.max(1, editSessions - 1))}
              className="w-6 h-6 flex items-center justify-center bg-zinc-950 border border-zinc-700 rounded hover:border-zinc-500 text-zinc-400 text-xs font-mono cursor-pointer transition-colors duration-150"
            >
              -
            </button>
            <span className="w-8 text-center text-xs font-bold text-zinc-200 font-mono">{editSessions}</span>
            <button
              type="button"
              onClick={() => onEditSessionsChange(Math.min(12, editSessions + 1))}
              className="w-6 h-6 flex items-center justify-center bg-zinc-950 border border-zinc-700 rounded hover:border-zinc-500 text-zinc-400 text-xs font-mono cursor-pointer transition-colors duration-150"
            >
              +
            </button>
          </div>
          {editOverAllocated && (
            <span className="text-[9px] text-rose-400 font-mono">over-allocated</span>
          )}
        </div>

        <div className="space-y-1.5">
          {(Object.entries(editAllocation) as [AgentType, number][]).map(([agent, count]) => (
            <div key={agent} className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: AGENT_COLORS[agent] }}
              />
              <span className="text-[10px] font-mono text-zinc-400 w-16 truncate">{AGENT_LABELS[agent]}</span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onEditAllocationChange(agent, count - 1)}
                  className="w-5 h-5 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded text-zinc-500 text-[10px] font-mono hover:border-zinc-600 hover:text-zinc-300 cursor-pointer transition-colors duration-150"
                >
                  -
                </button>
                <span className="w-6 text-center text-[10px] font-bold text-zinc-300 font-mono">{count}</span>
                <button
                  type="button"
                  onClick={() => onEditAllocationChange(agent, count + 1)}
                  disabled={editAllocated >= editSessions}
                  className="w-5 h-5 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded text-zinc-500 text-[10px] font-mono hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenAdvanced}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-zinc-700/50 text-[9px] font-mono text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/40 transition-all duration-150 cursor-pointer"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-.756-.426-.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Advanced Editor
        </button>
      </div>
    );
  }

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
        {isSelected && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="absolute top-2.5 right-[4.5rem] p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-500 hover:text-amber-400 transition-all duration-150 cursor-pointer z-10"
              title="Edit template"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {onReapply && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReapply();
                }}
                className="absolute top-2.5 right-10 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-500 hover:text-emerald-400 transition-all duration-150 cursor-pointer z-10"
                title="Re-apply template"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            {onDelete && (
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
          </>
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

const TemplateEditorModal: React.FC<{
  template: WorkspaceTemplate;
  onSave: (updates: Partial<Omit<WorkspaceTemplate, 'id'>>) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ template, onSave, onDelete, onClose }) => {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [selectedIcon, setSelectedIcon] = useState(template.icon);
  const [selectedColor, setSelectedColor] = useState(template.iconColor);
  const [sessions, setSessions] = useState(template.layout.sessions);
  const [allocation, setAllocation] = useState<Record<AgentType, number>>({ ...template.allocation });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const allocated = Object.values(allocation).reduce((s, c) => s + c, 0);
  const remaining = Math.max(0, sessions - allocated);
  const isOverAllocated = allocated > sessions;
  const utilization = sessions > 0 ? (allocated / sessions) * 100 : 0;

  const handleAllocationChange = (agent: AgentType, count: number) => {
    if (count < 0) return;
    const newAlloc = { ...allocation, [agent]: count };
    const total = Object.values(newAlloc).reduce((s, c) => s + c, 0);
    if (total > sessions) return;
    setAllocation(newAlloc);
  };

  const handleSave = () => {
    if (!name.trim() || isOverAllocated) return;
    onSave({
      name: name.trim(),
      description,
      icon: selectedIcon,
      iconColor: selectedColor,
      layout: { type: 'grid', sessions },
      allocation,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950">
              <Icon icon={ICON_MAP[selectedIcon] || 'simple-icons:code'} className="w-4.5 h-4.5" style={{ color: selectedColor }} />
            </div>
            <div>
              <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider">
                Edit Template
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                Customize your template configuration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              placeholder="Template name..."
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Icon &amp; Color
            </label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setSelectedIcon(opt.key);
                    setSelectedColor(opt.color);
                  }}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-150 cursor-pointer ${
                    selectedIcon === opt.key
                      ? 'border-zinc-400 bg-zinc-800 shadow-[0_0_12px_rgba(161,161,170,0.1)]'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-900'
                  }`}
                  title={opt.key}
                >
                  <Icon icon={ICON_MAP[opt.key]} className="w-4.5 h-4.5" style={{ color: opt.color }} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Terminal Sessions
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSessions(Math.max(1, sessions - 1))}
                className="w-8 h-8 flex items-center justify-center bg-zinc-950 border border-zinc-700 rounded-lg hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors duration-150"
              >
                <span className="text-sm font-mono">-</span>
              </button>
              <span className="w-10 text-center text-lg font-bold text-zinc-200 font-mono">{sessions}</span>
              <button
                type="button"
                onClick={() => setSessions(Math.min(12, sessions + 1))}
                className="w-8 h-8 flex items-center justify-center bg-zinc-950 border border-zinc-700 rounded-lg hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors duration-150"
              >
                <span className="text-sm font-mono">+</span>
              </button>
              <span className="text-[10px] text-zinc-600 font-mono ml-1">max 12</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Agent Allocation
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500">
                  {allocated}/{sessions} used
                </span>
                {remaining > 0 && (
                  <span className="text-[9px] font-mono text-zinc-600">
                    ({remaining} shell{remaining !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
            </div>

            <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  isOverAllocated ? 'bg-rose-500' : utilization > 80 ? 'bg-amber-500' : 'bg-zinc-400'
                }`}
                style={{ width: `${Math.min(100, utilization)}%` }}
              />
            </div>

            {isOverAllocated && (
              <div className="flex items-center gap-1.5 mb-2">
                <svg className="w-3 h-3 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-[10px] text-rose-400 font-mono">Allocation exceeds available slots</span>
              </div>
            )}

            <div className="space-y-2">
              {(Object.entries(allocation) as [AgentType, number][]).map(([agent, count]) => {
                const total = Object.values(allocation).reduce((s, c) => s + c, 0);
                const canIncrement = total < sessions;
                return (
                  <div
                    key={agent}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors duration-150 ${
                      count > 0
                        ? 'border-zinc-700/60 bg-zinc-900/40'
                        : 'border-zinc-800/40 bg-zinc-950/20 opacity-50'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: AGENT_COLORS[agent] }}
                    />
                    <span className="text-[11px] font-mono text-zinc-300 w-20 truncate">{AGENT_LABELS[agent]}</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleAllocationChange(agent, count - 1)}
                        className="w-7 h-7 flex items-center justify-center bg-zinc-950 border border-zinc-700 rounded hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors duration-150"
                      >
                        <span className="text-xs font-mono">-</span>
                      </button>
                      <span className="w-8 text-center text-xs font-bold text-zinc-200 font-mono">{count}</span>
                      <button
                        type="button"
                        onClick={() => handleAllocationChange(agent, count + 1)}
                        disabled={!canIncrement}
                        className="w-7 h-7 flex items-center justify-center bg-zinc-950 border border-zinc-700 rounded hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
                      >
                        <span className="text-xs font-mono">+</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {remaining > 0 && (
              <div className="mt-2 px-3 py-2.5 rounded-lg border border-zinc-800/40 bg-zinc-950/20">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-zinc-600 flex-shrink-0" />
                  <span className="text-[11px] font-mono text-zinc-500">Shell (unallocated)</span>
                  <span className="ml-auto text-xs font-bold text-zinc-500 font-mono">{remaining}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-rose-400">Delete this template?</span>
              <button
                type="button"
                onClick={onDelete}
                className="px-3 py-1 rounded text-[10px] font-mono uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-colors duration-150 cursor-pointer"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1 rounded text-[10px] font-mono uppercase tracking-wider text-zinc-400 border border-zinc-700 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600 hover:text-rose-400 transition-colors duration-150 cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 transition-colors duration-150 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || isOverAllocated}
              className="px-4 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider bg-white text-zinc-900 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>, document.body
  );
};

export const WorkspaceTemplatePicker: React.FC<WorkspaceTemplatePickerProps> = ({
  selectedTemplateId,
  templates,
  onSelectTemplate,
  onReapplyTemplate,
  onDeleteTemplate,
  onSaveCustomTemplate,
  onUpdateTemplate,
  onRestoreDefaults,
}) => {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAllocation, setEditAllocation] = useState<Record<AgentType, number>>({ ...EMPTY_ALLOCATION });
  const [editSessions, setEditSessions] = useState(4);
  const [advancedEditId, setAdvancedEditId] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    onSaveCustomTemplate?.(saveName.trim());
    setShowSaveModal(false);
    setSaveName('');
  }, [saveName, onSaveCustomTemplate]);

  const startInlineEdit = (template: WorkspaceTemplate) => {
    setEditingTemplateId(template.id);
    setEditName(template.name);
    setEditAllocation({ ...template.allocation });
    setEditSessions(template.layout.sessions);
  };

  const cancelInlineEdit = () => {
    setEditingTemplateId(null);
    setEditName('');
    setEditAllocation({ ...EMPTY_ALLOCATION });
    setEditSessions(4);
  };

  const saveInlineEdit = () => {
    if (!editingTemplateId || !editName.trim()) return;
    const allocTotal = Object.values(editAllocation).reduce((s, c) => s + c, 0);
    if (allocTotal > editSessions) return;
    onUpdateTemplate?.(editingTemplateId, {
      name: editName.trim(),
      layout: { type: 'grid', sessions: editSessions },
      allocation: { ...editAllocation },
    });
    setEditingTemplateId(null);
  };

  const handleEditAllocationChange = (agent: AgentType, count: number) => {
    if (count < 0) return;
    const newAlloc = { ...editAllocation, [agent]: count };
    const total = Object.values(newAlloc).reduce((s, c) => s + c, 0);
    if (total > editSessions) return;
    setEditAllocation(newAlloc);
  };

  const advancedTemplate = advancedEditId
    ? templates.find((t) => t.id === advancedEditId)
    : null;

  const handleAdvancedSave = (updates: Partial<Omit<WorkspaceTemplate, 'id'>>) => {
    if (!advancedEditId) return;
    onUpdateTemplate?.(advancedEditId, updates);
    setAdvancedEditId(null);
    setEditingTemplateId(null);
  };

  const handleAdvancedDelete = () => {
    if (!advancedEditId) return;
    onDeleteTemplate?.(advancedEditId);
    setAdvancedEditId(null);
    setEditingTemplateId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 text-xs font-mono">$</span>
          <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
            Template
          </label>
          <span className="px-2 py-0.5 rounded-full border border-zinc-800 text-[9px] text-zinc-500 bg-zinc-900/50">
            {templates.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRestoreConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900/50 transition-all duration-150 cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restore Defaults
            </button>
            {showRestoreConfirm && (
              <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-3">
                <p className="text-[10px] font-mono text-zinc-300 mb-3">Restore all built-in templates to their defaults? Custom templates will be kept.</p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRestoreConfirm(false)}
                    className="px-3 py-1 rounded text-[9px] font-mono uppercase tracking-wider text-zinc-400 border border-zinc-700 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRestoreDefaults?.();
                      setShowRestoreConfirm(false);
                    }}
                    className="px-3 py-1 rounded text-[9px] font-mono uppercase tracking-wider bg-white text-zinc-900 hover:bg-zinc-200 transition-colors duration-150 cursor-pointer"
                  >
                    Restore
                  </button>
                </div>
              </div>
            )}
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
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 border border-dashed border-zinc-800 rounded-xl">
          <svg className="w-8 h-8 text-zinc-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-[10px] font-mono text-zinc-600 mb-3">No templates</span>
          <button
            type="button"
            onClick={() => onRestoreDefaults?.()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-700 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-all duration-150 cursor-pointer"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Restore Default Templates
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedTemplateId === template.id}
              onSelect={() => {
                if (editingTemplateId !== template.id) {
                  onSelectTemplate(template.id);
                }
              }}
              onReapply={onReapplyTemplate ? () => onReapplyTemplate(template.id) : undefined}
              onDelete={onDeleteTemplate ? () => onDeleteTemplate(template.id) : undefined}
              onEdit={() => startInlineEdit(template)}
              isEditing={editingTemplateId === template.id}
              editName={editName}
              editAllocation={editAllocation}
              editSessions={editSessions}
              onEditNameChange={setEditName}
              onEditAllocationChange={handleEditAllocationChange}
              onEditSessionsChange={setEditSessions}
              onEditSave={saveInlineEdit}
              onEditCancel={cancelInlineEdit}
              onOpenAdvanced={() => setAdvancedEditId(template.id)}
            />
          ))}
        </div>
      )}

      {advancedTemplate && (
        <TemplateEditorModal
          template={advancedTemplate}
          onSave={handleAdvancedSave}
          onDelete={handleAdvancedDelete}
          onClose={() => setAdvancedEditId(null)}
        />
      )}

      {showSaveModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
        </div>, document.body
      )}
    </div>
  );
};
