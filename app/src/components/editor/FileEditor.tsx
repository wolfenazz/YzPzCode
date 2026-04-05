import React, { useEffect, useRef, useCallback, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { rust } from '@codemirror/lang-rust';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { closeBrackets, closeBracketsKeymap, autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, standardKeymap } from '@codemirror/commands';
import { search, findNext, findPrevious, setSearchQuery, SearchQuery, highlightSelectionMatches } from '@codemirror/search';
import { showMinimap } from '@replit/codemirror-minimap';
import { useAppStore } from '../../stores/appStore';
import { EditorTabs } from './EditorTabs';
import { MarkdownPreview } from './MarkdownPreview';
import { FindReplaceBar } from './FindReplaceBar';
import { ImagePreview, isImageFile } from './ImagePreview';
import { PdfPreview } from './PdfPreview';
import { DocxPreview } from './DocxPreview';
import { SpreadsheetPreview } from './SpreadsheetPreview';
import { invoke } from '@tauri-apps/api/core';

const languageExtensions: Record<string, () => any> = {
  javascript: () => javascript({ jsx: true, typescript: false }),
  typescript: () => javascript({ jsx: true, typescript: true }),
  rust: () => rust(),
  python: () => python(),
  html: () => html(),
  css: () => css(),
  json: () => json(),
  markdown: () => markdown(),
  java: () => java(),
  cpp: () => cpp(),
};

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const wordWrapCompartment = new Compartment();
const minimapCompartment = new Compartment();

const editorBaseTheme = EditorView.baseTheme({
  '&dark .cm-selectionBackground': {
    background: 'rgba(75, 93, 173, 0.5) !important',
  },
  '&dark .cm-focused .cm-selectionBackground': {
    background: 'rgba(88, 109, 211, 0.6) !important',
  },
  '&dark .cm-selectionMatch': {
    background: 'rgba(99, 102, 241, 0.25)',
  },
  '&dark .cm-focused .cm-selectionMatch': {
    background: 'rgba(99, 102, 241, 0.35)',
  },
  '&light .cm-selectionBackground': {
    background: 'rgba(59, 130, 246, 0.3) !important',
  },
  '&light .cm-focused .cm-selectionBackground': {
    background: 'rgba(59, 130, 246, 0.45) !important',
  },
  '&light .cm-selectionMatch': {
    background: 'rgba(37, 99, 235, 0.18)',
  },
  '&light .cm-focused .cm-selectionMatch': {
    background: 'rgba(37, 99, 235, 0.28)',
  },
});

const darkEditorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    backgroundColor: '#09090b',
    color: '#e4e4e7',
    height: '100%',
  },
  '.cm-scroller': {
    backgroundColor: '#09090b',
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    padding: '4px 0',
    backgroundColor: '#09090b',
  },
  '.cm-gutters': {
    backgroundColor: '#0c0c0e',
    borderRight: '1px solid #27272a',
    color: '#52525b',
    minWidth: '40px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#18181b',
    color: '#a1a1aa',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(63, 63, 70, 0.15)',
  },
  '.cm-cursor': {
    borderLeftColor: '#a1a1aa',
    borderLeftWidth: '2px',
  },
  '.cm-line': {
    padding: '0 4px',
  },
  '.cm-foldGutter': {
    backgroundColor: '#0c0c0e',
  },
}, { dark: true });

const lightEditorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    backgroundColor: '#d4d4d8',
    color: '#18181b',
    height: '100%',
  },
  '.cm-scroller': {
    backgroundColor: '#d4d4d8',
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    padding: '4px 0',
    backgroundColor: '#d4d4d8',
  },
  '.cm-gutters': {
    backgroundColor: '#cacacc',
    borderRight: '1px solid #b8b8bc',
    color: '#71717a',
    minWidth: '40px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#cacacc',
    color: '#404040',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(24, 24, 27, 0.08)',
  },
  '.cm-cursor': {
    borderLeftColor: '#2563eb',
    borderLeftWidth: '2px',
  },
  '.cm-line': {
    padding: '0 4px',
  },
  '.cm-foldGutter': {
    backgroundColor: '#cacacc',
  },
  '.cm-minimap': {
    backgroundColor: '#bfbfc2',
  },
}, { dark: false });

const lightHighlightStyle = EditorView.theme({
  '.tok-keyword': { color: '#7c3aed' },
  '.tok-string': { color: '#059669' },
  '.tok-number': { color: '#d97706' },
  '.tok-comment': { color: '#9ca3af', fontStyle: 'italic' },
  '.tok-function': { color: '#2563eb' },
  '.tok-variableName': { color: '#18181b' },
  '.tok-operator': { color: '#52525b' },
  '.tok-meta': { color: '#9ca3af' },
  '.tok-propertyName': { color: '#0891b2' },
  '.tok-typeName': { color: '#0891b2' },
  '.tok-punctuation': { color: '#71717a' },
  '.tok-atom': { color: '#ea580c' },
}, { dark: false });

const getExtension = (name: string): string | null => {
  const parts = name.split('.');
  if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  return null;
};

const getThemeExtensions = (t: string): any[] => {
  if (t === 'light') {
    return [lightEditorTheme, lightHighlightStyle, syntaxHighlighting(defaultHighlightStyle, { fallback: true })];
  }
  return [oneDark, darkEditorTheme];
};

function getMinimapExtension(enabled: boolean) {
  if (!enabled) return [];
  return showMinimap.compute(['doc'], () => ({
    create: () => {
      const dom = document.createElement('div');
      return { dom };
    },
    displayText: 'blocks',
    showOverlay: 'mouse-over',
  }));
}

export const FileEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentFileRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef<{
    updateFileContent: (path: string, content: string) => void;
    handleSave: () => void;
  }>({ updateFileContent: () => {}, handleSave: () => {} });

  const openFiles = useAppStore((s) => s.openFiles);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const updateFileContent = useAppStore((s) => s.updateFileContent);
  const markFileSaved = useAppStore((s) => s.markFileSaved);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const closeFileTab = useAppStore((s) => s.closeFileTab);
  const closeOtherFiles = useAppStore((s) => s.closeOtherFiles);
  const closeFilesToRight = useAppStore((s) => s.closeFilesToRight);
  const closeAllFiles = useAppStore((s) => s.closeAllFiles);
  const closeSavedFiles = useAppStore((s) => s.closeSavedFiles);
  const reorderOpenFiles = useAppStore((s) => s.reorderOpenFiles);
  const theme = useAppStore((s) => s.theme);
  const autoSave = useAppStore((s) => s.autoSave);
  const showMinimapSetting = useAppStore((s) => s.showMinimap);
  const setAutoSave = useAppStore((s) => s.setAutoSave);
  const setShowMinimap = useAppStore((s) => s.setShowMinimap);

  const [mdPreview, setMdPreview] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);
  const [showReplaceBar, setShowReplaceBar] = useState(false);

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const fileExt = activeFile ? getExtension(activeFile.name) : null;
  const isMarkdown = activeFile?.language === 'markdown' || fileExt === 'md' || fileExt === 'markdown';
  const isImage = isImageFile(fileExt);
  const isPdf = fileExt === 'pdf';
  const isDocx = fileExt === 'docx' || fileExt === 'doc';
  const isSpreadsheet = fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv';
  const isPreviewable = isImage || isPdf || isDocx || isSpreadsheet;

  const handleSave = useCallback(async () => {
    const { openFiles: files } = useAppStore.getState();
    const file = files.find((f) => f.path === currentFileRef.current);
    if (!file || !file.isDirty) return;
    try {
      await invoke('write_file_content', { path: file.path, content: file.content });
      markFileSaved(file.path);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [markFileSaved]);

  callbacksRef.current = { updateFileContent, handleSave };

  useEffect(() => {
    if (!editorRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    if (!activeFile || isPreviewable) {
      currentFileRef.current = null;
      return;
    }

    currentFileRef.current = activeFile.path;

    const langExt = languageExtensions[activeFile.language]?.() ?? [];

    const state = EditorState.create({
      doc: activeFile.content,
      extensions: [
        editorBaseTheme,
        themeCompartment.of(getThemeExtensions(theme)),
        languageCompartment.of(langExt),
        wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
        minimapCompartment.of(getMinimapExtension(showMinimapSetting)),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        highlightSelectionMatches(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        history(),
        indentOnInput(),
        search(),
        foldGutter(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...standardKeymap,
          ...historyKeymap,
          indentWithTab,
          {
            key: 'Mod-f',
            run: () => {
              setShowReplaceBar(false);
              setShowFindBar(true);
              return true;
            },
          },
          {
            key: 'Mod-h',
            run: () => {
              setShowReplaceBar(true);
              setShowFindBar(true);
              return true;
            },
          },
          {
            key: 'F3',
            run: () => {
              const v = viewRef.current;
              if (v) { findNext(v); return true; }
              return false;
            },
          },
          {
            key: 'Shift-F3',
            run: () => {
              const v = viewRef.current;
              if (v) { findPrevious(v); return true; }
              return false;
            },
          },
          {
            key: 'Mod-s',
            run: () => {
              if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
              }
              callbacksRef.current.handleSave();
              return true;
            },
          },
          {
            key: 'Mod-g',
            run: (view) => {
              const line = prompt('Go to line number:');
              if (line && !isNaN(Number(line))) {
                const lineNumber = Number(line);
                const doc = view.state.doc;
                if (lineNumber > 0 && lineNumber <= doc.lines) {
                  view.dispatch({
                    selection: { anchor: doc.line(lineNumber).from },
                    scrollIntoView: true,
                  });
                  view.focus();
                }
              }
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && currentFileRef.current) {
            callbacksRef.current.updateFileContent(currentFileRef.current, update.state.doc.toString());
            const { autoSave: as } = useAppStore.getState();
            if (as) {
              if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = setTimeout(() => {
                callbacksRef.current.handleSave();
                autoSaveTimerRef.current = null;
              }, 2000);
            }
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (viewRef.current === view) {
        view.destroy();
        viewRef.current = null;
      }
    };
  }, [activeFilePath]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtensions(theme)),
    });
  }, [theme]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: minimapCompartment.reconfigure(getMinimapExtension(showMinimapSetting)),
    });
  }, [showMinimapSetting]);

  useEffect(() => {
    if (!viewRef.current || !activeFile) return;
    if (currentFileRef.current !== activeFile.path) return;
    const current = viewRef.current.state.doc.toString();
    if (current !== activeFile.content) {
      viewRef.current.dispatch({
        changes: { from: 0, to: current.length, insert: activeFile.content },
      });
    }
  }, [activeFile?.content]);

  useEffect(() => {
    if (activeFile && !isMarkdown && !isPreviewable) {
      setMdPreview(false);
    }
  }, [activeFilePath, isMarkdown, isImage]);

  const handleTabClick = useCallback((path: string) => {
    setActiveFile(path);
  }, [setActiveFile]);

  const handleTabClose = useCallback((path: string) => {
    closeFileTab(path);
  }, [closeFileTab]);

  const getBreadcrumb = (filePath: string) => {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts.slice(-3).join(' / ');
  };

  const showEditor = activeFile && !isPreviewable && !(isMarkdown && mdPreview);

  const toolbarBtnClass = (active: boolean) =>
    `flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest transition-colors cursor-pointer ${
      active
        ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
        : theme === 'light'
          ? 'text-zinc-400 hover:text-zinc-600 hover:bg-gray-300'
          : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
    }`;

  return (
    <div className={`h-full flex flex-col ${theme === 'light' ? 'bg-gray-300' : 'bg-[#09090b]'}`}>
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
        theme={theme}
      />

      {activeFile && (
        <div className={`flex items-center justify-between px-3 py-1 border-b shrink-0 ${theme === 'light' ? 'bg-gray-200/60 border-gray-300' : 'bg-zinc-950 border-zinc-800/60'}`}>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] ${theme === 'light' ? 'text-zinc-400' : 'text-zinc-600'} font-mono tracking-wider`}>
              {getBreadcrumb(activeFile.path)}
            </span>
            {activeFile.isDirty && (
              <span className="text-[9px] text-amber-500 uppercase tracking-widest">Modified</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {showEditor && !isMarkdown && (
              <>
                <button
                  onClick={() => {
                    setShowReplaceBar(false);
                    setShowFindBar(true);
                  }}
                  className={toolbarBtnClass(false)}
                  title="Find & Replace (Ctrl+F)"
                  aria-label="Find and replace"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Find
                </button>
                <button
                  onClick={() => setWordWrap(!wordWrap)}
                  className={toolbarBtnClass(wordWrap)}
                  title="Toggle Word Wrap"
                  aria-label="Toggle word wrap"
                  aria-pressed={wordWrap}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                  Wrap
                </button>
                <button
                  onClick={() => setShowMinimap(!showMinimapSetting)}
                  className={toolbarBtnClass(showMinimapSetting)}
                  title="Toggle Minimap"
                  aria-label="Toggle minimap"
                  aria-pressed={showMinimapSetting}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  Map
                </button>
                <button
                  onClick={() => setAutoSave(!autoSave)}
                  className={toolbarBtnClass(autoSave)}
                  title="Toggle Auto-Save (2s debounce)"
                  aria-label="Toggle auto-save"
                  aria-pressed={autoSave}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Auto
                </button>
              </>
            )}
            {isMarkdown && (
              <button
              onClick={() => setMdPreview(!mdPreview)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest transition-colors cursor-pointer ${
                mdPreview
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                  : theme === 'light'
                    ? 'text-zinc-400 hover:text-zinc-600 hover:bg-gray-300'
                    : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
              }`}
              title={mdPreview ? 'Show source' : 'Show preview'}
              aria-label={mdPreview ? 'Show source code' : 'Show markdown preview'}
              aria-pressed={mdPreview}
            >
              {mdPreview ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
              {mdPreview ? 'Code' : 'Preview'}
            </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 relative min-h-0 overflow-hidden">
        <div
          ref={editorRef}
          className={`absolute inset-0 ${theme === 'light' ? 'bg-gray-300' : 'bg-[#09090b]'} [&_.cm-panels]:hidden`}
          style={{ visibility: showEditor ? 'visible' : 'hidden' }}
        />

        {showFindBar && showEditor && (
          <FindReplaceBar
            view={viewRef.current}
            theme={theme === 'light' ? 'light' : 'dark'}
            onClose={() => {
              setShowFindBar(false);
              setShowReplaceBar(false);
              if (viewRef.current) {
                viewRef.current.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
                viewRef.current.focus();
              }
            }}
            showReplaceInitially={showReplaceBar}
          />
        )}

        {activeFile && isImage && (
          <ImagePreview
            filePath={activeFile.path}
            fileName={activeFile.name}
            theme={theme}
          />
        )}

        {activeFile && isPdf && (
          <PdfPreview
            filePath={activeFile.path}
            fileName={activeFile.name}
            theme={theme}
          />
        )}

        {activeFile && isDocx && (
          <DocxPreview
            filePath={activeFile.path}
            fileName={activeFile.name}
            theme={theme}
          />
        )}

        {activeFile && isSpreadsheet && (
          <SpreadsheetPreview
            filePath={activeFile.path}
            fileName={activeFile.name}
            theme={theme}
          />
        )}

        {activeFile && isMarkdown && mdPreview && (
          <MarkdownPreview content={activeFile.content} theme={theme} />
        )}

        {!activeFile && (
          <div className={`absolute inset-0 flex items-center justify-center ${theme === 'light' ? 'bg-gray-300' : 'bg-[#09090b]'}`}>
            <div className={`flex flex-col items-center gap-3 ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-600'}`}>
              <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <div className="text-[10px] uppercase tracking-widest opacity-50">
                Select a file to view
              </div>
              <div className="text-[9px] uppercase tracking-widest opacity-30">
                Ctrl+S to save
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
