import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { open } from '@tauri-apps/plugin-dialog';
import { Export, FloppyDisk, Minus, Plus, SidebarSimple, Sparkle } from '@phosphor-icons/react';
import SwipeToast from '../reactbits/SwipeToast';
import { useAppStore } from '../../stores/appStore';
import { useWritingSessionStore, selectSession } from '../../stores/writingSessionStore';
import { useWritingStore } from '../../stores/writingStore';
import { createBrief, createDoc, fileName, parentPath, reportPath } from '../../utils/writing/document';
import { importDocx } from '../../utils/writing/docxImport';
import { blocksToMarkdown, countWords } from '../../utils/writing/markdown';
import type { RewriteAction } from '../../utils/writing/prompts';
import { newSectionId } from '../../utils/writing/reportTypes';
import type { DocNode, OutlineSection, Reference, ReportBrief, ReportProfile } from '../../utils/writing/types';
import type { WorkspaceConfig } from '../../types';
import { AiPanel, type AiPanelTab } from './AiPanel';
import { ExportDialog } from './ExportDialog';
import { PagedEditor } from './editor/PagedEditor';
import { findSectionRange, lintKey } from './editor/extensions';
import { pageCount, pageOfElement } from './editor/pageGeometry';
import { ReportsSidebar } from './ReportsSidebar';
import { ReviewCard, type ReviewState } from './ReviewCard';
import { Ribbon } from './Ribbon';
import { SelectionMenu } from './SelectionMenu';
import { applyRewrite, captureSelection, type RewriteTarget } from './rewriteSelection';
import { replaceSectionBody, sectionBodyJson, setStreamingSection, useReportGenerator, rewriteToBlocks } from './useReportGenerator';
import { useWritingDocument } from './useWritingDocument';
import { CommissionWizard, type OutlineResult } from './wizard/CommissionWizard';
import { WritingHero } from './WritingHero';
import './writing.css';

interface WritingWorkspaceProps {
  workspace: WorkspaceConfig;
  visible: boolean;
}

interface Toast {
  title: string;
  description: string;
}

const EMPTY_DOC: DocNode = { type: 'doc', content: [{ type: 'paragraph' }] };

export const WritingWorkspace: React.FC<WritingWorkspaceProps> = ({ workspace, visible }) => {
  const workspaceId = workspace.id;
  const session = useWritingSessionStore(selectSession(workspaceId));
  const updateSession = useWritingSessionStore((state) => state.update);
  const profiles = useWritingStore((state) => state.profiles);
  const animations = useAppStore((state) => state.animationsEnabled);

  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const getEditor = useCallback(() => editorRef.current, []);
  const onReady = useCallback((instance: Editor | null) => {
    editorRef.current = instance;
    setEditor(instance);
  }, []);

  const documents = useWritingDocument(workspaceId, workspace.path, getEditor);
  const generator = useReportGenerator(workspaceId, getEditor);

  const [wizard, setWizard] = useState<{ profile: ReportProfile | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [aiTab, setAiTab] = useState<AiPanelTab>('write');
  const [lintEnabled, setLintEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [wordCount, setWordCount] = useState(0);
  const [pages, setPages] = useState({ current: 1, total: 1 });
  const [review, setReview] = useState<ReviewState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sheen, setSheen] = useState(0);
  const reviewTarget = useRef<RewriteTarget | null>(null);
  const reviewApplied = useRef(false);
  const pendingStart = useRef<string | null>(null);
  const pendingImport = useRef<{ key: string; html: string } | null>(null);
  const restored = useRef(false);
  const deskRef = useRef<HTMLDivElement>(null);

  const hasDoc = Boolean(session.docPath && session.brief);
  const docDir = session.docPath ? parentPath(session.docPath) : '';
  const busy = session.run?.phase === 'writing' || session.run?.phase === 'outline';

  // Reopen the last report, or invite a first commission.
  useEffect(() => {
    if (restored.current || documents.loadingList) return;
    restored.current = true;
    const last = useWritingStore.getState().lastDocByWorkspace[workspaceId];
    if (last && documents.reports.some((report) => report.path === last)) void documents.openReport(last);
    else if (documents.reports.length === 0 && useWritingStore.getState().openWizardOnStart) setWizard({ profile: null });
  }, [documents, workspaceId]);

  // A commission or import arms one of these; the next loaded document consumes it.
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
    }
  }, [documents, documents.pendingContent, editor, generator, updateSession, workspaceId]);

  // Word count and page position.
  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setWordCount(countWords([editor.getJSON() as DocNode]));
        const root = editor.view.dom as HTMLElement;
        const total = pageCount(root);
        const { from } = editor.state.selection;
        const dom = editor.view.domAtPos(from).node;
        const element = dom instanceof Element ? dom : dom.parentElement;
        setPages({ current: element ? Math.min(total, pageOfElement(root, element)) : 1, total });
      });
    };
    update();
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    return () => {
      cancelAnimationFrame(frame);
      editor.off('update', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  // Lint highlighting follows the toggle and the banned-phrase list.
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(lintKey, { enabled: lintEnabled, phrases: session.brief?.humanizer.bannedPhrases ?? [] }).setMeta('addToHistory', false));
  }, [editor, lintEnabled, session.brief?.humanizer.bannedPhrases]);

  // The finishing moment.
  const previousPhase = useRef(session.run?.phase);
  useEffect(() => {
    const phase = session.run?.phase;
    if (previousPhase.current === 'writing' && phase === 'done' && session.run) {
      const seconds = Math.max(1, Math.round(((session.run.endedAt ?? Date.now()) - session.run.startedAt) / 1000));
      setToast({
        title: 'Report written',
        description: `${session.run.wordsWritten.toLocaleString()} words in ${seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`} · ${pages.total} pages`,
      });
      setSheen((value) => value + 1);
      void documents.save();
    }
    previousPhase.current = phase;
  }, [documents, pages.total, session.run]);

  // Keyboard: save and export.
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || !hasDoc) return;
      if (event.key.toLowerCase() === 's' && !event.shiftKey) {
        event.preventDefault();
        void documents.save();
      } else if (event.key.toLowerCase() === 'e' && event.shiftKey) {
        event.preventDefault();
        setExporting(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [documents, hasDoc, visible]);

  const designOutline = useCallback(async (brief: ReportBrief, bibliography: Reference[]): Promise<OutlineResult> => {
    const outline = await generator.generateOutline(brief, bibliography);
    const error = useWritingSessionStore.getState().sessions[workspaceId]?.run?.error ?? null;
    return { outline, error };
  }, [generator, workspaceId]);

  const commission = useCallback((brief: ReportBrief, outline: OutlineSection[], bibliography: Reference[]): void => {
    setWizard(null);
    armedStart.current = true;
    documents.createReport(createDoc(brief, outline, bibliography)).catch((error: unknown) => {
      armedStart.current = false;
      updateSession(workspaceId, { error: `Could not create the report: ${error instanceof Error ? error.message : String(error)}` });
    });
  }, [documents, updateSession, workspaceId]);

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
      await documents.createReport(doc);
      if (imported.warnings.length > 0) console.warn('Word import warnings:', imported.warnings);
    } catch (error) {
      armedImport.current = null;
      updateSession(workspaceId, { error: `Could not import ${fileName(picked)}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, [documents, updateSession, workspace.path, workspaceId]);
  // Requests from the Files view: open a report, or import a Word document.
  const request = useWritingSessionStore((state) => state.requests[workspaceId]);
  useEffect(() => {
    if (!request || documents.loadingList) return;
    useWritingSessionStore.getState().clearRequest(workspaceId);
    restored.current = true;
    setWizard(null);
    if (request.kind === 'open') void documents.openReport(request.path);
    else void importWord(request.path);
  }, [documents, importWord, request, workspaceId]);

  const setBrief = useCallback((patch: Partial<ReportBrief>) => {
    updateSession(workspaceId, (current) => (current.brief ? { brief: { ...current.brief, ...patch }, dirty: true } : {}));
  }, [updateSession, workspaceId]);

  const jumpToSection = useCallback((sectionId: string) => {
    const instance = editorRef.current;
    if (!instance) return;
    const range = findSectionRange(instance.state.doc, sectionId);
    if (!range) return;
    instance.chain().focus().setTextSelection(range.bodyFrom).run();
    const dom = instance.view.nodeDOM(range.from);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Review flow -------------------------------------------------------------

  const runReview = useCallback(async (action: RewriteAction, target: RewriteTarget, instruction?: string): Promise<void> => {
    reviewTarget.current = target;
    reviewApplied.current = false;
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

  const sectionTarget = useCallback((sectionId: string | null): RewriteTarget | null => {
    const instance = editorRef.current;
    const current = useWritingSessionStore.getState().sessions[workspaceId];
    if (!instance || !current) return null;
    let id = sectionId;
    if (!id) {
      const { from } = instance.state.selection;
      instance.state.doc.forEach((node, offset) => {
        if (offset <= from && node.type.name === 'heading' && node.attrs.sectionId) id = node.attrs.sectionId as string;
      });
    }
    if (!id) return null;
    const range = findSectionRange(instance.state.doc, id);
    if (!range) return null;
    const blocks = sectionBodyJson(instance, id);
    return {
      kind: 'blocks',
      from: range.bodyFrom,
      to: range.to,
      passage: blocksToMarkdown(blocks),
      before: instance.state.doc.textBetween(range.bodyFrom, range.to, '\n\n', ' '),
      sectionTitle: current.outline.find((section) => section.id === id)?.title,
    };
  }, [workspaceId]);

  const onInstruction = useCallback((action: RewriteAction, instruction: string, sectionId: string | null) => {
    const instance = editorRef.current;
    if (!instance) return;
    const selection = instance.state.selection.empty ? null : captureSelection(instance, action);
    const target = selection ?? sectionTarget(sectionId);
    if (!target) {
      updateSession(workspaceId, { error: 'Put the cursor in a section, select text, or mention a section with @ first.' });
      return;
    }
    void runReview(action, target, instruction || undefined);
  }, [runReview, sectionTarget, updateSession, workspaceId]);

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

  const title = session.brief?.details.title || session.meta?.title || 'Untitled report';

  return (
    <div className="wr-root" aria-hidden={!visible}>
      {sidebarOpen && (hasDoc || documents.reports.length > 0) && (
        <ReportsSidebar
          reports={documents.reports}
          activePath={session.docPath}
          editor={hasDoc ? editor : null}
          loading={documents.loadingList}
          onOpen={(path) => void documents.openReport(path)}
          onNew={() => setWizard({ profile: null })}
          onImport={() => void importWord()}
          onDelete={(path) => void documents.deleteReport(path)}
        />
      )}

      <div className="wr-shell">
        {hasDoc && session.brief ? (
          <>
            <div className="wr-center">
              <Ribbon
                editor={editor}
                style={session.brief.style}
                title={title}
                bibliography={session.bibliography}
                lintEnabled={lintEnabled}
                readOnly={false}
                onStyleChange={(style) => setBrief({ style })}
                onBibliographyChange={(bibliography) => updateSession(workspaceId, { bibliography, dirty: true })}
                onToggleLint={() => setLintEnabled((value) => !value)}
                onOpenAi={(tab) => { setAiOpen(true); setAiTab(tab); }}
                rightSlot={(
                  <span style={{ display: 'flex', gap: 2 }}>
                    <button type="button" className="wr-icon-btn" title="Show reports" onClick={() => setSidebarOpen((value) => !value)}><SidebarSimple size={15} /></button>
                    <button type="button" className="wr-icon-btn" title="Save (Ctrl S)" onClick={() => void documents.save()}><FloppyDisk size={15} /></button>
                    <button type="button" className="wr-pill-btn" style={{ height: 28 }} onClick={() => setExporting(true)} title="Export (Ctrl Shift E)"><Export size={14} /> Export</button>
                    <button type="button" className={`wr-icon-btn${aiOpen ? ' is-active' : ''}`} title="AI writer" onClick={() => setAiOpen((value) => !value)}><Sparkle size={15} weight={aiOpen ? 'fill' : 'light'} /></button>
                  </span>
                )}
              />
              <div className="wr-desk" ref={deskRef}>
                {sheen > 0 && <div key={sheen} className="wr-sheen" aria-hidden="true" />}
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
              <div className="wr-status">
                <span className="wr-status__item">
                  <span className={`wr-status__dot${session.error ? ' is-error' : session.dirty || session.saving ? ' is-dirty' : ''}`} />
                  {session.error ? session.error : session.saving ? 'Saving…' : session.dirty ? 'Unsaved changes' : session.lastSavedAt ? 'Saved' : 'Up to date'}
                </span>
                <span className="wr-status__item">Page {pages.current} of {pages.total}</span>
                <span className="wr-status__item">{wordCount.toLocaleString()} words · {Math.max(1, Math.round(wordCount / 230))} min read</span>
                <span className="wr-status__item">{session.brief.engine.engine === 'claude' ? 'Claude Code' : session.brief.engine.engine}{session.brief.engine.model ? ` · ${session.brief.engine.model}` : ''}</span>
                <span className="wr-status__spacer" />
                <span className="wr-status__zoom">
                  <button type="button" className="wr-icon-btn" style={{ width: 22, height: 22 }} aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}><Minus size={11} /></button>
                  <input type="range" min={0.5} max={2} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom" />
                  <button type="button" className="wr-icon-btn" style={{ width: 22, height: 22 }} aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2, Math.round((value + 0.1) * 10) / 10))}><Plus size={11} /></button>
                  <span style={{ minWidth: 36, textAlign: 'right' }}>{Math.round(zoom * 100)}%</span>
                </span>
              </div>
            </div>
            {aiOpen && (
              <AiPanel
                editor={editor}
                session={session}
                tab={aiTab}
                lintEnabled={lintEnabled}
                wordCount={wordCount}
                onTab={setAiTab}
                onToggleLint={() => setLintEnabled((value) => !value)}
                onWriteRemaining={() => void generator.generateSections({ skipWritten: true })}
                onRewriteAll={() => void generator.generateSections()}
                onWriteSection={(sectionId) => void generator.generateSections({ sectionIds: [sectionId] })}
                onJumpToSection={jumpToSection}
                onInstruction={onInstruction}
                onHumanizeSection={() => onInstruction('humanize', '', null)}
                onHumanizeAll={() => void humanizeAll()}
                onCancel={generator.cancel}
                onHumanizerChange={(humanizer) => setBrief({ humanizer })}
              />
            )}
            {editor && <SelectionMenu editor={editor} busy={busy || review?.status === 'running'} onAction={onSelectionAction} />}
          </>
        ) : (
          <WritingHero
            workspaceName={workspace.name}
            reports={documents.reports}
            profiles={profiles}
            animations={animations && visible}
            onCommission={(profile) => setWizard({ profile: profile ?? null })}
            onImport={() => void importWord()}
            onOpen={(path) => void documents.openReport(path)}
          />
        )}
      </div>

      <AnimatePresence>
        {wizard && (
          <CommissionWizard
            key="wizard"
            mode="report"
            workspacePath={workspace.path}
            profile={wizard.profile}
            onClose={() => setWizard(null)}
            onDesignOutline={designOutline}
            onCancelOutline={generator.cancel}
            onCommission={commission}
          />
        )}
      </AnimatePresence>

      {exporting && exportSource && (
        <ExportDialog
          source={exportSource}
          title={title}
          onClose={() => setExporting(false)}
          onExported={(path) => setToast({ title: 'Exported', description: fileName(path) })}
        />
      )}

      {review && (
        <ReviewCard
          review={review}
          bannedPhrases={session.brief?.humanizer.bannedPhrases ?? []}
          onAccept={() => {
            const instance = editorRef.current;
            if (!instance || !reviewTarget.current) return;
            reviewApplied.current = applyRewrite(instance, reviewTarget.current, review.after, review.action);
            if (!reviewApplied.current) setReview((current) => (current ? { ...current, status: 'failed', error: 'The document changed under the selection. Select the text again and retry.' } : current));
          }}
          onUndoAccept={() => {
            if (reviewApplied.current) editorRef.current?.commands.undo();
            reviewApplied.current = false;
          }}
          onSettled={() => setReview(null)}
          onRetry={() => { if (reviewTarget.current) void runReview(review.action, reviewTarget.current, review.instruction); }}
          onDiscard={() => { generator.cancel(); setReview(null); }}
        />
      )}

      <div className="wr-toast-host">
        {toast && (
          <SwipeToast
            open
            inline
            title={toast.title}
            description={toast.description}
            icon={<Sparkle size={16} weight="fill" color="var(--wr-gold)" />}
            background="var(--bg-secondary)"
            color="var(--text-primary)"
            fuseColor="var(--wr-gold)"
            duration={6000}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </div>
  );
};

export default WritingWorkspace;
