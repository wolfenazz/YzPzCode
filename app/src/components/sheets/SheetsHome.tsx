import React, { useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowRight, FileArrowUp, FileText, Image as ImageIcon, Paperclip, Plus, Trash, X } from '@phosphor-icons/react';
import type { EngineChoice } from '../../utils/writing/types';
import { relativeTime } from '../writing/ui';
import { attachmentFromPath, DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS, MAX_ATTACHMENT_COUNT, saveDropped, type SheetAttachment } from './attachments';
import type { WorkbookListing } from './useWorkbookDocument';

interface SheetsHomeProps {
  workspaceName: string;
  attachmentsFolder: string;
  workbooks: WorkbookListing[];
  engine: EngineChoice;
  busy: boolean;
  error: string | null;
  onCreate: (prompt: string, attachments: SheetAttachment[]) => void;
  onBlank: () => void;
  onOpenFile: (path: string) => void;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
}

const EXAMPLES: Array<{ label: string; prompt: string }> = [
  { label: 'Grade book', prompt: 'A grade book for a class of 24 students with three exams, two quizzes and homework. Weighted final grade as a formula, class average, highest and lowest, and a letter grade column.' },
  { label: 'Monthly budget', prompt: 'A household monthly budget: income sources, fixed and variable expenses by category, savings goal, and a summary with what is left each month. A chart of spending by category.' },
  { label: 'Invoice', prompt: 'A clean invoice template with company and client blocks, line items with quantity, unit price and line total, tax rate in one cell, subtotal, tax and grand total as formulas.' },
  { label: 'Inventory', prompt: 'An inventory list with SKU, name, category, quantity on hand, reorder level, unit cost and stock value, flagging items below the reorder level.' },
  { label: 'Attendance', prompt: 'An attendance sheet for 30 students and the days of one month, with present/absent marks and a total and percentage per student.' },
];

const FILE_FILTERS = [{ name: 'Spreadsheets', extensions: ['xlsx', 'xlsm', 'xls', 'ods', 'csv', 'tsv'] }];

export const SheetsHome: React.FC<SheetsHomeProps> = ({ workspaceName, attachmentsFolder, workbooks, engine, busy, error, onCreate, onBlank, onOpenFile, onOpen, onDelete }) => {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<SheetAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pictures = attachments.filter((a) => a.kind === 'image').length;
  const canSee = engine.engine === 'claude' || engine.engine === 'codex';
  const ready = (prompt.trim() !== '' || attachments.length > 0) && !busy;

  const addPaths = (paths: string[]): void => {
    const items = paths.map(attachmentFromPath).filter((item): item is SheetAttachment => item !== null);
    setFileError(items.length < paths.length ? 'Some files were skipped: use pictures, PDF, Word, Excel, CSV or text files.' : null);
    setAttachments((current) => [...current, ...items].slice(0, MAX_ATTACHMENT_COUNT));
  };
  const addFiles = async (files: File[]): Promise<void> => {
    try {
      addPaths(await Promise.all(files.map((file) => saveDropped(file, attachmentsFolder))));
    } catch (failure) {
      setFileError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const pick = async (): Promise<void> => {
    const chosen = await open({ multiple: true, filters: [{ name: 'Pictures and documents', extensions: [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS] }] });
    if (chosen) addPaths(Array.isArray(chosen) ? chosen : [chosen]);
  };
  const openFile = async (): Promise<void> => {
    const chosen = await open({ multiple: false, filters: FILE_FILTERS });
    if (chosen && !Array.isArray(chosen)) onOpenFile(chosen);
  };
  const submit = (): void => {
    if (ready) onCreate(prompt.trim(), attachments);
  };

  return (
    <div
      className="sh-home"
      data-dragging={dragging || undefined}
      onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { dragDepth.current += 1; setDragging(true); } }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        // A spreadsheet dropped on the home opens; anything else becomes material.
        const sheet = files.find((file) => /\.(xlsx|xlsm|xls|ods|csv|tsv)$/i.test(file.name) && (file as File & { path?: string }).path);
        if (sheet && files.length === 1) onOpenFile((sheet as File & { path?: string }).path!);
        else if (!busy) void addFiles(files);
      }}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.stopPropagation();
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <div className="sh-home__inner">
        <header className="sh-home__head">
          <div>
            <div className="sh-home__kicker">{workspaceName}</div>
            <h1 className="sh-home__title">New workbook</h1>
          </div>
          <div className="sh-home__actions">
            <button type="button" className="sx-btn" disabled={busy} onClick={() => void openFile()}><FileArrowUp size={14} /> Open Excel file</button>
            <button type="button" className="sx-btn" disabled={busy} onClick={onBlank}><Plus size={14} /> Blank workbook</button>
          </div>
        </header>

        <label className="sh-home__ask" htmlFor="sh-composer-input">Describe a workbook, or drop a photo or file</label>
        <div className="sh-composer" data-busy={busy || undefined}>
          <textarea
            id="sh-composer-input"
            ref={textarea}
            className="sh-composer__input"
            dir="auto"
            value={prompt}
            disabled={busy}
            autoFocus
            placeholder="A weekly timesheet for five people with hours per day, overtime over 40 hours and a total pay column at a rate I can change in one cell."
            onChange={(event) => setPrompt(event.target.value)}
            onPaste={(event) => {
              const pasted = Array.from(event.clipboardData.files);
              if (pasted.length > 0) {
                event.preventDefault();
                void addFiles(pasted);
              }
            }}
          />
          {attachments.length > 0 && (
            <div className="sh-chips">
              {attachments.map((item) => (
                <span key={item.id} className="sh-chip" title={item.path}>
                  {item.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
                  <span className="sh-chip__name">{item.name}</span>
                  <button type="button" aria-label={`Remove ${item.name}`} disabled={busy} onClick={() => setAttachments((current) => current.filter((a) => a.id !== item.id))}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          {pictures > 0 && !canSee && <p className="sh-home__warn">The chosen engine cannot look at pictures. Switch to Claude Code or Codex in the studio settings.</p>}
          <div className="sh-composer__bar">
            <button type="button" className="sx-btn sx-btn--quiet" disabled={busy || attachments.length >= MAX_ATTACHMENT_COUNT} onClick={() => void pick()} title="Photos, PDFs, Word, Excel and CSV files become the content">
              <Paperclip size={14} /> Add files
            </button>
            <span className="sh-composer__spacer" />
            <button type="button" className="sx-btn sx-btn--primary" disabled={!ready} onClick={submit} title="Ctrl+Enter">
              Build workbook <ArrowRight size={13} weight="bold" />
            </button>
          </div>
        </div>
        {error && <p className="sh-home__error">{error}</p>}
        {fileError && <p className="sh-home__error">{fileError}</p>}

        {!busy && !prompt.trim() && (
          <div className="sh-home__hints">
            <span className="sh-examples">
              <span className="sh-examples__label">Try</span>
              {EXAMPLES.map((example) => (
                <button key={example.label} type="button" className="sh-examples__item" title={example.prompt} onClick={() => { setPrompt(example.prompt); textarea.current?.focus(); }}>{example.label}</button>
              ))}
            </span>
            <span className="sh-home__keys">Ctrl+Enter to start</span>
          </div>
        )}

        {workbooks.length > 0 && (
          <section className="sh-home__section">
            <h2 className="sh-home__heading">Recent</h2>
            <div className="sh-books">
              {workbooks.slice(0, 12).map((book) => (
                <div key={book.path} className="sh-book">
                  <button type="button" className="sh-book__open" disabled={busy || confirming === book.path} onClick={() => onOpen(book.path)} title={book.path}>
                    <span className="sh-book__cover" aria-hidden="true">
                      {book.preview.length > 0 ? (
                        <table>
                          <tbody>
                            {book.preview.slice(0, 6).map((row, r) => (
                              <tr key={r}>{row.slice(0, 5).map((cell, c) => <td key={c} className={r === 0 ? 'is-head' : undefined}>{cell}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      ) : <span className="sh-book__blank">{book.title}</span>}
                    </span>
                    <span className="sh-book__name" dir="auto">{book.title}</span>
                    <span className="sh-book__meta">{book.sheets > 0 ? `${book.sheets} sheet${book.sheets === 1 ? '' : 's'} · ` : ''}{relativeTime(book.modifiedAt)}</span>
                  </button>
                  {confirming === book.path ? (
                    <span className="sh-book__confirm" onKeyDown={(event) => { if (event.key === 'Escape') setConfirming(null); }}>
                      <span>Delete this workbook?</span>
                      <span>
                        <button type="button" className="sx-btn sx-btn--sm" onClick={() => setConfirming(null)}>Keep</button>
                        <button type="button" className="sx-btn sx-btn--sm sx-btn--danger" onClick={() => { setConfirming(null); onDelete(book.path); }}>Delete</button>
                      </span>
                    </span>
                  ) : (
                    <button type="button" className="sh-book__delete" aria-label={`Delete ${book.title}`} disabled={busy} onClick={() => setConfirming(book.path)}><Trash size={12} /></button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      {dragging && <div className="sh-drop" aria-hidden="true">Drop a photo or a file to build from it</div>}
    </div>
  );
};
