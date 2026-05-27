import React from 'react';
import type { GeneratedDesign } from './types';

interface ExportControlsProps {
  design: GeneratedDesign | null;
  workspacePath: string | null;
  savedFolderPath: string | null;
  isSaving: boolean;
  saveError: string | null;
  onSave: () => void;
}

export const ExportControls: React.FC<ExportControlsProps> = ({
  design,
  workspacePath,
  savedFolderPath,
  isSaving,
  saveError,
  onSave,
}) => (
  <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/70">
    <div className="border-b border-zinc-800/80 px-4 py-3">
      <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-100">Export</h2>
      <p className="mt-1 text-[10px] text-zinc-500">Generated pages are saved as HTML/CSS under the workspace Design folder.</p>
    </div>

    <div className="space-y-3 p-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">target folder</div>
        <div className="mt-1 break-all text-[10px] leading-4 text-zinc-400">
          {workspacePath ? `${workspacePath}\\Design\\<page-folder>` : 'Open a workspace to save generated files.'}
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={!design || !workspacePath || isSaving}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5h11l3 3v11H5zM8 5v5h7M8 17h8" />
        </svg>
        {isSaving ? 'saving...' : 'save to Design'}
      </button>

      {savedFolderPath && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-300">saved</div>
          <div className="mt-1 break-all text-[10px] leading-4 text-emerald-100/80">{savedFolderPath}</div>
        </div>
      )}

      {saveError && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] leading-4 text-rose-200">
          {saveError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        {['index.html', 'styles.css', 'designer-meta.json'].map((file) => (
          <div key={file} className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-[9px] text-zinc-500">
            {file}
          </div>
        ))}
      </div>
    </div>
  </section>
);
