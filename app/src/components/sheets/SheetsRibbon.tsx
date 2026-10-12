import React from 'react';
import {
  ArrowArcLeft, ArrowArcRight, ArrowCounterClockwise, ArrowsMerge, BracketsSquare, ChartBar, ClipboardText, Columns, Copy, Eraser, FunnelSimple, GridFour, Link, MagnifyingGlass,
  NotePencil, PaintBucket, Percent, Plus, Rows, Scissors, Sigma, SortAscending, SortDescending, Table, TextAlignCenter, TextAlignLeft, TextAlignRight,
  TextAa, TextB, TextItalic, TextStrikethrough, TextUnderline, TextAlignJustify, TextT, Eye, Snowflake, Sparkle, ListChecks, Function as FunctionIcon, Image,
  PaintBrush,
} from '@phosphor-icons/react';
import { FORMAT_PRESETS } from '../../utils/sheets/numberFormat';
import type { StylePatch } from '../../utils/sheets/opTypes';
import { ColorMenu, Dropdown, MenuItem, MenuSep, ToolButton, ToolSeparator } from './controls';
import type { SheetsEditor } from './useSheetsEditor';

export type RibbonTab = 'home' | 'insert' | 'formulas' | 'data' | 'view';

export interface RibbonActions {
  formatCells: () => void;
  conditionalFormat: () => void;
  validation: () => void;
  chart: () => void;
  pivot: () => void;
  find: (replace: boolean) => void;
  functions: () => void;
  names: () => void;
  note: () => void;
  link: () => void;
  table: () => void;
  sort: (order: 'asc' | 'desc') => void;
  filter: () => void;
  removeDuplicates: () => void;
  textToColumns: () => void;
  refreshPivots: () => void;
  pivotCount: number;
  freeze: (mode: 'row' | 'col' | 'both' | 'none') => void;
  toggleFormulas: () => void;
  toggleGridlines: () => void;
  toggleHeadings: () => void;
  toggleRtl: () => void;
  recalculate: () => void;
  askAi: (prompt: string) => void;
  mergeCells: (mode: 'merge' | 'center' | 'unmerge') => void;
  borders: (preset: 'all' | 'outside' | 'inside' | 'top' | 'bottom' | 'left' | 'right' | 'none') => void;
  cellStyle: (kind: 'header' | 'total' | 'note' | 'good' | 'bad' | 'clear') => void;
  decimals: (delta: 1 | -1) => void;
  showFormulas: boolean;
  gridlines: boolean;
  headings: boolean;
  rtl: boolean;
  hasFilter: boolean;
  frozen: boolean;
}

const FONTS = ['Calibri', 'Arial', 'Tahoma', 'Segoe UI', 'Cambria', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Consolas', 'Traditional Arabic', 'Simplified Arabic'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];

interface RibbonProps {
  editor: SheetsEditor;
  tab: RibbonTab;
  onTab: (tab: RibbonTab) => void;
  actions: RibbonActions;
  disabled: boolean;
}

const TABS: Array<{ id: RibbonTab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'formulas', label: 'Formulas' },
  { id: 'data', label: 'Data' },
  { id: 'view', label: 'View' },
];

export const SheetsRibbon: React.FC<RibbonProps> = ({ editor, tab, onTab, actions, disabled }) => {
  const style = editor.activeStyle;
  const patch = (value: StylePatch): void => editor.patchStyle(value);
  const hAlign = style.align?.h ?? 'general';
  const fontName = style.font?.name ?? editor.shown?.defaultFont?.name ?? 'Calibri';
  const fontSize = style.font?.size ?? editor.shown?.defaultFont?.size ?? 11;

  return (
    <div className="sh-ribbon" data-keep-edit>
      <div className="sh-ribbon__tabs" role="tablist" aria-label="Ribbon">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className="sh-ribbon__tab" onClick={() => onTab(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="sh-tools" role="toolbar" aria-label={`${tab} tools`} aria-disabled={disabled}>
        {tab === 'home' && (
          <>
            <ToolButton icon={<ArrowArcLeft size={15} />} title="Undo (Ctrl+Z)" disabled={editor.session.past.length === 0} onClick={() => editor.commands.undo()} />
            <ToolButton icon={<ArrowArcRight size={15} />} title="Redo (Ctrl+Y)" disabled={editor.session.future.length === 0} onClick={() => editor.commands.redo()} />
            <ToolSeparator />
            <Dropdown label={<ClipboardText size={15} />} title="Paste" disabled={disabled} width={190}>
              {(close) => (
                <>
                  <MenuItem label="Paste" hint="Ctrl+V" onSelect={() => { close(); void editor.pasteFromClipboard('all'); }} />
                  <MenuItem label="Paste values only" onSelect={() => { close(); void editor.pasteFromClipboard('values'); }} />
                  <MenuItem label="Paste formatting only" onSelect={() => { close(); void editor.pasteFromClipboard('formats'); }} />
                </>
              )}
            </Dropdown>
            <ToolButton icon={<Scissors size={15} />} title="Cut (Ctrl+X)" disabled={disabled} onClick={() => editor.copySelection(null, true)} />
            <ToolButton icon={<Copy size={15} />} title="Copy (Ctrl+C)" onClick={() => editor.copySelection(null, false)} />
            <ToolSeparator />
            <select
              className="sh-select sh-select--font"
              aria-label="Font"
              value={fontName}
              disabled={disabled}
              onChange={(event) => { patch({ font: { name: event.target.value } }); editor.requestFocus(); }}
            >
              {!FONTS.includes(fontName) && <option value={fontName}>{fontName}</option>}
              {FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
            <select
              className="sh-select sh-select--size"
              aria-label="Font size"
              value={fontSize}
              disabled={disabled}
              onChange={(event) => { patch({ font: { size: Number(event.target.value) } }); editor.requestFocus(); }}
            >
              {!SIZES.includes(fontSize) && <option value={fontSize}>{fontSize}</option>}
              {SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <ToolSeparator />
            <ToolButton icon={<TextB size={15} weight="bold" />} title="Bold (Ctrl+B)" active={Boolean(style.font?.bold)} disabled={disabled} onClick={() => editor.toggle('bold')} />
            <ToolButton icon={<TextItalic size={15} />} title="Italic (Ctrl+I)" active={Boolean(style.font?.italic)} disabled={disabled} onClick={() => editor.toggle('italic')} />
            <ToolButton icon={<TextUnderline size={15} />} title="Underline (Ctrl+U)" active={Boolean(style.font?.underline)} disabled={disabled} onClick={() => editor.toggle('underline')} />
            <ToolButton icon={<TextStrikethrough size={15} />} title="Strikethrough" active={Boolean(style.font?.strike)} disabled={disabled} onClick={() => editor.toggle('strike')} />
            <Dropdown label={<span className="sh-tool__swatch" style={{ '--swatch': style.font?.color ?? 'currentColor' } as React.CSSProperties}><TextAa size={15} /></span>} title="Font colour" disabled={disabled} width={218}>
              {(close) => <ColorMenu value={style.font?.color} none="Automatic" onPick={(color) => patch({ font: { color } })} close={close} />}
            </Dropdown>
            <Dropdown label={<span className="sh-tool__swatch" style={{ '--swatch': style.fill ?? 'transparent' } as React.CSSProperties}><PaintBucket size={15} /></span>} title="Fill colour" disabled={disabled} width={218}>
              {(close) => <ColorMenu value={style.fill} none="No fill" onPick={(color) => patch({ fill: color })} close={close} />}
            </Dropdown>
            <Dropdown label={<GridFour size={15} />} title="Borders" disabled={disabled} width={180}>
              {(close) => (
                <>
                  {([['all', 'All borders'], ['outside', 'Outside borders'], ['inside', 'Inside borders'], ['bottom', 'Bottom border'], ['top', 'Top border'], ['left', 'Left border'], ['right', 'Right border'], ['none', 'No border']] as const).map(([id, label]) => (
                    <MenuItem key={id} label={label} onSelect={() => { close(); actions.borders(id); }} />
                  ))}
                </>
              )}
            </Dropdown>
            <ToolSeparator />
            <ToolButton icon={<TextAlignLeft size={15} />} title="Align left" active={hAlign === 'left'} disabled={disabled} onClick={() => patch({ align: { h: hAlign === 'left' ? 'general' : 'left' } })} />
            <ToolButton icon={<TextAlignCenter size={15} />} title="Center" active={hAlign === 'center'} disabled={disabled} onClick={() => patch({ align: { h: hAlign === 'center' ? 'general' : 'center' } })} />
            <ToolButton icon={<TextAlignRight size={15} />} title="Align right" active={hAlign === 'right'} disabled={disabled} onClick={() => patch({ align: { h: hAlign === 'right' ? 'general' : 'right' } })} />
            <ToolButton icon={<TextAlignJustify size={15} />} title="Wrap text" active={Boolean(style.align?.wrap)} disabled={disabled} onClick={() => patch({ align: { wrap: style.align?.wrap ? null : true } })} />
            <Dropdown label={<ArrowsMerge size={15} />} title="Merge cells" disabled={disabled} width={190}>
              {(close) => (
                <>
                  <MenuItem label="Merge and center" onSelect={() => { close(); actions.mergeCells('center'); }} />
                  <MenuItem label="Merge cells" onSelect={() => { close(); actions.mergeCells('merge'); }} />
                  <MenuItem label="Unmerge cells" onSelect={() => { close(); actions.mergeCells('unmerge'); }} />
                </>
              )}
            </Dropdown>
            <ToolSeparator />
            <Dropdown label={<span className="sh-tool__text">{FORMAT_PRESETS.find((preset) => preset.code === (style.numFmt ?? 'General'))?.label ?? 'Custom'}</span>} title="Number format" disabled={disabled} width={250}>
              {(close) => (
                <>
                  {FORMAT_PRESETS.map((preset) => (
                    <MenuItem key={preset.id} label={preset.label} hint={preset.sample} checked={(style.numFmt ?? 'General') === preset.code} onSelect={() => { close(); patch({ numFmt: preset.code === 'General' ? null : preset.code }); }} />
                  ))}
                  <MenuSep />
                  <MenuItem label="More formats…" onSelect={() => { close(); actions.formatCells(); }} />
                </>
              )}
            </Dropdown>
            <ToolButton icon={<Percent size={15} />} title="Percent" disabled={disabled} onClick={() => patch({ numFmt: '0%' })} />
            <ToolButton icon={<span className="sh-tool__glyph">,</span>} title="Thousands separator" disabled={disabled} onClick={() => patch({ numFmt: '#,##0.00' })} />
            <ToolButton icon={<span className="sh-tool__glyph">.0→</span>} title="More decimals" disabled={disabled} onClick={() => actions.decimals(1)} />
            <ToolButton icon={<span className="sh-tool__glyph">←.0</span>} title="Fewer decimals" disabled={disabled} onClick={() => actions.decimals(-1)} />
            <ToolSeparator />
            <Dropdown label={<PaintBrush size={15} />} title="Cell styles" disabled={disabled} width={190}>
              {(close) => (
                <>
                  <MenuItem label="Header" onSelect={() => { close(); actions.cellStyle('header'); }} />
                  <MenuItem label="Total" onSelect={() => { close(); actions.cellStyle('total'); }} />
                  <MenuItem label="Note" onSelect={() => { close(); actions.cellStyle('note'); }} />
                  <MenuItem label="Good" onSelect={() => { close(); actions.cellStyle('good'); }} />
                  <MenuItem label="Bad" onSelect={() => { close(); actions.cellStyle('bad'); }} />
                  <MenuSep />
                  <MenuItem label="Clear formatting" onSelect={() => { close(); actions.cellStyle('clear'); }} />
                </>
              )}
            </Dropdown>
            <ToolButton icon={<Table size={15} />} title="Format as table" disabled={disabled} onClick={actions.table} />
            <Dropdown label={<Plus size={15} />} title="Insert and delete" disabled={disabled} width={200}>
              {(close) => (
                <>
                  <MenuItem label="Insert rows" onSelect={() => { close(); editor.structure('insertRows'); }} />
                  <MenuItem label="Insert columns" onSelect={() => { close(); editor.structure('insertCols'); }} />
                  <MenuSep />
                  <MenuItem label="Delete rows" danger onSelect={() => { close(); editor.structure('deleteRows'); }} />
                  <MenuItem label="Delete columns" danger onSelect={() => { close(); editor.structure('deleteCols'); }} />
                  <MenuSep />
                  <MenuItem label="Clear contents" onSelect={() => { close(); editor.clearSelection('contents'); }} />
                  <MenuItem label="Clear formatting" onSelect={() => { close(); editor.clearSelection('formats'); }} />
                  <MenuItem label="Clear all" onSelect={() => { close(); editor.clearSelection('all'); }} />
                </>
              )}
            </Dropdown>
            <ToolSeparator />
            <ToolButton icon={<Sigma size={15} />} title="AutoSum (Alt+=)" disabled={disabled} onClick={() => editor.autosum()} />
            <Dropdown label={<SortAscending size={15} />} title="Sort and filter" disabled={disabled} width={190}>
              {(close) => (
                <>
                  <MenuItem icon={<SortAscending size={14} />} label="Sort A to Z" onSelect={() => { close(); actions.sort('asc'); }} />
                  <MenuItem icon={<SortDescending size={14} />} label="Sort Z to A" onSelect={() => { close(); actions.sort('desc'); }} />
                  <MenuSep />
                  <MenuItem icon={<FunnelSimple size={14} />} label={actions.hasFilter ? 'Remove filter' : 'Filter'} onSelect={() => { close(); actions.filter(); }} />
                </>
              )}
            </Dropdown>
            <ToolButton icon={<MagnifyingGlass size={15} />} title="Find and replace (Ctrl+F)" onClick={() => actions.find(false)} />
          </>
        )}

        {tab === 'insert' && (
          <>
            <ToolButton icon={<ChartBar size={15} />} label="Chart" title="Insert chart" disabled={disabled} onClick={actions.chart} />
            <ToolButton icon={<Table size={15} />} label="Table" title="Format as table" disabled={disabled} onClick={actions.table} />
            <ToolButton icon={<Columns size={15} />} label="Pivot table" title="Summarise data with a pivot table" disabled={disabled} onClick={actions.pivot} />
            <ToolSeparator />
            <ToolButton icon={<NotePencil size={15} />} label="Note" title="Add a note to the cell" disabled={disabled} onClick={actions.note} />
            <ToolButton icon={<Link size={15} />} label="Link" title="Add a link to the cell" disabled={disabled} onClick={actions.link} />
            <ToolSeparator />
            <ToolButton icon={<FunctionIcon size={15} />} label="Function" title="Insert function" disabled={disabled} onClick={actions.functions} />
            <ToolButton icon={<Rows size={15} />} label="Rows" title="Insert rows" disabled={disabled} onClick={() => editor.structure('insertRows')} />
            <ToolButton icon={<Columns size={15} />} label="Columns" title="Insert columns" disabled={disabled} onClick={() => editor.structure('insertCols')} />
          </>
        )}

        {tab === 'formulas' && (
          <>
            <ToolButton icon={<FunctionIcon size={15} />} label="Insert function" title="Browse functions" disabled={disabled} onClick={actions.functions} />
            <ToolButton icon={<Sigma size={15} />} label="AutoSum" title="AutoSum (Alt+=)" disabled={disabled} onClick={() => editor.autosum()} />
            <ToolSeparator />
            <ToolButton icon={<BracketsSquare size={15} />} label="Names" title="Named ranges" disabled={disabled} onClick={actions.names} />
            <ToolSeparator />
            <ToolButton icon={<Eye size={15} />} label="Show formulas" title="Show formulas instead of results" active={actions.showFormulas} onClick={actions.toggleFormulas} />
            <ToolButton icon={<Sparkle size={15} />} label="Recalculate" title="Calculate every formula again" disabled={disabled} onClick={actions.recalculate} />
            <ToolSeparator />
            <ToolButton icon={<Sparkle size={15} />} label="Explain formula" title="Ask the assistant to explain the selected formula" onClick={() => actions.askAi('Explain the formula in the selected cell step by step, and say if anything looks wrong with it.')} />
            <ToolButton icon={<Sparkle size={15} />} label="Fix errors" title="Ask the assistant to fix formula errors" disabled={disabled} onClick={() => actions.askAi('Find the cells in this sheet that show errors or look wrong, fix them, and say what you changed.')} />
          </>
        )}

        {tab === 'data' && (
          <>
            <ToolButton icon={<SortAscending size={15} />} label="Sort A–Z" title="Sort ascending" disabled={disabled} onClick={() => actions.sort('asc')} />
            <ToolButton icon={<SortDescending size={15} />} label="Sort Z–A" title="Sort descending" disabled={disabled} onClick={() => actions.sort('desc')} />
            <ToolButton icon={<FunnelSimple size={15} />} label="Filter" title="Turn the filter on or off" active={actions.hasFilter} disabled={disabled} onClick={actions.filter} />
            <ToolSeparator />
            <ToolButton icon={<Eraser size={15} />} label="Remove duplicates" title="Remove duplicate rows" disabled={disabled} onClick={actions.removeDuplicates} />
            <ToolButton icon={<Columns size={15} />} label="Text to columns" title="Split one column of text into columns" disabled={disabled} onClick={actions.textToColumns} />
            <ToolButton icon={<ArrowCounterClockwise size={15} />} label="Refresh pivots" title={actions.pivotCount ? `Rebuild ${actions.pivotCount} saved pivot table${actions.pivotCount === 1 ? '' : 's'}` : 'No saved pivot tables yet'} disabled={disabled || actions.pivotCount === 0} onClick={actions.refreshPivots} />
            <ToolButton icon={<ListChecks size={15} />} label="Validation" title="Data validation" disabled={disabled} onClick={actions.validation} />
            <ToolButton icon={<PaintBucket size={15} />} label="Conditional format" title="Conditional formatting" disabled={disabled} onClick={actions.conditionalFormat} />
            <ToolSeparator />
            <ToolButton icon={<Sparkle size={15} />} label="Clean data" title="Ask the assistant to clean the data" disabled={disabled} onClick={() => actions.askAi('Clean the data in the selected range: trim spaces, fix obvious typos and inconsistent capitalisation, and make dates and numbers real values. Keep a column of notes for anything you changed.')} />
            <ToolButton icon={<Sparkle size={15} />} label="Fill with AI" title="Ask the assistant to fill a column from a pattern or formula" disabled={disabled} onClick={() => actions.askAi('Fill the empty cells of the selected column using a formula that follows the pattern of the filled ones.')} />
          </>
        )}

        {tab === 'view' && (
          <>
            <Dropdown label={<><Snowflake size={15} /><span className="sh-tool__text">Freeze panes</span></>} title="Freeze panes" width={220}>
              {(close) => (
                <>
                  <MenuItem label="Freeze top row" onSelect={() => { close(); actions.freeze('row'); }} />
                  <MenuItem label="Freeze first column" onSelect={() => { close(); actions.freeze('col'); }} />
                  <MenuItem label="Freeze rows and columns above the cursor" onSelect={() => { close(); actions.freeze('both'); }} />
                  <MenuSep />
                  <MenuItem label="Unfreeze" disabled={!actions.frozen} onSelect={() => { close(); actions.freeze('none'); }} />
                </>
              )}
            </Dropdown>
            <ToolSeparator />
            <ToolButton icon={<GridFour size={15} />} label="Gridlines" title="Show gridlines" active={actions.gridlines} onClick={actions.toggleGridlines} />
            <ToolButton icon={<TextT size={15} />} label="Headings" title="Show row and column headings" active={actions.headings} onClick={actions.toggleHeadings} />
            <ToolButton icon={<Eye size={15} />} label="Formulas" title="Show formulas" active={actions.showFormulas} onClick={actions.toggleFormulas} />
            <ToolSeparator />
            <ToolButton icon={<TextAlignRight size={15} />} label="Right to left" title="Make this sheet right to left (Arabic, Hebrew)" active={actions.rtl} disabled={disabled} onClick={actions.toggleRtl} />
            <ToolSeparator />
            <ToolButton icon={<Image size={15} />} label="Hide rows" title="Hide the selected rows" disabled={disabled} onClick={() => editor.structure('hideRows')} />
            <ToolButton icon={<Image size={15} />} label="Hide columns" title="Hide the selected columns" disabled={disabled} onClick={() => editor.structure('hideCols')} />
            <ToolButton icon={<Eye size={15} />} label="Unhide" title="Show hidden rows and columns around the selection" disabled={disabled} onClick={() => { editor.structure('showRows'); editor.structure('showCols'); }} />
          </>
        )}
      </div>
    </div>
  );
};
