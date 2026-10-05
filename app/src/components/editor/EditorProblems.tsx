import { WarningCircle, X } from '@phosphor-icons/react';
import type { editor } from 'monaco-editor';
import type { ReactNode } from 'react';

interface EditorProblemsProps {
  markers: editor.IMarker[];
  onReveal: (line: number, column: number) => void;
  onClose: () => void;
}

export function EditorProblems({ markers, onReveal, onClose }: EditorProblemsProps): ReactNode {
  return <section aria-label="File problems" className="flex h-40 shrink-0 flex-col border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]">
    <div className="flex h-8 shrink-0 items-center justify-between px-3 text-xs">
      <span className="font-medium">Problems <span className="ml-1 text-[var(--text-secondary)]">{markers.length}</span></span>
      <button type="button" onClick={onClose} aria-label="Close problems" className="p-1 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer"><X size={14} /></button>
    </div>
    <div className="flex-1 overflow-auto px-2 pb-2">
      {markers.length === 0 ? <p className="px-1 py-3 text-xs text-[var(--text-secondary)]">No problems reported for this file. Diagnostics depend on language support.</p> : markers.map((marker, index) =>
        <button type="button" key={`${marker.startLineNumber}:${marker.startColumn}:${index}`} onClick={() => onReveal(marker.startLineNumber, marker.startColumn)}
          className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-[var(--bg-tertiary)] cursor-pointer">
          <WarningCircle size={15} className={`mt-0.5 shrink-0 ${marker.severity === 8 ? 'text-rose-400' : 'text-amber-500'}`} />
          <span className="flex-1 whitespace-pre-wrap">{marker.message}</span>
          <span className="shrink-0 text-[var(--text-secondary)] tabular-nums">{marker.startLineNumber}:{marker.startColumn}</span>
        </button>)}
    </div>
  </section>;
}
