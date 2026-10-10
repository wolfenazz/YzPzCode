import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { open } from '@tauri-apps/plugin-dialog';
import { FileText, Paperclip, X } from '@phosphor-icons/react';
import { CITATION_STYLES, formatReference, parseReferenceList } from '../../utils/writing/citations';
import { fileName } from '../../utils/writing/document';
import { SOURCE_EXTENSIONS } from '../../utils/writing/sources';
import type { CitationStyle, Reference } from '../../utils/writing/types';

interface ReferencesPanelProps {
  editor: Editor | null;
  bibliography: Reference[];
  citationStyle: CitationStyle;
  sourceFiles: string[];
  workspacePath: string;
  onBibliographyChange: (references: Reference[]) => void;
  onCitationStyleChange: (style: CitationStyle) => void;
  onSourceFilesChange: (files: string[]) => void;
}

/** The report's references (cited with [@key]) and the files the writer takes its facts from. */
export const ReferencesPanel: React.FC<ReferencesPanelProps> = ({ editor, bibliography, citationStyle, sourceFiles, workspacePath, onBibliographyChange, onCitationStyleChange, onSourceFilesChange }) => {
  const [draft, setDraft] = useState('');

  const add = (): void => {
    const parsed = parseReferenceList(draft, bibliography);
    if (parsed.length === 0) return;
    onBibliographyChange([...bibliography, ...parsed]);
    setDraft('');
  };

  const attach = async (): Promise<void> => {
    const picked = await open({ multiple: true, defaultPath: workspacePath, filters: [{ name: 'Documents and data', extensions: SOURCE_EXTENSIONS }] });
    const paths = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
    if (paths.length > 0) onSourceFilesChange([...new Set([...sourceFiles, ...paths])]);
  };

  return (
    <div className="wr-panel-body">
      <section className="wr-section">
        <label className="wr-row-field">
          <span>Citation style</span>
          <select className="wr-control" value={citationStyle} onChange={(event) => onCitationStyleChange(event.target.value as CitationStyle)}>
            {CITATION_STYLES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} {entry.example}</option>)}
          </select>
        </label>
      </section>

      <section className="wr-section">
        <div className="wr-section__row">
          <h3 className="wr-section__title">References</h3>
          {bibliography.length > 0 && (
            <button type="button" className="wr-link" disabled={!editor} onClick={() => editor?.chain().focus().insertBibliography().run()}>Insert bibliography</button>
          )}
        </div>
        {bibliography.length === 0 && <p className="wr-note">None yet. Add the works the report may cite; the writer cites only these.</p>}
        <ul className="wr-refs">
          {bibliography.map((ref) => (
            <li key={ref.id} className="wr-ref">
              <button type="button" className="wr-ref__body" title="Cite at the cursor" disabled={!editor} onClick={() => editor?.chain().focus().insertCitation([ref.key]).run()}>
                {formatReference(ref, citationStyle).replace(/^\[\d+\]\s*/, '')}
              </button>
              <button type="button" className="wr-icon" aria-label={`Remove ${ref.key}`} onClick={() => onBibliographyChange(bibliography.filter((entry) => entry.id !== ref.id))}><X size={11} /></button>
            </li>
          ))}
        </ul>
        <textarea
          className="wr-textarea"
          rows={3}
          value={draft}
          placeholder="Paste references, one per line"
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" className="wr-btn wr-btn--sm wr-btn--block" disabled={!draft.trim()} onClick={add}>Add to references</button>
        {bibliography.length > 0 && <p className="wr-note">Click a reference to cite it at the cursor.</p>}
      </section>

      <section className="wr-section">
        <h3 className="wr-section__title">Material</h3>
        <p className="wr-note">Files the writer takes its facts from when it writes or rewrites a section.</p>
        <ul className="wr-refs">
          {sourceFiles.map((path) => (
            <li key={path} className="wr-ref">
              <span className="wr-ref__body is-file" title={path}><FileText size={13} /> {fileName(path)}</span>
              <button type="button" className="wr-icon" aria-label={`Remove ${fileName(path)}`} onClick={() => onSourceFilesChange(sourceFiles.filter((entry) => entry !== path))}><X size={11} /></button>
            </li>
          ))}
        </ul>
        <button type="button" className="wr-btn wr-btn--sm wr-btn--block" onClick={() => void attach()}><Paperclip size={13} /> Attach files</button>
      </section>
    </div>
  );
};
