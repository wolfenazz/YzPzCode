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
import { BracketsCurly, CaretRight, Code, DotsThree, Eye, FloppyDisk, MagnifyingGlass, TerminalWindow, TextAlignLeft, WarningCircle } from '@phosphor-icons/react';
import { useEditorTerminalStore } from '../../stores/editorTerminalStore';
import monaco from '../../lib/monaco';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useActiveCustomTheme } from '../../hooks/useCustomTheme';
import { buildThemeTokens } from '../../utils/customTheme';
import { saveEditorFile } from '../../utils/editorSave';
import { EditorActionButton } from './EditorActionButton';
import { EditorProblems } from './EditorProblems';
import { TabContextMenu } from './TabContextMenu';
import { EditorTabs } from './EditorTabs';
import { MarkdownPreview } from './MarkdownPreview';
import { ImagePreview, isImageFile } from './ImagePreview';
import { PdfPreview } from './PdfPreview';
import { DocxPreview } from './DocxPreview';
import { SpreadsheetEditor } from './SpreadsheetEditor';
import { PptxPreview } from './PptxPreview';
import { DrawioPreview } from './DrawioPreview';
import { MediaPreview } from './MediaPreview';
import { BinaryPreview } from './BinaryPreview';
import { getMediaKind } from '../../utils/mediaFiles';
import { toMonacoLanguage } from '../../utils/monacoLanguage';
import { toMonacoThemeColor } from '../../utils/monacoThemeColor';
import { OpenInWritingButton } from '../writing/OpenInWritingButton';
import { OpenInPresentationButton } from '../presentation/OpenInPresentationButton';

type MonacoEditor = Parameters<OnMount>[0];

/** Status-bar shortcut to the bottom terminal panel, shown in the first pane only. */
function TerminalPanelToggle(): React.JSX.Element | null {
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const open = useEditorTerminalStore((s) => (workspaceId ? s.layoutByWorkspace[workspaceId]?.open : false) ?? false);
  const count = useEditorTerminalStore((s) => (workspaceId ? s.sessionsByWorkspace[workspaceId]?.length : 0) ?? 0);
  const toggle = useEditorTerminalStore((s) => s.toggle);
  if (!workspaceId) return null;
  return (
    <button type="button" onClick={() => toggle(workspaceId)} aria-pressed={open} title={open ? 'Hide terminal (Ctrl+`)' : 'Show terminal (Ctrl+`)'}
      className={`flex items-center gap-1 rounded px-1 py-1 cursor-pointer hover:bg-[var(--bg-tertiary)] ${open ? 'text-[var(--text-primary)]' : ''}`}>
      <TerminalWindow size={12} />Terminal{count > 0 ? ` ${count}` : ''}
    </button>
  );
}

interface CursorStatus {
  line: number;
  column: number;
  selection: number;
  lineCount: number;
  characterCount: number;
  tabSize: number;
  insertSpaces: boolean;
}

const getExtension = (name: string): string | null => {
  const parts = name.split(".");
  if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  return null;
};

interface EditorPaneProps {
  activeFilePath: string | null;
  focused: boolean;
  groupLabel: string;
  onSelectFile: (path: string) => void;
  onOpenBeside: (path: string) => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({ activeFilePath, focused, groupLabel, onSelectFile, onOpenBeside }) => {
  const theme = useEffectiveTheme();
  const editorRef = useRef<MonacoEditor | null>(null);
  const currentFileRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingExternalRef = useRef(false);
  const callbacksRef = useRef<{
    updateFileContent: (path: string, content: string) => void;
    handleSave: (expectedPath?: string, expectedWorkspaceId?: string) => void;
  }>({ updateFileContent: () => {}, handleSave: () => {} });

  const openFiles = useAppStore((s) => s.openFiles);
  const workspacePath = useAppStore((s) => s.currentWorkspace?.path);
  const editorRevealLine = useAppStore((s) => s.editorRevealLine);
  const setEditorRevealLine = useAppStore((s) => s.setEditorRevealLine);
  const updateFileContent = useAppStore((s) => s.updateFileContent);
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

  const [markdownMode, setMarkdownMode] = useState<'source' | 'preview' | 'live'>(groupLabel === '02' ? 'preview' : 'source');
  const mdPreview = markdownMode === 'preview';
  const [showProblems, setShowProblems] = useState(false);
  const [markers, setMarkers] = useState<MonacoEditorNamespace.IMarker[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listenerDisposables = useRef<{ dispose: () => void }[]>([]);
  const viewStates = useRef(new Map<string, MonacoEditorNamespace.ICodeEditorViewState>());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cursorStatus, setCursorStatus] = useState<CursorStatus>({
    line: 1,
    column: 1,
    selection: 0,
    lineCount: 0,
    characterCount: 0,
    tabSize: editorTabSize,
    insertSpaces: true,
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
  const mediaKind = getMediaKind(fileExt);
  const isBinary = Boolean(activeFile?.binary) && !mediaKind;
  const isPreviewable = isImage || isPdf || isDocx || isSpreadsheet || isPptx || isDrawio || mediaKind !== null || isBinary;
  const showEditor = Boolean(activeFile && !isPreviewable && !(isMarkdown && mdPreview));
  const mountContextRef = useRef({ focused, showEditor });
  mountContextRef.current = { focused, showEditor };
  currentFileRef.current = activeFile && !isPreviewable ? activeFilePath : null;

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
      tabSize: model?.getOptions().tabSize ?? 2,
      insertSpaces: model?.getOptions().insertSpaces ?? true,
    });
  }, []);

  const handleSave = useCallback(async (expectedPath?: string, expectedWorkspaceId?: string) => {
    const state = useAppStore.getState();
    const workspaceId = state.activeWorkspaceId;
    const path = currentFileRef.current;
    if (!path || !workspaceId || (expectedPath && expectedPath !== path) || (expectedWorkspaceId && expectedWorkspaceId !== workspaceId)) return;
    const file = state.openFiles.find((entry) => entry.path === path);
    if (!file?.isDirty) return;
    setSaving(true);
    try {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (file.diskContent === undefined && editorFormatOnSave && editor && model) {
        const action = editor.getAction('editor.action.formatDocument');
        if (action?.isSupported()) await action.run();
        // Formatting can yield while the user switches tabs or workspaces.
        if (useAppStore.getState().activeWorkspaceId !== workspaceId || currentFileRef.current !== path || editor.getModel() !== model) return;
      }
      await saveEditorFile(workspaceId, path);
      setSaveError(null);
    } catch (error) { setSaveError(String(error)); }
    finally { setSaving(false); }
  }, [editorFormatOnSave]);

  const handleSaveAll = useCallback(async () => {
    const state = useAppStore.getState();
    const workspaceId = state.activeWorkspaceId;
    if (!workspaceId) return;
    setSaving(true);
    const errors: string[] = [];
    for (const file of state.openFiles.filter((entry) => entry.isDirty)) {
      try { await saveEditorFile(workspaceId, file.path); }
      catch (error) { errors.push(String(error)); }
    }
    setSaveError(errors.length ? errors.join(' • ') : null);
    setSaving(false);
  }, []);

  const runAction = useCallback(async (id: string): Promise<void> => {
    const editor = editorRef.current;
    const action = editor?.getAction(id);
    if (!action?.isSupported()) { setNotice('This action is not available for the current language.'); return; }
    editor?.focus();
    try { await action.run(); setNotice(null); }
    catch (error) { setNotice(`Could not run this action: ${String(error)}`); }
  }, []);

  callbacksRef.current = { updateFileContent, handleSave };

  useEffect(() => {
    setSaveError(null);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    };
  }, [activeFilePath, workspacePath, activeFile?.diskContent]);

  const handleMonacoChange = useCallback<OnChange>((value) => {
    if (isApplyingExternalRef.current) return;
    const path = currentFileRef.current;
    if (!path) return;
    const next = value ?? "";
    const state = useAppStore.getState();
    const file = state.openFiles.find((f) => f.path === path);
    if (!file || file.content === next) return;

    callbacksRef.current.updateFileContent(path, next);

    if (state.autoSave && file.diskContent === undefined) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      const delay = state.autoSaveDelay > 0 ? state.autoSaveDelay : 2000;
      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveTimerRef.current = null;
        if (!useAppStore.getState().autoSave) return;
        callbacksRef.current.handleSave(path, state.activeWorkspaceId ?? undefined);
      }, delay);
    }
  }, []);

  const handleMonacoMount = useCallback<OnMount>((editor, monaco) => {
    listenerDisposables.current.forEach((listener) => listener.dispose());
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

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
      const state = useAppStore.getState();
      state.setEditorWordWrap(!state.editorWordWrap);
    });

    // Ctrl+F / Ctrl+H are Monaco-native (find / replace widgets) — not overridden.

    const updateMarkers = (): void => {
      const model = editor.getModel();
      setMarkers(model ? monaco.editor.getModelMarkers({ resource: model.uri }).filter((marker: MonacoEditorNamespace.IMarker) => marker.severity >= monaco.MarkerSeverity.Warning) : []);
    };
    listenerDisposables.current = [
      editor.onDidChangeCursorPosition(() => updateMonacoStatus(editor)),
      editor.onDidChangeModelContent(() => updateMonacoStatus(editor)),
      editor.onDidChangeModelOptions(() => updateMonacoStatus(editor)),
      editor.onWillChangeModel(() => {
        const model = editor.getModel();
        const state = editor.saveViewState();
        if (model && state) viewStates.current.set(model.uri.toString(), state);
      }),
      editor.onDidChangeModel(() => {
        const model = editor.getModel();
        const state = model && viewStates.current.get(model.uri.toString());
        if (state) editor.restoreViewState(state);
        updateMonacoStatus(editor); updateMarkers();
      }),
      monaco.editor.onDidChangeMarkers(updateMarkers),
      editor.onDidDispose(() => { if (editorRef.current === editor) editorRef.current = null; }),
    ];
    updateMarkers();

    // Pending search-result reveal (set before the tab mounted).
    const pendingReveal = useAppStore.getState().editorRevealLine;
    if (mountContextRef.current.focused && mountContextRef.current.showEditor && pendingReveal && pendingReveal.path === currentFileRef.current) {
      editor.revealLineInCenter(pendingReveal.line);
      editor.setPosition({ lineNumber: pendingReveal.line, column: 1 });
      useAppStore.getState().setEditorRevealLine(null);
    }

    updateMonacoStatus(editor);
  }, [updateMonacoStatus]);

  // A custom theme is read from its own tokens, not from <html>: the CSS variables it sets
  // are applied after this component renders, so reading them back would be one theme behind.
  // Each saved revision gets its own Monaco theme name so edits always refresh the editor.
  const customTheme = useActiveCustomTheme();
  const monacoThemeName = customTheme ? `yzpz-editor-custom-${customTheme.id}-${customTheme.updatedAt}` : `yzpz-editor-${theme}`;

  const defineMonacoGlobals = useCallback<BeforeMount>((instance) => {
    const root = getComputedStyle(document.documentElement);
    const customTokens = customTheme ? buildThemeTokens(customTheme) : null;
    const color = (name: string, fallback: string): string => toMonacoThemeColor(customTokens?.[name] ?? root.getPropertyValue(name), fallback);
    const background = color('--bg-primary', '#262626');
    const foreground = color('--text-primary', '#faf8f1');
    instance.editor.defineTheme(monacoThemeName, {
      base: theme === 'light' ? 'vs' : 'vs-dark', inherit: true, rules: [],
      colors: {
        'editor.background': background,
        'editor.foreground': foreground,
        'editorLineNumber.foreground': customTokens ? color('--color-zinc-500', '#76746b') : theme === 'light' ? '#939086' : '#76746b',
        'editorLineNumber.activeForeground': foreground,
        'editorGutter.background': background,
        'editorWidget.background': color('--bg-secondary', '#303030'),
        'editorWidget.border': color('--border-primary', '#3e3e38'),
        'editorCursor.foreground': color('--accent', '#d87757'),
        'editor.lineHighlightBackground': theme === 'light' ? '#00000006' : '#ffffff04',
        'editor.lineHighlightBorder': '#00000000',
        'editor.selectionBackground': customTokens ? color('--accent-border', '#d8775740') : theme === 'light' ? '#d8775738' : '#d8775740',
      },
    });
  }, [theme, customTheme, monacoThemeName]);

  useEffect(() => {
    defineMonacoGlobals(monaco);
    monaco.editor.setTheme(monacoThemeName);
  }, [monacoThemeName, defineMonacoGlobals]);

  useEffect(() => () => { listenerDisposables.current.forEach((listener) => listener.dispose()); }, []);

  useEffect(() => {
    if (!focused) return;
    const onKey = (event: KeyboardEvent): void => {
      if (useAppStore.getState().activeView !== 'editor' || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 's' && event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); void handleSaveAll();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault(); event.stopPropagation(); void handleSave();
      } else if (event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation();
        const currentIndex = openFiles.findIndex((file) => file.path === activeFilePath);
        const next = openFiles[(currentIndex + (event.shiftKey ? -1 : 1) + openFiles.length) % openFiles.length];
        if (next) onSelectFile(next.path);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focused, showEditor, handleSave, handleSaveAll, openFiles, activeFilePath, onSelectFile]);

  const monacoOptions = useMemo<MonacoEditorNamespace.IStandaloneEditorConstructionOptions>(() => ({
      minimap: { enabled: showMinimapSetting, maxColumn: 80, renderCharacters: false },
      wordWrap: editorWordWrap ? "on" : "off",
      lineNumbers: editorLineNumbers,
      fontSize: editorFontSize,
      fontFamily: `'${editorFontFamily}', 'Cascadia Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace`,
      tabSize: editorTabSize,
      bracketPairColorization: { enabled: editorBracketColorization },
      automaticLayout: true, // CRITICAL for resize inside the Tauri webview
      scrollBeyondLastLine: false,
      padding: { top: 18, bottom: 18 },
      lineHeight: 1.65,
      lineNumbersMinChars: 4,
      glyphMargin: true,
      stickyScroll: { enabled: true },
      guides: { indentation: true, bracketPairs: true },
      mouseWheelZoom: true,
      renderWhitespace: "selection",
      smoothScrolling: true,
      cursorSmoothCaretAnimation: "on",
      formatOnPaste: true,
      formatOnType: false,
      suggest: { preview: true, showWords: true },
      quickSuggestions: true,
      folding: true,
      renderLineHighlight: "all",
      fontLigatures: true,
      fixedOverflowWidgets: true,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
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
      setCursorStatus({ line: 1, column: 1, selection: 0, lineCount: 0, characterCount: 0, tabSize: editorTabSize, insertSpaces: true });
    }
  }, [activeFilePath, isPreviewable, editorTabSize]);

  // External content sync (git checkout / file watcher): push store content into
  // the editor without feeding the change back into the store.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile) return;
    if (currentFileRef.current !== activeFile.path) return;
    if (editor.getValue() !== activeFile.content) {
      const viewState = editor.saveViewState();
      isApplyingExternalRef.current = true;
      try {
        const model = editor.getModel();
        if (model) {
          editor.pushUndoStop();
          editor.executeEdits('disk-sync', [{ range: model.getFullModelRange(), text: activeFile.content }]);
          editor.pushUndoStop();
        }
        if (viewState) editor.restoreViewState(viewState);
      } finally { isApplyingExternalRef.current = false; }
      updateMonacoStatus(editor);
    }
  }, [activeFile?.content, activeFile?.path, updateMonacoStatus]);

  // Reveal a specific line (search results / quick navigation).
  useEffect(() => {
    if (focused && isMarkdown && mdPreview && editorRevealLine?.path === activeFilePath) setMarkdownMode('source');
  }, [focused, isMarkdown, mdPreview, editorRevealLine?.path, activeFilePath]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!focused || !showEditor || !editor || !activeFile || !editorRevealLine) return;
    if (editorRevealLine.path !== activeFile.path) return;
    editor.revealLineInCenter(editorRevealLine.line);
    editor.setPosition({ lineNumber: editorRevealLine.line, column: 1 });
    editor.focus();
    setEditorRevealLine(null);
  }, [editorRevealLine, activeFile?.path, setEditorRevealLine, focused, showEditor]);

  const closeTab = useCallback((path: string): void => {
    const file = useAppStore.getState().openFiles.find((entry) => entry.path === path);
    if (file?.isDirty && !window.confirm(`Discard unsaved changes to ${file.name}?`)) return;
    closeFileTab(path);
  }, [closeFileTab]);

  const confirmClose = (action: () => void, files = openFiles): void => {
    const dirty = files.filter((file) => file.isDirty);
    if (dirty.length && !window.confirm(`Discard unsaved changes in ${dirty.length} ${dirty.length === 1 ? 'file' : 'files'}?`)) return;
    action();
  };

  const revealPosition = (line: number, column: number): void => {
    if (isMarkdown && mdPreview) setMarkdownMode('source');
    editorRef.current?.setPosition({ lineNumber: line, column });
    editorRef.current?.revealLineInCenter(line);
    editorRef.current?.focus();
  };

  const menuItems = [
    { label: 'Save all files', shortcut: 'Ctrl+Shift+S', action: () => void handleSaveAll(), disabled: saving || !openFiles.some((file) => file.isDirty) },
    { separator: true as const },
    { label: 'Replace in file', shortcut: 'Ctrl+H', action: () => void runAction('editor.action.startFindReplaceAction'), disabled: !showEditor },
    { label: 'Go to line…', shortcut: 'Ctrl+G', action: () => void runAction('editor.action.gotoLine'), disabled: !showEditor },
    { label: 'Go to symbol…', shortcut: 'Ctrl+Shift+O', action: () => void runAction('editor.action.quickOutline'), disabled: !showEditor },
    { label: 'Command palette…', shortcut: 'F1', action: () => void runAction('editor.action.quickCommand'), disabled: !showEditor },
    { label: 'Toggle line comment', shortcut: 'Ctrl+/', action: () => void runAction('editor.action.commentLine'), disabled: !showEditor },
    { separator: true as const },
    { label: `${editorWordWrap ? 'Disable' : 'Enable'} word wrap`, shortcut: 'Alt+Z', action: () => setEditorWordWrap(!editorWordWrap) },
    { label: `${showMinimapSetting ? 'Hide' : 'Show'} minimap`, action: () => setShowMinimap(!showMinimapSetting) },
    { label: `${autoSave ? 'Disable' : 'Enable'} auto-save`, action: () => setAutoSave(!autoSave) },
    { label: `${showProblems ? 'Hide' : 'Show'} problems`, action: () => setShowProblems(!showProblems), disabled: !showEditor },
    { separator: true as const },
    { label: 'Open file in other pane', action: () => { if (activeFile) onOpenBeside(activeFile.path); }, disabled: !activeFile },
    { label: 'Copy file path', action: () => { if (activeFile) void navigator.clipboard.writeText(activeFile.path).catch((error: unknown) => setNotice(`Could not copy path: ${String(error)}`)); }, disabled: !activeFile },
  ];
  const breadcrumbs = activeFile?.path.replace(/\\/g, '/').replace(`${workspacePath?.replace(/\\/g, '/')}/`, '').split('/') ?? [];

  return <div className="flex h-full min-w-0 flex-col">
    <div className="flex shrink-0 min-w-0 items-stretch border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
      <span title={focused ? 'Focused editor pane' : 'Editor pane'} className={`flex w-8 shrink-0 items-center justify-center text-[10px] tabular-nums border-r border-[var(--border-primary)] ${focused ? 'text-[var(--accent)] bg-[var(--accent-light)]' : 'text-[var(--text-secondary)]'}`}>{groupLabel}</span>
      <div className="min-w-0 flex-1">
        <EditorTabs openFiles={openFiles} activeFilePath={activeFilePath} onTabClick={onSelectFile} onTabClose={closeTab}
          onCloseOthers={(path) => confirmClose(() => closeOtherFiles(path), openFiles.filter((file) => file.path !== path))}
          onCloseToRight={(path) => confirmClose(() => closeFilesToRight(path), openFiles.slice(openFiles.findIndex((file) => file.path === path) + 1))}
          onCloseAll={() => confirmClose(closeAllFiles)} onCloseSaved={closeSavedFiles} onReorder={reorderOpenFiles} onOpenBeside={onOpenBeside} />
      </div>
    </div>

    {activeFile && <>
      <div aria-label="File breadcrumb" title={activeFile.path} className="flex h-8 shrink-0 min-w-0 items-center gap-1 overflow-hidden px-3 text-[11px] text-[var(--text-secondary)]">
        {breadcrumbs.slice(-4).map((part, index, parts) => <React.Fragment key={`${part}:${index}`}>
          {index > 0 && <CaretRight size={10} className="shrink-0 opacity-50" />}
          <span className={`truncate ${index === parts.length - 1 ? 'text-[var(--text-primary)] font-medium' : ''}`}>{part}</span>
        </React.Fragment>)}
        {activeFile.isDirty && <span className="ml-1 shrink-0 text-[var(--accent)]">• Modified</span>}
      </div>
      <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-1 border-b border-[var(--border-primary)] px-2 py-1">
        <div className="flex items-center gap-0.5">
          {isMarkdown ? <div role="group" aria-label="Markdown view" className="flex items-center rounded bg-[var(--bg-secondary)] p-0.5">
            <EditorActionButton label="Markdown source" active={markdownMode === 'source'} onClick={() => setMarkdownMode('source')}><Code size={14} /><span>Source</span></EditorActionButton>
            <EditorActionButton label="Markdown preview" active={markdownMode === 'preview'} onClick={() => setMarkdownMode('preview')}><Eye size={14} /><span>Read</span></EditorActionButton>
            <EditorActionButton label="Markdown source with live preview" active={markdownMode === 'live'} onClick={() => setMarkdownMode('live')}><BracketsCurly size={14} /><span>Live</span></EditorActionButton>
          </div> : <span className="px-1 text-[11px] text-[var(--text-secondary)]">{mediaKind === 'audio' ? 'Audio' : mediaKind === 'video' ? 'Video' : isBinary ? 'Binary' : isPreviewable ? 'File preview' : toMonacoLanguage(activeFile.language)}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {showEditor && <>
            <EditorActionButton label="Find in file (Ctrl+F)" onClick={() => void runAction('actions.find')}><MagnifyingGlass size={15} /></EditorActionButton>
            <EditorActionButton label="Format document (Shift+Alt+F)" onClick={() => void runAction('editor.action.formatDocument')}><TextAlignLeft size={15} /></EditorActionButton>
            <EditorActionButton label="Editor commands (F1)" onClick={() => void runAction('editor.action.quickCommand')}><Code size={15} /></EditorActionButton>
          </>}
          {!isPreviewable && <EditorActionButton label={saving ? 'Saving file…' : 'Save file (Ctrl+S)'} disabled={saving || !activeFile.isDirty || activeFile.diskContent !== undefined} onClick={() => void handleSave()}><FloppyDisk size={15} /><span>{saving ? 'Saving' : 'Save'}</span></EditorActionButton>}
          {isImage && <EditorActionButton label="Open in Image Editor" onClick={() => useAppStore.getState().openInImageEditor(activeFile.path)}><span>Edit image</span></EditorActionButton>}
          <button type="button" title="More editor actions" aria-label="More editor actions" aria-haspopup="menu" aria-expanded={!!menu}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer"
            onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu(menu ? null : { x: rect.right - 240, y: rect.bottom + 4 }); }}><DotsThree size={20} /></button>
        </div>
      </div>
    </>}

    {(saveError || notice) && <div role={saveError ? 'alert' : 'status'} className="flex shrink-0 items-start gap-2 border-b border-[var(--border-primary)] px-3 py-2 text-xs">
      <span className={`flex-1 ${saveError ? 'text-rose-400' : 'text-[var(--text-secondary)]'}`}>{saveError ?? notice}</span>
      <button type="button" aria-label="Dismiss editor message" className="cursor-pointer" onClick={() => { setSaveError(null); setNotice(null); }}>×</button>
    </div>}
    {activeFile?.diskContent !== undefined && <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-xs">
      <span className="w-full text-[var(--text-secondary)]">{activeFile.diskContent === null ? 'File deleted on disk. Your open contents are preserved.' : 'File changed on disk. Your unsaved edits are preserved.'}</span>
      <EditorActionButton label={activeFile.diskContent === null ? 'Restore with my edits' : 'Keep my edits'} onClick={() => {
        const state = useAppStore.getState();
        if (state.activeWorkspaceId) state.resolveFileDiskChange(state.activeWorkspaceId, activeFile.path, true);
        setSaveError(null);
      }}><span>{activeFile.diskContent === null ? 'Restore with my edits' : 'Keep my edits'}</span></EditorActionButton>
      <EditorActionButton label="Use disk version" onClick={() => {
        if (activeFile.isDirty && !window.confirm('Discard your unsaved edits and use the current disk version?')) return;
        const state = useAppStore.getState();
        if (activeFile.diskContent === null) state.closeFileTab(activeFile.path);
        else if (state.activeWorkspaceId) state.resolveFileDiskChange(state.activeWorkspaceId, activeFile.path, false);
        setSaveError(null);
      }}><span>{activeFile.diskContent === null ? 'Close tab' : 'Reload from disk'}</span></EditorActionButton>
    </div>}

    {activeFile && fileExt === 'yzdoc' && useAppStore.getState().currentWorkspace?.kind === 'writing' && <div className="flex items-center justify-between gap-3 border-b border-[var(--border-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
      <span>This is a report file. Edit it in the Writing view; changes made here are overwritten when it saves.</span>
      <OpenInWritingButton path={activeFile.path} kind="open" />
    </div>}

    {activeFile && fileExt === 'yzdeck' && useAppStore.getState().currentWorkspace?.kind === 'presentation' && <div className="flex items-center justify-between gap-3 border-b border-[var(--border-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
      <span>This is a presentation file. Edit it in the Slides view; changes made here are overwritten when it saves.</span>
      <OpenInPresentationButton path={activeFile.path} kind="open" />
    </div>}

    <div className="relative min-h-0 flex-1 overflow-hidden">
      {activeFile && !isPreviewable && <div className={`absolute inset-0 ${isMarkdown && markdownMode === 'live' ? 'grid grid-cols-2' : ''}`}>
        <div className={`relative h-full min-h-0 min-w-0 ${showEditor ? '' : 'hidden'}`}>
          <Editor height="100%" path={monacoPath} defaultLanguage={toMonacoLanguage(activeFile.language)} value={activeFile.content}
            theme={monacoThemeName} onChange={handleMonacoChange} onMount={handleMonacoMount} beforeMount={defineMonacoGlobals}
            keepCurrentModel saveViewState={false} options={monacoOptions}
            loading={<div className="flex h-full items-center justify-center text-xs text-[var(--text-secondary)]">Opening editor…</div>} />
        </div>
        {isMarkdown && markdownMode !== 'source' && <div className={`relative min-h-0 min-w-0 ${markdownMode === 'live' ? 'border-l border-[var(--border-primary)]' : 'h-full'}`}>
          <MarkdownPreview content={activeFile.content} filePath={activeFile.path} workspacePath={workspacePath} />
        </div>}
      </div>}
      {activeFile && isImage && <ImagePreview filePath={activeFile.path} fileName={activeFile.name} />}
      {activeFile && isPdf && <PdfPreview filePath={activeFile.path} fileName={activeFile.name} />}
      {activeFile && isDocx && <DocxPreview filePath={activeFile.path} fileName={activeFile.name} />}
      {activeFile && isSpreadsheet && <SpreadsheetEditor filePath={activeFile.path} fileName={activeFile.name} />}
      {activeFile && isPptx && <PptxPreview filePath={activeFile.path} fileName={activeFile.name} />}
      {activeFile && isDrawio && <DrawioPreview filePath={activeFile.path} content={activeFile.content} />}
      {activeFile && mediaKind && <MediaPreview key={activeFile.path} filePath={activeFile.path} fileName={activeFile.name} kind={mediaKind} />}
      {activeFile && isBinary && <BinaryPreview key={activeFile.path} filePath={activeFile.path} fileName={activeFile.name} />}
      {!activeFile && <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <Code size={32} weight="light" className="mb-5 text-[var(--text-secondary)]" />
          <h2 className="text-xl font-semibold tracking-tight">A place to focus.</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Open a file from the explorer. Keep a reference in one pane and write in the other.</p>
          <dl className="mt-6 space-y-3 text-xs text-[var(--text-secondary)]">
            {[[ 'Quick open', 'Ctrl+P' ], [ 'Split editor', 'Ctrl+\\' ], [ 'Editor commands', 'F1' ]].map(([label, shortcut]) => <div key={label} className="flex justify-between"><dt>{label}</dt><dd><kbd className="rounded border border-[var(--border-primary)] px-1.5 py-0.5 text-[10px]">{shortcut}</kbd></dd></div>)}
          </dl>
        </div>
      </div>}
    </div>
    {showProblems && showEditor && <EditorProblems markers={markers} onReveal={revealPosition} onClose={() => setShowProblems(false)} />}
    <footer className="flex min-h-7 shrink-0 flex-wrap items-center justify-between gap-x-2 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 text-[10px] text-[var(--text-secondary)] tabular-nums">
      <div className="flex items-center gap-2">
        {groupLabel === '01' && <TerminalPanelToggle />}
        {showEditor && <button type="button" onClick={() => setShowProblems(!showProblems)} aria-label={`Problems: ${markers.length}`} aria-expanded={showProblems} className="flex items-center gap-1 rounded px-1 py-1 hover:bg-[var(--bg-tertiary)] cursor-pointer"><WarningCircle size={12} />{markers.length}</button>}
        <button type="button" onClick={() => setAutoSave(!autoSave)} aria-pressed={autoSave} className="rounded px-1 py-1 hover:bg-[var(--bg-tertiary)] cursor-pointer">{autoSave ? 'Auto-save' : activeFile?.isDirty ? 'Unsaved' : 'Saved'}</button>
        {showEditor && <span>{cursorStatus.lineCount.toLocaleString()} lines</span>}
      </div>
      <div className="flex items-center gap-2">
        {showEditor && <>
          <button type="button" title="Go to line" onClick={() => void runAction('editor.action.gotoLine')} className="rounded px-1 py-1 hover:bg-[var(--bg-tertiary)] cursor-pointer">Ln {cursorStatus.line}, Col {cursorStatus.column}{cursorStatus.selection > 0 ? ` (${cursorStatus.selection} selected)` : ''}</button>
          <button type="button" title="Change indentation" onClick={() => void runAction('editor.action.changeTabDisplaySize')} className="rounded px-1 py-1 hover:bg-[var(--bg-tertiary)] cursor-pointer">{cursorStatus.insertSpaces ? 'Spaces' : 'Tab size'}: {cursorStatus.tabSize}</button>
          <span>{toMonacoLanguage(activeFile?.language ?? 'plaintext')}</span>
          <span>{activeFile?.content.includes('\r\n') ? 'CRLF' : 'LF'}</span>
        </>}
      </div>
    </footer>
    {menu && <TabContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
  </div>;
};

