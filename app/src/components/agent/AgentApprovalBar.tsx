import React from 'react';
import type { AgentApprovalRequest } from '../../types';

interface AgentApprovalBarProps {
  approvals: AgentApprovalRequest[];
  onApprove: (requestId: string, approved: boolean) => void;
  /** Persist "always allow this tool" via the tool-policy store, then approve the pending request. */
  onAlwaysAllow?: (toolName: string, requestId: string) => void;
}

const APPROVAL_TOOL_LABEL: Record<string, string> = {
  run_commands: 'Run Command',
  editor: 'Edit File',
  apply_patch: 'Apply Patch',
  write_file: 'Write File',
  create_file: 'Create File',
  delete_file: 'Delete File',
  rename_file: 'Rename File',
  execute_command: 'Run Command',
};

const formatInput = (input: unknown): string => {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
};

export const AgentApprovalBar: React.FC<AgentApprovalBarProps> = ({ approvals, onApprove, onAlwaysAllow }) => {
  if (approvals.length === 0) return null;
  const approval = approvals[0];
  const label = APPROVAL_TOOL_LABEL[approval.toolName] || approval.toolName;
  const inputText = formatInput(approval.input);
  const command = typeof approval.input === 'object' && approval.input && 'command' in (approval.input as object)
    ? String((approval.input as { command?: unknown }).command ?? '')
    : '';

  return (
    <div className="border-t border-[var(--border-primary)] bg-amber-950/10 px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-400">
          Approval Required
        </span>
        <span className="font-mono text-[9px] text-[var(--text-secondary)]/60">
          {label}
          {approvals.length > 1 ? ` · +${approvals.length - 1} more` : ''}
        </span>
      </div>

      {command && (
        <div className="rounded-md border border-amber-900/40 bg-[var(--bg-main)] px-3 py-2">
          <div className="mb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/50">
            Command
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-amber-100/90">{command}</pre>
        </div>
      )}
      {!command && inputText && (
        <div className="max-h-32 overflow-auto rounded-md border border-amber-900/40 bg-[var(--bg-main)] px-3 py-2">
          <pre className="whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">{inputText}</pre>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => onApprove(approval.requestId, true)}
          className="flex-1 h-8 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
        >
          Approve
        </button>
        <button
          onClick={() => onApprove(approval.requestId, false)}
          className="flex-1 h-8 rounded-md bg-rose-900/60 hover:bg-rose-800 text-rose-100 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
        >
          Deny
        </button>
      </div>

      {onAlwaysAllow && (
        <button
          onClick={() => onAlwaysAllow(approval.toolName, approval.requestId)}
          className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md border border-amber-700/40 bg-amber-900/20 hover:bg-amber-900/40 text-amber-300/90 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
          title={`Always allow ${label} — future ${label} calls run without asking (manageable in Settings → YZPZ Agent → tool policies)`}
        >
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Always allow {label}
        </button>
      )}
    </div>
  );
};
