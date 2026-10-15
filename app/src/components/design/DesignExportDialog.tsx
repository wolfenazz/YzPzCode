import React, { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, X } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { handoffPrompt } from '../../utils/design/export';
import type { Board, DesignProject } from '../../utils/design/types';
import { submitBracketedPaste } from '../workspace/browser/browserModel';
import { exportCode, exportEmail, exportImages, exportPdf, exportSvgs, type ExportResult } from './exportBoards';

type Kind = 'png' | 'jpg' | 'pdf' | 'code' | 'email' | 'svg' | 'agent';

interface DesignExportDialogProps {
  project: DesignProject;
  projectDir: string;
  selectedIds: string[];
  onClose: () => void;
}

const KIND_LABEL: Record<Kind, { title: string; hint: string }> = {
  png: { title: 'PNG', hint: 'One image per board, at its real size or larger.' },
  jpg: { title: 'JPG', hint: 'Smaller files, no transparency.' },
  pdf: { title: 'PDF', hint: 'All boards in one file, one page per board at its own size.' },
  code: { title: 'HTML and code', hint: 'A folder with one HTML page per screen, tokens.css, pictures and DESIGN.md.' },
  email: { title: 'Email', hint: 'One HTML file per email: styles written into the elements and colours as plain values. Pictures are copied beside it; host them and use their full web addresses before sending.' },
  svg: { title: 'SVG', hint: 'Vector files for graphic boards.' },
  agent: { title: 'Send to a coding agent', hint: 'Exports the code, then tells an agent terminal to build it.' },
};

/** Export of the open design: images, PDF, code, SVG, or a hand-off to a coding agent's terminal. */
export const DesignExportDialog: React.FC<DesignExportDialogProps> = ({ project, projectDir, selectedIds, onClose }) => {
  const visible = project.boards.filter((board) => !board.hidden && board.source);
  const selected = visible.filter((board) => selectedIds.includes(board.id));
  const [scope, setScope] = useState<'all' | 'selected'>(selected.length > 0 ? 'selected' : 'all');
  const [kind, setKind] = useState<Kind>(project.kind === 'graphic' ? 'png' : 'png');
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState('');

  const openWorkspaces = useAppStore((state) => state.openWorkspaces);
  const sessionsByWorkspace = useAppStore((state) => state.sessionsByWorkspace);
  const agents = useMemo(() => openWorkspaces.flatMap((workspace) => (sessionsByWorkspace[workspace.id] ?? [])
    .filter((session) => session.agent)
    .map((session) => ({ id: session.id, workspaceId: workspace.id, label: `${workspace.name} · ${session.agent} #${session.index + 1}` }))), [openWorkspaces, sessionsByWorkspace]);

  const boards: Board[] = scope === 'selected' && selected.length > 0 ? selected : visible;
  const hasEmail = project.kind === 'web' && visible.some((board) => board.preset === 'email');
  const hasSvg = visible.some((board) => board.format === 'svg');
  const hasHtml = visible.some((board) => board.format === 'html');
  const kinds: Kind[] = project.kind === 'graphic' ? ['png', 'jpg', 'pdf', ...(hasSvg ? ['svg' as const] : []), ...(hasHtml ? ['code' as const] : [])] : ['png', 'jpg', 'pdf', 'code', ...(hasEmail ? ['email' as const] : []), 'agent'];
  const canRun = boards.length > 0 && !busy && (kind !== 'agent' || Boolean(target || agents[0]));

  const run = async (): Promise<void> => {
    setBusy(true);
    setDone(0);
    setError(null);
    setResult(null);
    setMessage(null);
    try {
      let out: ExportResult;
      if (kind === 'png' || kind === 'jpg') out = await exportImages(project, boards, projectDir, scale, kind, setDone);
      else if (kind === 'pdf') out = await exportPdf(project, boards, projectDir, setDone);
      else if (kind === 'svg') out = await exportSvgs(project, boards, projectDir);
      else if (kind === 'email') out = await exportEmail(project, boards, projectDir);
      else out = await exportCode(project, boards, projectDir);
      if (kind === 'agent') {
        const chosen = agents.find((entry) => entry.id === (target || agents[0]?.id));
        if (!chosen) throw new Error('Open a terminal with a coding agent first.');
        await submitBracketedPaste(chosen.id, handoffPrompt(project, out.folder, out.files.filter((file) => file.endsWith('.html'))), async (sessionId, input) => {
          await invoke('write_to_terminal', { sessionId, input });
        });
        const app = useAppStore.getState();
        app.switchWorkspace(chosen.workspaceId);
        app.setActiveView('terminal');
        setMessage(`Sent to ${chosen.label}.`);
      }
      setResult(out);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dz-modal" role="dialog" aria-modal="true" aria-label="Export" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') onClose(); }}>
      <div className="dz-modal__panel">
        <div className="dz-modal__head">
          <strong>Export</strong>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="dz-modal__row">
          <span>Boards</span>
          <div className="dz-segmented" role="radiogroup" aria-label="Which boards">
            <button type="button" role="radio" aria-checked={scope === 'all'} onClick={() => setScope('all')}>All ({visible.length})</button>
            <button type="button" role="radio" aria-checked={scope === 'selected'} disabled={selected.length === 0} onClick={() => setScope('selected')}>Selected ({selected.length})</button>
          </div>
        </div>

        <div className="dz-modal__row">
          <span>Format</span>
          <div className="dz-segmented" role="radiogroup" aria-label="Format">
            {kinds.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}>{value === 'agent' ? 'Agent' : value === 'code' ? 'Code' : KIND_LABEL[value].title}</button>
            ))}
          </div>
        </div>
        <p className="dz-note">{KIND_LABEL[kind].hint}</p>

        {(kind === 'png' || kind === 'jpg') && (
          <div className="dz-modal__row">
            <span>Size</span>
            <div className="dz-segmented" role="radiogroup" aria-label="Scale">
              {[1, 2, 3].map((value) => <button key={value} type="button" role="radio" aria-checked={scale === value} onClick={() => setScale(value)}>{value}×</button>)}
            </div>
          </div>
        )}

        {kind === 'agent' && (
          <div className="dz-modal__row">
            <span>Terminal</span>
            {agents.length === 0
              ? <span className="dz-note" style={{ margin: 0 }}>No agent terminal is open. Open a coding workspace first.</span>
              : (
                <select className="dz-select" value={target || agents[0].id} onChange={(event) => setTarget(event.target.value)} aria-label="Agent terminal">
                  {agents.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
              )}
          </div>
        )}

        {error && <p className="dz-error">{error}</p>}
        {result && (
          <div className="dz-modal__done">
            <span>{message ?? `Saved ${result.files.length} file${result.files.length === 1 ? '' : 's'}.`}</span>
            <button type="button" className="dz-btn dz-btn--sm" onClick={() => void invoke('reveal_in_file_manager', { path: result.folder }).catch(() => undefined)}><FolderOpen size={13} /> Show in folder</button>
          </div>
        )}

        <div className="dz-modal__foot">
          <button type="button" className="dz-btn" onClick={onClose}>Close</button>
          <button type="button" className="dz-btn dz-btn--primary" disabled={!canRun} onClick={() => void run()}>
            {busy ? `Exporting ${done}/${boards.length}…` : kind === 'agent' ? 'Send' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
};
