import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowRight, FileArrowUp, FileText, FolderSimple, Paperclip, SlidersHorizontal, Stop, Trash, X } from '@phosphor-icons/react';
import type { DeckRun } from '../../stores/presentationSessionStore';
import type { FileEntry } from '../../types';
import { localFileUrl } from '../../utils/mediaFiles';
import { findMentionedPaths, isPictureName, MAX_DECK_PICTURES } from '../../utils/presentation/designPictures';
import { formatDuration } from '../../utils/presentation/timing';
import type { DeckSize } from '../../utils/presentation/types';
import { isAbsolutePath } from '../../utils/presentation/assets';
import { fileName, joinPath, parentPath } from '../../utils/writing/document';
import { SOURCE_EXTENSIONS } from '../../utils/writing/sources';
import type { EngineChoice } from '../../utils/writing/types';
import { relativeTime } from '../writing/ui';
import { IMAGE_EXTENSIONS, saveDroppedFile, scanFolderPictures } from './designAssets';
import { EnginePicker } from './EnginePicker';
import { SvgSlide } from './SvgSlide';
import type { DeckListing } from './useDeckDocument';

export interface ComposerFile {
  path: string;
  name: string;
  kind: 'image' | 'document';
  use: 'auto' | 'slides' | 'style';
  /** Thumbnail data URL for pictures. */
  preview?: string;
}

/** A folder of pictures, picked or named in the description; its pictures go to the AI like picked ones. */
interface ComposerFolder {
  path: string;
  name: string;
  pictures: string[];
  /** Usable pictures in the folder, including any beyond the deck's limit. */
  total: number;
  use: ComposerFile['use'];
  /** The text in the description it was found from; null when picked. */
  mention: string | null;
}

export interface ComposerInput {
  prompt: string;
  files: ComposerFile[];
  slideCount: number | null;
  size: DeckSize;
  language: string;
  /** The AI designs each slide's element animation. */
  animate: boolean;
}

interface DesignComposerProps {
  workspaceName: string;
  workspacePath: string;
  decks: DeckListing[];
  engine: EngineChoice;
  defaultSize: DeckSize;
  run: DeckRun | null;
  busy: boolean;
  animations: boolean;
  onEngine: (engine: EngineChoice) => void;
  onCreate: (input: ComposerInput) => void;
  onCancel: () => void;
  onOpen: (path: string) => void;
  /** Moves the deck's folder to the workspace trash. */
  onDelete: (path: string) => void;
  onImport: () => void;
}

const COUNTS: Array<number | null> = [null, 5, 8, 12, 16];
const MAX_FILES = 12;
const isImage = (path: string): boolean => IMAGE_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() ?? '');

/** Short label → the description it fills in. */
const EXAMPLES: Array<{ label: string; prompt: string }> = [
  { label: 'Pitch to the city council', prompt: 'A pitch for our neighbourhood solar co-op to the city council: panel costs are down 40% since 2020, 120 households have joined, and we need €80k for phase two.' },
  { label: 'Lesson for 14-year-olds', prompt: 'A 15-minute lesson introducing photosynthesis to 14-year-olds. Playful and visual, with a simple experiment they can do at home.' },
  { label: 'Product launch keynote', prompt: 'Launch keynote for a minimalist mechanical keyboard brand. Dark, premium, few words, big product moments.' },
  { label: 'Board update from a report', prompt: 'Board update from the attached report: what moved this quarter, why churn rose, and the pricing change we recommend.' },
];

const USES: Array<{ value: ComposerFile['use']; label: string }> = [
  { value: 'auto', label: 'AI decides' },
  { value: 'slides', label: 'On slides' },
  { value: 'style', label: 'Inspiration' },
];

/** How a picture (or a folder of them) is used: a quiet select inside its chip. */
const UseSelect: React.FC<{ value: ComposerFile['use']; disabled: boolean; onChange: (use: ComposerFile['use']) => void }> = ({ value, disabled, onChange }) => (
  <select className="pd-chip__use" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as ComposerFile['use'])} aria-label="How the pictures are used" title="On slides: placed on the slides. Inspiration: sets the look only.">
    {USES.map((use) => <option key={use.value} value={use.value}>{use.label}</option>)}
  </select>
);

/** A recent deck, shown by its cover slide; deleting asks once, in place. */
const DeckCard: React.FC<{ deck: DeckListing; disabled: boolean; onOpen: (path: string) => void; onDelete: (path: string) => void }> = ({ deck, disabled, onOpen, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const dir = parentPath(deck.path);
  const resolveHref = useCallback((href: string): string => (/^data:/.test(href) ? href : localFileUrl(isAbsolutePath(href) ? href : joinPath(dir, href))), [dir]);
  const kind = deck.preserve ? 'Original design' : deck.imported ? 'PowerPoint' : null;
  return (
    <div className="pd-deck" data-shape={deck.cover && deck.cover.canvas.width / deck.cover.canvas.height < 1.5 ? '4:3' : undefined}>
      <button type="button" className="pd-deck__open" disabled={disabled || confirming} onClick={() => onOpen(deck.path)} title={deck.path}>
        <span className="pd-deck__cover">
          {deck.cover ? (
            <SvgSlide svg={deck.cover.svg} width={320} canvas={deck.cover.canvas} resolveHref={resolveHref} />
          ) : (
            <span className="pd-deck__blank" dir="auto">{deck.title}</span>
          )}
        </span>
        <span className="pd-deck__name" dir="auto">{deck.title}</span>
        <span className="pd-deck__meta">
          {deck.slides} slide{deck.slides === 1 ? '' : 's'}{kind ? ` · ${kind}` : ''} · {relativeTime(deck.modifiedAt)}
        </span>
      </button>
      {confirming ? (
        // Over the cover, so the card keeps its size.
        <span className="pd-deck__confirm" onKeyDown={(event) => { if (event.key === 'Escape') setConfirming(false); }}>
          <span>Delete this deck?</span>
          <span className="pd-deck__confirm-actions">
            <button type="button" className="pd-btn pd-btn--sm pd-btn--danger" onClick={() => { setConfirming(false); onDelete(deck.path); }}>Delete</button>
            <button type="button" className="pd-btn pd-btn--sm" onClick={() => setConfirming(false)} autoFocus>Keep</button>
          </span>
        </span>
      ) : (
        <button type="button" className="pd-deck__delete" disabled={disabled} aria-label={`Delete ${deck.title}`} title="Delete" onClick={() => setConfirming(true)}>
          <Trash size={13} />
        </button>
      )}
    </div>
  );
};

/** The new-presentation screen: describe it, add files, and the AI designs a deck from scratch. */
export const DesignComposer: React.FC<DesignComposerProps> = ({ workspaceName, workspacePath, decks, engine, defaultSize, run, busy, animations, onEngine, onCreate, onCancel, onOpen, onDelete, onImport }) => {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const [folders, setFolders] = useState<ComposerFolder[]>([]);
  const [slideCount, setSlideCount] = useState<number | null>(null);
  const [size, setSize] = useState<DeckSize>(defaultSize);
  const [language, setLanguage] = useState('');
  const [animate, setAnimate] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);
  /** Paths already looked up on disk: what each one is. */
  const lookedUp = useRef(new Map<string, 'folder' | 'file' | 'none'>());
  /** Folders the user removed after they were found in the description. */
  const dismissed = useRef(new Set<string>());
  const ready = prompt.trim().length >= 8 && !busy;
  const pictureCount = files.filter((file) => file.kind === 'image').length + folders.reduce((sum, folder) => sum + folder.pictures.length, 0);

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
    element.style.height = `${Math.min(320, Math.max(132, element.scrollHeight))}px`;
  }, [prompt]);

  const addPaths = useCallback(async (paths: string[]): Promise<void> => {
    const fresh = paths.filter((path) => !files.some((file) => file.path === path)).slice(0, Math.max(0, MAX_FILES - files.length));
    const added = await Promise.all(fresh.map(async (path): Promise<ComposerFile> => {
      const image = isImage(path);
      let preview: string | undefined;
      if (image) preview = await invoke<string>('read_file_as_base64', { path }).catch(() => undefined);
      return { path, name: fileName(path), kind: image ? 'image' : 'document', use: 'auto', preview };
    }));
    setFiles((current) => [...current, ...added.filter((file) => !current.some((entry) => entry.path === file.path))]);
  }, [files]);

  const addFolder = useCallback(async (path: string, mention: string | null): Promise<void> => {
    const key = path.toLowerCase();
    if (folders.some((folder) => folder.path.toLowerCase() === key)) return;
    if (!mention && pictureCount >= MAX_DECK_PICTURES) {
      setFileError(`A deck takes up to ${MAX_DECK_PICTURES} pictures.`);
      return;
    }
    const { paths, total } = await scanFolderPictures(path, MAX_DECK_PICTURES);
    if (paths.length === 0) {
      if (!mention) setFileError(`No pictures in ${fileName(path)} (PNG, JPEG, GIF or WebP).`);
      return;
    }
    const picked = files.filter((file) => file.kind === 'image').length;
    // The room is counted on the latest folders: a folder found a moment ago may just have been dropped.
    setFolders((current) => {
      if (current.some((folder) => folder.path.toLowerCase() === key)) return current;
      const room = MAX_DECK_PICTURES - picked - current.reduce((sum, folder) => sum + folder.pictures.length, 0);
      return room > 0 ? [...current, { path, name: fileName(path) || path, pictures: paths.slice(0, room), total, use: 'auto', mention }] : current;
    });
  }, [files, folders, pictureCount]);

  const pickFolder = async (): Promise<void> => {
    setFileError(null);
    const picked = await open({ directory: true, defaultPath: workspacePath });
    if (typeof picked === 'string') void addFolder(picked, null);
  };

  /** What a path is on disk, remembered. */
  const lookUp = useCallback(async (path: string): Promise<'folder' | 'file' | 'none'> => {
    const known = lookedUp.current.get(path.toLowerCase());
    if (known) return known;
    let kind: 'folder' | 'file' | 'none' = 'none';
    if (await invoke<FileEntry[]>('list_directory_entries', { path }).then(() => true, () => false)) kind = 'folder';
    else if (await invoke<boolean>('path_exists', { path }).catch(() => false)) kind = 'file';
    lookedUp.current.set(path.toLowerCase(), kind);
    return kind;
  }, []);

  // Folders and files named in the description ("pictures are in @C:\…\public")
  // are attached as if picked; deleting the path from the text detaches them.
  useEffect(() => {
    if (busy) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const mentions = findMentionedPaths(prompt, workspacePath);
        // A folder found from the description stays only while the description still names it
        // (typing "…\website\public" drops "…\website", found during a pause).
        const named = new Set(mentions.flatMap((mention) => mention.candidates.map((candidate) => candidate.toLowerCase())));
        setFolders((current) => current.filter((folder) => folder.mention === null || named.has(folder.path.toLowerCase())));
        for (const mention of mentions) {
          for (const candidate of mention.candidates) {
            const kind = await lookUp(candidate);
            if (kind === 'none') continue;
            if (kind === 'folder' && !dismissed.current.has(candidate.toLowerCase())) await addFolder(candidate, mention.raw);
            if (kind === 'file' && (isPictureName(candidate) || SOURCE_EXTENSIONS.includes(candidate.split('.').pop()?.toLowerCase() ?? '')) && !dismissed.current.has(candidate.toLowerCase())) await addPaths([candidate]);
            break;
          }
        }
      })();
    }, 500);
    return () => window.clearTimeout(timer);
    // Only the description drives this; the helpers guard against duplicates themselves.
  }, [prompt, busy, workspacePath]);

  const pick = async (): Promise<void> => {
    const picked = await open({ multiple: true, defaultPath: workspacePath, filters: [{ name: 'Pictures and documents', extensions: [...IMAGE_EXTENSIONS, ...SOURCE_EXTENSIONS] }] });
    if (!picked) return;
    void addPaths(Array.isArray(picked) ? picked : [picked]);
  };

  /** Pasted or dropped files are saved beside the decks, then attached like picked ones. */
  const addFiles = async (list: File[]): Promise<void> => {
    setFileError(null);
    const usable = list.filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      return file.type.startsWith('image/') || SOURCE_EXTENSIONS.includes(extension);
    });
    if (usable.length < list.length) setFileError('Some files were skipped: use pictures, PDFs, Word, Excel or text files.');
    try {
      const folder = joinPath(workspacePath, 'Presentations', '.attachments');
      const paths = await Promise.all(usable.map((file) => saveDroppedFile(file, folder)));
      await addPaths(paths);
    } catch (error) {
      setFileError(`Could not add the file: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const submit = (): void => {
    if (!ready) return;
    const fromFolders = folders.flatMap((folder) => folder.pictures.map((path): ComposerFile => ({ path, name: fileName(path), kind: 'image', use: folder.use })));
    const all = [...files, ...fromFolders.filter((file) => !files.some((entry) => entry.path.toLowerCase() === file.path.toLowerCase()))];
    onCreate({ prompt: prompt.trim(), files: all, slideCount, size, language: language.trim(), animate });
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    // Typing in the composer never reaches the workspace shortcuts.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.stopPropagation();
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  const designing = busy || run?.phase === 'outline';
  const elapsed = run ? Math.max(0, ((run.endedAt ?? now) - run.startedAt) / 1000) : 0;
  const failed = !busy && run?.phase === 'failed' && run.error;
  const hasDocuments = files.some((file) => file.kind === 'document');
  const summary = [slideCount ? `${slideCount} slides` : 'Auto length', size, language.trim(), animate ? '' : 'No animation'].filter(Boolean).join(' · ');

  return (
    <div
      className="pd-home"
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
      <div className="pd-home__inner" data-still={!animations || undefined}>
        <header className="pd-home__head">
          <div>
            <div className="pd-home__kicker">{workspaceName}</div>
            <h1 className="pd-home__title">New presentation</h1>
          </div>
          <button type="button" className="pd-btn" disabled={designing} onClick={onImport}>
            <FileArrowUp size={14} /> Open PowerPoint file
          </button>
        </header>

        <label className="pd-home__ask" htmlFor="pd-composer-input">What is it for, and who will see it?</label>
        <div className="pd-composer" data-busy={designing || undefined}>
          <textarea dir="auto"
            id="pd-composer-input"
            ref={textarea}
            className="pd-composer__input"
            value={prompt}
            disabled={designing}
            placeholder="A 10-minute talk for new hires about how our support team works: the three tiers, response times, and the tools they will use on day one. Friendly and clear."
            onChange={(event) => setPrompt(event.target.value)}
            onPaste={(event) => {
              const pasted = Array.from(event.clipboardData.files);
              if (pasted.length > 0) {
                event.preventDefault();
                void addFiles(pasted);
              }
            }}
            autoFocus
          />

          {(files.length > 0 || folders.length > 0) && (
            <div className="pd-chips">
              {folders.map((folder) => (
                <span key={folder.path} className="pd-chip" title={`${folder.path}${folder.mention ? '\nFound in your description' : ''}`}>
                  {folder.pictures[0] ? <img className="pd-chip__thumb" src={localFileUrl(folder.pictures[0])} alt="" loading="lazy" /> : <FolderSimple size={13} />}
                  <span className="pd-chip__name">{folder.name}</span>
                  <span className="pd-chip__meta">{folder.total > folder.pictures.length ? `${folder.pictures.length} of ${folder.total}` : folder.pictures.length}</span>
                  <UseSelect value={folder.use} disabled={designing} onChange={(use) => setFolders((current) => current.map((entry) => (entry.path === folder.path ? { ...entry, use } : entry)))} />
                  <button
                    type="button"
                    className="pd-chip__remove"
                    aria-label={`Remove ${folder.name}`}
                    disabled={designing}
                    onClick={() => {
                      dismissed.current.add(folder.path.toLowerCase());
                      setFolders((current) => current.filter((entry) => entry.path !== folder.path));
                    }}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              {files.map((file) => (
                <span key={file.path} className="pd-chip" title={file.path}>
                  {file.preview ? <img className="pd-chip__thumb" src={file.preview} alt="" /> : <FileText size={13} />}
                  <span className="pd-chip__name">{file.name}</span>
                  {file.kind === 'image' && (
                    <UseSelect value={file.use} disabled={designing} onChange={(use) => setFiles((current) => current.map((entry) => (entry.path === file.path ? { ...entry, use } : entry)))} />
                  )}
                  <button type="button" className="pd-chip__remove" aria-label={`Remove ${file.name}`} disabled={designing} onClick={() => { dismissed.current.add(file.path.toLowerCase()); setFiles((current) => current.filter((entry) => entry.path !== file.path)); }}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}

          {showOptions && !designing && (
            <div className="pd-options">
              <div className="pd-options__row">
                <span>Slides</span>
                <div className="pd-segmented" role="radiogroup" aria-label="Number of slides">
                  {COUNTS.map((count) => (
                    <button key={count ?? 'auto'} type="button" role="radio" aria-checked={slideCount === count} onClick={() => setSlideCount(count)}>{count ?? 'Auto'}</button>
                  ))}
                </div>
              </div>
              <div className="pd-options__row">
                <span>Shape</span>
                <div className="pd-segmented" role="radiogroup" aria-label="Slide shape">
                  {(['16:9', '4:3'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={size === value} onClick={() => setSize(value)}>{value}</button>)}
                </div>
              </div>
              <div className="pd-options__row">
                <span>Animation</span>
                <div className="pd-segmented" role="radiogroup" aria-label="Animation of the slides">
                  <button type="button" role="radio" aria-checked={animate} onClick={() => setAnimate(true)} title="The AI designs how each slide's elements come in">AI designs it</button>
                  <button type="button" role="radio" aria-checked={!animate} onClick={() => setAnimate(false)}>None</button>
                </div>
              </div>
              <label className="pd-options__row">
                <span>Language</span>
                <input dir="auto" className="pd-control" value={language} placeholder="Same as the description" onChange={(event) => setLanguage(event.target.value)} />
              </label>
              <div className="pd-options__engine">
                <EnginePicker value={engine} onChange={onEngine} />
              </div>
            </div>
          )}

          <div className="pd-composer__bar">
            <button type="button" className="pd-btn pd-btn--ghost" disabled={designing || files.length >= MAX_FILES} onClick={() => void pick()} title="Documents become the content; pictures can go on slides or set the look">
              <Paperclip size={14} /> Add files
            </button>
            <button type="button" className="pd-btn pd-btn--ghost" disabled={designing || pictureCount >= MAX_DECK_PICTURES} onClick={() => void pickFolder()} title="Use the pictures in a folder (its subfolders too). You can also write a folder path in the description.">
              <FolderSimple size={14} /> Add folder
            </button>
            <button type="button" className={`pd-btn pd-btn--ghost${showOptions ? ' is-on' : ''}`} aria-expanded={showOptions} disabled={designing} onClick={() => setShowOptions((value) => !value)}>
              <SlidersHorizontal size={14} /> {summary}
            </button>
            <span className="pd-composer__spacer" />
            {designing ? (
              <button type="button" className="pd-btn" onClick={onCancel}><Stop size={12} weight="fill" /> Stop</button>
            ) : (
              <button type="button" className="pd-btn pd-btn--primary" disabled={!ready} onClick={submit} title="Ctrl+Enter">
                Design deck <ArrowRight size={13} weight="bold" />
              </button>
            )}
          </div>

          {designing && (
            <div className="pd-composer__status" role="status" aria-live="polite">
              <span>
                Choosing a look and planning the story{hasDocuments ? ' from your files' : ''}{pictureCount > 0 ? ` around ${pictureCount} picture${pictureCount === 1 ? '' : 's'}` : ''}
              </span>
              <span className="pd-composer__time">{formatDuration(elapsed)}</span>
            </div>
          )}
        </div>
        {failed && <p className="pd-home__error">{run?.error}</p>}
        {fileError && <p className="pd-home__error">{fileError}</p>}

        {!designing && (
          <div className="pd-home__hints">
            {!prompt.trim() && (
              <span className="pd-examples">
                <span className="pd-examples__label">Try</span>
                {EXAMPLES.map((example) => (
                  <button key={example.label} type="button" className="pd-examples__item" title={example.prompt} onClick={() => { setPrompt(example.prompt); textarea.current?.focus(); }}>
                    {example.label}
                  </button>
                ))}
              </span>
            )}
            <span className="pd-home__keys">Ctrl+Enter to start</span>
          </div>
        )}

        {decks.length > 0 && (
          <section className="pd-home__section">
            <h2 className="pd-home__heading">Recent</h2>
            <div className="pd-decks">
              {decks.slice(0, 8).map((deck) => <DeckCard key={deck.path} deck={deck} disabled={designing} onOpen={onOpen} onDelete={onDelete} />)}
            </div>
          </section>
        )}
      </div>
      {dragging && <div className="pd-drop" aria-hidden="true">Drop pictures or documents to use them</div>}
    </div>
  );
};
