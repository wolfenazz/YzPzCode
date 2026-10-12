import React, { useMemo, useState } from 'react';
import { cellKey, colName, normRange, parseRange, rangeText } from '../../utils/sheets/address';
import { FUNCTION_GROUPS } from '../../utils/sheets/formula/functions';
import { FUNCTION_DOCS } from '../../utils/sheets/functionDocs';
import { findAll, nextHit, replaceIn, type FindHit, type FindOptions } from '../../utils/sheets/find';
import { FORMAT_PRESETS, formatNumber } from '../../utils/sheets/numberFormat';
import type { ConditionalRule, Op, StylePatch } from '../../utils/sheets/opTypes';
import type { BorderStyle, ChartKind, DataValidation, Pivot } from '../../utils/sheets/types';
import { CheckRow, Dialog, DialogButtons, FieldRow } from './Dialog';
import type { SheetsEditor } from './useSheetsEditor';

const lastRange = (editor: SheetsEditor) => normRange(editor.selection.ranges[editor.selection.ranges.length - 1]);

// ---- Format cells ----

type FormatTab = 'number' | 'align' | 'font' | 'border' | 'fill';

const BORDER_PRESETS: Array<{ id: 'all' | 'outside' | 'inside' | 'top' | 'bottom' | 'left' | 'right' | 'none'; label: string }> = [
  { id: 'none', label: 'None' }, { id: 'outside', label: 'Outline' }, { id: 'all', label: 'All' }, { id: 'inside', label: 'Inside' },
  { id: 'top', label: 'Top' }, { id: 'bottom', label: 'Bottom' }, { id: 'left', label: 'Left' }, { id: 'right', label: 'Right' },
];

export const FormatCellsDialog: React.FC<{ editor: SheetsEditor; initialTab?: FormatTab; onClose: () => void }> = ({ editor, initialTab = 'number', onClose }) => {
  const current = editor.activeStyle;
  const [tab, setTab] = useState<FormatTab>(initialTab);
  const [code, setCode] = useState(current.numFmt ?? 'General');
  const [h, setH] = useState(current.align?.h ?? 'general');
  const [v, setV] = useState(current.align?.v ?? 'bottom');
  const [wrap, setWrap] = useState(Boolean(current.align?.wrap));
  const [shrink, setShrink] = useState(Boolean(current.align?.shrink));
  const [indent, setIndent] = useState(current.align?.indent ?? 0);
  const [reading, setReading] = useState<0 | 1 | 2>(current.align?.reading ?? 0);
  const [fontName, setFontName] = useState(current.font?.name ?? '');
  const [fontSize, setFontSize] = useState(current.font?.size ?? 0);
  const [bold, setBold] = useState(Boolean(current.font?.bold));
  const [italic, setItalic] = useState(Boolean(current.font?.italic));
  const [underline, setUnderline] = useState(Boolean(current.font?.underline));
  const [strike, setStrike] = useState(Boolean(current.font?.strike));
  const [color, setColor] = useState(current.font?.color ?? '#000000');
  const [fill, setFill] = useState(current.fill ?? '');
  const [borderPreset, setBorderPreset] = useState<typeof BORDER_PRESETS[number]['id'] | null>(null);
  const [borderStyle, setBorderStyle] = useState<BorderStyle>('thin');
  const [borderColor, setBorderColor] = useState('#000000');
  const [locked, setLocked] = useState(current.locked !== false);
  const sample = useMemo(() => {
    const result = formatNumber(1234.5678, code || 'General');
    return result.text;
  }, [code]);

  const apply = (): void => {
    const patch: StylePatch = {
      numFmt: code === 'General' || code === '' ? null : code,
      align: { h: h === 'general' ? null : h, v: v === 'bottom' ? null : v, wrap: wrap ? true : null, shrink: shrink ? true : null, indent: indent || null, reading: reading || null },
      font: {
        name: fontName || null,
        size: fontSize || null,
        bold: bold ? true : null,
        italic: italic ? true : null,
        underline: underline ? true : null,
        strike: strike ? true : null,
        color: color === '#000000' ? null : color,
      },
      fill: fill || null,
      locked,
    };
    const ops: Op[] = [];
    const name = editor.sheetName;
    for (const range of editor.selection.ranges) {
      ops.push({ op: 'format', sheet: name, range: rangeText(normRange(range)), style: patch });
      if (borderPreset) ops.push({ op: 'borders', sheet: name, range: rangeText(normRange(range)), preset: borderPreset, style: borderStyle, color: borderColor });
    }
    editor.apply(ops);
    onClose();
    editor.requestFocus();
  };

  return (
    <Dialog title="Format cells" onClose={onClose} width={520} footer={<DialogButtons primary="OK" onPrimary={apply} onCancel={onClose} />}>
      <div className="sh-tabsbar" role="tablist">
        {([['number', 'Number'], ['align', 'Alignment'], ['font', 'Font'], ['border', 'Border'], ['fill', 'Fill']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'number' && (
        <div className="sh-form">
          <div className="sh-formats">
            {FORMAT_PRESETS.map((preset) => (
              <button key={preset.id} type="button" className={code === preset.code ? 'is-on' : ''} onClick={() => setCode(preset.code)}>{preset.label}</button>
            ))}
          </div>
          <FieldRow label="Format code" hint="Excel codes such as #,##0.00 or dd/mm/yyyy">
            <input className="sh-input" value={code} onChange={(event) => setCode(event.target.value)} dir="ltr" spellCheck={false} />
          </FieldRow>
          <div className="sh-sample">Sample <strong>{sample}</strong></div>
        </div>
      )}
      {tab === 'align' && (
        <div className="sh-form sh-form--grid">
          <FieldRow label="Horizontal">
            <select className="sh-input" value={h} onChange={(event) => setH(event.target.value as typeof h)}>
              {['general', 'left', 'center', 'right', 'justify', 'centerContinuous', 'distributed'].map((value) => <option key={value} value={value}>{value === 'centerContinuous' ? 'Center across selection' : value[0].toUpperCase() + value.slice(1)}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Vertical">
            <select className="sh-input" value={v} onChange={(event) => setV(event.target.value as typeof v)}>
              {['top', 'center', 'bottom', 'justify', 'distributed'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Indent">
            <input className="sh-input" type="number" min={0} max={15} value={indent} onChange={(event) => setIndent(Number(event.target.value))} />
          </FieldRow>
          <FieldRow label="Reading order">
            <select className="sh-input" value={reading} onChange={(event) => setReading(Number(event.target.value) as 0 | 1 | 2)}>
              <option value={0}>Context</option>
              <option value={1}>Left to right</option>
              <option value={2}>Right to left</option>
            </select>
          </FieldRow>
          <CheckRow label="Wrap text" checked={wrap} onChange={setWrap} />
          <CheckRow label="Shrink to fit" checked={shrink} onChange={setShrink} />
        </div>
      )}
      {tab === 'font' && (
        <div className="sh-form sh-form--grid">
          <FieldRow label="Font" hint="empty keeps the workbook font">
            <input className="sh-input" value={fontName} onChange={(event) => setFontName(event.target.value)} placeholder="Calibri" />
          </FieldRow>
          <FieldRow label="Size" hint="points">
            <input className="sh-input" type="number" min={0} max={409} value={fontSize || ''} onChange={(event) => setFontSize(Number(event.target.value))} placeholder="11" />
          </FieldRow>
          <FieldRow label="Colour">
            <input className="sh-input sh-input--color" type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} />
          </FieldRow>
          <div className="sh-form__row">
            <CheckRow label="Bold" checked={bold} onChange={setBold} />
            <CheckRow label="Italic" checked={italic} onChange={setItalic} />
            <CheckRow label="Underline" checked={underline} onChange={setUnderline} />
            <CheckRow label="Strikethrough" checked={strike} onChange={setStrike} />
          </div>
        </div>
      )}
      {tab === 'border' && (
        <div className="sh-form">
          <div className="sh-formats">
            {BORDER_PRESETS.map((preset) => (
              <button key={preset.id} type="button" className={borderPreset === preset.id ? 'is-on' : ''} onClick={() => setBorderPreset(preset.id)}>{preset.label}</button>
            ))}
          </div>
          <div className="sh-form--grid">
            <FieldRow label="Line">
              <select className="sh-input" value={borderStyle} onChange={(event) => setBorderStyle(event.target.value as BorderStyle)}>
                {(['thin', 'medium', 'thick', 'dashed', 'dotted', 'double', 'hair'] as BorderStyle[]).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Colour"><input className="sh-input sh-input--color" type="color" value={borderColor} onChange={(event) => setBorderColor(event.target.value.toUpperCase())} /></FieldRow>
          </div>
        </div>
      )}
      {tab === 'fill' && (
        <div className="sh-form">
          <FieldRow label="Background colour">
            <input className="sh-input sh-input--color" type="color" value={fill || '#ffffff'} onChange={(event) => setFill(event.target.value.toUpperCase())} />
          </FieldRow>
          <button type="button" className="sx-btn sx-btn--sm" onClick={() => setFill('')}>No fill</button>
          <CheckRow label="Locked (applies when the sheet is protected)" checked={locked} onChange={setLocked} />
        </div>
      )}
    </Dialog>
  );
};

// ---- Conditional formatting ----

type CfKind = 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'contains' | 'duplicates' | 'unique' | 'top' | 'bottom' | 'aboveAverage' | 'colorScale' | 'dataBar' | 'iconSet' | 'formula' | 'blanks';

const CF_LABELS: Record<CfKind, string> = {
  greaterThan: 'Greater than', lessThan: 'Less than', between: 'Between', equal: 'Equal to', contains: 'Text contains', duplicates: 'Duplicate values', unique: 'Unique values',
  top: 'Top N items', bottom: 'Bottom N items', aboveAverage: 'Above average', colorScale: 'Colour scale', dataBar: 'Data bars', iconSet: 'Icon set', formula: 'Custom formula', blanks: 'Blank cells',
};

const CF_STYLES: Array<{ id: string; label: string; fill: string; color: string }> = [
  { id: 'red', label: 'Light red fill, dark red text', fill: '#FFC7CE', color: '#9C0006' },
  { id: 'yellow', label: 'Yellow fill, dark yellow text', fill: '#FFEB9C', color: '#9C5700' },
  { id: 'green', label: 'Green fill, dark green text', fill: '#C6EFCE', color: '#006100' },
  { id: 'blue', label: 'Light blue fill, dark blue text', fill: '#DDEBF7', color: '#1F4E78' },
  { id: 'gray', label: 'Gray fill, dark text', fill: '#E7E6E6', color: '#333333' },
];

export const ConditionalFormatDialog: React.FC<{ editor: SheetsEditor; onClose: () => void }> = ({ editor, onClose }) => {
  const [kind, setKind] = useState<CfKind>('greaterThan');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [text, setText] = useState('');
  const [n, setN] = useState(10);
  const [style, setStyle] = useState('red');
  const [formula, setFormula] = useState('');
  const range = rangeText(lastRange(editor));
  const existing = editor.shown?.sheets[editor.sheetIndex]?.cf.filter((entry) => entry.sqref.split(' ').some((part) => {
    const r = parseRange(part);
    const sel = lastRange(editor);
    return r && r.r1 <= sel.r2 && r.r2 >= sel.r1 && r.c1 <= sel.c2 && r.c2 >= sel.c1;
  })).length ?? 0;
  const chosen = CF_STYLES.find((entry) => entry.id === style) ?? CF_STYLES[0];
  const dxf = { fill: chosen.fill, font: { color: chosen.color } };

  const build = (): ConditionalRule | null => {
    switch (kind) {
      case 'greaterThan': case 'lessThan': case 'equal': return a === '' ? null : { kind: 'cell', op: kind, a, style: dxf };
      case 'between': return a === '' || b === '' ? null : { kind: 'cell', op: 'between', a, b, style: dxf };
      case 'contains': return text === '' ? null : { kind: 'text', op: 'contains', text, style: dxf };
      case 'duplicates': case 'unique': case 'blanks': return { kind, style: dxf };
      case 'top': case 'bottom': return { kind: 'top', n, bottom: kind === 'bottom', style: dxf };
      case 'aboveAverage': return { kind: 'aboveAverage', style: dxf };
      case 'colorScale': return { kind: 'colorScale', colors: ['#F8696B', '#FFEB84', '#63BE7B'] };
      case 'dataBar': return { kind: 'dataBar', color: '#638EC6' };
      case 'iconSet': return { kind: 'iconSet', set: '3TrafficLights' };
      case 'formula': return formula.trim() === '' ? null : { kind: 'expression', formula: formula.replace(/^=/, ''), style: dxf };
    }
  };
  const rule = build();
  const usesStyle = !['colorScale', 'dataBar', 'iconSet'].includes(kind);

  return (
    <Dialog
      title="Conditional formatting"
      onClose={onClose}
      footer={(
        <DialogButtons
          primary="Add rule"
          disabled={!rule}
          onPrimary={() => { if (rule) { editor.apply([{ op: 'conditionalFormat', sheet: editor.sheetName, range, rule }]); onClose(); editor.requestFocus(); } }}
          onCancel={onClose}
          secondary={existing > 0 && (
            <button type="button" className="sx-btn sx-btn--quiet" onClick={() => { editor.apply([{ op: 'conditionalFormat', sheet: editor.sheetName, range, clear: true }]); onClose(); }}>
              Clear rules here ({existing})
            </button>
          )}
        />
      )}
    >
      <div className="sh-form">
        <FieldRow label="Applies to"><input className="sh-input" value={range} readOnly /></FieldRow>
        <FieldRow label="Rule">
          <select className="sh-input" value={kind} onChange={(event) => setKind(event.target.value as CfKind)}>
            {(Object.keys(CF_LABELS) as CfKind[]).map((id) => <option key={id} value={id}>{CF_LABELS[id]}</option>)}
          </select>
        </FieldRow>
        {['greaterThan', 'lessThan', 'equal', 'between'].includes(kind) && (
          <div className="sh-form--grid">
            <FieldRow label={kind === 'between' ? 'From' : 'Value'}><input className="sh-input" value={a} onChange={(event) => setA(event.target.value)} placeholder="50 or =B1" /></FieldRow>
            {kind === 'between' && <FieldRow label="To"><input className="sh-input" value={b} onChange={(event) => setB(event.target.value)} /></FieldRow>}
          </div>
        )}
        {kind === 'contains' && <FieldRow label="Text"><input className="sh-input" dir="auto" value={text} onChange={(event) => setText(event.target.value)} /></FieldRow>}
        {(kind === 'top' || kind === 'bottom') && <FieldRow label="Items"><input className="sh-input" type="number" min={1} value={n} onChange={(event) => setN(Number(event.target.value))} /></FieldRow>}
        {kind === 'formula' && <FieldRow label="Formula" hint="written for the first cell, true applies the format"><input className="sh-input" value={formula} onChange={(event) => setFormula(event.target.value)} placeholder={`=$B2>100`} /></FieldRow>}
        {usesStyle && (
          <FieldRow label="Format">
            <select className="sh-input" value={style} onChange={(event) => setStyle(event.target.value)}>
              {CF_STYLES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </FieldRow>
        )}
        {usesStyle && <div className="sh-sample" style={{ background: chosen.fill, color: chosen.color }}>AaBbCc 123</div>}
      </div>
    </Dialog>
  );
};

// ---- Data validation ----

type ValidationKind = 'any' | DataValidation['type'];

export const ValidationDialog: React.FC<{ editor: SheetsEditor; onClose: () => void }> = ({ editor, onClose }) => {
  const sheet = editor.shown?.sheets[editor.sheetIndex];
  const range = lastRange(editor);
  const existing = sheet?.validations.find((entry) => entry.sqref.split(' ').some((part) => {
    const r = parseRange(part);
    return r && r.r1 <= range.r2 && r.r2 >= range.r1 && r.c1 <= range.c2 && r.c2 >= range.c1;
  }));
  const [type, setType] = useState<ValidationKind>(existing?.type ?? 'any');
  const [op, setOp] = useState<NonNullable<DataValidation['op']>>(existing?.op ?? 'between');
  const [a, setA] = useState(existing?.a ?? '');
  const [b, setB] = useState(existing?.b ?? '');
  const [allowBlank, setAllowBlank] = useState(existing?.allowBlank !== false);
  const [dropdown, setDropdown] = useState(existing?.showDropdown !== false);
  const [errorStyle, setErrorStyle] = useState<NonNullable<DataValidation['errorStyle']>>(existing?.errorStyle ?? 'stop');
  const [errorTitle, setErrorTitle] = useState(existing?.errorTitle ?? '');
  const [error, setError] = useState(existing?.error ?? '');
  const [promptTitle, setPromptTitle] = useState(existing?.promptTitle ?? '');
  const [prompt, setPrompt] = useState(existing?.prompt ?? '');

  const apply = (): void => {
    const target = rangeText(range);
    if (type === 'any') editor.apply([{ op: 'validation', sheet: editor.sheetName, range: target, rule: null }]);
    else {
      const rule: Omit<DataValidation, 'sqref'> = { type, allowBlank, showDropdown: dropdown, errorStyle };
      if (type !== 'list' && type !== 'custom') rule.op = op;
      if (a) rule.a = a;
      if (b && op.toLowerCase().includes('between')) rule.b = b;
      if (errorTitle) rule.errorTitle = errorTitle;
      if (error) rule.error = error;
      if (promptTitle) rule.promptTitle = promptTitle;
      if (prompt) rule.prompt = prompt;
      editor.apply([{ op: 'validation', sheet: editor.sheetName, range: target, rule }]);
    }
    onClose();
    editor.requestFocus();
  };

  const needsBetween = type !== 'any' && type !== 'list' && type !== 'custom' && (op === 'between' || op === 'notBetween');
  return (
    <Dialog title="Data validation" onClose={onClose} footer={<DialogButtons primary="OK" onPrimary={apply} onCancel={onClose} />}>
      <div className="sh-form">
        <FieldRow label="Allow">
          <select className="sh-input" value={type} onChange={(event) => setType(event.target.value as ValidationKind)}>
            <option value="any">Any value</option>
            <option value="whole">Whole number</option>
            <option value="decimal">Decimal</option>
            <option value="list">List</option>
            <option value="date">Date</option>
            <option value="time">Time</option>
            <option value="textLength">Text length</option>
            <option value="custom">Custom formula</option>
          </select>
        </FieldRow>
        {type === 'list' && (
          <>
            <FieldRow label="Source" hint="comma-separated items, or a range like =$E$1:$E$5"><input className="sh-input" dir="auto" value={a} onChange={(event) => setA(event.target.value)} placeholder="Yes, No, Maybe" /></FieldRow>
            <CheckRow label="Show a dropdown in the cell" checked={dropdown} onChange={setDropdown} />
          </>
        )}
        {type !== 'any' && type !== 'list' && type !== 'custom' && (
          <>
            <FieldRow label="Data">
              <select className="sh-input" value={op} onChange={(event) => setOp(event.target.value as typeof op)}>
                {[['between', 'between'], ['notBetween', 'not between'], ['equal', 'equal to'], ['notEqual', 'not equal to'], ['greaterThan', 'greater than'], ['lessThan', 'less than'], ['greaterThanOrEqual', 'greater than or equal to'], ['lessThanOrEqual', 'less than or equal to']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FieldRow>
            <div className="sh-form--grid">
              <FieldRow label={needsBetween ? 'Minimum' : 'Value'}><input className="sh-input" value={a} onChange={(event) => setA(event.target.value)} /></FieldRow>
              {needsBetween && <FieldRow label="Maximum"><input className="sh-input" value={b} onChange={(event) => setB(event.target.value)} /></FieldRow>}
            </div>
          </>
        )}
        {type === 'custom' && <FieldRow label="Formula" hint="true means the entry is allowed"><input className="sh-input" value={a} onChange={(event) => setA(event.target.value)} placeholder="=A1>0" /></FieldRow>}
        {type !== 'any' && (
          <>
            <CheckRow label="Ignore blank" checked={allowBlank} onChange={setAllowBlank} />
            <div className="sh-form--grid">
              <FieldRow label="When it is wrong">
                <select className="sh-input" value={errorStyle} onChange={(event) => setErrorStyle(event.target.value as typeof errorStyle)}>
                  <option value="stop">Refuse the entry</option>
                  <option value="warning">Warn</option>
                  <option value="information">Inform</option>
                </select>
              </FieldRow>
              <FieldRow label="Message title"><input className="sh-input" value={errorTitle} onChange={(event) => setErrorTitle(event.target.value)} /></FieldRow>
            </div>
            <FieldRow label="Message"><input className="sh-input" dir="auto" value={error} onChange={(event) => setError(event.target.value)} /></FieldRow>
            <div className="sh-form--grid">
              <FieldRow label="Input hint title"><input className="sh-input" value={promptTitle} onChange={(event) => setPromptTitle(event.target.value)} /></FieldRow>
              <FieldRow label="Input hint"><input className="sh-input" dir="auto" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></FieldRow>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};

// ---- Chart ----

const CHART_KINDS: Array<{ id: ChartKind; label: string }> = [
  { id: 'column', label: 'Column' }, { id: 'bar', label: 'Bar' }, { id: 'line', label: 'Line' }, { id: 'area', label: 'Area' },
  { id: 'pie', label: 'Pie' }, { id: 'doughnut', label: 'Doughnut' }, { id: 'scatter', label: 'Scatter' },
];

export const ChartDialog: React.FC<{ editor: SheetsEditor; onClose: () => void }> = ({ editor, onClose }) => {
  const sel = lastRange(editor);
  const single = sel.r1 === sel.r2 && sel.c1 === sel.c2;
  const [kind, setKind] = useState<ChartKind>('column');
  const [range, setRange] = useState(single ? '' : rangeText(sel));
  const [title, setTitle] = useState('');
  const [stacked, setStacked] = useState(false);
  const [labels, setLabels] = useState(false);
  const [smooth, setSmooth] = useState(false);
  const valid = parseRange(range.replace(/^.*!/, '')) !== null;
  return (
    <Dialog
      title="Insert chart"
      onClose={onClose}
      onEnter={() => valid && create()}
      footer={<DialogButtons primary="Insert" disabled={!valid} onPrimary={create} onCancel={onClose} />}
    >
      <div className="sh-form">
        <div className="sh-kinds" role="radiogroup" aria-label="Chart type">
          {CHART_KINDS.map((entry) => (
            <button key={entry.id} type="button" role="radio" aria-checked={kind === entry.id} onClick={() => setKind(entry.id)}>{entry.label}</button>
          ))}
        </div>
        <FieldRow label="Data range" hint="include the header row and the label column">
          <input className="sh-input" value={range} onChange={(event) => setRange(event.target.value)} placeholder="A1:C10" spellCheck={false} data-autofocus />
        </FieldRow>
        <FieldRow label="Title"><input className="sh-input" dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} /></FieldRow>
        <div className="sh-form__row">
          {(kind === 'column' || kind === 'bar' || kind === 'area') && <CheckRow label="Stacked" checked={stacked} onChange={setStacked} />}
          {(kind === 'line') && <CheckRow label="Smooth lines" checked={smooth} onChange={setSmooth} />}
          <CheckRow label="Data labels" checked={labels} onChange={setLabels} />
        </div>
      </div>
    </Dialog>
  );

  function create(): void {
    editor.apply([{ op: 'chart', sheet: editor.sheetName, chart: { kind, title: title || undefined, range: range.replace(/^.*!/, ''), stacked, smooth, dataLabels: labels } }]);
    onClose();
    editor.requestFocus();
  }
};

// ---- Pivot ----

export const PivotDialog: React.FC<{ editor: SheetsEditor; onClose: () => void; onCreated: (def: Pivot) => void }> = ({ editor, onClose, onCreated }) => {
  const sheet = editor.shown?.sheets[editor.sheetIndex];
  const sel = lastRange(editor);
  const [source, setSource] = useState(sel.r1 === sel.r2 && sel.c1 === sel.c2 ? '' : rangeText(sel));
  const [rows, setRows] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [values, setValues] = useState<Array<{ field: string; agg: 'sum' | 'count' | 'average' | 'min' | 'max' }>>([]);
  const [target, setTarget] = useState<'new' | 'here'>('new');
  const parsed = parseRange(source);
  const headers = useMemo(() => {
    if (!sheet || !parsed) return [];
    const out: string[] = [];
    for (let c = parsed.c1; c <= parsed.c2; c += 1) {
      const cell = sheet.cells[cellKey(parsed.r1, c)];
      out.push(cell?.v !== undefined ? String(cell.v) : `Column ${colName(c)}`);
    }
    return out;
  }, [sheet, parsed]);

  const place = (field: string, to: 'rows' | 'columns' | 'values' | 'none'): void => {
    setRows((list) => (to === 'rows' ? [...list.filter((x) => x !== field), field] : list.filter((x) => x !== field)));
    setColumns((list) => (to === 'columns' ? [...list.filter((x) => x !== field), field] : list.filter((x) => x !== field)));
    setValues((list) => (to === 'values' ? [...list.filter((x) => x.field !== field), { field, agg: 'sum' as const }] : list.filter((x) => x.field !== field)));
  };
  const where = (field: string): 'rows' | 'columns' | 'values' | 'none' => (rows.includes(field) ? 'rows' : columns.includes(field) ? 'columns' : values.some((v) => v.field === field) ? 'values' : 'none');
  const ready = Boolean(parsed) && values.length > 0 && (rows.length > 0 || columns.length > 0);

  const create = (): void => {
    if (!sheet || !parsed) return;
    const ops: Op[] = [];
    let targetSheet = sheet.name;
    let targetCell = cellKey(parsed.r1, parsed.c2 + 2);
    if (target === 'new') {
      targetSheet = 'Pivot';
      let n = 1;
      const taken = new Set((editor.shown?.sheets ?? []).map((s) => s.name.toLowerCase()));
      while (taken.has(targetSheet.toLowerCase())) { n += 1; targetSheet = `Pivot ${n}`; }
      ops.push({ op: 'addSheet', name: targetSheet });
      targetCell = 'A3';
    }
    const quote = (name: string): string => (/^[A-Za-z_][\w.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);
    ops.push({ op: 'pivot', sheet: targetSheet, pivot: { source: `${quote(sheet.name)}!${source}`, target: targetCell, rows, columns, values } });
    if (target === 'new') ops.push({ op: 'colWidth', sheet: targetSheet, cols: 'A:H', width: 'auto' });
    editor.apply(ops);
    // The definition is kept with the workbook so Data > Refresh pivots can rebuild it after the data changes.
    onCreated({
      id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`,
      name: targetSheet === sheet.name ? `Pivot ${targetCell}` : targetSheet,
      source: `${quote(sheet.name)}!${source}`,
      target: `${quote(targetSheet)}!${targetCell}`,
      rows, columns, values,
    });
    onClose();
  };

  return (
    <Dialog title="Pivot table" onClose={onClose} width={520} footer={<DialogButtons primary="Create" disabled={!ready} onPrimary={create} onCancel={onClose} />}>
      <div className="sh-form">
        <FieldRow label="Source range" hint="with a header row"><input className="sh-input" value={source} onChange={(event) => setSource(event.target.value)} placeholder="A1:D100" data-autofocus /></FieldRow>
        {headers.length > 0 && (
          <div className="sh-pivot">
            {headers.map((field) => (
              <div key={field} className="sh-pivot__row">
                <span dir="auto">{field}</span>
                <select className="sh-input" value={where(field)} onChange={(event) => place(field, event.target.value as 'rows' | 'columns' | 'values' | 'none')}>
                  <option value="none">—</option>
                  <option value="rows">Rows</option>
                  <option value="columns">Columns</option>
                  <option value="values">Values</option>
                </select>
                {where(field) === 'values' && (
                  <select className="sh-input" value={values.find((v) => v.field === field)?.agg} onChange={(event) => setValues((list) => list.map((v) => (v.field === field ? { ...v, agg: event.target.value as typeof v.agg } : v)))}>
                    {['sum', 'count', 'average', 'min', 'max'].map((agg) => <option key={agg} value={agg}>{agg}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
        <FieldRow label="Place it">
          <select className="sh-input" value={target} onChange={(event) => setTarget(event.target.value as 'new' | 'here')}>
            <option value="new">On a new sheet</option>
            <option value="here">Next to the data</option>
          </select>
        </FieldRow>
        <p className="sh-note">In Excel the result appears as values. The definition is saved with the workbook: rebuild it from Data &gt; Refresh pivots after the data changes.</p>
      </div>
    </Dialog>
  );
};

// ---- Text to columns ----

const DELIMITERS: Array<{ id: string; label: string; char: string }> = [
  { id: 'comma', label: 'Comma (,)', char: ',' },
  { id: 'semicolon', label: 'Semicolon (;)', char: ';' },
  { id: 'tab', label: 'Tab', char: '\t' },
  { id: 'space', label: 'Space', char: ' ' },
  { id: 'pipe', label: 'Pipe (|)', char: '|' },
  { id: 'custom', label: 'Custom…', char: '' },
];

export const TextToColumnsDialog: React.FC<{ editor: SheetsEditor; onClose: () => void }> = ({ editor, onClose }) => {
  const sel = lastRange(editor);
  const [range, setRange] = useState(rangeText(sel.c1 === sel.c2 ? sel : { r1: sel.r1, c1: sel.c1, r2: sel.r2, c2: sel.c1 }));
  const [delimiter, setDelimiter] = useState('comma');
  const [custom, setCustom] = useState('');
  const [target, setTarget] = useState('');
  const sheet = editor.shown?.sheets[editor.sheetIndex];
  const customChars = [...custom];
  const char = delimiter === 'custom' ? (customChars.length === 1 ? customChars[0] : '') : (DELIMITERS.find((d) => d.id === delimiter)?.char ?? '');
  const parsed = parseRange(range);
  const targetCell = target.trim() === '' ? undefined : parseRange(target.trim());
  const preview = useMemo(() => {
    if (!sheet || !parsed || !char) return [];
    const out: string[][] = [];
    for (let r = parsed.r1; r <= parsed.r2 && out.length < 5; r += 1) {
      const cell = sheet.cells[cellKey(r, parsed.c1)];
      if (cell?.e !== undefined || cell?.f !== undefined || cell?.v === undefined) continue;
      out.push(String(cell.v).split(char).map((part) => part.trim()));
    }
    return out;
  }, [sheet, parsed, char]);
  const ready = Boolean(parsed) && char !== '' && (target.trim() === '' || Boolean(targetCell));

  const split = (): void => {
    if (!parsed || char === '') return;
    const op: Op = { op: 'textToColumns', sheet: editor.sheetName, range: rangeText(normRange(parsed)), delimiter: char };
    if (target.trim() !== '' && targetCell) op.target = cellKey(targetCell.r1, targetCell.c1);
    editor.apply([op]);
    onClose();
  };

  return (
    <Dialog title="Text to columns" onClose={onClose} width={480} footer={<DialogButtons primary="Split" disabled={!ready} onPrimary={split} onCancel={onClose} />}>
      <div className="sh-form">
        <FieldRow label="Split this column" hint="one column, e.g. A1:A40"><input className="sh-input" value={range} onChange={(event) => setRange(event.target.value)} placeholder="A1:A40" dir="ltr" data-autofocus /></FieldRow>
        <FieldRow label="Split on">
          <select className="sh-input" value={delimiter} onChange={(event) => setDelimiter(event.target.value)}>
            {DELIMITERS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </FieldRow>
        {delimiter === 'custom' && (
          <FieldRow label="Character" hint="a single character"><input className="sh-input" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder=":" dir="ltr" maxLength={4} /></FieldRow>
        )}
        <FieldRow label="Write to" hint="a cell, or empty to split in place"><input className="sh-input" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="B1" dir="ltr" /></FieldRow>
        {preview.length > 0 && (
          <div className="sh-sample">{preview.map((line, i) => <div key={i}>{line.join('  |  ')}</div>)}</div>
        )}
        <p className="sh-note">Numbers and dates in the pieces are typed like entered values. Formula cells are left alone, and new columns inherit the column’s formatting.</p>
      </div>
    </Dialog>
  );
};

// ---- Find and replace ----

export const FindDialog: React.FC<{ editor: SheetsEditor; replace: boolean; onClose: () => void }> = ({ editor, replace, onClose }) => {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState<FindOptions>({});
  const [whole, setWhole] = useState(false);
  const [showReplace, setShowReplace] = useState(replace);
  const [message, setMessage] = useState('');
  const wb = editor.wb;
  const sheets = useMemo(() => (wb ? (whole ? wb.sheets.map((_, i) => i) : [editor.sheetIndex]) : []), [wb, whole, editor.sheetIndex]);
  const hits = useMemo<FindHit[]>(() => (wb ? findAll(wb, query, sheets, options) : []), [wb, query, sheets, options]);

  const goTo = (hit: FindHit | null): void => {
    if (!hit || !wb) return;
    if (hit.sheet !== editor.sheetIndex) editor.activateSheet(hit.sheet);
    editor.select({ r1: hit.row, c1: hit.col, r2: hit.row, c2: hit.col }, { row: hit.row, col: hit.col });
    setMessage(`${hits.indexOf(hit) + 1} of ${hits.length}`);
  };
  const next = (): void => {
    const { row, col } = editor.selection.active;
    goTo(nextHit(hits, editor.sheetIndex, row, col));
  };
  const replaceOne = (): void => {
    const { row, col } = editor.selection.active;
    const hit = hits.find((h) => h.sheet === editor.sheetIndex && h.row === row && h.col === col);
    if (!hit || !wb) return next();
    const text = replaceIn(hit.text, query, replacement, options);
    editor.apply([{ op: 'setValues', sheet: wb.sheets[hit.sheet].name, at: hit.key, values: [[text]], parse: true }]);
    next();
  };
  const replaceAll = (): void => {
    if (!wb || hits.length === 0) return;
    const ops: Op[] = hits.map((hit) => ({ op: 'setValues' as const, sheet: wb.sheets[hit.sheet].name, at: hit.key, values: [[replaceIn(hit.text, query, replacement, options)]], parse: true }));
    editor.apply(ops);
    setMessage(`Replaced ${hits.length}`);
  };

  return (
    <Dialog title={showReplace ? 'Find and replace' : 'Find'} onClose={onClose} width={420} onEnter={next} footer={(
      <>
        <span className="sh-dialog__spacer"><span className="sh-note">{query ? message || `${hits.length} found` : ''}</span></span>
        {showReplace && <button type="button" className="sx-btn" disabled={hits.length === 0} onClick={replaceAll}>Replace all</button>}
        {showReplace && <button type="button" className="sx-btn" disabled={hits.length === 0} onClick={replaceOne}>Replace</button>}
        <button type="button" className="sx-btn sx-btn--primary" disabled={hits.length === 0} onClick={next}>Find next</button>
      </>
    )}>
      <div className="sh-form">
        <FieldRow label="Find"><input className="sh-input" dir="auto" value={query} onChange={(event) => { setQuery(event.target.value); setMessage(''); }} data-autofocus /></FieldRow>
        {showReplace
          ? <FieldRow label="Replace with"><input className="sh-input" dir="auto" value={replacement} onChange={(event) => setReplacement(event.target.value)} /></FieldRow>
          : <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" onClick={() => setShowReplace(true)}>Replace…</button>}
        <div className="sh-form__row">
          <CheckRow label="Match case" checked={Boolean(options.matchCase)} onChange={(value) => setOptions((o) => ({ ...o, matchCase: value }))} />
          <CheckRow label="Entire cell" checked={Boolean(options.entireCell)} onChange={(value) => setOptions((o) => ({ ...o, entireCell: value }))} />
          <CheckRow label="Look in formulas" checked={Boolean(options.inFormulas)} onChange={(value) => setOptions((o) => ({ ...o, inFormulas: value }))} />
          <CheckRow label="Whole workbook" checked={whole} onChange={setWhole} />
        </div>
      </div>
    </Dialog>
  );
};

// ---- Functions ----

export const FunctionDialog: React.FC<{ onPick: (name: string) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [chosen, setChosen] = useState('SUM');
  const names = useMemo(() => {
    const source = group === 'all' ? FUNCTION_GROUPS.flatMap((g) => g.names) : FUNCTION_GROUPS.find((g) => g.id === group)?.names ?? [];
    const q = query.trim().toUpperCase();
    return [...new Set(source)].filter((name) => !q || name.includes(q)).sort();
  }, [group, query]);
  const doc = FUNCTION_DOCS[chosen];
  return (
    <Dialog title="Insert function" onClose={onClose} width={520} onEnter={() => onPick(chosen)} footer={<DialogButtons primary="Insert" onPrimary={() => onPick(chosen)} onCancel={onClose} />}>
      <div className="sh-form">
        <div className="sh-form--grid">
          <FieldRow label="Search"><input className="sh-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="sum, lookup, date…" data-autofocus /></FieldRow>
          <FieldRow label="Category">
            <select className="sh-input" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="all">All</option>
              {FUNCTION_GROUPS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </FieldRow>
        </div>
        <div className="sh-fnlist" role="listbox" aria-label="Functions">
          {names.slice(0, 200).map((name) => (
            <button key={name} type="button" role="option" aria-selected={chosen === name} className={chosen === name ? 'is-on' : ''} onClick={() => setChosen(name)} onDoubleClick={() => onPick(name)}>{name}</button>
          ))}
          {names.length === 0 && <span className="sh-note">No function matches.</span>}
        </div>
        <div className="sh-fndoc">
          <code>{doc?.syntax ?? `${chosen}(…)`}</code>
          <span>{doc?.summary ?? ''}</span>
        </div>
      </div>
    </Dialog>
  );
};

// ---- Names ----

export const NamesDialog: React.FC<{ editor: SheetsEditor; onClose: () => void }> = ({ editor, onClose }) => {
  const [name, setName] = useState('');
  const [ref, setRef] = useState(() => `${editor.sheetName}!${rangeText(lastRange(editor))}`);
  const names = editor.shown?.names ?? [];
  const valid = /^[A-Za-z_À-￿][\w.À-￿]*$/.test(name) && ref.trim() !== '';
  return (
    <Dialog title="Named ranges" onClose={onClose} footer={<DialogButtons primary="Add name" disabled={!valid} onPrimary={() => { editor.apply([{ op: 'name', name, ref }]); setName(''); }} onCancel={onClose} />}>
      <div className="sh-form">
        <div className="sh-names">
          {names.length === 0 && <span className="sh-note">No names yet.</span>}
          {names.map((entry) => (
            <div key={`${entry.name}-${entry.scope ?? 'g'}`} className="sh-names__row">
              <strong>{entry.name}</strong>
              <code>{entry.ref}</code>
              <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" onClick={() => editor.apply([{ op: 'name', name: entry.name, ref: null, sheet: entry.scope !== undefined ? editor.shown?.sheets[entry.scope]?.name : undefined }])}>Delete</button>
            </div>
          ))}
        </div>
        <div className="sh-form--grid">
          <FieldRow label="Name"><input className="sh-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="TaxRate" data-autofocus /></FieldRow>
          <FieldRow label="Refers to"><input className="sh-input" value={ref} onChange={(event) => setRef(event.target.value)} spellCheck={false} /></FieldRow>
        </div>
      </div>
    </Dialog>
  );
};

// ---- A single line of text ----

export const TextPromptDialog: React.FC<{ title: string; label: string; initial?: string; multiline?: boolean; confirm: string; onSubmit: (value: string) => void; onClose: () => void; onClear?: () => void }> = ({ title, label, initial = '', multiline, confirm, onSubmit, onClose, onClear }) => {
  const [value, setValue] = useState(initial);
  return (
    <Dialog title={title} onClose={onClose} onEnter={() => !multiline && onSubmit(value)} footer={(
      <DialogButtons
        primary={confirm}
        onPrimary={() => onSubmit(value)}
        onCancel={onClose}
        secondary={onClear && initial !== '' && <button type="button" className="sx-btn sx-btn--quiet" onClick={onClear}>Remove</button>}
      />
    )}>
      <div className="sh-form">
        <FieldRow label={label}>
          {multiline
            ? <textarea className="sh-input" rows={4} dir="auto" value={value} onChange={(event) => setValue(event.target.value)} data-autofocus />
            : <input className="sh-input" dir="auto" value={value} onChange={(event) => setValue(event.target.value)} data-autofocus />}
        </FieldRow>
      </div>
    </Dialog>
  );
};

// ---- A refused or questioned entry ----

export const EntryAlertDialog: React.FC<{ title: string; message: string; style: 'stop' | 'warning' | 'information'; onAction: (action: 'retry' | 'cancel' | 'keep') => void }> = ({ title, message, style, onAction }) => (
  <Dialog
    title={title}
    onClose={() => onAction(style === 'stop' ? 'retry' : 'cancel')}
    width={400}
    footer={style === 'stop'
      ? <><button type="button" className="sx-btn" onClick={() => onAction('cancel')}>Cancel</button><button type="button" className="sx-btn sx-btn--primary" onClick={() => onAction('retry')} data-autofocus>Retry</button></>
      : <><button type="button" className="sx-btn" onClick={() => onAction('cancel')}>No</button><button type="button" className="sx-btn sx-btn--primary" onClick={() => onAction('keep')} data-autofocus>Keep it</button></>}
  >
    <p className="sh-note sh-note--body" dir="auto">{message}</p>
  </Dialog>
);

