import React, { useEffect, useRef, useState } from 'react';
import { Function as FunctionIcon } from '@phosphor-icons/react';
import { cellKey, normRange, parseRange, parseSheetRef, rangeText, type RangeRef } from '../../utils/sheets/address';
import type { Workbook } from '../../utils/sheets/types';
import type { GridSelection } from '../../stores/sheetsSessionStore';
import { FunctionHints } from './FunctionHints';

interface FormulaBarProps {
  wb: Workbook;
  sheetIndex: number;
  selection: GridSelection;
  text: string;
  editing: boolean;
  readOnly: boolean;
  onFocusEdit: () => void;
  onChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onJump: (range: RangeRef, sheetIndex?: number) => void;
  onPickFunction: () => void;
}

/** The name box, the function button and the formula input above the grid. */
export const FormulaBar: React.FC<FormulaBarProps> = ({ wb, sheetIndex, selection, text, editing, readOnly, onFocusEdit, onChange, onCommit, onCancel, onJump, onPickFunction }) => {
  const last = selection.ranges[selection.ranges.length - 1];
  const multi = last.r1 !== last.r2 || last.c1 !== last.c2;
  const label = multi && !(last.r1 === 0 && last.r2 >= 1048575) && !(last.c1 === 0 && last.c2 >= 16383)
    ? `${last.r2 - last.r1 + 1}R × ${last.c2 - last.c1 + 1}C`
    : multi ? rangeText(normRange(last)) : cellKey(selection.active.row, selection.active.col);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setNameDraft(null), [label, sheetIndex]);

  const jump = (): void => {
    const value = (nameDraft ?? '').trim();
    setNameDraft(null);
    if (!value) return;
    const direct = parseSheetRef(value);
    if (direct) {
      const target = direct.sheet ? wb.sheets.findIndex((s) => s.name.toLowerCase() === direct.sheet!.toLowerCase()) : sheetIndex;
      if (target >= 0) return onJump(direct.range, target);
    }
    const range = parseRange(value);
    if (range) return onJump(range);
    const named = wb.names.find((n) => n.name.toLowerCase() === value.toLowerCase());
    const ref = named ? parseSheetRef(named.ref) : null;
    if (ref) {
      const target = ref.sheet ? wb.sheets.findIndex((s) => s.name.toLowerCase() === ref.sheet!.toLowerCase()) : sheetIndex;
      if (target >= 0) onJump(ref.range, target);
    }
  };

  return (
    <div className="sh-fbar" data-keep-edit>
      <input
        className="sh-fbar__name"
        aria-label="Name box"
        value={nameDraft ?? label}
        spellCheck={false}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setNameDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') jump();
          if (event.key === 'Escape') setNameDraft(null);
        }}
        onBlur={() => setNameDraft(null)}
      />
      <button type="button" className="sh-fbar__fx" title="Insert function" aria-label="Insert function" onClick={onPickFunction}>
        <FunctionIcon size={15} />
      </button>
      <div className="sh-fbar__field">
        <input
          ref={input}
          className="sh-fbar__input"
          aria-label="Formula bar"
          dir="auto"
          spellCheck={false}
          readOnly={readOnly}
          value={text}
          onFocus={onFocusEdit}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              onCommit();
              input.current?.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
              input.current?.blur();
            }
          }}
        />
        {editing && <FunctionHints text={text} x={0} y={30} onPick={onChange} />}
      </div>
    </div>
  );
};
