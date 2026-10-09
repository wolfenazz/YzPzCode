import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { BookBookmark, FilePlus, Paperclip, X } from '@phosphor-icons/react';
import { parseReferenceList } from '../../../utils/writing/citations';
import { fileName } from '../../../utils/writing/document';
import { getReportType, pagesToWords, wordsToPages } from '../../../utils/writing/reportTypes';
import { SOURCE_EXTENSIONS } from '../../../utils/writing/sources';
import type { Reference, ReportDetails } from '../../../utils/writing/types';
import { NumberField, Select } from '../controls';

const LANGUAGES = ['English', 'Arabic', 'French', 'Spanish', 'German', 'Portuguese', 'Turkish', 'Urdu', 'Indonesian', 'Chinese (Simplified)', 'Japanese'];

interface DetailsStepProps {
  typeId: string;
  details: ReportDetails;
  bibliography: Reference[];
  workspacePath: string;
  onChange: (patch: Partial<ReportDetails>) => void;
  onBibliographyChange: (references: Reference[]) => void;
}

export const DetailsStep: React.FC<DetailsStepProps> = ({ typeId, details, bibliography, workspacePath, onChange, onBibliographyChange }) => {
  const type = getReportType(typeId);
  const [referenceDraft, setReferenceDraft] = useState('');
  const setField = (key: string, value: string): void => onChange({ fields: { ...details.fields, [key]: value } });

  const attach = async (): Promise<void> => {
    const picked = await open({
      multiple: true,
      defaultPath: workspacePath,
      filters: [{ name: 'Documents and data', extensions: SOURCE_EXTENSIONS }],
    });
    const paths = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
    if (paths.length === 0) return;
    onChange({ sourceFiles: [...new Set([...details.sourceFiles, ...paths])] });
  };

  const addReferences = (): void => {
    const parsed = parseReferenceList(referenceDraft, bibliography);
    if (parsed.length === 0) return;
    onBibliographyChange([...bibliography, ...parsed]);
    setReferenceDraft('');
  };

  return (
    <div className="wr-wizard__step">
      <span className="wr-eyebrow">Step two · {type.name}</span>
      <h2 className="wr-wizard__question">Tell me about <em>this</em> one.</h2>
      <p className="wr-wizard__lede">The more specific the brief, the more the report sounds like it was written for this occasion. Sources you attach are used as the factual basis.</p>

      <div className="wr-step-columns">
        <div className="wr-stack">
          <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
            <h3 className="wr-panel-card__title">The essentials</h3>
            <div className="wr-form-grid">
              <label className="wr-field is-wide">
                <span className="wr-field__label">Title</span>
                <input className="wr-input" style={{ fontSize: 16 }} value={details.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="e.g. A Low-Cost IoT System for Smart Irrigation" autoFocus />
              </label>
              <label className="wr-field is-wide">
                <span className="wr-field__label">Subtitle <span className="wr-field__hint">(optional)</span></span>
                <input className="wr-input" value={details.subtitle} onChange={(event) => onChange({ subtitle: event.target.value })} />
              </label>
              <label className="wr-field is-wide">
                <span className="wr-field__label">Brief — what should this report say?</span>
                <textarea className="wr-textarea" rows={5} value={details.brief} onChange={(event) => onChange({ brief: event.target.value })} placeholder="The problem, the angle, key points to make, what the reader should conclude…" />
              </label>
              <label className="wr-field">
                <span className="wr-field__label">Audience</span>
                <input className="wr-input" value={details.audience} onChange={(event) => onChange({ audience: event.target.value })} placeholder="e.g. Faculty examiners, board of directors" />
              </label>
              <label className="wr-field">
                <span className="wr-field__label">Author(s)</span>
                <input className="wr-input" value={details.authors} onChange={(event) => onChange({ authors: event.target.value })} />
              </label>
              <label className="wr-field">
                <span className="wr-field__label">Organisation</span>
                <input className="wr-input" value={details.organization} onChange={(event) => onChange({ organization: event.target.value })} />
              </label>
              <label className="wr-field">
                <span className="wr-field__label">Date</span>
                <input className="wr-input" value={details.date} onChange={(event) => onChange({ date: event.target.value })} />
              </label>
            </div>
          </div></div>

          {type.fields.length > 0 && (
            <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
              <h3 className="wr-panel-card__title">{type.name} details</h3>
              <div className="wr-form-grid">
                {type.fields.map((field) => (
                  <label key={field.key} className={`wr-field${field.multiline ? ' is-wide' : ''}`}>
                    <span className="wr-field__label">{field.label}</span>
                    {field.multiline ? (
                      <textarea className="wr-textarea" rows={3} value={details.fields[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setField(field.key, event.target.value)} />
                    ) : (
                      <input className="wr-input" value={details.fields[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setField(field.key, event.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </div></div>
          )}

          <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
            <h3 className="wr-panel-card__title">Sources & evidence</h3>
            <div className="wr-stack">
              <label className="wr-field">
                <span className="wr-field__label">Notes, data and facts to use</span>
                <textarea className="wr-textarea" rows={4} value={details.sourceNotes} onChange={(event) => onChange({ sourceNotes: event.target.value })} placeholder="Paste findings, figures, interview notes, requirements…" />
              </label>
              <div className="wr-field">
                <span className="wr-field__label">Attached files</span>
                <div className="wr-chips">
                  {details.sourceFiles.map((path) => (
                    <span key={path} className="wr-chip" title={path}>
                      <Paperclip size={12} />
                      {fileName(path)}
                      <button type="button" aria-label={`Remove ${fileName(path)}`} onClick={() => onChange({ sourceFiles: details.sourceFiles.filter((entry) => entry !== path) })}><X size={12} /></button>
                    </span>
                  ))}
                  <button type="button" className="wr-pill-btn" style={{ height: 28 }} onClick={() => void attach()}>
                    <FilePlus size={14} /> Attach PDF, Word, Excel or text
                  </button>
                </div>
              </div>
              <div className="wr-field">
                <span className="wr-field__label">References to cite <span className="wr-field__hint">— one per line; the AI cites only these</span></span>
                <textarea className="wr-textarea" rows={3} value={referenceDraft} onChange={(event) => setReferenceDraft(event.target.value)} placeholder="Smith, J. (2024). Water use in arid farms. Journal of Hydrology." />
                <div className="wr-row" style={{ minHeight: 0 }}>
                  <span className="wr-field__hint">{bibliography.length} reference{bibliography.length === 1 ? '' : 's'} in the bibliography</span>
                  <button type="button" className="wr-pill-btn" style={{ height: 28 }} disabled={!referenceDraft.trim()} onClick={addReferences}>
                    <BookBookmark size={14} /> Add references
                  </button>
                </div>
                {bibliography.length > 0 && (
                  <div className="wr-chips">
                    {bibliography.map((ref) => (
                      <span key={ref.id} className="wr-chip" title={`${ref.authors} (${ref.year}). ${ref.title}`}>
                        @{ref.key}
                        <button type="button" aria-label={`Remove ${ref.key}`} onClick={() => onBibliographyChange(bibliography.filter((entry) => entry.id !== ref.id))}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div></div>
        </div>

        <aside className="wr-stack">
          <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
            <h3 className="wr-panel-card__title">Length & language</h3>
            <div className="wr-stack">
              <div className="wr-row">
                <span className="wr-row__label">Pages (approx.)</span>
                <NumberField value={wordsToPages(details.targetWords)} min={1} max={200} onChange={(pages) => onChange({ targetWords: pagesToWords(pages) })} suffix="pp" />
              </div>
              <div className="wr-row">
                <span className="wr-row__label">Words</span>
                <NumberField value={details.targetWords} min={300} max={80000} step={100} onChange={(words) => onChange({ targetWords: words })} />
              </div>
              <div className="wr-row">
                <span className="wr-row__label">Language</span>
                <Select options={LANGUAGES} value={details.language} onChange={(language) => onChange({ language })} label="Language" align="right" />
              </div>
            </div>
          </div></div>
          <p className="wr-field__hint" style={{ lineHeight: 1.6 }}>
            Tip: when the facts matter (financials, results, quotes), attach the data. The writer is instructed never to invent figures and leaves a clearly marked placeholder where a number is missing.
          </p>
        </aside>
      </div>
    </div>
  );
};
