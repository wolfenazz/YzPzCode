import React, { useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowLeft, ArrowRight, BookBookmark, FileText, Paperclip, Plus, SlidersHorizontal, Stop, X } from '@phosphor-icons/react';
import { briefForNewReport, useWritingStore } from '../../stores/writingStore';
import { writeFileBytes } from '../../utils/presentation/assets';
import { parseReferenceList } from '../../utils/writing/citations';
import { fileName, joinPath, REPORTS_FOLDER } from '../../utils/writing/document';
import { composerCopy, getReportType, pagesToWords, wordsToPages } from '../../utils/writing/reportTypes';
import { SOURCE_EXTENSIONS } from '../../utils/writing/sources';
import type { EngineChoice, Reference, ReportBrief, ReportDetails } from '../../utils/writing/types';
import { EngineFields, formatElapsed, WebPhotosToggle } from './ui';
import { ReportIcon } from './wizard/reportIcons';

const LANGUAGES = ['English', 'Arabic', 'French', 'Spanish', 'German', 'Portuguese', 'Turkish', 'Urdu', 'Indonesian', 'Chinese (Simplified)', 'Japanese'];
const MAX_FILES = 16;

interface ReportComposerProps {
  typeId: string;
  workspacePath: string;
  /** The AI is planning the report. */
  busy: boolean;
  startedAt: number | null;
  error: string | null;
  onBack: () => void;
  onWrite: (brief: ReportBrief, bibliography: Reference[]) => void;
  onCancel: () => void;
}

/** The composer for one kind of document: say what it is about, give it material, and it gets written. */
export const ReportComposer: React.FC<ReportComposerProps> = ({ typeId, workspacePath, busy, startedAt, error, onBack, onWrite, onCancel }) => {
  const type = getReportType(typeId);
  const copy = composerCopy(type);
  const profiles = useWritingStore((state) => state.profiles);
  const defaultProfileId = useWritingStore((state) => state.defaultProfileId);
  const setDefaultEngine = useWritingStore((state) => state.setDefaultEngine);
  const typeProfiles = useMemo(() => profiles.filter((entry) => entry.typeId === type.id), [profiles, type.id]);
  const [profileId, setProfileId] = useState<string | null>(() => {
    const preferred = typeProfiles.find((entry) => entry.id === defaultProfileId) ?? typeProfiles.find((entry) => !entry.builtIn);
    return preferred?.id ?? null;
  });
  const [brief, setBrief] = useState<ReportBrief>(() => briefForNewReport(type.id, profileId));
  const [bibliography, setBibliography] = useState<Reference[]>([]);
  const [referenceDraft, setReferenceDraft] = useState('');
  const [showReferences, setShowReferences] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [openMaterial, setOpenMaterial] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);

  const { details } = brief;
  const lineFields = type.fields.filter((field) => !field.multiline);
  const materialFields = type.fields.filter((field) => field.multiline);
  const hasTeam = type.fields.some((field) => field.key === 'team');
  const hasInstitution = type.fields.some((field) => ['institution', 'company', 'organization'].includes(field.key));
  const material = materialFields.some((field) => (details.fields[field.key] ?? '').trim().length > 0);
  const ready = !busy && (details.brief.trim().length >= 8 || material || details.title.trim().length > 0);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [busy]);

  // The box grows with the description.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(360, Math.max(140, element.scrollHeight))}px`;
  }, [details.brief]);

  const setDetails = (patch: Partial<ReportDetails>): void => setBrief((current) => ({ ...current, details: { ...current.details, ...patch } }));
  const setField = (key: string, value: string): void => setBrief((current) => ({ ...current, details: { ...current.details, fields: { ...current.details.fields, [key]: value } } }));
  const setEngine = (engine: EngineChoice): void => {
    setBrief((current) => ({ ...current, engine }));
    setDefaultEngine(engine);
  };

  const pickProfile = (id: string | null): void => {
    setProfileId(id);
    const fresh = briefForNewReport(type.id, id);
    // What the user wrote about this report stays; the profile brings its people, style and voice.
    setBrief((current) => ({
      ...fresh,
      details: {
        ...fresh.details,
        title: current.details.title,
        subtitle: current.details.subtitle,
        brief: current.details.brief,
        sourceNotes: current.details.sourceNotes,
        sourceFiles: current.details.sourceFiles,
        targetWords: current.details.targetWords,
        fields: { ...fresh.details.fields, ...Object.fromEntries(materialFields.map((field) => [field.key, current.details.fields[field.key] ?? ''])) },
      },
      engine: current.engine,
    }));
  };

  const addPaths = (paths: string[]): void => {
    setDetails({ sourceFiles: [...new Set([...details.sourceFiles, ...paths])].slice(0, MAX_FILES) });
  };

  const attach = async (): Promise<void> => {
    setFileError(null);
    const picked = await open({ multiple: true, defaultPath: workspacePath, filters: [{ name: 'Documents and data', extensions: SOURCE_EXTENSIONS }] });
    const paths = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
    if (paths.length > 0) addPaths(paths);
  };

  /** Dropped or pasted files are saved beside the reports, then attached like picked ones. */
  const addFiles = async (list: File[]): Promise<void> => {
    setFileError(null);
    const usable = list.filter((file) => SOURCE_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() ?? ''));
    if (usable.length < list.length) setFileError('Some files were skipped. Use PDF, Word, Excel, CSV or text files.');
    try {
      const folder = joinPath(workspacePath, REPORTS_FOLDER, '.attachments');
      const paths = await Promise.all(usable.map(async (file) => {
        const extension = file.name.split('.').pop()?.toLowerCase() ?? 'txt';
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 48) || 'file';
        const path = joinPath(folder, `${base}-${Date.now().toString(36)}.${extension}`);
        await writeFileBytes(path, new Uint8Array(await file.arrayBuffer()));
        return path;
      }));
      if (paths.length > 0) addPaths(paths);
    } catch (reason) {
      setFileError(`Could not add the file: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };

  const addReferences = (): void => {
    const parsed = parseReferenceList(referenceDraft, bibliography);
    if (parsed.length === 0) return;
    setBibliography([...bibliography, ...parsed]);
    setReferenceDraft('');
  };

  const submit = (): void => {
    if (!ready) return;
    const pending = referenceDraft.trim() ? parseReferenceList(referenceDraft, bibliography) : [];
    onWrite(brief, [...bibliography, ...pending]);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    // Typing in the composer never reaches the workspace shortcuts.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.stopPropagation();
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  const pages = wordsToPages(details.targetWords);

  return (
    <div
      className="wr-composer-page"
      data-dragging={dragging || undefined}
      onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { dragDepth.current += 1; setDragging(true); } }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!busy) void addFiles(Array.from(event.dataTransfer.files));
      }}
      onKeyDown={onKeyDown}
    >
      <div className="wr-composer-page__inner">
        <button type="button" className="wr-back" onClick={onBack} disabled={busy}><ArrowLeft size={13} /> All documents</button>

        <header className="wr-composer__head">
          <span className="wr-composer__icon"><ReportIcon name={type.icon} size={20} /></span>
          <div>
            <div className="wr-composer__kind">{type.name}</div>
            <p className="wr-composer__desc">{type.description}</p>
          </div>
        </header>

        <h1 className="wr-composer__ask">{copy.ask}</h1>

        <div className="wr-composer" data-busy={busy || undefined}>
          <textarea
            ref={textarea}
            className="wr-composer__input"
            value={details.brief}
            disabled={busy}
            placeholder={copy.placeholder}
            onChange={(event) => setDetails({ brief: event.target.value })}
            onPaste={(event) => {
              const pasted = Array.from(event.clipboardData.files);
              if (pasted.length > 0) {
                event.preventDefault();
                void addFiles(pasted);
              }
            }}
            aria-label={copy.ask}
            autoFocus
          />

          {(details.sourceFiles.length > 0 || bibliography.length > 0) && (
            <div className="wr-attachments">
              {details.sourceFiles.map((path) => (
                <span key={path} className="wr-attachment" title={path}>
                  <FileText size={13} />
                  <span>{fileName(path)}</span>
                  <button type="button" aria-label={`Remove ${fileName(path)}`} disabled={busy} onClick={() => setDetails({ sourceFiles: details.sourceFiles.filter((entry) => entry !== path) })}><X size={11} /></button>
                </span>
              ))}
              {bibliography.length > 0 && (
                <span className="wr-attachment">
                  <BookBookmark size={13} />
                  <span>{bibliography.length} reference{bibliography.length === 1 ? '' : 's'}</span>
                  <button type="button" aria-label="Remove references" disabled={busy} onClick={() => setBibliography([])}><X size={11} /></button>
                </span>
              )}
            </div>
          )}

          {showReferences && !busy && (
            <div className="wr-composer__drawer">
              <label className="wr-label" htmlFor="wr-composer-refs">References to cite, one per line. The writer cites only these.</label>
              <textarea id="wr-composer-refs" className="wr-textarea" rows={3} value={referenceDraft} onChange={(event) => setReferenceDraft(event.target.value)} placeholder="Smith, J. (2024). Water use in arid farms. Journal of Hydrology." />
              <div className="wr-composer__drawer-foot">
                <span className="wr-note">Paste APA, Harvard, IEEE or plain lines.</span>
                <button type="button" className="wr-btn wr-btn--sm" disabled={!referenceDraft.trim()} onClick={addReferences}>Add</button>
              </div>
            </div>
          )}

          {showOptions && !busy && (
            <div className="wr-composer__drawer wr-composer__options">
              <label className="wr-row-field">
                <span>Length</span>
                <span className="wr-length">
                  <input className="wr-control wr-control--num" type="number" min={1} max={200} value={pages} onChange={(event) => setDetails({ targetWords: pagesToWords(Math.max(1, Math.min(200, Number(event.target.value) || 1))) })} />
                  <span className="wr-note">pages · about {details.targetWords.toLocaleString()} words</span>
                </span>
              </label>
              <label className="wr-row-field">
                <span>Language</span>
                <select className="wr-control" value={details.language} onChange={(event) => setDetails({ language: event.target.value })}>
                  {[...new Set([details.language, ...LANGUAGES])].map((language) => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
              {typeProfiles.length > 0 && (
                <label className="wr-row-field">
                  <span>Profile</span>
                  <select className="wr-control" value={profileId ?? ''} onChange={(event) => pickProfile(event.target.value || null)}>
                    <option value="">Standard {type.name.toLowerCase()}</option>
                    {typeProfiles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                  </select>
                </label>
              )}
              <WebPhotosToggle value={brief.pictures !== 'none'} onChange={(on) => setBrief((current) => ({ ...current, pictures: on ? 'web' : 'none' }))} />
              <EngineFields value={brief.engine} onChange={setEngine} />
            </div>
          )}

          <div className="wr-composer__bar">
            <button type="button" className="wr-btn wr-btn--ghost" disabled={busy || details.sourceFiles.length >= MAX_FILES} onClick={() => void attach()} title="Notes, data, papers or earlier drafts: the writer takes its facts from them">
              <Paperclip size={14} /> Attach
            </button>
            <button type="button" className={`wr-btn wr-btn--ghost${showReferences ? ' is-on' : ''}`} disabled={busy} aria-expanded={showReferences} onClick={() => setShowReferences((value) => !value)}>
              <BookBookmark size={14} /> References
            </button>
            <button type="button" className={`wr-btn wr-btn--ghost${showOptions ? ' is-on' : ''}`} disabled={busy} aria-expanded={showOptions} onClick={() => setShowOptions((value) => !value)}>
              <SlidersHorizontal size={14} /> {pages} {pages === 1 ? 'page' : 'pages'} · {details.language}
            </button>
            <span className="wr-spacer" />
            {busy ? (
              <button type="button" className="wr-btn" onClick={onCancel}><Stop size={12} weight="fill" /> Stop</button>
            ) : (
              <button type="button" className="wr-btn wr-btn--primary" disabled={!ready} onClick={submit} title="Ctrl+Enter">
                Write {type.id === 'custom' ? 'document' : 'report'} <ArrowRight size={13} weight="bold" />
              </button>
            )}
          </div>

          {busy && (
            <div className="wr-composer__status" role="status" aria-live="polite">
              <span className="wr-pulse" aria-hidden="true" />
              Planning the structure{details.sourceFiles.length > 0 ? ' from your material' : ''} · {formatElapsed(startedAt ? (now - startedAt) / 1000 : 0)}
            </div>
          )}
        </div>
        {error && !busy && <p className="wr-note is-error wr-composer__error">{error}</p>}
        {fileError && <p className="wr-note is-error wr-composer__error">{fileError}</p>}

        <section className="wr-composer__details" aria-label="Details">
          <div className="wr-composer__section-head">
            <h2>Details</h2>
            <span className="wr-note">Optional. They appear on the cover and guide the writer.</span>
          </div>
          <div className="wr-grid">
            <label className="wr-field wr-field--wide">
              <span className="wr-label">Title</span>
              <input className="wr-control" value={details.title} disabled={busy} onChange={(event) => setDetails({ title: event.target.value })} placeholder="Leave empty and the writer will title it" />
            </label>
            {!hasTeam && (
              <label className="wr-field">
                <span className="wr-label">Author(s)</span>
                <input className="wr-control" value={details.authors} disabled={busy} onChange={(event) => setDetails({ authors: event.target.value })} />
              </label>
            )}
            {!hasInstitution && (
              <label className="wr-field">
                <span className="wr-label">Organisation</span>
                <input className="wr-control" value={details.organization} disabled={busy} onChange={(event) => setDetails({ organization: event.target.value })} />
              </label>
            )}
            {lineFields.map((field) => (
              <label key={field.key} className="wr-field">
                <span className="wr-label">{field.label}</span>
                <input className="wr-control" value={details.fields[field.key] ?? ''} disabled={busy} placeholder={field.placeholder} onChange={(event) => setField(field.key, event.target.value)} />
              </label>
            ))}
            <label className="wr-field">
              <span className="wr-label">Audience</span>
              <input className="wr-control" value={details.audience} disabled={busy} onChange={(event) => setDetails({ audience: event.target.value })} placeholder="Who will read it" />
            </label>
          </div>

          {materialFields.length > 0 && (
            <div className="wr-material">
              {materialFields.map((field) => (openMaterial.has(field.key) || (details.fields[field.key] ?? '').trim() ? (
                <label key={field.key} className="wr-field wr-field--wide">
                  <span className="wr-label">{field.label}</span>
                  <textarea className="wr-textarea" rows={field.key === 'team' || field.key === 'attendees' ? 3 : 5} value={details.fields[field.key] ?? ''} disabled={busy} placeholder={field.placeholder} onChange={(event) => setField(field.key, event.target.value)} />
                </label>
              ) : (
                <button key={field.key} type="button" className="wr-btn wr-btn--ghost wr-btn--sm" disabled={busy} onClick={() => setOpenMaterial((current) => new Set(current).add(field.key))}>
                  <Plus size={12} /> {field.label}
                </button>
              )))}
            </div>
          )}
        </section>
      </div>
      {dragging && <div className="wr-dropzone" aria-hidden="true">Drop files to use them as material</div>}
    </div>
  );
};
