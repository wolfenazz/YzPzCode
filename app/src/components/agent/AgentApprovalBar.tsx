import { File, ShieldCheck } from '@phosphor-icons/react';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '../ai-elements/confirmation';
import type { AgentApprovalRequest } from '../../types';

interface AgentApprovalBarProps {
  approvals: AgentApprovalRequest[];
  onApprove: (requestId: string, approved: boolean) => void;
  onAlwaysAllow?: (toolName: string, requestId: string) => void;
}

const APPROVAL_TOOL_LABEL: Record<string, string> = {
  run_commands: 'run a command',
  editor: 'edit a file',
  apply_patch: 'apply a patch',
  write_file: 'write a file',
  create_file: 'create a file',
  delete_file: 'delete a file',
  rename_file: 'rename a file',
  execute_command: 'run a command',
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

export const AgentApprovalBar = ({ approvals, onApprove, onAlwaysAllow }: AgentApprovalBarProps) => {
  if (approvals.length === 0) return null;

  const approval = approvals[0];
  const label = APPROVAL_TOOL_LABEL[approval.toolName] ?? approval.toolName;
  const inputText = formatInput(approval.input);
  const command = typeof approval.input === 'object' && approval.input && 'command' in approval.input
    ? String((approval.input as { command?: unknown }).command ?? '')
    : '';

  return (
    <div className="absolute inset-x-4 bottom-32 z-40 mx-auto max-w-2xl">
      <Confirmation
        approval={{ id: approval.requestId }}
        className="app-surface app-surface--raised border-[var(--border-primary)] bg-[var(--popover)] p-4 shadow-[var(--shadow-dialog)]"
        state="approval-requested"
      >
        <ConfirmationTitle className="text-sm text-[var(--text-primary)]">
          Allow the agent to {label}?
          {approvals.length > 1 ? ` ${approvals.length - 1} more requests are waiting.` : ''}
        </ConfirmationTitle>

        <div className="mt-3 space-y-3">
          {command || inputText ? (
            <pre className="max-h-32 overflow-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2.5 font-mono text-xs leading-5 text-[var(--text-secondary)] whitespace-pre-wrap break-all">
              {command || inputText}
            </pre>
          ) : null}

          {approval.affectedPaths?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {approval.affectedPaths.map((path) => (
                <span className="inline-flex max-w-48 items-center gap-1.5 rounded-md bg-[var(--bg-tertiary)] px-2 py-1 text-[10px] text-[var(--text-secondary)]" key={path} title={path}>
                  <File size={12} />
                  <span className="truncate">{path.split(/[/\\]/).pop()}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <ConfirmationRequest>
          <ConfirmationActions className="mt-4 justify-end">
            {onAlwaysAllow ? (
              <button
                className="app-button mr-auto"
                onClick={() => onAlwaysAllow(approval.toolName, approval.requestId)}
                title={`Always allow ${label}`}
                type="button"
              >
                <ShieldCheck size={14} />
                Always allow
              </button>
            ) : null}
            <ConfirmationAction onClick={() => onApprove(approval.requestId, false)} variant="outline">
              Deny
            </ConfirmationAction>
            <ConfirmationAction onClick={() => onApprove(approval.requestId, true)}>
              Allow once
            </ConfirmationAction>
          </ConfirmationActions>
        </ConfirmationRequest>
      </Confirmation>
    </div>
  );
};
