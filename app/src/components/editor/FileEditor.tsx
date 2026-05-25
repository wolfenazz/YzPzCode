import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  highlightSpecialChars,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
} from '@codemirror/language';
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
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, standardKeymap } from '@codemirror/commands';
import {
  search,
  findNext,
  findPrevious,
  setSearchQuery,
  SearchQuery,
  highlightSelectionMatches,
  searchKeymap,
} from '@codemirror/search';
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

const languageExtensions: Record<string, () => Extension> = {
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
const lineNumberCompartment = new Compartment();
const tabSizeCompartment = new Compartment();
const bracketCompartment = new Compartment();

interface CursorStatus {
  line: number;
  column: number;
  selection: number;
  lineCount: number;
  characterCount: number;
}

const editorBaseTheme = EditorView.baseTheme({
  "&dark .cm-selectionBackground": {
    background: "rgba(68, 98, 209, 0.36) !important",
  },
  "&dark .cm-focused .cm-selectionBackground": {
    background: "rgba(82, 121, 236, 0.45) !important",
  },
  "&dark .cm-selectionMatch": {
    background: "rgba(120, 157, 255, 0.16)",
  },
  "&light .cm-selectionBackground": {
    background: "rgba(45, 96, 196, 0.24) !important",
  },
  "&light .cm-focused .cm-selectionBackground": {
    background: "rgba(45, 96, 196, 0.34) !important",
  },
  "&light .cm-selectionMatch": {
    background: "rgba(45, 96, 196, 0.14)",
  },
  ".cm-tooltip": {
    borderRadius: "12px",
    overflow: "hidden",
  },
  ".cm-panels": {
    display: "none",
  },
});

const lightHighlightStyle = EditorView.theme({
  ".tok-keyword": { color: "#5745a7" },
  ".tok-string": { color: "#0f766e" },
  ".tok-number": { color: "#b45309" },
  ".tok-comment": { color: "#7c7f8a", fontStyle: "italic" },
  ".tok-function": { color: "#1d4ed8" },
  ".tok-variableName": { color: "#20232b" },
  ".tok-operator": { color: "#525866" },
  ".tok-meta": { color: "#7c7f8a" },
  ".tok-propertyName": { color: "#0f766e" },
  ".tok-typeName": { color: "#0f5ea8" },
  ".tok-punctuation": { color: "#666b78" },
  ".tok-atom": { color: "#c2410c" },
}, { dark: false });

const darkHighlightStyle = EditorView.theme({
  ".tok-keyword": { color: "#a78bfa" },
  ".tok-string": { color: "#34d399" },
  ".tok-number": { color: "#f59e0b" },
  ".tok-comment": { color: "#71717a", fontStyle: "italic" },
  ".tok-function": { color: "#7dd3fc" },
  ".tok-variableName": { color: "#e5e7eb" },
  ".tok-operator": { color: "#94a3b8" },
  ".tok-meta": { color: "#71717a" },
  ".tok-propertyName": { color: "#5eead4" },
  ".tok-typeName": { color: "#93c5fd" },
  ".tok-punctuation": { color: "#a1a1aa" },
  ".tok-atom": { color: "#fb923c" },
}, { dark: true });

const getExtension = (name: string): string | null => {
  const parts = name.split(".");
  if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  return null;
};

const getThemeExtensions = (
  theme: "dark" | "light",
  fontFamily: string,
  fontSize: number,
): Extension[] => {
  if (theme === "light") {
    return [
      EditorView.theme({
        "&": {
          fontSize: `${fontSize}px`,
          backgroundColor: "#1c1e23",
          color: "#e7e9ee",
          height: "100%",
        },
        ".cm-scroller": {
          backgroundColor: "#1c1e23",
        },
        ".cm-content": {
          fontFamily: `'${fontFamily}', 'JetBrains Mono', 'Fira Code', Consolas, monospace`,
          padding: "12px 0",
          caretColor: "#8ab4ff",
          minHeight: "100%",
        },
        ".cm-gutters": {
          backgroundColor: "#181a1f",
          borderRight: "1px solid rgba(84, 92, 107, 0.55)",
          color: "#8a92a0",
          minWidth: "48px",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "#23262c",
          color: "#d4d7de",
        },
        ".cm-activeLine": {
          backgroundColor: "rgba(255, 255, 255, 0.04)",
        },
        ".cm-line": {
          padding: "0 14px 0 8px",
        },
        ".cm-cursor": {
          borderLeftColor: "#8ab4ff",
          borderLeftWidth: "2px",
        },
        ".cm-foldGutter": {
          backgroundColor: "#181a1f",
        },
        ".cm-minimap": {
          backgroundColor: "#17191d",
          borderLeft: "1px solid rgba(84, 92, 107, 0.45)",
        },
        ".cm-matchingBracket, .cm-nonmatchingBracket": {
          backgroundColor: "rgba(138, 180, 255, 0.10)",
          outline: "1px solid rgba(138, 180, 255, 0.22)",
        },
      }, { dark: false }),
      lightHighlightStyle,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    ];
  }

  return [
    oneDark,
    EditorView.theme({
      "&": {
        fontSize: `${fontSize}px`,
        backgroundColor: "#121417",
        color: "#edf0f5",
        height: "100%",
      },
      ".cm-scroller": {
        backgroundColor: "#121417",
      },
      ".cm-content": {
        fontFamily: `'${fontFamily}', 'JetBrains Mono', 'Fira Code', Consolas, monospace`,
        padding: "12px 0",
        caretColor: "#d4d4d8",
        minHeight: "100%",
      },
      ".cm-gutters": {
        backgroundColor: "#0d0f12",
        borderRight: "1px solid rgba(63, 63, 70, 0.7)",
        color: "#5f6672",
        minWidth: "48px",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "#15181d",
        color: "#a1a1aa",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(90, 99, 122, 0.12)",
      },
      ".cm-line": {
        padding: "0 14px 0 8px",
      },
      ".cm-cursor": {
        borderLeftColor: "#d4d4d8",
        borderLeftWidth: "2px",
      },
      ".cm-foldGutter": {
        backgroundColor: "#0d0f12",
      },
      ".cm-minimap": {
        backgroundColor: "#0f1114",
        borderLeft: "1px solid rgba(63, 63, 70, 0.7)",
      },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: "rgba(148, 163, 184, 0.12)",
        outline: "1px solid rgba(148, 163, 184, 0.22)",
      },
    }, { dark: true }),
    darkHighlightStyle,
  ];
};

const getMinimapExtension = (enabled: boolean): Extension => {
  if (!enabled) return [];

  return showMinimap.compute(["doc"], () => ({
    create: () => {
      const dom = document.createElement("div");
      return { dom };
    },
    displayText: "blocks",
    showOverlay: "mouse-over",
  }));
};

const getLineNumbersExtension = (mode: "on" | "off" | "relative"): Extension => {
  if (mode === "off") {
    return [];
  }

  return [lineNumbers(), highlightActiveLineGutter()];
};

const updateCursorStatus = (
  view: EditorView,
  setStatus: React.Dispatch<React.SetStateAction<CursorStatus>>,
): void => {
  const mainSelection = view.state.selection.main;
  const cursorLine = view.state.doc.lineAt(mainSelection.head);

  setStatus({
    line: cursorLine.number,
    column: mainSelection.head - cursorLine.from + 1,
    selection: Math.abs(mainSelection.to - mainSelection.from),
    lineCount: view.state.doc.lines,
    characterCount: view.state.doc.length,
  });
};

const normalizeContentForSave = (content: string, trimWhitespace: boolean): string => {
  if (!trimWhitespace) {
    return content;
  }

  return content
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
};

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
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const editorFontSize = useAppStore((s) => s.editorFontSize);
  const editorTabSize = useAppStore((s) => s.editorTabSize);
  const editorWordWrap = useAppStore((s) => s.editorWordWrap);
  const setEditorWordWrap = useAppStore((s) => s.setEditorWordWrap);
  const editorLineNumbers = useAppStore((s) => s.editorLineNumbers);
  const editorBracketColorization = useAppStore((s) => s.editorBracketColorization);
  const editorTrimWhitespace = useAppStore((s) => s.editorTrimWhitespace);

  const [mdPreview, setMdPreview] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);
  const [showReplaceBar, setShowReplaceBar] = useState(false);
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
  const isPreviewable = isImage || isPdf || isDocx || isSpreadsheet;

  const handleSave = useCallback(async () => {
    const state = useAppStore.getState();
    const file = state.openFiles.find((entry) => entry.path === currentFileRef.current);
    if (!file || !file.isDirty) return;

    const contentToSave = normalizeContentForSave(file.content, editorTrimWhitespace);

    try {
      if (contentToSave !== file.content) {
        state.updateFileContent(file.path, contentToSave);

        const view = viewRef.current;
        if (view && currentFileRef.current === file.path) {
          const currentDoc = view.state.doc.toString();
          if (currentDoc !== contentToSave) {
            view.dispatch({
              changes: { from: 0, to: currentDoc.length, insert: contentToSave },
            });
          }
        }
      }

      await invoke("write_file_content", { path: file.path, content: contentToSave });
      markFileSaved(file.path);
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, [markFileSaved, editorTrimWhitespace]);

  callbacksRef.current = { updateFileContent, handleSave };

  useEffect(() => {
    if (!editorRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    if (!activeFile || isPreviewable) {
      currentFileRef.current = null;
      setCursorStatus({
        line: 1,
        column: 1,
        selection: 0,
        lineCount: 0,
        characterCount: 0,
      });
      return;
    }

    currentFileRef.current = activeFile.path;
    const languageExtension = languageExtensions[activeFile.language]?.() ?? [];

    const state = EditorState.create({
      doc: activeFile.content,
      extensions: [
        editorBaseTheme,
        themeCompartment.of(getThemeExtensions(theme, editorFontFamily, editorFontSize)),
        languageCompartment.of(languageExtension),
        wordWrapCompartment.of(editorWordWrap ? EditorView.lineWrapping : []),
        minimapCompartment.of(getMinimapExtension(showMinimapSetting)),
        lineNumberCompartment.of(getLineNumbersExtension(editorLineNumbers)),
        tabSizeCompartment.of(EditorState.tabSize.of(editorTabSize)),
        bracketCompartment.of(editorBracketColorization ? bracketMatching() : []),
        highlightActiveLine(),
        drawSelection(),
        highlightSelectionMatches(),
        highlightSpecialChars(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
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
          ...searchKeymap,
          ...completionKeymap,
          indentWithTab,
          {
            key: "Mod-f",
            run: () => {
              setShowReplaceBar(false);
              setShowFindBar(true);
              return true;
            },
          },
          {
            key: "Mod-h",
            run: () => {
              setShowReplaceBar(true);
              setShowFindBar(true);
              return true;
            },
          },
          {
            key: "F3",
            run: () => {
              const view = viewRef.current;
              if (view) {
                findNext(view);
                return true;
              }
              return false;
            },
          },
          {
            key: "Shift-F3",
            run: () => {
              const view = viewRef.current;
              if (view) {
                findPrevious(view);
                return true;
              }
              return false;
            },
          },
          {
            key: "Mod-s",
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
            key: "Mod-g",
            run: (view) => {
              const line = prompt("Go to line number:");
              if (line && !Number.isNaN(Number(line))) {
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
            const { autoSave: isAutoSaveEnabled } = useAppStore.getState();
            if (isAutoSaveEnabled) {
              if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = setTimeout(() => {
                callbacksRef.current.handleSave();
                autoSaveTimerRef.current = null;
              }, 2000);
            }
          }

          if (update.docChanged || update.selectionSet) {
            updateCursorStatus(update.view, setCursorStatus);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    updateCursorStatus(view, setCursorStatus);

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
  }, [activeFilePath, isPreviewable]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtensions(theme, editorFontFamily, editorFontSize)),
    });
  }, [theme, editorFontFamily, editorFontSize]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: wordWrapCompartment.reconfigure(editorWordWrap ? EditorView.lineWrapping : []),
    });
  }, [editorWordWrap]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: minimapCompartment.reconfigure(getMinimapExtension(showMinimapSetting)),
    });
  }, [showMinimapSetting]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: lineNumberCompartment.reconfigure(getLineNumbersExtension(editorLineNumbers)),
    });
  }, [editorLineNumbers]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: tabSizeCompartment.reconfigure(EditorState.tabSize.of(editorTabSize)),
    });
  }, [editorTabSize]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: bracketCompartment.reconfigure(editorBracketColorization ? bracketMatching() : []),
    });
  }, [editorBracketColorization]);

  useEffect(() => {
    if (!viewRef.current || !activeFile) return;
    if (currentFileRef.current !== activeFile.path) return;
    const current = viewRef.current.state.doc.toString();
    if (current !== activeFile.content) {
      viewRef.current.dispatch({
        changes: { from: 0, to: current.length, insert: activeFile.content },
      });
      updateCursorStatus(viewRef.current, setCursorStatus);
    }
  }, [activeFile?.content]);

  useEffect(() => {
    if (activeFile && !isMarkdown && !isPreviewable) {
      setMdPreview(false);
    }
  }, [activeFilePath, isMarkdown, isPreviewable, activeFile]);

  const handleTabClick = useCallback((path: string) => {
    setActiveFile(path);
  }, [setActiveFile]);

  const handleTabClose = useCallback((path: string) => {
    closeFileTab(path);
  }, [closeFileTab]);

  const getBreadcrumb = (filePath: string): string => {
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts.slice(-4).join(" / ");
  };

  const showEditor = Boolean(activeFile && !isPreviewable && !(isMarkdown && mdPreview));
  const isLightTheme = theme === "light";
  const frameClass = isLightTheme
    ? "bg-[#181a1f] text-zinc-100"
    : "bg-[#101214] text-zinc-100";
  const panelClass = isLightTheme
    ? "border-zinc-700/70 bg-[#1d2026]"
    : "border-zinc-800/80 bg-[#15181c]";
  const toolbarClass = isLightTheme
    ? "border-zinc-700/70 bg-[#1b1e23]"
    : "border-zinc-800/80 bg-[#111317]";
  const contentShellClass = isLightTheme
    ? "bg-[#1c1e23]"
    : "bg-[#121417]";

  const toolbarBtnClass = (active: boolean, accent: "default" | "emerald" = "default"): string => {
    if (active) {
      return accent === "emerald"
        ? "inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400 transition-colors cursor-pointer"
        : "inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400 transition-colors cursor-pointer";
    }

    return isLightTheme
      ? "inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:border-zinc-600/70 hover:bg-[#22252b] hover:text-zinc-100 cursor-pointer"
      : "inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:border-zinc-700/70 hover:bg-zinc-800/70 hover:text-zinc-200 cursor-pointer";
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
        theme={theme}
      />

      <div className="flex-1 min-h-0 p-2.5">
        <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border shadow-[0_18px_45px_rgba(0,0,0,0.18)] ${panelClass}`}>
          {activeFile && (
            <div className={`shrink-0 border-b px-4 py-3 ${toolbarClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`truncate text-sm font-semibold ${isLightTheme ? "text-zinc-100" : "text-zinc-100"}`}>
                      {activeFile.name}
                    </span>
                    {activeFile.isDirty && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-400">
                        Unsaved
                      </span>
                    )}
                  </div>
                  <div className={`mt-1 truncate text-[10px] font-mono uppercase tracking-[0.18em] ${isLightTheme ? "text-zinc-500" : "text-zinc-500"}`}>
                    {getBreadcrumb(activeFile.path)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {showEditor && (
                    <>
                      <button
                        onClick={() => {
                          setShowReplaceBar(false);
                          setShowFindBar(true);
                        }}
                        className={toolbarBtnClass(false)}
                        title="Find and Replace"
                        aria-label="Find and replace"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Find
                      </button>
                      <button
                        onClick={() => setEditorWordWrap(!editorWordWrap)}
                        className={toolbarBtnClass(editorWordWrap)}
                        title="Toggle word wrap"
                        aria-label="Toggle word wrap"
                        aria-pressed={editorWordWrap}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h4v14H4zM10 5h4v14h-4zM16 5h4v14h-4z" />
                        </svg>
                        Map
                      </button>
                      <button
                        onClick={() => setAutoSave(!autoSave)}
                        className={toolbarBtnClass(autoSave, "emerald")}
                        title="Toggle auto-save"
                        aria-label="Toggle auto-save"
                        aria-pressed={autoSave}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5h11l3 3v11a1 1 0 01-1 1H6a1 1 0 01-1-1V5zm3 0v5h8" />
                        </svg>
                        Save
                      </button>
                    </>
                  )}

                  {isMarkdown && (
                    <button
                      onClick={() => setMdPreview(!mdPreview)}
                      className={toolbarBtnClass(mdPreview, "emerald")}
                      title={mdPreview ? "Show source" : "Show preview"}
                      aria-label={mdPreview ? "Show source code" : "Show markdown preview"}
                      aria-pressed={mdPreview}
                    >
                      {mdPreview ? (
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                      {mdPreview ? "Code" : "Preview"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className={`relative flex-1 min-h-0 overflow-hidden ${contentShellClass}`}>
            <div
              ref={editorRef}
              className={`absolute inset-0 ${contentShellClass}`}
              style={{ visibility: showEditor ? "visible" : "hidden" }}
            />

            {showFindBar && showEditor && (
              <FindReplaceBar
                view={viewRef.current}
                theme={theme}
                onClose={() => {
                  setShowFindBar(false);
                  setShowReplaceBar(false);
                  if (viewRef.current) {
                    viewRef.current.dispatch({
                      effects: setSearchQuery.of(new SearchQuery({ search: "" })),
                    });
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
              <div className={`absolute inset-0 flex items-center justify-center ${contentShellClass}`}>
                <div className="max-w-sm rounded-2xl border border-dashed border-zinc-500/20 bg-black/10 px-8 py-10 text-center backdrop-blur-sm">
                  <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border ${isLightTheme ? "border-zinc-700/70 bg-[#1f2228] text-zinc-300" : "border-zinc-700/70 bg-zinc-900/70 text-zinc-300"}`}>
                    <svg className="h-7 w-7 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div className={`text-xs font-semibold uppercase tracking-[0.22em] ${isLightTheme ? "text-zinc-300" : "text-zinc-300"}`}>
                    Editor Ready
                  </div>
                  <div className={`mt-3 text-[11px] leading-5 ${isLightTheme ? "text-zinc-500" : "text-zinc-500"}`}>
                    Open any file from the explorer to edit it here. Search, minimap, selection tracking, and autosave are wired into the workspace.
                  </div>
                  <div className={`mt-4 text-[10px] font-mono uppercase tracking-[0.18em] ${isLightTheme ? "text-zinc-500" : "text-zinc-600"}`}>
                    Ctrl+F Find  /  Ctrl+S Save  /  Ctrl+G Go To Line
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={`shrink-0 border-t px-4 py-2 ${toolbarClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-[0.18em]">
              <div className={`flex flex-wrap items-center gap-3 ${isLightTheme ? "text-zinc-500" : "text-zinc-500"}`}>
                <span>{activeFile?.language ?? "No file"}</span>
                <span>{cursorStatus.lineCount.toLocaleString()} lines</span>
                <span>{cursorStatus.characterCount.toLocaleString()} chars</span>
                <span>tab {editorTabSize}</span>
              </div>
              <div className={`flex flex-wrap items-center gap-3 ${isLightTheme ? "text-zinc-400" : "text-zinc-400"}`}>
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
