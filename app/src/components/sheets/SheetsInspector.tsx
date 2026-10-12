import React from 'react';
import { ArrowCounterClockwise, Trash } from '@phosphor-icons/react';
import { FORMAT_PRESETS } from '../../utils/sheets/numberFormat';
import type { CfRule, Pivot } from '../../utils/sheets/types';
import { ColorInput, Facts, Field, Hint, Section, Segmented, Select, Toggle } from '../studio/Inspector';
import type { SheetsEditor } from './useSheetsEditor';

const FONT_NAMES = ['Calibri', 'Arial', 'Tahoma', 'Segoe UI', 'Cambria', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Traditional Arabic', 'Simplified Arabic'];

const describeRule = (rule: CfRule): string => {
  switch (rule.kind) {
    case 'cell': return `Cell value ${rule.op.replace(/([A-Z])/g, ' $1').toLowerCase()} ${rule.a}${rule.b ? ` and ${rule.b}` : ''}`;
    case 'text': return `Text ${rule.op.replace(/([A-Z])/g, ' $1').toLowerCase()} “${rule.text}”`;
    case 'expression': return `Formula ${rule.formula}`;
    case 'top': return `${rule.bottom ? 'Bottom' : 'Top'} ${rule.n}${rule.percent ? '%' : ''}`;
    case 'aboveAverage': return rule.below ? 'Below average' : 'Above average';
    case 'colorScale': return 'Colour scale';
    case 'dataBar': return 'Data bars';
    case 'iconSet': return `Icons ${rule.set}`;
    default: return rule.kind;
  }
};

export const FormatInspector: React.FC<{ editor: SheetsEditor; onMore: () => void }> = ({ editor, onMore }) => {
  const style = editor.activeStyle;
  const disabled = editor.readOnly;
  const code = style.numFmt ?? 'General';
  const preset = FORMAT_PRESETS.find((entry) => entry.code === code);
  return (
    <>
      <Section title="Number">
        <Field label="Format">
          <Select value={preset ? preset.id : 'custom'} disabled={disabled} onChange={(event) => {
            const chosen = FORMAT_PRESETS.find((entry) => entry.id === event.target.value);
            if (chosen) editor.patchStyle({ numFmt: chosen.code === 'General' ? null : chosen.code });
          }}>
            {!preset && <option value="custom">{code}</option>}
            {FORMAT_PRESETS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </Select>
        </Field>
      </Section>
      <Section title="Text">
        <Field label="Font">
          <Select value={style.font?.name ?? ''} disabled={disabled} onChange={(event) => editor.patchStyle({ font: { name: event.target.value || null } })}>
            <option value="">Workbook default</option>
            {FONT_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
        <Field label="Size">
          <input className="sx-input" type="number" min={6} max={72} disabled={disabled} value={style.font?.size ?? ''} placeholder="11" onChange={(event) => editor.patchStyle({ font: { size: event.target.value ? Number(event.target.value) : null } })} />
        </Field>
        <Field label="Colour">
          <ColorInput value={style.font?.color ?? '#000000'} label="Text colour" onChange={(color) => editor.patchStyle({ font: { color } })} />
        </Field>
        <Toggle label="Bold" checked={Boolean(style.font?.bold)} disabled={disabled} onChange={() => editor.toggle('bold')} />
        <Toggle label="Italic" checked={Boolean(style.font?.italic)} disabled={disabled} onChange={() => editor.toggle('italic')} />
        <Toggle label="Wrap text" checked={Boolean(style.align?.wrap)} disabled={disabled} onChange={(checked) => editor.patchStyle({ align: { wrap: checked ? true : null } })} />
      </Section>
      <Section title="Alignment">
        <Segmented
          label="Horizontal alignment"
          value={style.align?.h ?? 'general'}
          options={[{ id: 'general', label: 'Auto' }, { id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }, { id: 'right', label: 'Right' }]}
          onChange={(h) => editor.patchStyle({ align: { h: h === 'general' ? null : h } })}
        />
        <Segmented
          label="Vertical alignment"
          value={style.align?.v ?? 'bottom'}
          options={[{ id: 'top', label: 'Top' }, { id: 'center', label: 'Middle' }, { id: 'bottom', label: 'Bottom' }]}
          onChange={(v) => editor.patchStyle({ align: { v: v === 'bottom' ? null : v } })}
        />
      </Section>
      <Section title="Cell">
        <Field label="Fill">
          <ColorInput value={style.fill ?? '#ffffff'} label="Fill colour" text={style.fill ?? 'None'} onChange={(color) => editor.patchStyle({ fill: color })} />
        </Field>
        {style.fill && <button type="button" className="sx-btn sx-btn--sm sx-btn--quiet" disabled={disabled} onClick={() => editor.patchStyle({ fill: null })}>Clear fill</button>}
        <button type="button" className="sx-btn sx-btn--sm" onClick={onMore}>More formatting…</button>
      </Section>
    </>
  );
};

export const DataInspector: React.FC<{
  editor: SheetsEditor;
  onNames: () => void;
  onFormat: () => void;
  pivots: Pivot[];
  onRefreshPivot: (id: string) => void;
  onRefreshAllPivots: () => void;
  onRemovePivot: (id: string) => void;
}> = ({ editor, onNames, onFormat, pivots, onRefreshPivot, onRefreshAllPivots, onRemovePivot }) => {
  const sheet = editor.shown?.sheets[editor.sheetIndex];
  if (!sheet) return null;
  const disabled = editor.readOnly;
  const name = sheet.name;
  const empty = sheet.tables.length === 0 && sheet.cf.length === 0 && sheet.validations.length === 0 && (editor.shown?.names.length ?? 0) === 0 && pivots.length === 0;
  return (
    <>
      <Section title="This sheet">
        <Toggle label="Right to left" hint="Arabic, Hebrew and Persian sheets" checked={Boolean(sheet.rtl)} disabled={disabled} onChange={(checked) => editor.apply([{ op: 'sheetProps', sheet: name, rtl: checked }])} />
        <Toggle label="Gridlines" checked={sheet.gridlines !== false} disabled={disabled} onChange={(checked) => editor.apply([{ op: 'sheetProps', sheet: name, gridlines: checked }])} />
        <Field label="Tab colour">
          <ColorInput value={sheet.tabColor ?? '#9aa1ab'} label="Tab colour" text={sheet.tabColor ?? 'None'} onChange={(color) => editor.apply([{ op: 'sheetProps', sheet: name, tabColor: color }])} />
        </Field>
        <Facts items={[
          ['Cells', Object.keys(sheet.cells).length.toLocaleString()],
          ['Charts', sheet.charts.length],
          ['Merged areas', sheet.merges.length],
        ]} />
      </Section>
      {sheet.tables.length > 0 && (
        <Section title="Tables" aside={sheet.tables.length}>
          {sheet.tables.map((table) => (
            <div key={table.name} className="sh-listrow">
              <span><strong>{table.name}</strong> <code>{table.ref}</code></span>
              <button type="button" aria-label={`Remove table ${table.name}`} disabled={disabled} onClick={() => editor.apply([{ op: 'table', sheet: name, range: table.ref, remove: true }])}><Trash size={12} /></button>
            </div>
          ))}
        </Section>
      )}
      {sheet.cf.length > 0 && (
        <Section title="Conditional formats" aside={sheet.cf.length}>
          {sheet.cf.map((entry, index) => (
            <div key={`${entry.sqref}-${index}`} className="sh-listrow">
              <span dir="auto"><code>{entry.sqref}</code> {describeRule(entry.rule)}</span>
              <button type="button" aria-label="Remove rule" disabled={disabled} onClick={() => editor.apply([{ op: 'conditionalFormat', sheet: name, range: entry.sqref.split(' ')[0], clear: true }])}><Trash size={12} /></button>
            </div>
          ))}
        </Section>
      )}
      {sheet.validations.length > 0 && (
        <Section title="Validation" aside={sheet.validations.length}>
          {sheet.validations.map((entry, index) => (
            <div key={`${entry.sqref}-${index}`} className="sh-listrow">
              <span><code>{entry.sqref}</code> {entry.type === 'list' ? `List: ${entry.a ?? ''}` : entry.type}</span>
              <button type="button" aria-label="Remove validation" disabled={disabled} onClick={() => editor.apply([{ op: 'validation', sheet: name, range: entry.sqref.split(' ')[0], rule: null }])}><Trash size={12} /></button>
            </div>
          ))}
        </Section>
      )}
      <Section title="Names" aside={editor.shown?.names.length ?? 0}>
        {(editor.shown?.names ?? []).slice(0, 8).map((entry) => (
          <div key={`${entry.name}-${entry.scope ?? 'g'}`} className="sh-listrow">
            <span><strong>{entry.name}</strong> <code>{entry.ref}</code></span>
          </div>
        ))}
        <button type="button" className="sx-btn sx-btn--sm" onClick={onNames}>Manage names…</button>
      </Section>
      {pivots.length > 0 && (
        <Section title="Pivot tables" aside={pivots.length}>
          {pivots.map((pivot) => (
            <div key={pivot.id} className="sh-listrow">
              <span><strong>{pivot.name}</strong> <code>{pivot.target}</code></span>
              <span className="sh-listrow__actions">
                <button type="button" aria-label={`Refresh ${pivot.name}`} title="Rebuild this pivot table from its source" disabled={disabled} onClick={() => onRefreshPivot(pivot.id)}><ArrowCounterClockwise size={12} /></button>
                <button type="button" aria-label={`Forget ${pivot.name}`} title="Forget this pivot table (its cells stay)" disabled={disabled} onClick={() => onRemovePivot(pivot.id)}><Trash size={12} /></button>
              </span>
            </div>
          ))}
          {pivots.length > 1 && <button type="button" className="sx-btn sx-btn--sm" disabled={disabled} onClick={onRefreshAllPivots}>Refresh all</button>}
        </Section>
      )}
      {empty && <Hint>Tables, rules and validation you add appear here.</Hint>}
      <button type="button" className="sx-btn sx-btn--sm sx-btn--quiet" onClick={onFormat}>Format cells…</button>
    </>
  );
};
