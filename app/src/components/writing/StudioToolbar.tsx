import React, { useEffect, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  ArrowArcLeft,
  ArrowArcRight,
  BookBookmark,
  CircleNotch,
  Code,
  DotsThree,
  Eraser,
  FileDashed,
  Footprints,
  Image as ImageIcon,
  Link,
  ListBullets,
  ListMagnifyingGlass,
  ListNumbers,
  Minus,
  Plus,
  Quotes,
  SpeakerHigh,
  Stop,
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
} from '@phosphor-icons/react';
import { registerAllBundledFonts } from '../../utils/bundledFonts';
import { FONT_GROUPS, groupOf } from '../../utils/writing/fontCatalog';
import { DOCUMENT_FONTS, fontStack } from '../../utils/writing/stylePresets';
import type { Reference, ReportStyle } from '../../utils/writing/types';
import { useTtsPlayback } from '../../hooks/useTtsPlayback';
import { TTS_SPEEDS, useTtsStore } from '../../stores/ttsStore';
import { ttsBilingual } from '../../utils/tts/strings';
import { REPORT_NARRATION_MAX_CHARS, selectionOrSectionNarrationText } from './reportNarration';
import { Dropdown, MenuItem, MenuLabel, MenuSep } from './ui';

const FONT_SIZES = ['8pt', '9pt', '10pt', '10.5pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt'];
const TEXT_COLORS = ['#16161a', '#4a4a54', '#8a8a94', '#b42318', '#c2410c', '#a16207', '#15803d', '#0f766e', '#1d4ed8', '#6d28d9', '#be185d', '#0b2545'];
const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#fed7aa', '#e9d5ff'];

const ICON = { size: 15 } as const;

const Btn: React.FC<{ label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({ label, shortcut, active, disabled, onClick, children }) => (
  <button
    type="button"
    className={`wr-tb${active ? ' is-active' : ''}`}
    title={shortcut ? `${label} (${shortcut})` : label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);

const Sep: React.FC = () => <span className="wr-tb-sep" aria-hidden="true" />;

interface StudioToolbarProps {
  editor: Editor | null;
  style: ReportStyle;
  bibliography: Reference[];
  onOpenReferences: () => void;
  onToast?: (message: string) => void;
}

export const StudioToolbar: React.FC<StudioToolbarProps> = ({ editor, style, bibliography, onOpenReferences, onToast }) => {
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
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
        code: current.isActive('codeBlock'),
        bullet: current.isActive('bulletList'),
        ordered: current.isActive('orderedList'),
        link: current.isActive('link'),
        table: current.isActive('table'),
        align: (['left', 'center', 'right', 'justify'] as const).find((value) => current.isActive({ textAlign: value })) ?? null,
        fontFamily: attrs.fontFamily ?? '',
        fontSize: attrs.fontSize ?? '',
        color: attrs.color ?? '',
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        hasSelection: !current.state.selection.empty,
        // The direction the block under the caret reads in (the editor writes it to the DOM as `dir`).
        rtl: (() => {
          try {
            const node = current.view.domAtPos(current.state.selection.from).node;
            const element = node.nodeType === 3 ? node.parentElement : node as HTMLElement;
            return element?.closest('[dir]')?.getAttribute('dir') === 'rtl';
          } catch {
            return false;
          }
        })(),
      };
    },
  });

  const ttsEnabled = useTtsStore((state) => state.enabled);
  const ttsSpeed = useTtsStore((state) => state.speed);
  const setTtsSpeed = useTtsStore((state) => state.setSpeed);
  const { status: ttsStatus, errorMsg: ttsError, speak: ttsSpeak, stop: ttsStop } = useTtsPlayback();

  useEffect(() => {
    if (ttsError) onToast?.(ttsError);
  }, [ttsError, onToast]);

  const ttsBusy = ttsStatus === 'preparing' || ttsStatus === 'synthesizing' || ttsStatus === 'playing';
  // Full section text goes to the backend in one call: the Python bridge
  // chunks (~250 chars) and joins to a single WAV, so long sections play
  // without cutoff up to the backend ceiling; beyond it we ask for a slice.
  const narrate = (): void => {
    if (!editor) return;
    if (ttsBusy) {
      ttsStop();
      return;
    }
    const target = selectionOrSectionNarrationText(editor);
    if (!target) {
      onToast?.(ttsBilingual('selectOrSection'));
      return;
    }
    if (target.text.length > REPORT_NARRATION_MAX_CHARS) {
      onToast?.(ttsBilingual('tooLong'));
      return;
    }
    void ttsSpeak(target.text);
  };
  const narrateLabel: string = ttsBusy
    ? 'Stop narration · إيقاف السرد'
    : state?.hasSelection
      ? 'Read selection aloud · قراءة المحدد'
      : 'Read section aloud · قراءة القسم';

  const disabled = !editor;
  const chain = () => editor!.chain().focus();
  /** Applies the link draft; on blur a valid address commits instead of being discarded. */
  const commitLink = (fromBlur: boolean): void => {
    if (linkDraft === null || !editor) return;
    const value = linkDraft.trim();
    try {
      if (value && value !== 'https://') {
        editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
      } else if (!fromBlur) {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      }
    } catch {
      // The selection moved on; leave the text alone.
    }
    setLinkDraft(null);
  };  const family = DOCUMENT_FONTS.find((font) => state?.fontFamily && fontStack(font.family) === state.fontFamily)?.family ?? '';
  const block = state?.h1 ? 'Heading 1' : state?.h2 ? 'Heading 2' : state?.h3 ? 'Heading 3' : state?.quote ? 'Quote' : state?.caption ? 'Caption' : state?.code ? 'Code' : 'Normal text';
  const align = state?.align ?? style.alignment;
  const AlignIcon = align === 'center' ? TextAlignCenter : align === 'right' ? TextAlignRight : align === 'justify' ? TextAlignJustify : TextAlignLeft;

  return (
    <div className="wr-toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Undo" shortcut="Ctrl+Z" disabled={disabled || !state?.canUndo} onClick={() => chain().undo().run()}><ArrowArcLeft {...ICON} /></Btn>
      <Btn label="Redo" shortcut="Ctrl+Y" disabled={disabled || !state?.canRedo} onClick={() => chain().redo().run()}><ArrowArcRight {...ICON} /></Btn>
      <Sep />

      <Dropdown label={<span className="wr-tb__value" style={{ width: 92 }}>{block}</span>} title="Paragraph style" disabled={disabled} width={220}>
        {(close) => (
          <>
            <MenuItem label="Normal text" checked={block === 'Normal text'} onSelect={() => { chain().setParagraph().run(); close(); }} />
            <MenuItem label={<span className="wr-dd__sample is-h1">Heading 1</span>} hint="Chapter" checked={block === 'Heading 1'} onSelect={() => { chain().setHeading({ level: 1 }).run(); close(); }} />
            <MenuItem label={<span className="wr-dd__sample is-h2">Heading 2</span>} hint="Section" checked={block === 'Heading 2'} onSelect={() => { chain().setHeading({ level: 2 }).run(); close(); }} />
            <MenuItem label={<span className="wr-dd__sample is-h3">Heading 3</span>} hint="Subsection" checked={block === 'Heading 3'} onSelect={() => { chain().setHeading({ level: 3 }).run(); close(); }} />
            <MenuSep />
            <MenuItem label="Quote" checked={block === 'Quote'} onSelect={() => { chain().toggleBlockquote().run(); close(); }} />
            <MenuItem label="Caption" checked={block === 'Caption'} onSelect={() => { chain().setNode('caption', { kind: 'table' }).run(); close(); }} />
            <MenuItem label="Code" checked={block === 'Code'} onSelect={() => { chain().toggleCodeBlock().run(); close(); }} />
          </>
        )}
      </Dropdown>
      <Sep />

      <span className="wr-tb__fontwrap" onPointerEnter={() => void registerAllBundledFonts()} onFocus={() => void registerAllBundledFonts()}>
        <Dropdown label={<span className="wr-tb__value" style={{ width: 110 }}>{family || style.bodyFont}</span>} title="Font" disabled={disabled} width={240}>
          {(close) => (
            <>
              <MenuItem label={`Document font (${style.bodyFont})`} checked={!family} onSelect={() => { chain().unsetFontFamily().run(); close(); }} />
              {FONT_GROUPS.map((group) => {
                const fonts = DOCUMENT_FONTS.filter((font) => groupOf({ name: font.family, kind: font.kind, character: font.character, source: font.source, arabic: font.arabic }) === group.id);
                if (fonts.length === 0) return null;
                return (
                  <React.Fragment key={group.id}>
                    <MenuSep />
                    <MenuLabel>{group.label}</MenuLabel>
                    {fonts.map((font) => (
                      <MenuItem
                        key={font.family}
                        label={font.family}
                        hint={font.source === 'bundled' ? 'app' : undefined}
                        style={{ fontFamily: fontStack(font.family) }}
                        checked={family === font.family}
                        onSelect={() => { chain().setFontFamily(fontStack(font.family)).run(); close(); }}
                      />
                    ))}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </Dropdown>
      </span>
      <Dropdown label={<span className="wr-tb__value" style={{ width: 30 }}>{state?.fontSize ? state.fontSize.replace('pt', '') : style.bodySize}</span>} title="Font size" disabled={disabled} width={120}>
        {(close) => (
          <>
            <MenuItem label="Default" checked={!state?.fontSize} onSelect={() => { chain().unsetFontSize().run(); close(); }} />
            <MenuSep />
            {FONT_SIZES.map((size) => (
              <MenuItem key={size} label={size.replace('pt', '')} checked={state?.fontSize === size} onSelect={() => { chain().setFontSize(size).run(); close(); }} />
            ))}
          </>
        )}
      </Dropdown>
      <Sep />

      <Btn label="Bold" shortcut="Ctrl+B" active={state?.bold} disabled={disabled} onClick={() => chain().toggleBold().run()}><TextB {...ICON} weight="bold" /></Btn>
      <Btn label="Italic" shortcut="Ctrl+I" active={state?.italic} disabled={disabled} onClick={() => chain().toggleItalic().run()}><TextItalic {...ICON} /></Btn>
      <Btn label="Underline" shortcut="Ctrl+U" active={state?.underline} disabled={disabled} onClick={() => chain().toggleUnderline().run()}><TextUnderline {...ICON} /></Btn>
      <Dropdown
        label={<span className="wr-tb__color"><span>A</span><i style={{ background: state?.color || '#16161a' }} /></span>}
        title="Text colour and highlight"
        disabled={disabled}
        width={196}
      >
        {(close) => (
          <div className="wr-swatches-menu">
            <MenuLabel>Text</MenuLabel>
            <div className="wr-swatches">
              {TEXT_COLORS.map((color) => (
                <button key={color} type="button" className="wr-swatch" style={{ background: color }} aria-label={`Text colour ${color}`} onClick={() => { chain().setColor(color).run(); close(); }} />
              ))}
            </div>
            <MenuItem label="Automatic" onSelect={() => { chain().unsetColor().run(); close(); }} />
            <MenuLabel>Highlight</MenuLabel>
            <div className="wr-swatches">
              {HIGHLIGHTS.map((color) => (
                <button key={color} type="button" className="wr-swatch" style={{ background: color }} aria-label={`Highlight ${color}`} onClick={() => { chain().toggleHighlight({ color }).run(); close(); }} />
              ))}
            </div>
            <MenuItem label="No highlight" onSelect={() => { chain().unsetHighlight().run(); close(); }} />
          </div>
        )}
      </Dropdown>
      <Sep />

      <Dropdown label={<AlignIcon {...ICON} />} title="Alignment" disabled={disabled} width={190}>
        {(close) => (
          <>
            <MenuItem icon={<TextAlignLeft size={14} />} label="Left" checked={align === 'left'} onSelect={() => { chain().setTextAlign('left').run(); close(); }} />
            <MenuItem icon={<TextAlignCenter size={14} />} label="Centre" checked={align === 'center'} onSelect={() => { chain().setTextAlign('center').run(); close(); }} />
            <MenuItem icon={<TextAlignRight size={14} />} label="Right" checked={align === 'right'} onSelect={() => { chain().setTextAlign('right').run(); close(); }} />
            <MenuItem icon={<TextAlignJustify size={14} />} label="Justify" checked={align === 'justify'} onSelect={() => { chain().setTextAlign('justify').run(); close(); }} />
            <MenuSep />
            <MenuLabel>Direction</MenuLabel>
            <MenuItem label="Left to right" checked={!state?.rtl} onSelect={() => { chain().setTextDirection('ltr').run(); close(); }} />
            <MenuItem label="Right to left" hint="Arabic, Hebrew" checked={Boolean(state?.rtl)} onSelect={() => { chain().setTextDirection('rtl').run(); close(); }} />
            <MenuItem label="Automatic" hint="First letter decides" onSelect={() => { chain().setTextDirection(null).run(); close(); }} />
          </>
        )}
      </Dropdown>
      <Btn label="Bulleted list" active={state?.bullet} disabled={disabled} onClick={() => chain().toggleBulletList().run()}><ListBullets {...ICON} /></Btn>
      <Btn label="Numbered list" active={state?.ordered} disabled={disabled} onClick={() => chain().toggleOrderedList().run()}><ListNumbers {...ICON} /></Btn>
      <Sep />

      {linkDraft === null ? (
        <Btn label="Link" active={state?.link} disabled={disabled} onClick={() => setLinkDraft((editor?.getAttributes('link').href as string | undefined) ?? 'https://')}><Link {...ICON} /></Btn>
      ) : (
        <form
          className="wr-tb-link"
          onSubmit={(event) => {
            event.preventDefault();
            commitLink(false);
          }}
        >
          <input className="wr-control" value={linkDraft} autoFocus aria-label="Link address" onChange={(event) => setLinkDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setLinkDraft(null); }} onBlur={() => commitLink(true)} />
        </form>
      )}

      <Dropdown label={<><Plus {...ICON} /> <span>Insert</span></>} title="Insert" disabled={disabled} width={236}>
        {(close) => (
          <>
            <MenuItem icon={<Table size={14} />} label="Table" onSelect={() => { chain().insertTable({ rows: 4, cols: 3, withHeaderRow: true }).run(); close(); }} />
            <MenuItem icon={<ImageIcon size={14} />} label="Figure" onSelect={() => { chain().insertFigure({ src: null, caption: 'Figure caption' }).run(); close(); }} />
            <MenuItem icon={<span className="wr-dd__glyph">Aa</span>} label="Table caption" onSelect={() => { chain().insertCaption('table', 'Table caption').run(); close(); }} />
            <MenuItem icon={<Footprints size={14} />} label="Footnote" onSelect={() => { chain().insertFootnote('').run(); close(); }} />
            <MenuItem icon={<Quotes size={14} />} label="Quote" onSelect={() => { chain().toggleBlockquote().run(); close(); }} />
            <MenuItem icon={<Code size={14} />} label="Code block" onSelect={() => { chain().toggleCodeBlock().run(); close(); }} />
            <MenuSep />
            <MenuItem icon={<FileDashed size={14} />} label="Page break" hint="Ctrl+Enter" onSelect={() => { chain().insertPageBreak().run(); close(); }} />
            <MenuItem icon={<Minus size={14} />} label="Divider" onSelect={() => { chain().setHorizontalRule().run(); close(); }} />
            <MenuItem icon={<ListMagnifyingGlass size={14} />} label="Table of contents" onSelect={() => { chain().insertTableOfContents().run(); close(); }} />
            <MenuSep />
            <MenuLabel>Citation</MenuLabel>
            {bibliography.length === 0 && <MenuItem icon={<BookBookmark size={14} />} label="Add references…" onSelect={() => { onOpenReferences(); close(); }} />}
            {bibliography.slice(0, 8).map((ref) => (
              <MenuItem
                key={ref.id}
                icon={<span className="wr-dd__glyph">@</span>}
                label={ref.authors ? `${ref.authors.split(/[;,]/)[0]} (${ref.year || 'n.d.'})` : ref.title}
                onSelect={() => { chain().insertCitation([ref.key]).run(); close(); }}
              />
            ))}
            {bibliography.length > 8 && <MenuItem icon={<BookBookmark size={14} />} label="All references…" onSelect={() => { onOpenReferences(); close(); }} />}
            {bibliography.length > 0 && <MenuItem icon={<BookBookmark size={14} />} label="Bibliography" onSelect={() => { chain().insertBibliography().run(); close(); }} />}
          </>
        )}
      </Dropdown>

      {state?.table && (
        <Dropdown label={<><Table {...ICON} /> <span>Table</span></>} title="Table" disabled={disabled} width={200}>
          {(close) => (
            <>
              <MenuItem label="Row above" onSelect={() => { chain().addRowBefore().run(); close(); }} />
              <MenuItem label="Row below" onSelect={() => { chain().addRowAfter().run(); close(); }} />
              <MenuItem label="Column left" onSelect={() => { chain().addColumnBefore().run(); close(); }} />
              <MenuItem label="Column right" onSelect={() => { chain().addColumnAfter().run(); close(); }} />
              <MenuSep />
              <MenuItem label="Header row" onSelect={() => { chain().toggleHeaderRow().run(); close(); }} />
              <MenuItem label="Merge or split cells" onSelect={() => { chain().mergeOrSplit().run(); close(); }} />
              <MenuSep />
              <MenuItem label="Delete row" onSelect={() => { chain().deleteRow().run(); close(); }} />
              <MenuItem label="Delete column" onSelect={() => { chain().deleteColumn().run(); close(); }} />
              <MenuItem label="Delete table" onSelect={() => { chain().deleteTable().run(); close(); }} />
            </>
          )}
        </Dropdown>
      )}

      <Dropdown label={<DotsThree {...ICON} weight="bold" />} title="More formatting" disabled={disabled} width={200} caret={false}>
        {(close) => (
          <>
            <MenuItem icon={<TextStrikethrough size={14} />} label="Strikethrough" checked={state?.strike} onSelect={() => { chain().toggleStrike().run(); close(); }} />
            <MenuItem icon={<TextSuperscript size={14} />} label="Superscript" checked={state?.sup} onSelect={() => { chain().toggleSuperscript().run(); close(); }} />
            <MenuItem icon={<TextSubscript size={14} />} label="Subscript" checked={state?.sub} onSelect={() => { chain().toggleSubscript().run(); close(); }} />
            <MenuSep />
            <MenuItem icon={<Eraser size={14} />} label="Clear formatting" onSelect={() => { chain().unsetAllMarks().clearNodes().run(); close(); }} />
          </>
        )}
      </Dropdown>

      {ttsEnabled && (
        <>
          <Sep />
          <Btn label={narrateLabel} active={ttsBusy} disabled={disabled} onClick={narrate}>
            {ttsStatus === 'preparing' || ttsStatus === 'synthesizing'
              ? <CircleNotch {...ICON} className="animate-spin" />
              : ttsBusy
                ? <Stop {...ICON} weight="fill" />
                : <SpeakerHigh {...ICON} />}
          </Btn>
          <Dropdown label={<span className="wr-tb__value" style={{ width: 36 }}>{ttsSpeed}x</span>} title="Narration speed" disabled={disabled} width={120}>
            {(close) => (
              <>
                {TTS_SPEEDS.map((speed) => (
                  <MenuItem key={speed} label={`${speed}x`} checked={ttsSpeed === speed} onSelect={() => { setTtsSpeed(speed); close(); }} />
                ))}
              </>
            )}
          </Dropdown>
        </>
      )}
    </div>
  );
};
