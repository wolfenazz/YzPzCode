import React, { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Selection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Typography } from '@tiptap/extension-typography';
import { TableKit } from '@tiptap/extension-table';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { PaginationPlus } from 'tiptap-pagination-plus';
import { useAppStore } from '../../../stores/appStore';
import { bundledFamiliesIn, registerBundledFont } from '../../../utils/bundledFonts';
import { cssString, docIsRtl, docLabels } from '../../../utils/writing/labels';
import { languageTag } from '../../../utils/writing/rtl';
import { fontStack, headingSizes, mmToPx, pageDimensions } from '../../../utils/writing/stylePresets';
import type { DocNode, ReportStyle } from '../../../utils/writing/types';
import {
  AiStream,
  Bibliography,
  Caption,
  Citation,
  CoverPage,
  Figure,
  Footnote,
  HumanizerLint,
  PageBreak,
  PageFlow,
  SectionHeading,
  TableOfContentsBlock,
  WritingCommands,
  WritingContext,
} from './extensions';
import { ScrollKeeper } from './scrollKeeper';
import { TextDirection } from './textDirection';
import { StreamAura } from './StreamAura';

export interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  pageGap: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  contentMarginTop: number;
  contentMarginBottom: number;
  contentHeight: number;
}

const PAGE_GAP = 36;
const RUNNING_LINE = 18;

/** Word-style geometry: the page margin is the distance to the text; the running header and footer sit inside it. */
export function geometryFor(style: ReportStyle): PageGeometry {
  const { width, height } = pageDimensions(style.pageSize, style.orientation);
  const split = (mm: number): [number, number] => {
    const total = mmToPx(mm);
    const outer = Math.max(8, Math.round(total * 0.42));
    return [outer, Math.max(4, total - outer - RUNNING_LINE)];
  };
  const [marginTop, contentMarginTop] = split(style.margins.top);
  const [marginBottom, contentMarginBottom] = split(style.margins.bottom);
  const pageHeight = mmToPx(height);
  return {
    pageWidth: mmToPx(width),
    pageHeight,
    pageGap: PAGE_GAP,
    marginTop,
    marginBottom,
    marginLeft: mmToPx(style.margins.left),
    marginRight: mmToPx(style.margins.right),
    contentMarginTop,
    contentMarginBottom,
    contentHeight: pageHeight - marginTop - marginBottom - contentMarginTop - contentMarginBottom - RUNNING_LINE * 2,
  };
}

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));

function runningContent(style: ReportStyle, title: string): { headerLeft: string; headerRight: string; footerLeft: string; footerRight: string } {
  const page = '<span class="wr-page-num">{page}</span>';
  const header = style.headerText.replace('{title}', title);
  const footer = style.footerText.replace('{title}', title);
  return {
    headerLeft: header ? `<span class="wr-running">${escapeHtml(header)}</span>` : '',
    headerRight: style.pageNumbers === 'top-right' ? page : '',
    footerLeft: [
      footer ? `<span class="wr-running">${escapeHtml(footer)}</span>` : '',
      style.pageNumbers === 'bottom-center' ? `<span class="wr-page-num is-centered">{page}</span>` : '',
    ].join(''),
    footerRight: style.pageNumbers === 'bottom-right' ? page : '',
  };
}

function pageGapColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--wr-desk').trim()
    || getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
  return value || '#1f1f1f';
}

export interface PagedEditorProps {
  workspaceId: string;
  docDir: string;
  /** Changing this key replaces the content with `content`. */
  contentKey: string;
  content: DocNode;
  style: ReportStyle;
  title: string;
  /** The report's language ("Arabic", "English"…): printed labels, spell-check, base reading direction. */
  language?: string;
  hasCover: boolean;
  zoom: number;
  editable: boolean;
  onReady: (editor: Editor | null) => void;
  onChange: () => void;
  /** Receives the final content just before the editor is destroyed. */
  onDispose?: (content: DocNode) => void;
  /** Run status per section id; a failed or stopped section gets no finish animation. */
  sectionOutcomes?: Record<string, string>;
}

export const PagedEditor: React.FC<PagedEditorProps> = ({
  workspaceId,
  docDir,
  contentKey,
  content,
  style,
  title,
  language = 'English',
  hasCover,
  zoom,
  editable,
  onReady,
  onChange,
  onDispose,
  sectionOutcomes,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const geometry = useMemo(() => geometryFor(style), [style]);
  const running = useMemo(() => runningContent(style, title), [style, title]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDisposeRef = useRef(onDispose);
  onDisposeRef.current = onDispose;
  const themeKey = useAppStore((state) => `${state.themeMode}:${state.activeCustomThemeId ?? ''}`);

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      SectionHeading,
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph', 'caption'] }),
      TextDirection,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Typography,
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : 'Write here, or select text and ask the AI…'),
        showOnlyCurrent: true,
      }),
      CharacterCount,
      WritingContext.configure({ workspaceId, docDir }),
      PageBreak,
      Footnote,
      Citation,
      Caption,
      Figure,
      TableOfContentsBlock,
      CoverPage,
      Bibliography,
      WritingCommands,
      AiStream,
      HumanizerLint,
      PageFlow.configure({ sectionBreaks: style.sectionBreaks }),
      PaginationPlus.configure({
        ...geometry,
        pageGapBorderSize: 0,
        pageGapBorderColor: 'transparent',
        pageBreakBackground: pageGapColor(),
        ...running,
        customHeader: hasCover ? { 1: { headerLeft: '', headerRight: '' } } : {},
        customFooter: hasCover ? { 1: { footerLeft: '', footerRight: '' } } : {},
      }),
      // Last, so it measures after the pagination has resized the pages.
      ScrollKeeper,
    ],
    content: content as never,
    editable,
    editorProps: {
      attributes: { class: 'wr-paper', spellcheck: 'true' },
    },
    onUpdate: ({ transaction }) => {
      if (transaction.getMeta('wrPageFlow') || transaction.getMeta('wrExternal')) return;
      onChangeRef.current();
    },
  }, [workspaceId]);

  useEffect(() => {
    onReady(editor);
    return () => {
      if (editor && !editor.isDestroyed) onDisposeRef.current?.(editor.getJSON() as DocNode);
      onReady(null);
    };
  }, [editor, onReady]);

  // Replace the content when a different report (or an import) is loaded.
  const loadedKey = useRef(contentKey);
  useEffect(() => {
    if (!editor || loadedKey.current === contentKey) return;
    loadedKey.current = contentKey;
    editor.storage.writingContext.docDir = docDir;
    editor.chain().setMeta('wrExternal', true).setMeta('addToHistory', false).setContent(content as never, { emitUpdate: false }).run();
    // Replacing the whole document leaves the cursor at its end: a new report opens at the top.
    editor.view.dispatch(editor.state.tr.setSelection(Selection.atStart(editor.state.doc)).setMeta('wrExternal', true).setMeta('addToHistory', false));
    const desk = (editor.view.dom as HTMLElement).closest('.wr-desk');
    if (desk) desk.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, contentKey]);

  useEffect(() => {
    if (editor) editor.storage.writingContext.docDir = docDir;
  }, [editor, docDir]);

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // The language: spell-check dictionary, and the direction of blocks that have no letters of their own.
  const tag = languageTag(language);
  const rtl = docIsRtl(language);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dom.setAttribute('lang', tag);
    editor.storage.textDirection.base = rtl ? 'rtl' : 'ltr';
    editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false).setMeta('wrPageFlow', true));
  }, [editor, tag, rtl]);

  // Faces packaged with the app load when the report uses them, and the pages re-measure once they have.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined;
    const remeasure = (): void => {
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false).setMeta('wrPageFlow', true));
    };
    const used = bundledFamiliesIn(`${style.bodyFont}|${style.headingFont}|${JSON.stringify(editor.getJSON())}`);
    if (used.length > 0) void Promise.all(used.map((family) => registerBundledFont(family))).then(remeasure);
    document.fonts.addEventListener('loadingdone', remeasure);
    return () => document.fonts.removeEventListener('loadingdone', remeasure);
  }, [editor, style.bodyFont, style.headingFont, contentKey]);

  // Page geometry, running heads and the desk colour follow the report style and app theme.
  useEffect(() => {
    if (!editor) return;
    const chain = editor.chain()
      .updatePageWidth(geometry.pageWidth)
      .updatePageHeight(geometry.pageHeight)
      .updatePageGap(geometry.pageGap)
      .updateMargins({ top: geometry.marginTop, bottom: geometry.marginBottom, left: geometry.marginLeft, right: geometry.marginRight })
      .updateContentMargins({ top: geometry.contentMarginTop, bottom: geometry.contentMarginBottom })
      .updateHeaderContent(running.headerLeft, running.headerRight)
      .updateFooterContent(running.footerLeft, running.footerRight)
      .updatePageBreakBackground(pageGapColor());
    if (hasCover) chain.updateHeaderContent('', '', 1).updateFooterContent('', '', 1);
    chain.run();
    const storage = editor.storage as unknown as { pageFlow?: { sectionBreaks: boolean } };
    if (storage.pageFlow) storage.pageFlow.sectionBreaks = style.sectionBreaks;
    editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false).setMeta('wrPageFlow', true));
  }, [editor, geometry, running, hasCover, style.sectionBreaks, themeKey]);

  const [h1, h2, h3, h4] = headingSizes(style);
  const labels = docLabels(language);
  const cssVars = {
    '--wr-body-font': fontStack(style.bodyFont),
    '--wr-heading-font': fontStack(style.headingFont),
    '--wr-body-size': `${style.bodySize}pt`,
    '--wr-h1-size': `${h1}pt`,
    '--wr-h2-size': `${h2}pt`,
    '--wr-h3-size': `${h3}pt`,
    '--wr-h4-size': `${h4}pt`,
    '--wr-line-height': String(style.lineHeight),
    '--wr-paragraph-spacing': `${style.paragraphSpacing}pt`,
    // "Left" means the start edge, so Arabic paragraphs sit at the right of their page.
    '--wr-text-align': style.alignment === 'left' ? 'start' : style.alignment,
    '--wr-label-chapter': cssString(labels.chapter),
    '--wr-label-table': cssString(labels.table),
    '--wr-label-figure': cssString(labels.figure),
    '--wr-indent': style.firstLineIndent ? '1.27cm' : '0',
    '--wr-heading-color': style.headingColor,
    '--wr-doc-accent': style.accentColor,
    '--wr-content-height': `${geometry.contentHeight}px`,
    '--wr-zoom': String(zoom),
  } as React.CSSProperties;

  return (
    <div
      ref={hostRef}
      className={`wr-editor is-numbering-${style.headingNumbering}${editable ? '' : ' is-readonly'}${rtl ? ' is-rtl' : ''}`}
      style={cssVars}
    >
      <div className="wr-editor__zoom">
        <EditorContent editor={editor} />
      </div>
      <StreamAura editor={editor} host={hostRef} outcomes={sectionOutcomes} />
    </div>
  );
};
