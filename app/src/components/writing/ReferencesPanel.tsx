import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { open } from '@tauri-apps/plugin-dialog';
import { FileText, Paperclip, X } from '@phosphor-icons/react';
import { CITATION_STYLES, formatReference, parseReferenceList } from '../../utils/writing/citations';
import { fileName } from '../../utils/writing/document';
import { SOURCE_EXTENSIONS } from '../../utils/writing/sources';
import type { CitationStyle, Reference } from '../../utils/writing/types';
import { Field, Hint, Section, Select } from '../studio/Inspector';

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
  const [unrecognised, setUnrecognised] = useState(false);

  const add = (): void => {
    const parsed = parseReferenceList(draft, bibliography);
    if (parsed.length === 0) {
      setUnrecognised(true);
      return;
    }
    setUnrecognised(false);
    onBibliographyChange([...bibliography, ...parsed]);
    setDraft('');
  };

  const attach = async (): Promise<void> => {
    const picked = await open({ multiple: true, defaultPath: workspacePath, filters: [{ name: 'Documents and data', extensions: SOURCE_EXTENSIONS }] });
    const paths = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
    if (paths.length > 0) onSourceFilesChange([...new Set([...sourceFiles, ...paths])]);
  };

  return (
    <>
      <Section title="Citation style">
        <Field label="Style" stack>
          <Select value={citationStyle} onChange={(event) => onCitationStyleChange(event.target.value as CitationStyle)}>
            {CITATION_STYLES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} {entry.example}</option>)}
          </Select>
        </Field>
      </Section>

      <Section
        title="References"
        aside={bibliography.length > 0 ? (
          <button type="button" className="sx-link" disabled={!editor} onClick={() => editor?.chain().focus().insertBibliography().run()}>Insert bibliography</button>
        ) : undefined}
      >
        {bibliography.length === 0 && <Hint>None yet. Add the works the report may cite; the writer cites only these.</Hint>}
        {bibliography.length > 0 && (
          <ul className="wr-refs">
            {bibliography.map((ref) => (
              <li key={ref.id} className="wr-ref">
                <button type="button" className="wr-ref__body" title="Cite at the cursor" disabled={!editor} onClick={() => editor?.chain().focus().insertCitation([ref.key]).run()}>
                  {formatReference(ref, citationStyle).replace(/^\[\d+\]\s*/, '')}
                </button>
                <button type="button" className="sx-icon" aria-label={`Remove ${ref.key}`} onClick={() => onBibliographyChange(bibliography.filter((entry) => entry.id !== ref.id))}><X size={12} /></button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          className="sx-textarea"
          rows={3}
          value={draft}
          placeholder="Paste references, one per line"
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => { setDraft(event.target.value); setUnrecognised(false); }}
        />
        <button type="button" className="sx-btn sx-btn--block" disabled={!draft.trim()} onClick={add}>Add to references</button>
        {unrecognised && <Hint error>No references recognised. Add one per line, e.g. “Author (2024). Title.”</Hint>}
        {bibliography.length > 0 && <Hint>Click a reference to cite it at the cursor.</Hint>}
      </Section>

      <Section title="Material">
        <Hint>Files the writer takes its facts from when it writes or rewrites a section.</Hint>
        {sourceFiles.length > 0 && (
          <ul className="wr-refs">
            {sourceFiles.map((path) => (
              <li key={path} className="wr-ref">
                <span className="wr-ref__body is-file" title={path}><FileText size={14} /> {fileName(path)}</span>
                <button type="button" className="sx-icon" aria-label={`Remove ${fileName(path)}`} onClick={() => onSourceFilesChange(sourceFiles.filter((entry) => entry !== path))}><X size={12} /></button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="sx-btn sx-btn--block" onClick={() => void attach()}><Paperclip size={14} /> Attach files</button>
      </Section>
    </>
  );
};
