import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  ArrowArcLeft,
  ArrowArcRight,
  BookBookmark,
  Code,
  Eraser,
  FileImage,
  Highlighter,
  Image as ImageIcon,
  Link,
  ListBullets,
  ListNumbers,
  ListMagnifyingGlass,
  Minus,
  Quotes,
  Rows,
  Scissors,
  Table,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextSubscript,
  TextSuperscript,
  TextUnderline,
  TextT,
  Footprints,
  Columns,
  Trash,
  Sparkle,
  Plus,
} from '@phosphor-icons/react';
import WarmTooltip, { WarmTooltipGroup } from '../reactbits/WarmTooltip';
import { CITATION_STYLES, parseReferenceList } from '../../utils/writing/citations';
import { applyTheme, DOCUMENT_FONTS, fontStack, PAGE_SIZES, STYLE_THEMES } from '../../utils/writing/stylePresets';
import type { CitationStyle, CoverStyle, HeadingNumbering, PageSizeId, Reference, ReportStyle } from '../../utils/writing/types';

type TabId = 'home' | 'insert' | 'layout' | 'references' | 'review';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'layout', label: 'Layout' },
  { id: 'references', label: 'References' },
  { id: 'review', label: 'Review' },
];

const FONT_SIZES = ['8pt', '9pt', '10pt', '10.5pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt'];
const TEXT_COLORS = ['#16161a', '#4a4a54', '#b42318', '#c2410c', '#a16207', '#15803d', '#0f766e', '#1d4ed8', '#6d28d9', '#be185d'];
const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#fed7aa'];

const Tip: React.FC<{ label: string; shortcut?: string; children: React.ReactElement<Record<string, unknown>> }> = ({ label, shortcut, children }) => (
  <WarmTooltip content={label} shortcut={shortcut} side="bottom" size="sm" surfaceColor="var(--text-primary)" inkColor="var(--bg-primary)">
    {children}
  </WarmTooltip>
);

const ToolButton: React.FC<{ label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({ label, shortcut, active, disabled, onClick, children }) => (
  <Tip label={label} shortcut={shortcut}>
    <button
      type="button"
      className={`wr-icon-btn${active ? ' is-active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  </Tip>
);

interface RibbonProps {
  editor: Editor | null;
  style: ReportStyle;
  title: string;
  bibliography: Reference[];
  lintEnabled: boolean;
  readOnly: boolean;
  onStyleChange: (style: ReportStyle) => void;
  onBibliographyChange: (references: Reference[]) => void;
  onToggleLint: () => void;
  onOpenAi: (tab: 'write' | 'humanize') => void;
  rightSlot?: React.ReactNode;
}

const ICON = { size: 16, weight: 'light' as const };

export const Ribbon: React.FC<RibbonProps> = ({ editor, style, title, bibliography, lintEnabled, readOnly, onStyleChange, onBibliographyChange, onToggleLint, onOpenAi, rightSlot }) => {
  const [tab, setTab] = useState<TabId>('home');
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [referenceDraft, setReferenceDraft] = useState('');

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const attrs = current.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string };
      return {
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        sup: current.isActive('superscript'),
        sub: current.isActive('subscript'),
        h1: current.isActive('heading', { level: 1 }),
        h2: current.isActive('heading', { level: 2 }),
        h3: current.isActive('heading', { level: 3 }),
        quote: current.isActive('blockquote'),
        caption: current.isActive('caption'),
        paragraph: current.isActive('paragraph'),
        bullet: current.isActive('bulletList'),
        ordered: current.isActive('orderedList'),
        link: current.isActive('link'),
        code: current.isActive('codeBlock'),
        table: current.isActive('table'),
        align: (['left', 'center', 'right', 'justify'] as const).find((value) => current.isActive({ textAlign: value })) ?? null,
        fontFamily: attrs.fontFamily ?? '',
        fontSize: attrs.fontSize ?? '',
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  const chain = () => editor!.chain().focus();
  const disabled = !editor || readOnly;
  const setStyle = <K extends keyof ReportStyle>(key: K, value: ReportStyle[K]): void => onStyleChange({ ...style, [key]: value });
  const familyValue = DOCUMENT_FONTS.find((font) => state?.fontFamily && fontStack(font.family) === state.fontFamily)?.family ?? '';

  return (
    <div className="wr-ribbon">
      <div className="wr-ribbon__tabs" role="tablist">
        {TABS.map((entry) => (
          <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} className={`wr-ribbon__tab${tab === entry.id ? ' is-active' : ''}`} onClick={() => setTab(entry.id)}>
            {entry.label}
            {tab === entry.id && <motion.span layoutId="wr-ribbon-tab" className="wr-ribbon__tab-line" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />}
          </button>
        ))}
        <div className="wr-ribbon__doc-title">
          <strong title={title}>{title}</strong>
          {rightSlot}
        </div>
      </div>

      <WarmTooltipGroup>
        <div className="wr-ribbon__body">
          {tab === 'home' && (
            <>
              <div className="wr-ribbon__group">
                <ToolButton label="Undo" shortcut="Ctrl Z" disabled={disabled || !state?.canUndo} onClick={() => chain().undo().run()}><ArrowArcLeft {...ICON} /></ToolButton>
                <ToolButton label="Redo" shortcut="Ctrl Y" disabled={disabled || !state?.canRedo} onClick={() => chain().redo().run()}><ArrowArcRight {...ICON} /></ToolButton>
              </div>
              <div className="wr-ribbon__group">
                <div className="wr-ribbon__styles">
                  {[
                    { id: 'p', label: 'Normal', hint: 'Body text', active: state?.paragraph && !state?.caption, run: () => chain().setParagraph().run() },
                    { id: 'h1', label: 'Chapter', hint: 'Heading 1', active: state?.h1, run: () => chain().toggleHeading({ level: 1 }).run() },
                    { id: 'h2', label: 'Section', hint: 'Heading 2', active: state?.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
                    { id: 'h3', label: 'Subsection', hint: 'Heading 3', active: state?.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
                    { id: 'quote', label: 'Quote', hint: 'Block quote', active: state?.quote, run: () => chain().toggleBlockquote().run() },
                    { id: 'caption', label: 'Caption', hint: 'Table caption', active: state?.caption, run: () => chain().setNode('caption', { kind: 'table' }).run() },
                  ].map((entry) => (
                    <button key={entry.id} type="button" className={`wr-style-chip${entry.active ? ' is-active' : ''}`} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={entry.run}>
                      <span>{entry.label}</span>
                      <span>{entry.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="wr-ribbon__group">
                <select className="wr-ribbon__select" style={{ width: 140 }} value={familyValue} disabled={disabled} aria-label="Font"
                  onChange={(event) => (event.target.value ? chain().setFontFamily(fontStack(event.target.value)).run() : chain().unsetFontFamily().run())}>
                  <option value="">{style.bodyFont} (default)</option>
                  {DOCUMENT_FONTS.map((font) => <option key={font.family} value={font.family}>{font.family}</option>)}
                </select>
                <select className="wr-ribbon__select" style={{ width: 74 }} value={state?.fontSize ?? ''} disabled={disabled} aria-label="Font size"
                  onChange={(event) => (event.target.value ? chain().setFontSize(event.target.value).run() : chain().unsetFontSize().run())}>
                  <option value="">Auto</option>
                  {FONT_SIZES.map((size) => <option key={size} value={size}>{size.replace('pt', '')}</option>)}
                </select>
              </div>
              <div className="wr-ribbon__group">
                <ToolButton label="Bold" shortcut="Ctrl B" active={state?.bold} disabled={disabled} onClick={() => chain().toggleBold().run()}><TextB {...ICON} weight="bold" /></ToolButton>
                <ToolButton label="Italic" shortcut="Ctrl I" active={state?.italic} disabled={disabled} onClick={() => chain().toggleItalic().run()}><TextItalic {...ICON} /></ToolButton>
                <ToolButton label="Underline" shortcut="Ctrl U" active={state?.underline} disabled={disabled} onClick={() => chain().toggleUnderline().run()}><TextUnderline {...ICON} /></ToolButton>
                <ToolButton label="Strikethrough" active={state?.strike} disabled={disabled} onClick={() => chain().toggleStrike().run()}><TextStrikethrough {...ICON} /></ToolButton>
                <ToolButton label="Superscript" active={state?.sup} disabled={disabled} onClick={() => chain().toggleSuperscript().run()}><TextSuperscript {...ICON} /></ToolButton>
                <ToolButton label="Subscript" active={state?.sub} disabled={disabled} onClick={() => chain().toggleSubscript().run()}><TextSubscript {...ICON} /></ToolButton>
              </div>
              <div className="wr-ribbon__group">
                {TEXT_COLORS.slice(0, 6).map((color) => (
                  <ToolButton key={color} label={`Text colour ${color}`} disabled={disabled} onClick={() => chain().setColor(color).run()}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: color, boxShadow: '0 0 0 1px rgba(255,255,255,.18)' }} />
                  </ToolButton>
                ))}
                {HIGHLIGHTS.slice(0, 3).map((color) => (
                  <ToolButton key={color} label="Highlight" disabled={disabled} onClick={() => chain().toggleHighlight({ color }).run()}>
                    <Highlighter size={15} weight="fill" color={color} />
                  </ToolButton>
                ))}
                <ToolButton label="Clear formatting" disabled={disabled} onClick={() => chain().unsetAllMarks().clearNodes().run()}><Eraser {...ICON} /></ToolButton>
              </div>
              <div className="wr-ribbon__group">
                <ToolButton label="Align left" active={state?.align === 'left'} disabled={disabled} onClick={() => chain().setTextAlign('left').run()}><TextAlignLeft {...ICON} /></ToolButton>
                <ToolButton label="Centre" active={state?.align === 'center'} disabled={disabled} onClick={() => chain().setTextAlign('center').run()}><TextAlignCenter {...ICON} /></ToolButton>
                <ToolButton label="Align right" active={state?.align === 'right'} disabled={disabled} onClick={() => chain().setTextAlign('right').run()}><TextAlignRight {...ICON} /></ToolButton>
                <ToolButton label="Justify" active={state?.align === 'justify'} disabled={disabled} onClick={() => chain().setTextAlign('justify').run()}><TextAlignJustify {...ICON} /></ToolButton>
              </div>
              <div className="wr-ribbon__group">
                <ToolButton label="Bulleted list" active={state?.bullet} disabled={disabled} onClick={() => chain().toggleBulletList().run()}><ListBullets {...ICON} /></ToolButton>
                <ToolButton label="Numbered list" active={state?.ordered} disabled={disabled} onClick={() => chain().toggleOrderedList().run()}><ListNumbers {...ICON} /></ToolButton>
              </div>
            </>
          )}

          {tab === 'insert' && (
            <>
              <div className="wr-ribbon__group">
                <button type="button" className="wr-ribbon__text-btn" disabled={disabled} onClick={() => chain().insertTable({ rows: 4, cols: 3, withHeaderRow: true }).run()}><Table {...ICON} /> Table</button>
                {state?.table && (
                  <>
                    <ToolButton label="Add row below" disabled={disabled} onClick={() => chain().addRowAfter().run()}><Rows {...ICON} /></ToolButton>
                    <ToolButton label="Add column right" disabled={disabled} onClick={() => chain().addColumnAfter().run()}><Columns {...ICON} /></ToolButton>
                    <ToolButton label="Delete row" disabled={disabled} onClick={() => chain().deleteRow().run()}><Minus {...ICON} /></ToolButton>
                    <ToolButton label="Delete column" disabled={disabled} onClick={() => chain().deleteColumn().run()}><Scissors {...ICON} /></ToolButton>
                    <ToolButton label="Toggle header row" disabled={disabled} onClick={() => chain().toggleHeaderRow().run()}><TextT {...ICON} /></ToolButton>
                    <ToolButton label="Delete table" disabled={disabled} onClick={() => chain().deleteTable().run()}><Trash {...ICON} /></ToolButton>
                  </>
                )}
                <button type="button" className="wr-ribbon__text-btn" disabled={disabled} onClick={() => chain().insertCaption('table', 'Table caption').run()}>Table caption</button>
              </div>
              <div className="wr-ribbon__group">
                <button type="button" className="wr-ribbon__text-btn" disabled={disabled} onClick={() => chain().insertFigure({ src: null, caption: 'Figure caption' }).run()}><ImageIcon {...ICON} /> Figure</button>
                <button type="button" className="wr-ribbon__text-btn" disabled={disabled} onClick={() => chain().insertFootnote('').run()}><Footprints {...ICON} /> Footnote</button>
                <button type="button" className="wr-ribbon__text-btn" disabled={disabled} onClick={() => chain().insertPageBreak().run()}><FileImage {...ICON} /> Page break</button>
                <button type="button" className="wr-ribbon__text-btn" disabled={disabled} onClick={() => chain().setHorizontalRule().run()}><Minus {...ICON} /> Rule</button>
              </div>
              <div className="wr-ribbon__group">
                <button type="button" className="wr-ribbon__text-btn" disabled={disabled} onClick={() => chain().insertTableOfContents().run()}><ListMagnifyingGlass {...ICON} /> Contents</button>
                <button type="button" className={`wr-ribbon__text-btn${state?.quote ? ' is-active' : ''}`} disabled={disabled} onClick={() => chain().toggleBlockquote().run()}><Quotes {...ICON} /> Quote</button>
                <button type="button" className={`wr-ribbon__text-btn${state?.code ? ' is-active' : ''}`} disabled={disabled} onClick={() => chain().toggleCodeBlock().run()}><Code {...ICON} /> Code</button>
              </div>
              <div className="wr-ribbon__group">
                {linkDraft === null ? (
                  <button type="button" className={`wr-ribbon__text-btn${state?.link ? ' is-active' : ''}`} disabled={disabled}
                    onClick={() => setLinkDraft((editor?.getAttributes('link').href as string | undefined) ?? 'https://')}>
                    <Link {...ICON} /> Link
                  </button>
                ) : (
                  <form
                    style={{ display: 'flex', gap: 4 }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (linkDraft.trim() && linkDraft !== 'https://') chain().extendMarkRange('link').setLink({ href: linkDraft.trim() }).run();
                      else chain().extendMarkRange('link').unsetLink().run();
                      setLinkDraft(null);
                    }}
                  >
                    <input className="wr-ribbon__select" style={{ width: 220 }} value={linkDraft} autoFocus onChange={(event) => setLinkDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setLinkDraft(null); }} />
                    <button type="submit" className="wr-ribbon__text-btn">Apply</button>
                  </form>
                )}
              </div>
            </>
          )}

          {tab === 'layout' && (
            <>
              <div className="wr-ribbon__group">
                <select className="wr-ribbon__select" value={style.themeId} disabled={readOnly} aria-label="Template" onChange={(event) => onStyleChange(applyTheme(style, event.target.value))}>
                  {STYLE_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
                </select>
              </div>
              <div className="wr-ribbon__group">
                <select className="wr-ribbon__select" value={style.pageSize} disabled={readOnly} aria-label="Paper size" onChange={(event) => setStyle('pageSize', event.target.value as PageSizeId)}>
                  {Object.values(PAGE_SIZES).map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
                </select>
                <select className="wr-ribbon__select" value={style.orientation} disabled={readOnly} aria-label="Orientation" onChange={(event) => setStyle('orientation', event.target.value as ReportStyle['orientation'])}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
                <select className="wr-ribbon__select" value={String(Math.round(style.margins.top))} disabled={readOnly} aria-label="Margins" onChange={(event) => { const value = Number(event.target.value); setStyle('margins', { top: value, right: value, bottom: value, left: value }); }}>
                  {[12.7, 19, 25.4, 30, 38].map((value) => <option key={value} value={String(Math.round(value))}>{value === 12.7 ? 'Narrow' : value === 19 ? 'Moderate' : value === 25.4 ? 'Normal' : value === 30 ? 'Wide' : 'Extra wide'} · {Math.round(value)} mm</option>)}
                </select>
              </div>
              <div className="wr-ribbon__group">
                <select className="wr-ribbon__select" value={style.headingNumbering} disabled={readOnly} aria-label="Heading numbering" onChange={(event) => setStyle('headingNumbering', event.target.value as HeadingNumbering)}>
                  <option value="decimal">Numbered 1 · 1.1</option>
                  <option value="chapter">Chapter 1</option>
                  <option value="none">No numbers</option>
                </select>
                <select className="wr-ribbon__select" value={style.cover} disabled={readOnly} aria-label="Cover" onChange={(event) => setStyle('cover', event.target.value as CoverStyle)}>
                  {['academic', 'classic', 'corporate', 'modern', 'minimal', 'none'].map((cover) => <option key={cover} value={cover}>{cover === 'none' ? 'No cover' : `${cover[0].toUpperCase()}${cover.slice(1)} cover`}</option>)}
                </select>
                <button type="button" className={`wr-ribbon__text-btn${style.sectionBreaks ? ' is-active' : ''}`} disabled={readOnly} onClick={() => setStyle('sectionBreaks', !style.sectionBreaks)}>Chapters on new page</button>
              </div>
              <div className="wr-ribbon__group">
                <select className="wr-ribbon__select" value={style.bodyFont} disabled={readOnly} aria-label="Body font" onChange={(event) => setStyle('bodyFont', event.target.value)}>
                  {DOCUMENT_FONTS.map((font) => <option key={font.family} value={font.family}>{font.family}</option>)}
                </select>
                <select className="wr-ribbon__select" value={String(style.bodySize)} disabled={readOnly} aria-label="Body size" onChange={(event) => setStyle('bodySize', Number(event.target.value))}>
                  {[9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14].map((size) => <option key={size} value={String(size)}>{size} pt</option>)}
                </select>
                <select className="wr-ribbon__select" value={String(style.lineHeight)} disabled={readOnly} aria-label="Line spacing" onChange={(event) => setStyle('lineHeight', Number(event.target.value))}>
                  {[1, 1.15, 1.3, 1.4, 1.5, 1.75, 2].map((value) => <option key={value} value={String(value)}>{value}× spacing</option>)}
                </select>
                <button type="button" className={`wr-ribbon__text-btn${style.alignment === 'justify' ? ' is-active' : ''}`} disabled={readOnly} onClick={() => setStyle('alignment', style.alignment === 'justify' ? 'left' : 'justify')}>Justified</button>
              </div>
            </>
          )}

          {tab === 'references' && (
            <>
              <div className="wr-ribbon__group">
                <select className="wr-ribbon__select" value={style.citationStyle} disabled={readOnly} aria-label="Citation style" onChange={(event) => setStyle('citationStyle', event.target.value as CitationStyle)}>
                  {CITATION_STYLES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} {entry.example}</option>)}
                </select>
              </div>
              <div className="wr-ribbon__group">
                <select className="wr-ribbon__select" style={{ width: 200 }} value="" disabled={disabled || bibliography.length === 0} aria-label="Insert citation"
                  onChange={(event) => { if (event.target.value) chain().insertCitation([event.target.value]).run(); }}>
                  <option value="">{bibliography.length === 0 ? 'No references yet' : 'Insert citation…'}</option>
                  {bibliography.map((ref) => <option key={ref.id} value={ref.key}>{ref.authors ? `${ref.authors.split(/[;,]/)[0]} (${ref.year})` : ref.title}</option>)}
                </select>
                <button type="button" className="wr-ribbon__text-btn" disabled={disabled} onClick={() => chain().insertBibliography().run()}><BookBookmark {...ICON} /> Bibliography</button>
              </div>
              <div className="wr-ribbon__group">
                <input className="wr-ribbon__select" style={{ width: 340 }} value={referenceDraft} disabled={readOnly} onChange={(event) => setReferenceDraft(event.target.value)} placeholder="Paste a reference: Smith, J. (2024). Title. Journal." />
                <button type="button" className="wr-ribbon__text-btn" disabled={readOnly || !referenceDraft.trim()} onClick={() => {
                  const parsed = parseReferenceList(referenceDraft, bibliography);
                  if (parsed.length > 0) onBibliographyChange([...bibliography, ...parsed]);
                  setReferenceDraft('');
                }}><Plus {...ICON} /> Add</button>
                <span className="wr-field__hint">{bibliography.length} in library</span>
              </div>
            </>
          )}

          {tab === 'review' && (
            <>
              <div className="wr-ribbon__group">
                <button type="button" className={`wr-ribbon__text-btn${lintEnabled ? ' is-active' : ''}`} onClick={onToggleLint}><Highlighter {...ICON} /> Highlight AI patterns</button>
                <button type="button" className="wr-ribbon__text-btn" onClick={() => onOpenAi('humanize')}><Sparkle {...ICON} /> Humanizer</button>
              </div>
              <div className="wr-ribbon__group">
                <button type="button" className="wr-ribbon__text-btn" onClick={() => onOpenAi('write')}><Sparkle {...ICON} weight="fill" /> AI writer</button>
              </div>
            </>
          )}
        </div>
      </WarmTooltipGroup>
    </div>
  );
};
