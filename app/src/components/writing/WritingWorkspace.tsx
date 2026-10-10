import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { open } from '@tauri-apps/plugin-dialog';
import { CaretRight, Export, Minus, Plus, SidebarSimple } from '@phosphor-icons/react';
import { useWritingSessionStore, selectSession } from '../../stores/writingSessionStore';
import { useWritingStore } from '../../stores/writingStore';
import { createBrief, createDoc, fileName, parentPath, reportPath } from '../../utils/writing/document';
import { importDocx } from '../../utils/writing/docxImport';
import { blocksToMarkdown, countWords } from '../../utils/writing/markdown';
import type { RewriteAction } from '../../utils/writing/prompts';
import { getReportType, newSectionId } from '../../utils/writing/reportTypes';
import type { DocNode, OutlineSection, Reference, ReportBrief, ReportDetails } from '../../utils/writing/types';
import type { WorkspaceConfig } from '../../types';
import { AssistantPanel } from './AssistantPanel';
import { DesignPanel } from './DesignPanel';
import { ExportDialog } from './ExportDialog';
import { PagedEditor } from './editor/PagedEditor';
import { findSectionRange, lintKey } from './editor/extensions';
import { pageCount, pageOfElement } from './editor/pageGeometry';
import { OutlinePanel } from './OutlinePanel';
import { ReferencesPanel } from './ReferencesPanel';
import { ReportComposer } from './ReportComposer';
import { ReviewCard, type ReviewState } from './ReviewCard';
import { SelectionMenu } from './SelectionMenu';
import { StudioToolbar } from './StudioToolbar';
import { applyRewrite, captureSelection, type RewriteTarget } from './rewriteSelection';
import { Toast, formatElapsed, type ToastMessage } from './ui';
import { replaceSectionBody, rewriteToBlocks, sectionBodyJson, setStreamingSection, useReportGenerator } from './useReportGenerator';
import { useWritingDocument } from './useWritingDocument';
import { WritingHome } from './WritingHome';
import './writing.css';

interface WritingWorkspaceProps {
  workspace: WorkspaceConfig;
  visible: boolean;
}

type PanelId = 'assistant' | 'design' | 'references';

const PANELS: Array<{ id: PanelId; label: string }> = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'design', label: 'Design' },
  { id: 'references', label: 'References' },
];

const EMPTY_DOC: DocNode = { type: 'doc', content: [{ type: 'paragraph' }] };

export const WritingWorkspace: React.FC<WritingWorkspaceProps> = ({ workspace, visible }) => {
  const workspaceId = workspace.id;
  const session = useWritingSessionStore(selectSession(workspaceId));
  const updateSession = useWritingSessionStore((state) => state.update);

  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const getEditor = useCallback(() => editorRef.current, []);
  const onReady = useCallback((instance: Editor | null) => {
    editorRef.current = instance;
    setEditor(instance);
  }, []);

  const documents = useWritingDocument(workspaceId, workspace.path, getEditor);
  const generator = useReportGenerator(workspaceId, getEditor);

  const [composerType, setComposerType] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  /** The planned report is being written to disk. */
  const [creating, setCreating] = useState(false);
  const [panel, setPanel] = useState<PanelId | null>('assistant');
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lintEnabled, setLintEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [wordCount, setWordCount] = useState(0);
  const [pages, setPages] = useState({ current: 1, total: 1 });
  const [review, setReview] = useState<ReviewState | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const reviewTarget = useRef<RewriteTarget | null>(null);
  const pendingStart = useRef<string | null>(null);
  const pendingImport = useRef<{ key: string; html: string } | null>(null);
  const restored = useRef(false);

  const hasDoc = Boolean(session.docPath && session.brief);
  const docDir = session.docPath ? parentPath(session.docPath) : '';
  const busy = session.run?.phase === 'writing' || session.run?.phase === 'outline';
  const showToast = useCallback((text: string, action?: ToastMessage['action']) => setToast({ id: Date.now(), text, action }), []);
  const closeToast = useCallback(() => setToast(null), []);

  // Reopen the last report once the list is known.
  useEffect(() => {
    if (restored.current || documents.loadingList) return;
    restored.current = true;
    const last = useWritingStore.getState().lastDocByWorkspace[workspaceId];
    if (last && documents.reports.some((report) => report.path === last)) void documents.openReport(last);
  }, [documents, workspaceId]);

  // A new report or an import arms one of these; the next loaded document consumes it.
  const armedStart = useRef(false);
  const armedImport = useRef<string | null>(null);
  useEffect(() => {
    const key = documents.pendingContent?.key;
    if (!key) return;
    if (armedImport.current !== null) {
      pendingImport.current = { key, html: armedImport.current };
      armedImport.current = null;
    }
    if (armedStart.current) {
      pendingStart.current = key;
      armedStart.current = false;
    }
  }, [documents.pendingContent]);

  // Once that document is in the editor: insert the imported text, or start writing.
  useEffect(() => {
    const key = documents.pendingContent?.key;
    const instance = editorRef.current;
    if (!key || !instance) return;
    if (pendingImport.current?.key === key) {
      const { html } = pendingImport.current;
      pendingImport.current = null;
      instance.commands.setContent(html, { emitUpdate: false });
      // Imported chapters become outline sections so they can be rewritten section by section.
      const outline: OutlineSection[] = [];
      const tr = instance.state.tr;
      instance.state.doc.forEach((node, offset) => {
        if (node.type.name === 'heading' && node.attrs.level === 1) {
          const id = newSectionId();
          const title = node.textContent.trim() || 'Section';
          const unnumbered = /^(abstract|acknowledg|references|bibliography|appendix|executive summary)/i.test(title);
          outline.push({ id, title, notes: '', targetWords: 0, subsections: [], unnumbered });
          tr.setNodeMarkup(offset, undefined, { ...node.attrs, sectionId: id, unnumbered });
        }
      });
      tr.setMeta('addToHistory', false);
      instance.view.dispatch(tr);
      updateSession(workspaceId, { outline });
      void documents.save();
    }
    if (pendingStart.current === key) {
      pendingStart.current = null;
      void generator.generateSections();
    } else {
      // Photos the writer asked for before the report was last closed.
      void generator.fillPictures();
    }
  }, [documents, documents.pendingContent, editor, generator, updateSession, workspaceId]);

  // Word count and page position.
  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    let timer = 0;
    const measure = (): void => {
      if (editor.isDestroyed) return;
      setWordCount(countWords([editor.getJSON() as DocNode]));
      const root = editor.view.dom as HTMLElement;
      const total = pageCount(root);
      const dom = editor.view.domAtPos(editor.state.selection.from).node;
      const element = dom instanceof Element ? dom : dom.parentElement;
      setPages({ current: element ? Math.min(total, pageOfElement(root, element)) : 1, total });
    };
    const update = (props?: { transaction?: Transaction }): void => {
      // AI writes arrive several times a second: count at most twice a second meanwhile.
      if (props?.transaction?.getMeta('aiStreamWrite')) {
        if (!timer) timer = window.setTimeout(() => { timer = 0; measure(); }, 500);
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    update();
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      editor.off('update', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  // Lint highlighting follows the toggle and the banned-phrase list.
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(lintKey, { enabled: lintEnabled, phrases: session.brief?.humanizer.bannedPhrases ?? [] }).setMeta('addToHistory', false));
  }, [editor, lintEnabled, session.brief?.humanizer.bannedPhrases]);

  // The cover page follows the Design choice.
  const cover = session.brief?.style.cover;
  useEffect(() => {
    if (!editor || !cover) return;
    const first = editor.state.doc.firstChild;
    const hasCover = first?.type.name === 'coverPage';
    const wantCover = cover !== 'none';
    if (wantCover === hasCover) return;
    const tr = editor.state.tr;
    if (wantCover) tr.insert(0, editor.schema.nodes.coverPage.create());
    else tr.delete(0, first!.nodeSize);
    editor.view.dispatch(tr.setMeta('addToHistory', false));
  }, [editor, cover, documents.pendingContent?.key]);

  // The finishing moment.
  const previousPhase = useRef(session.run?.phase);
  useEffect(() => {
    const phase = session.run?.phase;
    if (previousPhase.current === 'writing' && phase === 'done' && session.run) {
      const seconds = ((session.run.endedAt ?? Date.now()) - session.run.startedAt) / 1000;
      if (session.run.wordsWritten > 0) showToast(`Written · ${session.run.wordsWritten.toLocaleString()} words in ${formatElapsed(seconds)}`);
      void documents.save();
    }
    previousPhase.current = phase;
  }, [documents, session.run, showToast]);

  // Keyboard: save and export.
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || !hasDoc) return;
      const key = event.key.toLowerCase();
      if (key === 's' && !event.shiftKey) {
        event.preventDefault();
        void documents.save();
      } else if (key === 'e' && event.shiftKey) {
        event.preventDefault();
        setExporting(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [documents, hasDoc, visible]);

  // Creating -----------------------------------------------------------------

  const commission = useCallback((brief: ReportBrief, outline: OutlineSection[], bibliography: Reference[]): void => {
    armedStart.current = true;
    setCreating(true);
    documents.createReport(createDoc(brief, outline, bibliography))
      .then(() => setComposerType(null))
      .catch((error: unknown) => {
        armedStart.current = false;
        setComposerError(`Could not create the report: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => setCreating(false));
  }, [documents]);

  /** Plans the report with the AI, then creates it and starts writing. */
  const writeReport = useCallback(async (brief: ReportBrief, bibliography: Reference[]): Promise<void> => {
    setComposerError(null);
    const design = await generator.generateOutline(brief, bibliography);
    if (!design) {
      const run = useWritingSessionStore.getState().sessions[workspaceId]?.run;
      if (run?.phase !== 'cancelled') setComposerError(run?.error ?? 'The writer could not plan this report.');
      return;
    }
    const titled: ReportBrief = design.title
      ? { ...brief, details: { ...brief.details, title: design.title.title, subtitle: brief.details.subtitle || design.title.subtitle } }
      : brief;
    commission(titled, design.outline, bibliography);
  }, [commission, generator, workspaceId]);

  const goHome = useCallback(async (): Promise<void> => {
    if (busy) generator.cancel();
    setReview(null);
    setExporting(false);
    await documents.closeReport();
  }, [busy, documents, generator]);

  const importWord = useCallback(async (fromPath?: string): Promise<void> => {
    const picked = fromPath ?? await open({ multiple: false, defaultPath: workspace.path, filters: [{ name: 'Word document', extensions: ['docx'] }] });
    if (typeof picked !== 'string') return;
    const title = fileName(picked).replace(/\.docx$/i, '');
    const brief = createBrief('custom', null, useWritingStore.getState().defaultEngine);
    brief.details.title = title;
    brief.style.cover = 'none';
    brief.style.includeToc = false;
    const taken = new Set(documents.reports.map((report) => report.path.toLowerCase()));
    const path = reportPath(workspace.path, title, taken);
    try {
      const imported = await importDocx(picked, parentPath(path));
      if (imported.title) brief.details.title = imported.title;
      if (/<nav data-toc/.test(imported.html)) brief.style.includeToc = true;
      const doc = createDoc(brief, [], []);
      doc.content = EMPTY_DOC;
      armedImport.current = imported.html;
      setComposerType(null);
      await documents.createReport(doc);
      if (imported.warnings.length > 0) console.warn('Word import warnings:', imported.warnings);
    } catch (error) {
      armedImport.current = null;
      showToast(`Could not import ${fileName(picked)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [documents, showToast, workspace.path]);

  // Requests from the Files view: open a report, or import a Word document.
  const request = useWritingSessionStore((state) => state.requests[workspaceId]);
  useEffect(() => {
    if (!request || documents.loadingList) return;
    useWritingSessionStore.getState().clearRequest(workspaceId);
    restored.current = true;
    setComposerType(null);
    if (request.kind === 'open') void documents.openReport(request.path);
    else void importWord(request.path);
  }, [documents, importWord, request, workspaceId]);

  // Editing the brief ----------------------------------------------------------

  const setBrief = useCallback((patch: Partial<ReportBrief>) => {
    updateSession(workspaceId, (current) => (current.brief ? { brief: { ...current.brief, ...patch }, dirty: true } : {}));
  }, [updateSession, workspaceId]);

  const setDetails = useCallback((patch: Partial<ReportDetails>) => {
    updateSession(workspaceId, (current) => (current.brief ? { brief: { ...current.brief, details: { ...current.brief.details, ...patch } }, dirty: true } : {}));
  }, [updateSession, workspaceId]);

  // Review flow -------------------------------------------------------------

  const runReview = useCallback(async (action: RewriteAction, target: RewriteTarget, instruction?: string): Promise<void> => {
    reviewTarget.current = target;
    setReview({ action, instruction, before: target.before, after: '', status: 'running', error: null });
    const result = await generator.rewrite({
      action,
      passage: target.passage,
      sectionTitle: target.sectionTitle,
      instruction,
      onText: (text) => setReview((current) => (current ? { ...current, after: text } : current)),
    });
    setReview((current) => (current ? {
      ...current,
      after: result.ok ? result.text : current.after,
      status: result.ok ? 'done' : 'failed',
      error: result.ok ? null : result.error,
    } : current));
  }, [generator]);

  const onSelectionAction = useCallback((action: RewriteAction, instruction?: string) => {
    const instance = editorRef.current;
    if (!instance) return;
    const target = captureSelection(instance, action);
    if (target) void runReview(action, target, instruction);
  }, [runReview]);

  const sectionTarget = useCallback((): RewriteTarget | null => {
    const instance = editorRef.current;
    const current = useWritingSessionStore.getState().sessions[workspaceId];
    if (!instance || !current) return null;
    let id: string | null = null;
    const { from } = instance.state.selection;
    instance.state.doc.forEach((node, offset) => {
      if (offset <= from && node.type.name === 'heading' && node.attrs.sectionId) id = node.attrs.sectionId as string;
    });
    if (!id) return null;
    const range = findSectionRange(instance.state.doc, id);
    if (!range) return null;
    return {
      kind: 'blocks',
      from: range.bodyFrom,
      to: range.to,
      passage: blocksToMarkdown(sectionBodyJson(instance, id)),
      before: instance.state.doc.textBetween(range.bodyFrom, range.to, '\n\n', ' '),
      sectionTitle: current.outline.find((section) => section.id === id)?.title,
    };
  }, [workspaceId]);

  const onInstruction = useCallback((action: RewriteAction, instruction: string) => {
    const instance = editorRef.current;
    if (!instance) return;
    const selection = instance.state.selection.empty ? null : captureSelection(instance, action);
    const target = selection ?? sectionTarget();
    if (!target) {
      showToast('Put the cursor in a section or select text first.');
      return;
    }
    void runReview(action, target, instruction || undefined);
  }, [runReview, sectionTarget, showToast]);

  const humanizeAll = useCallback(async () => {
    const instance = editorRef.current;
    const current = useWritingSessionStore.getState().sessions[workspaceId];
    if (!instance || !current) return;
    const store = useWritingSessionStore.getState();
    store.updateRun(workspaceId, { phase: 'writing', startedAt: Date.now(), endedAt: null, error: null, calls: [], wordsWritten: 0, sectionStatus: Object.fromEntries(current.outline.map((section) => [section.id, 'queued' as const])) });
    for (const section of current.outline) {
      const blocks = sectionBodyJson(instance, section.id);
      if (countWords(blocks) < 30) {
        store.updateRun(workspaceId, (run) => ({ sectionStatus: { ...run.sectionStatus, [section.id]: 'done' } }));
        continue;
      }
      store.updateRun(workspaceId, (run) => ({ currentSectionId: section.id, sectionStatus: { ...run.sectionStatus, [section.id]: 'writing' } }));
      setStreamingSection(instance, section.id);
      const result = await generator.rewrite({ action: 'humanize', passage: blocksToMarkdown(blocks), sectionTitle: section.title });
      setStreamingSection(instance, null);
      if (!result.ok) {
        store.updateRun(workspaceId, (run) => ({ phase: result.cancelled ? 'cancelled' : 'failed', endedAt: Date.now(), error: result.error, sectionStatus: { ...run.sectionStatus, [section.id]: result.cancelled ? 'cancelled' : 'failed' } }));
        return;
      }
      replaceSectionBody(instance, section.id, rewriteToBlocks(result.text), true);
      void generator.fillPictures();
      store.updateRun(workspaceId, (run) => ({ wordsWritten: run.wordsWritten + countWords(rewriteToBlocks(result.text)), sectionStatus: { ...run.sectionStatus, [section.id]: 'done' } }));
    }
    store.updateRun(workspaceId, { phase: 'done', endedAt: Date.now(), currentSectionId: null });
    documents.scheduleSave();
  }, [documents, generator, workspaceId]);

  const exportSource = useMemo(() => (exporting && session.brief && editorRef.current ? {
    brief: session.brief,
    bibliography: session.bibliography,
    content: editorRef.current.getJSON() as DocNode,
    docDir,
  } : null), [docDir, exporting, session.bibliography, session.brief]);

  const title = session.brief?.details.title || session.meta?.title || 'Untitled';
  const saveState = session.error ? session.error : session.saving ? 'Saving…' : session.dirty ? 'Edited' : 'Saved';
  const current = session.outline.find((section) => section.id === session.run?.currentSectionId);
  const composing = !hasDoc && (session.run?.phase === 'outline' || creating);

  return (
    <div className="wr-root" aria-hidden={!visible}>
      {hasDoc && session.brief ? (
        <div className="wr-studio">
          <header className="wr-topbar">
            <button type="button" className={`wr-icon${outlineOpen ? ' is-on' : ''}`} title="Outline" aria-label="Toggle outline" aria-pressed={outlineOpen} onClick={() => setOutlineOpen((value) => !value)}>
              <SidebarSimple size={15} />
            </button>
            <nav className="wr-crumbs" aria-label="Location">
              <button type="button" className="wr-crumbs__link" onClick={() => void goHome()}>Documents</button>
              <CaretRight size={10} className="wr-crumbs__sep" />
              <input
                className="wr-crumbs__title"
                value={session.brief.details.title}
                placeholder={session.meta?.title || 'Untitled'}
                aria-label="Title"
                size={Math.max(8, Math.min(60, (session.brief.details.title || title).length + 1))}
                onChange={(event) => setDetails({ title: event.target.value })}
                onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
              />
            </nav>
            <span className={`wr-save${session.error ? ' is-error' : ''}`} title={session.lastSavedAt ? `Saved ${new Date(session.lastSavedAt).toLocaleTimeString()}` : undefined}>{saveState}</span>
            <span className="wr-spacer" />
            <div className="wr-seg" role="tablist" aria-label="Side panel">
              {PANELS.map((entry) => (
                <button key={entry.id} type="button" role="tab" aria-selected={panel === entry.id} className="wr-seg__item" onClick={() => setPanel((value) => (value === entry.id ? null : entry.id))}>
                  {entry.label}
                </button>
              ))}
            </div>
            <button type="button" className="wr-btn wr-btn--primary" onClick={() => setExporting(true)} title="Export (Ctrl+Shift+E)"><Export size={13} /> Export</button>
          </header>

          <StudioToolbar editor={editor} style={session.brief.style} bibliography={session.bibliography} onOpenReferences={() => setPanel('references')} />

          <div className="wr-studio__body">
            {outlineOpen && (
              <OutlinePanel editor={editor} run={session.run} busy={busy} onWriteSection={(sectionId) => void generator.generateSections({ sectionIds: [sectionId] })} />
            )}
            <div className="wr-desk">
              <div className="wr-desk__inner">
                <PagedEditor
                  workspaceId={workspaceId}
                  docDir={docDir}
                  contentKey={documents.pendingContent?.key ?? 'empty'}
                  content={documents.pendingContent?.content ?? EMPTY_DOC}
                  style={session.brief.style}
                  title={title}
                  hasCover={session.brief.style.cover !== 'none'}
                  zoom={zoom}
                  editable
                  onReady={onReady}
                  onChange={documents.scheduleSave}
                  onDispose={documents.saveOnDispose}
                />
              </div>
            </div>
            {panel && (
              <aside className="wr-panel" aria-label={PANELS.find((entry) => entry.id === panel)?.label}>
                {panel === 'assistant' && (
                  <AssistantPanel
                    editor={editor}
                    session={session}
                    lintEnabled={lintEnabled}
                    onToggleLint={() => setLintEnabled((value) => !value)}
                    onWriteRemaining={() => void generator.generateSections({ skipWritten: true })}
                    onRewriteAll={() => void generator.generateSections()}
                    onHumanizeAll={() => void humanizeAll()}
                    onCancel={generator.cancel}
                    onInstruction={onInstruction}
                    onBriefChange={setBrief}
                  />
                )}
                {panel === 'design' && (
                  <DesignPanel
                    style={session.brief.style}
                    busy={busy}
                    onChange={(style) => setBrief({ style })}
                    onRestyle={generator.restyle}
                    onCancel={generator.cancel}
                  />
                )}
                {panel === 'references' && (
                  <ReferencesPanel
                    editor={editor}
                    bibliography={session.bibliography}
                    citationStyle={session.brief.style.citationStyle}
                    sourceFiles={session.brief.details.sourceFiles}
                    workspacePath={workspace.path}
                    onBibliographyChange={(bibliography) => updateSession(workspaceId, { bibliography, dirty: true })}
                    onCitationStyleChange={(citationStyle) => setBrief({ style: { ...session.brief!.style, citationStyle } })}
                    onSourceFilesChange={(sourceFiles) => setDetails({ sourceFiles })}
                  />
                )}
              </aside>
            )}
          </div>

          <footer className="wr-status">
            {busy && session.run?.phase === 'writing' ? (
              <span className="wr-status__item wr-status__run">
                <span className="wr-pulse" aria-hidden="true" /> Writing{current ? ` ${current.title}` : '…'}
                <button type="button" className="wr-link" onClick={generator.cancel}>Stop</button>
              </span>
            ) : (
              <span className="wr-status__item">{getReportType(session.brief.typeId).name}</span>
            )}
            <span className="wr-status__item">Page {pages.current} of {pages.total}</span>
            <span className="wr-status__item">{wordCount.toLocaleString()} words</span>
            <span className="wr-spacer" />
            <span className="wr-status__zoom">
              <button type="button" className="wr-icon wr-icon--sm" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}><Minus size={11} /></button>
              <button type="button" className="wr-status__pct" title="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" className="wr-icon wr-icon--sm" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2, Math.round((value + 0.1) * 10) / 10))}><Plus size={11} /></button>
            </span>
          </footer>

          {editor && <SelectionMenu editor={editor} busy={busy || review?.status === 'running'} onAction={onSelectionAction} />}
        </div>
      ) : composerType ? (
        <ReportComposer
          key={composerType}
          typeId={composerType}
          workspacePath={workspace.path}
          busy={composing}
          startedAt={composing ? session.run?.startedAt ?? null : null}
          error={composerError}
          onBack={() => { setComposerType(null); setComposerError(null); }}
          onWrite={(brief, bibliography) => void writeReport(brief, bibliography)}
          onCancel={generator.cancel}
        />
      ) : (
        <WritingHome
          workspaceName={workspace.name}
          reports={documents.reports}
          loading={documents.loadingList}
          onPick={(typeId) => { setComposerError(null); setComposerType(typeId); }}
          onOpen={(path) => void documents.openReport(path)}
          onImport={() => void importWord()}
          onDelete={(path) => void documents.deleteReport(path)}
        />
      )}

      {exporting && exportSource && (
        <ExportDialog
          source={exportSource}
          title={title}
          onClose={() => setExporting(false)}
          onExported={(path) => showToast(`Exported ${fileName(path)}`)}
        />
      )}

      {review && (
        <ReviewCard
          review={review}
          bannedPhrases={session.brief?.humanizer.bannedPhrases ?? []}
          onAccept={() => {
            const instance = editorRef.current;
            if (!instance || !reviewTarget.current) return;
            if (!applyRewrite(instance, reviewTarget.current, review.after, review.action)) {
              setReview((value) => (value ? { ...value, status: 'failed', error: 'The text changed under the selection. Select it again and retry.' } : value));
              return;
            }
            setReview(null);
            void generator.fillPictures();
            showToast('Change applied', { label: 'Undo', run: () => editorRef.current?.chain().focus().undo().run() });
          }}
          onRetry={() => { if (reviewTarget.current) void runReview(review.action, reviewTarget.current, review.instruction); }}
          onDiscard={() => { if (review.status === 'running') generator.cancel(); setReview(null); }}
        />
      )}

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
};

export default WritingWorkspace;
