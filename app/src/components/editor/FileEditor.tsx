// Monaco setup FIRST so workers + loader config are ready before <Editor> mounts.
import '../../lib/monaco';
// Import Monaco's CSS via a RELATIVE path: monaco-editor@0.56's package `exports`
// map ("./*": "./esm/vs/*.js") rewrites bare "monaco-editor/..." specifiers and
// has no exported CSS path, so a relative import bypasses the map entirely.
import '../../../node_modules/monaco-editor/min/vs/editor/editor.main.css';

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Editor } from '@monaco-editor/react';
import type { BeforeMount, OnChange, OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNamespace } from 'monaco-editor';
import { useAppStore } from '../../stores/appStore';
import { FileIcon } from '../explorer/FileIcon';
import { EditorTabs } from './EditorTabs';
import { DiffViewer } from './DiffViewer';
import { MarkdownPreview } from './MarkdownPreview';
import { ImagePreview, isImageFile } from './ImagePreview';
import { PdfPreview } from './PdfPreview';
import { DocxPreview } from './DocxPreview';
import { SpreadsheetEditor } from './SpreadsheetEditor';
import { PptxPreview } from './PptxPreview';
import { DrawioPreview } from './DrawioPreview';
import { invoke } from '@tauri-apps/api/core';

type MonacoEditor = Parameters<OnMount>[0];

/**
 * Maps the backend's FileTab.language value to a Monaco language id.
 * Accepts known names (`typescript`, `python`, ...) and raw extensions (`ts`, `py`, ...).
 */
const toMonacoLanguage = (lang: string): string => {
  const key = lang.toLowerCase();
  const knownLanguages: Record<string, string> = {
    typescript: 'typescript',
    javascript: 'javascript',
    python: 'python',
    rust: 'rust',
    html: 'html',
    css: 'css',
    json: 'json',
    markdown: 'markdown',
    md: 'markdown',
    java: 'java',
    cpp: 'cpp',
    c: 'cpp',
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    txt: 'plaintext',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    go: 'go',
    php: 'php',
    rb: 'ruby',
    cs: 'csharp',
  };
  return knownLanguages[key] ?? 'plaintext';
};

interface CursorStatus {
  line: number;
  column: number;
  selection: number;
  lineCount: number;
  characterCount: number;
}

const normalizeContentForSave = (content: string, trimWhitespace: boolean): string => {
  if (!trimWhitespace) {
    return content;
  }

  return content
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
};

const getExtension = (name: string): string | null => {
  const parts = name.split(".");
  if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  return null;
};

const getBreadcrumb = (filePath: string): string => {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts.slice(-4).join(" / ");
};

export const FileEditor: React.FC = () => {
  const editorRef = useRef<MonacoEditor | null>(null);
  const currentFileRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingExternalRef = useRef(false);
  const callbacksRef = useRef<{
    updateFileContent: (path: string, content: string) => void;
    handleSave: () => void;
  }>({ updateFileContent: () => {}, handleSave: () => {} });

  const openFiles = useAppStore((s) => s.openFiles);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const gitDiffFile = useAppStore((s) => s.gitDiffFile);
  const setGitDiffFile = useAppStore((s) => s.setGitDiffFile);
  const workspacePath = useAppStore((s) => s.currentWorkspace?.path);
  const editorRevealLine = useAppStore((s) => s.editorRevealLine);
  const setEditorRevealLine = useAppStore((s) => s.setEditorRevealLine);
  const updateFileContent = useAppStore((s) => s.updateFileContent);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const closeFileTab = useAppStore((s) => s.closeFileTab);
  const closeOtherFiles = useAppStore((s) => s.closeOtherFiles);
  const closeFilesToRight = useAppStore((s) => s.closeFilesToRight);
  const closeAllFiles = useAppStore((s) => s.closeAllFiles);
  const closeSavedFiles = useAppStore((s) => s.closeSavedFiles);
  const reorderOpenFiles = useAppStore((s) => s.reorderOpenFiles);
  const autoSave = useAppStore((s) => s.autoSave);
  const showMinimapSetting = useAppStore((s) => s.showMinimap);
  const setAutoSave = useAppStore((s) => s.setAutoSave);
  const setShowMinimap = useAppStore((s) => s.setShowMinimap);
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const editorFontSize = useAppStore((s) => s.editorFontSize);
  const editorTabSize = useAppStore((s) => s.editorTabSize);
  const editorWordWrap = useAppStore((s) => s.editorWordWrap);
  const setEditorWordWrap = useAppStore((s) => s.setEditorWordWrap);
  const editorLineNumbers = useAppStore((s) => s.editorLineNumbers);
  const editorBracketColorization = useAppStore((s) => s.editorBracketColorization);
  const editorFormatOnSave = useAppStore((s) => s.editorFormatOnSave);
  const editorTrimWhitespace = useAppStore((s) => s.editorTrimWhitespace);

  const [mdPreview, setMdPreview] = useState(false);
  const [cursorStatus, setCursorStatus] = useState<CursorStatus>({
    line: 1,
    column: 1,
    selection: 0,
    lineCount: 0,
    characterCount: 0,
  });

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const fileExt = activeFile ? getExtension(activeFile.name) : null;
  const isMarkdown = activeFile?.language === "markdown" || fileExt === "md" || fileExt === "markdown";
  const isImage = isImageFile(fileExt);
  const isPdf = fileExt === "pdf";
  const isDocx = fileExt === "docx" || fileExt === "doc";
  const isSpreadsheet = fileExt === "xlsx" || fileExt === "xls" || fileExt === "csv";
  const isPptx = fileExt === "pptx" || fileExt === "ppt";
  const isDrawio = fileExt === "drawio" || fileExt === "dio";
  const isPreviewable = isImage || isPdf || isDocx || isSpreadsheet || isPptx || isDrawio;
  const showEditor = Boolean(activeFile && !isPreviewable && !(isMarkdown && mdPreview));

  const dotIndex = activeFile ? activeFile.name.lastIndexOf(".") : -1;
  const fileNameBase = activeFile && dotIndex > 0 ? activeFile.name.slice(0, dotIndex) : activeFile?.name ?? "";
  const fileExtPart = activeFile && dotIndex > 0 ? activeFile.name.slice(dotIndex) : "";

  // One Monaco model per normalized file path → per-file undo stack & view state.
  const monacoPath = activeFile ? activeFile.path.replace(/\\/g, "/") : undefined;

  const updateMonacoStatus = useCallback((editor: MonacoEditor | null): void => {
    if (!editor) return;
    const model = editor.getModel();
    const position = editor.getPosition();
    const selection = editor.getSelection();
    setCursorStatus({
      line: position?.lineNumber ?? 1,
      column: position?.column ?? 1,
      selection: model && selection ? model.getValueInRange(selection).length : 0,
      lineCount: model?.getLineCount() ?? 0,
      characterCount: model?.getValueLength() ?? 0,
    });
  }, []);

  const handleSave = useCallback(async () => {
    const state = useAppStore.getState();
    const path = currentFileRef.current;
    let file = state.openFiles.find((entry) => entry.path === path);
    if (!file || !file.isDirty) return;

    let contentToSave = file.content;

    // When format-on-save is enabled, run Monaco's formatDocument action (it fires
    // onChange → the store is updated) and read the formatted value from the editor.
    const editor = editorRef.current;
    if (editor && editor.getModel() && editorFormatOnSave) {
      const formatAction = editor.getAction("editor.action.formatDocument");
      if (formatAction) {
        try {
          await formatAction.run();
        } catch {
          // Formatting is best-effort; fall back to the current content.
        }
      }
      contentToSave = editor.getValue();
    }

    contentToSave = normalizeContentForSave(contentToSave, editorTrimWhitespace);
    file = state.openFiles.find((entry) => entry.path === path) ?? file;

    if (contentToSave !== file.content) {
      state.updateFileContent(file.path, contentToSave);
    }

    try {
      await invoke("write_file_content", { path: file.path, content: contentToSave });
      state.markFileSaved(file.path);
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, [editorFormatOnSave, editorTrimWhitespace]);

  callbacksRef.current = { updateFileContent, handleSave };

  const handleMonacoChange = useCallback<OnChange>((value) => {
    if (isApplyingExternalRef.current) return;
    const path = currentFileRef.current;
    if (!path) return;
    const next = value ?? "";
    const state = useAppStore.getState();
    const file = state.openFiles.find((f) => f.path === path);
    if (!file || file.content === next) return;

    callbacksRef.current.updateFileContent(path, next);

    if (state.autoSave) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      const delay = state.autoSaveDelay > 0 ? state.autoSaveDelay : 2000;
      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveTimerRef.current = null;
        callbacksRef.current.handleSave();
      }, delay);
    }
  }, []);

  const handleMonacoMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;

    // Ctrl+S → save (clear any pending autosave first).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      callbacksRef.current.handleSave();
    });

    // Ctrl+G → VS Code "Go to Line/Column" quick input (registered in standalone).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      editor.trigger("", "editor.action.gotoLine", null);
    });

    // Ctrl+F / Ctrl+H are Monaco-native (find / replace widgets) — not overridden.

    editor.onDidChangeCursorPosition(() => updateMonacoStatus(editor));
    editor.onDidChangeModelContent(() => updateMonacoStatus(editor));
    editor.onDidChangeModel(() => updateMonacoStatus(editor));

    // Pending search-result reveal (set before the tab mounted).
    const pendingReveal = useAppStore.getState().editorRevealLine;
    if (pendingReveal && pendingReveal.path === currentFileRef.current) {
      editor.revealLineInCenter(pendingReveal.line);
      editor.setPosition({ lineNumber: pendingReveal.line, column: 1 });
      useAppStore.getState().setEditorRevealLine(null);
    }

    updateMonacoStatus(editor);
  }, [updateMonacoStatus]);

  const defineMonacoGlobals = useCallback<BeforeMount>((_monaco) => {
    // Workers + loader config are set up in lib/monaco.ts (imported above);
    // the built-in vs / vs-dark themes need no additional setup.
  }, []);

  const monacoOptions = useMemo<MonacoEditorNamespace.IStandaloneEditorConstructionOptions>(() => ({
      minimap: { enabled: showMinimapSetting },
      wordWrap: editorWordWrap ? "on" : "off",
      lineNumbers: editorLineNumbers,
      fontSize: editorFontSize,
      fontFamily: `'${editorFontFamily}', 'JetBrains Mono', 'Fira Code', Consolas, monospace`,
      tabSize: editorTabSize,
      bracketPairColorization: { enabled: editorBracketColorization },
      automaticLayout: true, // CRITICAL for resize inside the Tauri webview
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      renderWhitespace: "selection",
      smoothScrolling: true,
      cursorSmoothCaretAnimation: "on",
      formatOnPaste: true,
      formatOnType: false,
      suggest: { preview: true, showWords: true },
      quickSuggestions: true,
      folding: true,
      renderLineHighlight: "all",
      breadcrumbs: { enabled: true },
      fontLigatures: true,
      fixedOverflowWidgets: true,
      scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
      overviewRulerLanes: 3,
      showUnused: true,
    }),
    [
      showMinimapSetting,
      editorWordWrap,
      editorLineNumbers,
      editorFontSize,
      editorFontFamily,
      editorTabSize,
      editorBracketColorization,
    ],
  );

  // Track the active file so save/change handlers always target the right tab.
  useEffect(() => {
    if (!activeFilePath || isPreviewable) {
      currentFileRef.current = null;
      setCursorStatus({ line: 1, column: 1, selection: 0, lineCount: 0, characterCount: 0 });
    } else {
      currentFileRef.current = activeFilePath;
    }
  }, [activeFilePath, isPreviewable]);

  // Reset markdown preview when switching to a non-markdown / non-previewable file.
  useEffect(() => {
    if (activeFile && !isMarkdown && !isPreviewable) {
      setMdPreview(false);
    }
  }, [activeFilePath, isMarkdown, isPreviewable, activeFile]);

  // External content sync (git checkout / file watcher): push store content into
  // the editor without feeding the change back into the store.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile) return;
    if (currentFileRef.current !== activeFile.path) return;
    if (editor.getValue() !== activeFile.content) {
      isApplyingExternalRef.current = true;
      editor.setValue(activeFile.content);
      isApplyingExternalRef.current = false;
      updateMonacoStatus(editor);
    }
  }, [activeFile?.content, activeFile?.path, updateMonacoStatus]);

  // Reveal a specific line (search results / quick navigation).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile || !editorRevealLine) return;
    if (editorRevealLine.path !== activeFile.path) return;
    editor.revealLineInCenter(editorRevealLine.line);
    editor.setPosition({ lineNumber: editorRevealLine.line, column: 1 });
    editor.focus();
    setEditorRevealLine(null);
  }, [editorRevealLine, activeFile?.path, setEditorRevealLine]);

  const handleTabClick = useCallback((path: string) => {
    setActiveFile(path);
  }, [setActiveFile]);

  const handleTabClose = useCallback((path: string) => {
    closeFileTab(path);
  }, [closeFileTab]);

  const frameClass = "bg-[var(--bg-primary)] text-[var(--text-primary)]";
  const toolbarClass = "border-[var(--border-primary)] bg-[var(--bg-secondary)]";
  const contentShellClass = "bg-[var(--bg-primary)]";

  const toolbarBtnClass = (active: boolean, accent: "default" | "emerald" = "default"): string => {
    const base =
      "group/tb inline-flex items-center gap-1.5 rounded-md border px-2.5 py-[5px] text-[10px] font-mono font-semibold uppercase tracking-[0.16em] transition-all duration-150 cursor-pointer select-none";
    if (active) {
      return accent === "emerald"
        ? `${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_14px_-4px_rgba(16,185,129,0.55)] hover:bg-emerald-500/15`
        : `${base} border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_14px_-4px_var(--accent-glow)] hover:bg-[var(--accent-light)]`;
    }

    return `${base} border-[var(--border-primary)] bg-[var(--bg-primary)]/40 text-[var(--text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)] hover:shadow-[0_0_14px_-4px_var(--accent-glow)]`;
  };

  return (
    <div className={`h-full flex flex-col ${frameClass}`}>
      <EditorTabs
        openFiles={openFiles}
        activeFilePath={activeFilePath}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onCloseOthers={closeOtherFiles}
        onCloseToRight={closeFilesToRight}
        onCloseAll={closeAllFiles}
        onCloseSaved={closeSavedFiles}
        onReorder={reorderOpenFiles}
      />

      <div className="flex-1 min-h-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {activeFile && (
            <div className="relative shrink-0 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 px-4 py-2.5 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent opacity-60" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 shrink-0 border border-[var(--accent-border)] bg-[var(--accent-light)] group/fe">
                    <FileIcon extension={fileExt} isDir={false} className="w-3 h-3 shrink-0" />
                    <span className="text-[9px] uppercase font-black tracking-widest text-[var(--accent)]">
                      {fileExt ? `.${fileExt}` : 'file'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-mono text-[12px] font-semibold text-[var(--text-primary)]">
                        {fileNameBase}
                        {fileExtPart && (
                          <span className="text-[var(--accent)]">{fileExtPart}</span>
                        )}
                      </span>
                      {activeFile.isDirty && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)] px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
                          </span>
                          unsaved
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] tracking-wide text-[var(--text-secondary)]">
                      <span className="text-[var(--accent-text)]">~/</span>
                      {getBreadcrumb(activeFile.path)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {showEditor && (
                    <>
                      <button
                        onClick={() => {
                          editorRef.current?.trigger("", "actions.find", null);
                        }}
                        className={toolbarBtnClass(false)}
                        title="Find and Replace"
                        aria-label="Find and replace"
                      >
                        <svg className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/tb:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Find
                        <kbd className="hidden rounded border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 px-1 py-px font-mono text-[8px] font-bold tracking-wider text-[var(--text-secondary)] shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)] transition-colors duration-150 lg:inline-flex group-hover/tb:border-[var(--accent-border)] group-hover/tb:text-[var(--accent-text)]">
                          Ctrl+F
                        </kbd>
                      </button>
                      <button
                        onClick={() => setEditorWordWrap(!editorWordWrap)}
                        className={toolbarBtnClass(editorWordWrap)}
                        title="Toggle word wrap"
                        aria-label="Toggle word wrap"
                        aria-pressed={editorWordWrap}
                      >
                        <svg className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/tb:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h11a3 3 0 110 6h-3M4 18h5" />
                        </svg>
                        Wrap
                      </button>
                      <button
                        onClick={() => setShowMinimap(!showMinimapSetting)}
                        className={toolbarBtnClass(showMinimapSetting)}
                        title="Toggle minimap"
                        aria-label="Toggle minimap"
                        aria-pressed={showMinimapSetting}
                      >
                        <svg className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/tb:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h4v14H4zM10 5h4v14h-4zM16 5h4v14h-4z" />
                        </svg>
                        Map
                      </button>
                      <div className="h-4 w-px bg-[var(--border-primary)]" />
                      <button
                        onClick={() => setAutoSave(!autoSave)}
                        className={toolbarBtnClass(autoSave, "emerald")}
                        title="Toggle auto-save"
                        aria-label="Toggle auto-save"
                        aria-pressed={autoSave}
                      >
                        <svg className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/tb:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Auto
                      </button>
                      <button
                        onClick={handleSave}
                        className={toolbarBtnClass(false)}
                        title="Save"
                        aria-label="Save file"
                      >
                        <svg className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/tb:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5h11l3 3v11a1 1 0 01-1 1H6a1 1 0 01-1-1V5zm3 0v5h8" />
                        </svg>
                        Save
                        <kbd className="hidden rounded border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 px-1 py-px font-mono text-[8px] font-bold tracking-wider text-[var(--text-secondary)] shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)] transition-colors duration-150 lg:inline-flex group-hover/tb:border-[var(--accent-border)] group-hover/tb:text-[var(--accent-text)]">
                          Ctrl+S
                        </kbd>
                      </button>
                    </>
                  )}

                  {isMarkdown && (
                    <>
                      <div className="h-4 w-px bg-[var(--border-primary)]" />
                      <button
                        onClick={() => setMdPreview(!mdPreview)}
                        className={toolbarBtnClass(mdPreview, "emerald")}
                        title={mdPreview ? "Show source" : "Show preview"}
                        aria-label={mdPreview ? "Show source code" : "Show markdown preview"}
                        aria-pressed={mdPreview}
                      >
                        {mdPreview ? (
                          <svg className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/tb:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                          </svg>
                        ) : (
                          <svg className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/tb:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                        {mdPreview ? "Code" : "Preview"}
                      </button>
                    </>
                  )}

                  {isImage && activeFile && (
                    <>
                      <div className="h-4 w-px bg-[var(--border-primary)]" />
                      <button
                        onClick={() => {
                          useAppStore.getState().openInImageEditor(activeFile.path);
                        }}
                        className={toolbarBtnClass(false)}
                        title="Open this image in the layer-based Image Editor"
                        aria-label="Open in Image Editor"
                      >
                        <svg className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/tb:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15l-5-5L5 21" />
                        </svg>
                        <span className="text-[var(--accent-text)]">Image Editor</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className={`relative flex-1 min-h-0 overflow-hidden ${contentShellClass}`}>
            {gitDiffFile && workspacePath ? (
              <DiffViewer
                workspacePath={workspacePath}
                filePath={gitDiffFile.path}
                fileName={gitDiffFile.name}
                onClose={() => setGitDiffFile(null)}
              />
            ) : (
              <>
            {activeFile && !isPreviewable && (
              <div
                className="absolute inset-0"
                style={{ display: showEditor ? undefined : "none" }}
              >
                <Editor
                  height="100%"
                  path={monacoPath}
                  defaultLanguage={toMonacoLanguage(activeFile.language)}
                  value={activeFile.content}
                  theme="vs-dark"
                  onChange={handleMonacoChange}
                  onMount={handleMonacoMount}
                  beforeMount={defineMonacoGlobals}
                  keepCurrentModel
                  loading={
                    <div className="flex h-full w-full items-center justify-center text-[11px] text-zinc-500">
                      Loading Monaco…
                    </div>
                  }
                  options={monacoOptions}
                />
              </div>
            )}

            {activeFile && isImage && (
              <ImagePreview
                filePath={activeFile.path}
                fileName={activeFile.name}
              />
            )}

            {activeFile && isPdf && (
              <PdfPreview
                filePath={activeFile.path}
                fileName={activeFile.name}
              />
            )}

            {activeFile && isDocx && (
              <DocxPreview
                filePath={activeFile.path}
                fileName={activeFile.name}
              />
            )}

            {activeFile && isSpreadsheet && (
              <SpreadsheetEditor
                filePath={activeFile.path}
                fileName={activeFile.name}
              />
            )}

            {activeFile && isPptx && (
              <PptxPreview
                filePath={activeFile.path}
                fileName={activeFile.name}
              />
            )}

            {activeFile && isDrawio && (
              <DrawioPreview
                filePath={activeFile.path}
                content={activeFile.content}
              />
            )}

            {activeFile && isMarkdown && mdPreview && (
              <MarkdownPreview content={activeFile.content} />
            )}

            {!activeFile && (
              <div className={`absolute inset-0 flex items-center justify-center ${contentShellClass}`}>
                <div className="max-w-sm rounded-2xl border border-dashed border-zinc-500/20 bg-black/10 px-8 py-10 text-center backdrop-blur-sm">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700/70 bg-zinc-900/70 text-zinc-300">
                    <svg className="h-7 w-7 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300">
                    Editor Ready
                  </div>
                  <div className="mt-3 text-[11px] leading-5 text-zinc-500">
                    Open any file from the explorer to edit it here. Monaco powers this editor with the same engine as VS Code.
                  </div>
                  <div className="mt-4 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-600">
                    Ctrl+F Find  /  Ctrl+S Save  /  Ctrl+G Go To Line
                  </div>
                </div>
              </div>
            )}
              </>
            )}
          </div>

          <div className={`shrink-0 border-t px-4 py-1.5 ${toolbarClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-[0.18em]">
              <div className="flex flex-wrap items-center gap-3 text-zinc-400">
                <span>{activeFile?.language ?? "No file"}</span>
                <span>{cursorStatus.lineCount.toLocaleString()} lines</span>
                <span>{cursorStatus.characterCount.toLocaleString()} chars</span>
                <span>tab {editorTabSize}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-zinc-400">
                <span>Ln {cursorStatus.line}</span>
                <span>Col {cursorStatus.column}</span>
                <span>Sel {cursorStatus.selection}</span>
                <span>{autoSave ? "Auto-save on" : "Auto-save off"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
