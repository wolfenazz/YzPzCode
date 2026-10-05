import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@iconify/react';
import { ArrowCounterClockwise, ArrowLeft, Minus, PencilSimple, Plus, SlidersHorizontal, Trash, X } from '@phosphor-icons/react';
import type { WorkspaceTemplate } from '../../hooks/useWorkspace';
import { AGENT_IDS, TOOL_IDS, cliMeta } from './cliCatalog';
import { SETUP_EASE, useSetupMotion } from './useSetupMotion';
import type { CliType } from '../../types';

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

const ICONS: Record<string, { icon: string; color: string }> = {
  react: { icon: 'simple-icons:react', color: '#61DAFB' },
  rust: { icon: 'simple-icons:rust', color: '#CE422B' },
  python: { icon: 'simple-icons:python', color: '#3776AB' },
  typescript: { icon: 'simple-icons:typescript', color: '#3178C6' },
  nodejs: { icon: 'simple-icons:nodedotjs', color: '#339933' },
  go: { icon: 'simple-icons:go', color: '#00ADD8' },
  vue: { icon: 'simple-icons:vuedotjs', color: '#4FC08D' },
  svelte: { icon: 'simple-icons:svelte', color: '#FF3E00' },
  fullstack: { icon: 'ph:stack-bold', color: '#A855F7' },
  quick: { icon: 'ph:lightning-fill', color: '#10B981' },
  custom: { icon: 'ph:sparkle-bold', color: '#A1A1AA' },
};

const LAYOUT_SIZES = [0, 1, 2, 4, 6, 8];

function TemplateIcon({ template, size = 14 }: { template: Pick<WorkspaceTemplate, 'icon' | 'iconColor'>; size?: number }): React.JSX.Element {
  return <Icon icon={ICONS[template.icon]?.icon ?? 'ph:code-bold'} width={size} height={size} style={{ color: template.iconColor }} />;
}

function assigned(template: WorkspaceTemplate): [CliType, number][] {
  return (Object.entries(template.allocation) as [CliType, number][]).filter(([, count]) => count > 0);
}

function describe(template: WorkspaceTemplate): string {
  const terminals = template.layout.sessions === 0 ? 'Editor only' : `${template.layout.sessions} terminal${template.layout.sessions === 1 ? '' : 's'}`;
  const agents = assigned(template).reduce((sum, [, count]) => sum + count, 0);
  return agents > 0 ? `${terminals} · ${agents} assigned` : terminals;
}

function AgentChips({ template }: { template: WorkspaceTemplate }): React.JSX.Element {
  const list = assigned(template);
  if (list.length === 0) return <span className="text-xs text-[var(--text-secondary)]">Plain shells</span>;
  return (
    <span className="ws-mini-agents">
      {list.map(([cli, count]) => {
        const meta = cliMeta(cli);
        return (
          <span key={cli} className="ws-mini-agent">
            {meta?.logo ? <img src={meta.logo} alt="" /> : <Icon icon={meta?.icon ?? 'ph:terminal-window'} width={12} style={{ color: meta?.color }} />}
            {meta?.label ?? cli}{count > 1 && <span className="tabular-nums">×{count}</span>}
          </span>
        );
      })}
    </span>
  );
}

function TemplateEditor({ template, onSave, onDelete, onBack }: {
  template: WorkspaceTemplate;
  onSave: (updates: Partial<Omit<WorkspaceTemplate, 'id'>>) => void;
  onDelete?: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [icon, setIcon] = useState(template.icon);
  const [iconColor, setIconColor] = useState(template.iconColor);
  const [sessions, setSessions] = useState(LAYOUT_SIZES.includes(template.layout.sessions) ? template.layout.sessions : 4);
  const [allocation, setAllocation] = useState<Record<CliType, number>>(() => {
    const base = Object.fromEntries([...AGENT_IDS, ...TOOL_IDS].map((cli) => [cli, 0])) as Record<CliType, number>;
    return { ...base, ...template.allocation };
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const total = Object.values(allocation).reduce((sum, count) => sum + count, 0);
  const overAllocated = total > sessions;
  // Assigned CLIs first so the template's shape is readable at a glance.
  const order = [...AGENT_IDS, ...TOOL_IDS].sort((a, b) => Number(allocation[b] > 0) - Number(allocation[a] > 0));

  const change = (cli: CliType, count: number): void => {
    if (count < 0 || (count > allocation[cli] && total >= sessions)) return;
    setAllocation({ ...allocation, [cli]: count });
  };

  return (
    <>
      <div className="ws-dialog__body space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="ws-label">Name</span>
            <input className="ws-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Template name" autoFocus /></label>
          <label className="block"><span className="ws-label">Description</span>
            <input className="ws-input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What it’s for" /></label>
        </div>
        <div>
          <span className="ws-label">Icon</span>
          <div className="ws-icon-grid">
            {Object.entries(ICONS).map(([key, option]) => (
              <button key={key} type="button" className="ws-icon-option" aria-pressed={icon === key} aria-label={key} title={key}
                onClick={() => { setIcon(key); setIconColor(option.color); }}>
                <Icon icon={option.icon} width={16} style={{ color: option.color }} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="ws-label">Terminals</span>
          <div className="ws-steps">
            {LAYOUT_SIZES.map((size) => (
              <button key={size} type="button" className="ws-steps__item" aria-current={sessions === size ? 'step' : undefined} onClick={() => setSessions(size)}>
                {sessions === size && <motion.span layoutId="ws-template-sessions" className="ws-steps__pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                <span>{size === 0 ? 'Editor' : size}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.8125rem] font-medium">Assigned terminals</span>
            <span className={`text-xs tabular-nums ${overAllocated ? 'text-[#e5484d]' : 'text-[var(--text-secondary)]'}`}>{total} of {sessions}{overAllocated ? ' · too many' : ''}</span>
          </div>
          <div className="ws-list"><div className="ws-list__scroll" style={{ maxHeight: '15rem' }}>
            {order.map((cli) => {
              const meta = cliMeta(cli);
              return (
                <div key={cli} className="ws-row" data-active={allocation[cli] > 0} style={{ minHeight: '2.75rem' }}>
                  {allocation[cli] > 0 && <span className="ws-row__accent" style={{ background: meta.color }} />}
                  <span className="ws-row__logo" style={{ width: '1.625rem', height: '1.625rem' }}>
                    {meta.logo ? <img src={meta.logo} alt="" style={{ width: '1rem', height: '1rem' }} /> : <Icon icon={meta.icon ?? 'ph:terminal-window'} width={14} style={{ color: meta.color }} />}
                  </span>
                  <span className="ws-row__body"><span className="ws-row__name block">{meta.label}</span></span>
                  <span className="ws-stepper">
                    <button type="button" aria-label={`Remove one ${meta.label}`} disabled={allocation[cli] === 0} onClick={() => change(cli, allocation[cli] - 1)}><Minus size={12} weight="bold" /></button>
                    <output>{allocation[cli]}</output>
                    <button type="button" aria-label={`Add one ${meta.label}`} disabled={total >= sessions} onClick={() => change(cli, allocation[cli] + 1)}><Plus size={12} weight="bold" /></button>
                  </span>
                </div>
              );
            })}
          </div></div>
        </div>
      </div>
      <div className="ws-dialog__foot">
        {onDelete ? (confirmDelete
          ? <span className="flex items-center gap-2 text-xs"><span className="text-[var(--text-secondary)]">Delete this template?</span>
              <button type="button" className="ws-btn ws-btn--sm" onClick={onDelete}>Delete</button>
              <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => setConfirmDelete(false)}>Keep</button></span>
          : <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost ws-btn--danger" onClick={() => setConfirmDelete(true)}><Trash size={13} />Delete</button>)
          : <span />}
        <span className="flex items-center gap-2">
          <button type="button" className="ws-btn" onClick={onBack}>Cancel</button>
          <button type="button" className="ws-btn ws-btn--primary" disabled={!name.trim() || overAllocated}
            onClick={() => onSave({ name: name.trim(), description, icon, iconColor, layout: { type: 'grid', sessions }, allocation })}>Save template</button>
        </span>
      </div>
    </>
  );
}

/**
 * Presets as a row of chips (one click applies a template), plus a library
 * dialog for saving the current setup, editing, deleting, and restoring defaults.
 */
export function WorkspaceTemplatePicker({
  selectedTemplateId, templates, onSelectTemplate, onReapplyTemplate, onDeleteTemplate, onSaveCustomTemplate, onUpdateTemplate, onRestoreDefaults,
}: WorkspaceTemplatePickerProps): React.JSX.Element {
  const motionEnabled = useSetupMotion();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'edit'; id: string }>({ kind: 'list' });
  const [saveName, setSaveName] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const editing = view.kind === 'edit' ? templates.find((template) => template.id === view.id) : undefined;

  const openLibrary = (): void => { setView({ kind: 'list' }); setConfirmRestore(false); setOpen(true); };
  const saveCurrent = (): void => {
    if (!saveName.trim()) return;
    onSaveCustomTemplate?.(saveName.trim());
    setSaveName('');
  };

  return (
    <>
      <div className="mb-3.5 flex items-center gap-2">
        <div className="ws-presets min-w-0 flex-1" role="group" aria-label="Presets">
          {templates.map((template, index) => (
            <motion.button key={template.id} type="button" className="ws-preset" aria-pressed={selectedTemplateId === template.id}
              title={template.description || describe(template)} onClick={() => onSelectTemplate(template.id)}
              initial={motionEnabled ? { opacity: 0, y: 4 } : false} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: SETUP_EASE, delay: motionEnabled ? index * 0.03 : 0 }}>
              <span className="ws-preset__icon"><TemplateIcon template={template} size={12} /></span>
              {template.name}
              {template.layout.sessions > 0 && <span className="ws-preset__count">{template.layout.sessions}</span>}
            </motion.button>
          ))}
          {templates.length === 0 && <span className="py-1.5 text-xs text-[var(--text-secondary)]">No presets yet.</span>}
        </div>
        <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={openLibrary}><SlidersHorizontal size={14} />Manage</button>
      </div>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="ws-overlay" />
          <Dialog.Content className="ws-dialog ws-dialog--wide" aria-describedby={undefined}>
            <div className="ws-dialog__head">
              <div className="flex items-start gap-2">
                {editing && <button type="button" className="ws-btn ws-btn--icon ws-btn--sm ws-btn--ghost -ml-1.5" aria-label="Back to presets" onClick={() => setView({ kind: 'list' })}><ArrowLeft size={15} /></button>}
                <div>
                  <Dialog.Title className="ws-dialog__title">{editing ? `Edit “${editing.name}”` : 'Presets'}</Dialog.Title>
                  <p className="ws-dialog__desc">{editing ? 'Changes apply the next time you pick this preset.' : 'Reusable layouts and agent line-ups. Pick one to apply it.'}</p>
                </div>
              </div>
              <Dialog.Close className="ws-btn ws-btn--icon ws-btn--sm ws-btn--ghost" aria-label="Close"><X size={15} /></Dialog.Close>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={editing ? editing.id : 'list'} className="flex min-h-0 flex-1 flex-col"
                initial={motionEnabled ? { opacity: 0, x: editing ? 12 : -12 } : false} animate={{ opacity: 1, x: 0 }} exit={motionEnabled ? { opacity: 0, x: editing ? -12 : 12 } : undefined}
                transition={{ duration: 0.2, ease: SETUP_EASE }}>
                {editing ? (
                  <TemplateEditor template={editing} onBack={() => setView({ kind: 'list' })}
                    onDelete={onDeleteTemplate ? () => { onDeleteTemplate(editing.id); setView({ kind: 'list' }); } : undefined}
                    onSave={(updates) => { onUpdateTemplate?.(editing.id, updates); setView({ kind: 'list' }); }} />
                ) : (
                  <>
                    <div className="ws-dialog__body">
                      <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); saveCurrent(); }}>
                        <input className="ws-input" style={{ height: '2.25rem' }} value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="Save the current setup as…" aria-label="New preset name" />
                        <button type="submit" className="ws-btn" disabled={!saveName.trim()}><Plus size={14} />Save</button>
                      </form>
                      {templates.length === 0 ? (
                        <div className="ws-empty">
                          <p className="mb-3">No presets.</p>
                          <button type="button" className="ws-btn ws-btn--sm" onClick={() => onRestoreDefaults?.()}><ArrowCounterClockwise size={13} />Restore defaults</button>
                        </div>
                      ) : (
                        <div className="ws-template-grid">
                          {templates.map((template) => (
                            <div key={template.id} className="ws-template" data-selected={selectedTemplateId === template.id}>
                              <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => { onSelectTemplate(template.id); setOpen(false); }}>
                                <span className="ws-row__logo"><TemplateIcon template={template} size={16} /></span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[0.8125rem] font-[520]">{template.name}</span>
                                  <span className="block truncate text-xs text-[var(--text-secondary)]">{describe(template)}</span>
                                </span>
                              </button>
                              <AgentChips template={template} />
                              <span className="ws-template__actions">
                                {onReapplyTemplate && selectedTemplateId === template.id && (
                                  <button type="button" className="ws-btn ws-btn--icon ws-btn--sm ws-btn--ghost" aria-label={`Re-apply ${template.name}`} title="Re-apply" onClick={() => onReapplyTemplate(template.id)}><ArrowCounterClockwise size={13} /></button>
                                )}
                                {onUpdateTemplate && <button type="button" className="ws-btn ws-btn--icon ws-btn--sm ws-btn--ghost" aria-label={`Edit ${template.name}`} title="Edit" onClick={() => setView({ kind: 'edit', id: template.id })}><PencilSimple size={13} /></button>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="ws-dialog__foot">
                      {confirmRestore
                        ? <span className="flex flex-wrap items-center gap-2 text-xs"><span className="text-[var(--text-secondary)]">Reset built-in presets? Your own are kept.</span>
                            <button type="button" className="ws-btn ws-btn--sm" onClick={() => { onRestoreDefaults?.(); setConfirmRestore(false); }}>Reset</button>
                            <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => setConfirmRestore(false)}>Cancel</button></span>
                        : <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => setConfirmRestore(true)}><ArrowCounterClockwise size={13} />Restore defaults</button>}
                      <Dialog.Close className="ws-btn">Done</Dialog.Close>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
