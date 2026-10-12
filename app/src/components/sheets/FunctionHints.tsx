import React, { useMemo } from 'react';
import { FUNCTIONS } from '../../utils/sheets/formula/functions';
import { FUNCTION_DOCS } from '../../utils/sheets/functionDocs';

/** The function name being typed at the end of a formula, and the text before it. */
export function pendingFunction(text: string): { prefix: string; before: string } | null {
  if (!text.startsWith('=')) return null;
  const match = /([A-Za-z_][\w.]*)$/.exec(text);
  if (!match) return null;
  const before = text.slice(0, match.index);
  // A name is a function being typed only where an operand can start.
  if (!/(^=|[(,+\-*/^&=<>:;{\s])$/.test(before)) return null;
  return { prefix: match[1], before };
}

/** The call the caret sits in and the argument it is on: `SUM(A1, B|` → SUM, 1. */
export function activeCall(text: string): { name: string; argument: number } | null {
  if (!text.startsWith('=')) return null;
  const stack: Array<{ name: string; argument: number }> = [];
  let inString = false;
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '(') {
      const name = /([A-Za-z_][\w.]*)$/.exec(text.slice(1, i))?.[1] ?? '';
      stack.push({ name: name.toUpperCase(), argument: 0 });
    } else if (ch === ')') stack.pop();
    else if ((ch === ',' || ch === ';') && stack.length) stack[stack.length - 1].argument += 1;
  }
  for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].name) return stack[i];
  return null;
}

interface FunctionHintsProps {
  text: string;
  x: number;
  y: number;
  onPick: (text: string) => void;
}

/** Completion list and argument help under the cell editor. */
export const FunctionHints: React.FC<FunctionHintsProps> = ({ text, x, y, onPick }) => {
  const pending = useMemo(() => pendingFunction(text), [text]);
  const call = useMemo(() => activeCall(text), [text]);
  const matches = useMemo(() => {
    if (!pending) return [];
    const prefix = pending.prefix.toUpperCase();
    return Object.keys(FUNCTIONS).filter((name) => name.startsWith(prefix)).sort().slice(0, 8);
  }, [pending]);
  const doc = call ? FUNCTION_DOCS[call.name] : undefined;
  if (matches.length === 0 && !doc) return null;
  return (
    <div className="sh-hints" style={{ left: x, top: y }} data-keep-edit>
      {matches.length > 0 && pending && (
        <ul className="sh-hints__list" role="listbox">
          {matches.map((name) => (
            <li key={name}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(event) => { event.preventDefault(); onPick(`${pending.before}${name}(`); }}>
                <span className="sh-hints__name">{name}</span>
                <span className="sh-hints__sum">{FUNCTION_DOCS[name]?.summary ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {matches.length === 0 && doc && call && (
        <div className="sh-hints__doc">
          <code>{doc.syntax}</code>
          <span>{doc.summary}</span>
        </div>
      )}
    </div>
  );
};
