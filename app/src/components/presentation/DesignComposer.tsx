import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowRight, FileArrowUp, FileText, ImageSquare, Paperclip, PresentationChart, Sparkle, Stop, X } from '@phosphor-icons/react';
import type { DeckRun } from '../../stores/presentationSessionStore';
import { formatDuration } from '../../utils/presentation/timing';
import type { DeckSize } from '../../utils/presentation/types';
import { fileName, joinPath } from '../../utils/writing/document';
import { SOURCE_EXTENSIONS } from '../../utils/writing/sources';
import type { EngineChoice } from '../../utils/writing/types';
import { IMAGE_EXTENSIONS, saveDroppedFile } from './designAssets';
import { EnginePicker } from './EnginePicker';
import type { DeckListing } from './useDeckDocument';

export interface ComposerFile {
  path: string;
  name: string;
  kind: 'image' | 'document';
  use: 'auto' | 'slides' | 'style';
  /** Thumbnail data URL for pictures. */
  preview?: string;
}

export interface ComposerInput {
  prompt: string;
  files: ComposerFile[];
  slideCount: number | null;
  size: DeckSize;
  language: string;
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
  onImport: () => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;
const COUNTS: Array<number | null> = [null, 5, 8, 12, 16];
const MAX_FILES = 12;
const isImage = (path: string): boolean => IMAGE_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() ?? '');

const EXAMPLES = [
  'A pitch for our neighbourhood solar co-op to the city council: panel costs are down 40% since 2020, 120 households have joined, and we need €80k for phase two.',
  'A 15-minute lesson introducing photosynthesis to 14-year-olds. Playful and visual, with a simple experiment they can do at home.',
  'Launch keynote for a minimalist mechanical keyboard brand. Dark, premium, few words, big product moments.',
  'Board update from the attached report: what moved this quarter, why churn rose, and the pricing change we recommend.',
];

const USE_LABEL: Record<ComposerFile['use'], string> = { auto: 'AI decides', slides: 'On slides', style: 'Inspiration' };
const NEXT_USE: Record<ComposerFile['use'], ComposerFile['use']> = { auto: 'slides', slides: 'style', style: 'auto' };

/** The new-presentation screen: describe it, add files, and the AI designs a deck from scratch. */
export const DesignComposer: React.FC<DesignComposerProps> = ({ workspaceName, workspacePath, decks, engine, defaultSize, run, busy, animations, onEngine, onCreate, onCancel, onOpen, onImport }) => {
  const reduce = useReducedMotion();
  const still = reduce || !animations;
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const [slideCount, setSlideCount] = useState<number | null>(null);
  const [size, setSize] = useState<DeckSize>(defaultSize);
  const [language, setLanguage] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);
  const ready = prompt.trim().length >= 8 && !busy;

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
    element.style.height = `${Math.min(320, Math.max(120, element.scrollHeight))}px`;
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
    onCreate({ prompt: prompt.trim(), files, slideCount, size, language: language.trim() });
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  const designing = busy || run?.phase === 'outline';
  const elapsed = run ? Math.max(0, ((run.endedAt ?? now) - run.startedAt) / 1000) : 0;
  const failed = !busy && run?.phase === 'failed' && run.error;

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
    >
      <div className="pd-home__inner">
        <motion.span className="pr-eyebrow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <PresentationChart size={12} weight="fill" /> {workspaceName} · Presentation studio
        </motion.span>
        <motion.h1 className="pd-home__title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}>
          Describe it. <em>We design it.</em>
        </motion.h1>
        <motion.p className="pd-home__lede" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.12 }}>
          Say what the presentation is for and who will see it. Add your notes, documents, logo or photos. The AI invents a look made for this deck and draws every slide.
        </motion.p>

        <motion.div className="pd-composer" data-busy={designing || undefined} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.18 }}>
          <textarea
            ref={textarea}
            className="pd-composer__input"
            value={prompt}
            disabled={designing}
            placeholder="e.g. A 10-minute talk for new hires about how our support team works: the three tiers, response times, and the tools they will use on day one. Friendly and clear."
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              const pasted = Array.from(event.clipboardData.files);
              if (pasted.length > 0) {
                event.preventDefault();
                void addFiles(pasted);
              }
            }}
            aria-label="Describe your presentation"
            autoFocus
          />

          {files.length > 0 && (
            <div className="pd-files">
              {files.map((file) => (
                <div key={file.path} className="pd-file" data-kind={file.kind} title={file.path}>
                  {file.preview ? <img src={file.preview} alt="" className="pd-file__thumb" /> : <span className="pd-file__icon"><FileText size={16} /></span>}
                  <span className="pd-file__text">
                    <span className="pd-file__name">{file.name}</span>
                    {file.kind === 'image' ? (
                      <button type="button" className="pd-file__use" disabled={designing} onClick={() => setFiles((current) => current.map((entry) => (entry.path === file.path ? { ...entry, use: NEXT_USE[entry.use] } : entry)))} title="Click to change how this picture is used">
                        {USE_LABEL[file.use]}
                      </button>
                    ) : <span className="pd-file__use pd-file__use--static">Source</span>}
                  </span>
                  <button type="button" className="pr-icon-btn pr-icon-btn--xs" aria-label={`Remove ${file.name}`} disabled={designing} onClick={() => setFiles((current) => current.filter((entry) => entry.path !== file.path))}><X size={11} /></button>
                </div>
              ))}
            </div>
          )}

          {showOptions && !designing && (
            <div className="pd-options">
              <div className="pd-option">
                <span className="pr-field__label">Slides</span>
                <div className="pd-segmented" role="radiogroup" aria-label="Number of slides">
                  {COUNTS.map((count) => (
                    <button key={count ?? 'auto'} type="button" role="radio" aria-checked={slideCount === count} onClick={() => setSlideCount(count)}>{count ?? 'Auto'}</button>
                  ))}
                </div>
              </div>
              <div className="pd-option">
                <span className="pr-field__label">Shape</span>
                <div className="pd-segmented" role="radiogroup" aria-label="Slide shape">
                  {(['16:9', '4:3'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={size === value} onClick={() => setSize(value)}>{value}</button>)}
                </div>
              </div>
              <label className="pd-option">
                <span className="pr-field__label">Language</span>
                <input className="pr-input pd-option__lang" value={language} placeholder="Same as my description" onChange={(event) => setLanguage(event.target.value)} onKeyDown={(event) => event.stopPropagation()} />
              </label>
              <div className="pd-option pd-option--engine">
                <EnginePicker value={engine} onChange={onEngine} />
              </div>
            </div>
          )}

          <div className="pd-composer__bar">
            <button type="button" className="pr-btn pr-btn--sm pr-btn--ghost" disabled={designing || files.length >= MAX_FILES} onClick={() => void pick()} title="Documents become the content; pictures can go on slides or set the mood">
              <Paperclip size={14} /> Add files
            </button>
            <button type="button" className="pr-btn pr-btn--sm pr-btn--ghost" aria-expanded={showOptions} disabled={designing} onClick={() => setShowOptions((value) => !value)}>
              {slideCount ? `${slideCount} slides` : 'Auto length'} · {size}{language.trim() ? ` · ${language.trim()}` : ''}
            </button>
            <span className="pd-composer__spacer" />
            {designing ? (
              <button type="button" className="pr-btn pr-btn--lg" onClick={onCancel}><Stop size={14} weight="fill" /> Stop</button>
            ) : (
              <button type="button" className="pr-btn pr-btn--primary pr-btn--lg" disabled={!ready} onClick={submit} title="Ctrl+Enter">
                <Sparkle size={14} weight="fill" /> Design my deck <ArrowRight size={14} weight="bold" />
              </button>
            )}
          </div>

          {designing && (
            <div className="pd-progress" role="status" aria-live="polite">
              <span className="pd-progress__orb" data-still={still || undefined} aria-hidden="true" />
              <span>
                <strong>Art-directing your deck</strong>
                <span>Inventing a visual identity and planning the story{files.some((file) => file.kind === 'document') ? ' from your files' : ''} · {formatDuration(elapsed)}</span>
              </span>
            </div>
          )}
          {failed && <div className="pr-error">{run?.error}</div>}
          {fileError && <div className="pr-error">{fileError}</div>}
        </motion.div>

        {!designing && !prompt.trim() && (
          <motion.div className="pd-examples" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }}>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="pd-example" onClick={() => { setPrompt(example); textarea.current?.focus(); }}>
                {example}
              </button>
            ))}
          </motion.div>
        )}

        <div className="pd-home__foot">
          {decks.length > 0 && (
            <div className="pd-recent">
              <div className="pr-label">Recent presentations</div>
              <div className="pd-recent__list">
                {decks.slice(0, 6).map((deck) => (
                  <button key={deck.path} type="button" className="pr-deck-row" disabled={designing} onClick={() => onOpen(deck.path)}>
                    <span className="pr-deck-row__glyph" aria-hidden="true">{deck.designed ? <Sparkle size={14} /> : <PresentationChart size={15} />}</span>
                    <span className="pr-deck-row__text">
                      <span className="pr-deck-row__name">{deck.title}</span>
                      <span className="pr-deck-row__meta">
                        {deck.slides} slide{deck.slides === 1 ? '' : 's'}{deck.preserve ? ' · original design' : deck.designed ? ' · AI-designed' : ''} · {new Date(deck.modifiedAt).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="pr-btn pr-btn--sm pr-btn--ghost pd-home__import" disabled={designing} onClick={onImport}>
            <FileArrowUp size={14} /> Open a PowerPoint file instead
          </button>
        </div>
      </div>
      {dragging && (
        <div className="pd-drop" aria-hidden="true">
          <ImageSquare size={28} weight="duotone" />
          <span>Drop pictures or documents</span>
        </div>
      )}
    </div>
  );
};
