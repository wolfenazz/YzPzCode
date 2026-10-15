import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { CaretDown, Check, DeviceMobile, FileText, ImageSquare, Minus, Monitor, Plus, Trash, X } from '@phosphor-icons/react';
import { useDesignStore } from '../../stores/designStore';
import { MAX_CANVAS, MIN_CANVAS, aspectLabel, clampCanvas, findPreset, presetsFor, resolveFormat, sizeLabel } from '../../utils/design/formats';
import { DESIGN_FOLDER } from '../../utils/design/project';
import type { DesignKind, DesignTokens } from '../../utils/design/types';
import { VISUAL_STYLES } from '../../utils/presentation/designStyles';
import { composeExtra, findTemplate, templateName, templateQuestion, type DesignTemplate } from '../../utils/design/templates';
import type { ExamplePrompt } from '../../utils/design/promptLibrary';
import { hasRtl, isRtlLanguage } from '../../utils/writing/rtl';
import { joinPath } from '../../utils/writing/document';
import { SOURCE_EXTENSIONS } from '../../utils/writing/sources';
import { IMAGE_EXTENSIONS, saveDroppedFile } from '../presentation/designAssets';
import { StudioPromptBar } from '../composer/StudioPromptBar';
import { relativeTime } from '../writing/ui';
import { TemplateGallery } from './TemplateGallery';
import type { DesignListing } from './useDesignDocument';
import type { SavedKit } from './useDesignKits';

export interface ComposerFile {
  path: string;
  name: string;
  kind: 'image' | 'document';
  use: 'auto' | 'slides' | 'style';
  preview?: string;
}

export interface ComposerInput {
  prompt: string;
  kind: DesignKind;
  /** Preset ids or custom `1200x628` sizes; one board each for a graphic, the first for an app or web design. */
  formats: string[];
  /** `VISUAL_STYLES` id, or null when the AI decides. */
  style: string | null;
  files: ComposerFile[];
  /** A kit or recent system the screens must keep to. */
  kit: DesignTokens | null;
  /** Offer three looks before drawing. */
  explore: boolean;
  /** The planned boards and filled details of the chosen template, for the AI; empty without one. */
  extra: string;
  /** The boards are the cards of one series (a carousel). */
  series: boolean;
  /** How a graphic is drawn: free layout (SVG) or text layout (HTML). */
  format: 'svg' | 'html';
  template: string | null;
}

interface DesignComposerProps {
  workspaceName: string;
  workspacePath: string;
  projects: DesignListing[];
  busy: boolean;
  error: string | null;
  onCreate: (input: ComposerInput) => void;
  onCancel: () => void;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  kits: SavedKit[];
}

const MAX_FILES = 12;
const MIN_PROMPT = 8;

const KIND_LABEL: Record<DesignKind, string> = { app: 'App', web: 'Web', graphic: 'Graphic' };
const KIND_ICON: Record<DesignKind, React.ReactNode> = {
  app: <DeviceMobile size={14} />,
  web: <Monitor size={14} />,
  graphic: <ImageSquare size={14} />,
};

const PLACEHOLDER: Record<DesignKind, string> = {
  app: 'What mobile app shall we design?',
  web: 'What website shall we design?',
  graphic: 'What graphic, banner or picture shall we design?',
};

const EXAMPLES: Record<DesignKind, Array<{ label: string; prompt: string }>> = {
  app: [
    { label: 'Habit tracker', prompt: 'A calm habit tracker app: today view with streaks, a weekly review and a simple add-habit flow.' },
    { label: 'Banking home', prompt: 'A mobile banking app: balance overview, recent transactions, quick transfer and a spending breakdown.' },
    { label: 'Recipe app', prompt: 'A recipe app with a photo-led home feed, a recipe detail with ingredients and steps, and a saved list.' },
  ],
  web: [
    { label: 'SaaS landing page', prompt: 'A landing page for a project-planning tool: hero, three feature sections, pricing and a closing call to action.' },
    { label: 'Portfolio', prompt: 'A photographer portfolio site: full-bleed work grid, an about page and a contact page.' },
    { label: 'Restaurant', prompt: 'A restaurant website: hero with the dining room, menu highlights, opening hours and a reservation section.' },
  ],
  graphic: [
    { label: 'Product launch banner', prompt: 'A bold launch banner for a minimalist mechanical keyboard. Dark, premium, few words, one strong product moment.' },
    { label: 'Event poster', prompt: 'A poster for a two-day design conference in October: typographic, high contrast, the date and city clearly readable.' },
    { label: 'Social post set', prompt: 'A square announcement post for a new coffee shop opening, warm and friendly, with the opening date.' },
  ],
};

const isImage = (path: string): boolean => IMAGE_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() ?? '');
const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** Closes a popover on an outside pointer press or Escape. A press inside any of `inside` is not outside. */
function useDismiss(openState: boolean, close: () => void, inside: ReadonlyArray<React.RefObject<HTMLElement | null>>): void {
  const insideRef = useRef(inside);
  insideRef.current = inside;
  useEffect(() => {
    if (!openState) return undefined;
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (insideRef.current.some((entry) => entry.current?.contains(target))) return;
      close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [openState, close]);
}

const MENU_WIDTH = 240;
const MENU_EDGE = 8;
const MENU_MAX_HEIGHT = 320;

/**
 * A menu drawn in the body, under its button (above it when the room below is
 * short) and kept inside the window. The composer's boxes clip and stack, so a
 * menu inside them ends up under the template cards; here it is never covered.
 */
const FloatingMenu: React.FC<{ anchor: React.RefObject<HTMLElement | null>; panelRef: React.RefObject<HTMLDivElement | null>; label: string; width?: number; children: React.ReactNode }> = ({ anchor, panelRef, label, width = MENU_WIDTH, children }) => {
  const [place, setPlace] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const position = (): void => {
      const button = anchor.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const left = Math.max(MENU_EDGE, Math.min(rect.left, window.innerWidth - width - MENU_EDGE));
      const below = window.innerHeight - rect.bottom - MENU_EDGE * 2;
      const above = rect.top - MENU_EDGE * 2;
      if (below >= 200 || below >= above) setPlace({ left, top: rect.bottom + 6, width, maxHeight: Math.min(MENU_MAX_HEIGHT, below) });
      else setPlace({ left, bottom: window.innerHeight - rect.top + 6, width, maxHeight: Math.min(MENU_MAX_HEIGHT, above) });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [anchor, width]);

  // The menu is drawn inside the prompt bar's React tree, so its clicks would reach the bar's
  // handlers (which move focus to the prompt). They stop here: a typed size stays in its field.
  return createPortal(
    <div ref={panelRef} role="menu" aria-label={label} className="dz-menu dz-menu--float dz-menu-layer" style={place} onClick={(event) => event.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
};

const ProjectCard: React.FC<{ project: DesignListing; disabled: boolean; onOpen: (path: string) => void; onDelete: (path: string) => void }> = ({ project, disabled, onOpen, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const longest = Math.max(1, ...project.cover.map((board) => Math.max(board.width, board.height)));
  return (
    <div className="dz-project">
      <button type="button" className="dz-project__open" disabled={disabled} onClick={() => onOpen(project.path)}>
        <div className="dz-project__cover">
          <div className="dz-project__boards">
            {project.cover.length === 0 && <span style={{ color: 'var(--dz-ink-faint)', fontSize: 12 }}>Empty</span>}
            {project.cover.map((board, index) => (
              <span key={index} className="dz-project__board" style={{ width: Math.max(10, (board.width / longest) * 56), height: Math.max(10, (board.height / longest) * 56) }} />
            ))}
          </div>
        </div>
        <div className="dz-project__name">{project.title}</div>
        <div className="dz-project__meta">{KIND_LABEL[project.kind]} · {project.boards} {project.boards === 1 ? 'board' : 'boards'} · {relativeTime(project.modifiedAt)}</div>
      </button>
      <button type="button" className="dz-project__delete" aria-label={`Delete ${project.title}`} disabled={disabled} onClick={() => setConfirming(true)}><Trash size={13} /></button>
      {confirming && (
        <div className="dz-project__confirm" role="alertdialog" aria-label={`Delete ${project.title}?`}>
          <button type="button" className="dz-btn dz-btn--sm dz-btn--danger" onClick={() => { setConfirming(false); onDelete(project.path); }}>Delete</button>
          <button type="button" className="dz-btn dz-btn--sm" onClick={() => setConfirming(false)}>Keep</button>
        </div>
      )}
    </div>
  );
};

/** The describe-it home: one box, then what it is (app, web, graphic), its size, a look and the AI. */
export const DesignComposer: React.FC<DesignComposerProps> = ({ workspaceName, workspacePath, projects, busy, error, onCreate, onCancel, onOpen, onDelete, kits }) => {
  const defaultKind = useDesignStore((state) => state.defaultKind);
  const lastPresets = useDesignStore((state) => state.lastPresets);
  const setLastPresets = useDesignStore((state) => state.setLastPresets);
  const setPreference = useDesignStore((state) => state.setPreference);
  const engine = useDesignStore((state) => state.defaultEngine);
  const setEngine = useDesignStore((state) => state.setDefaultEngine);
  const exploreDirections = useDesignStore((state) => state.exploreDirections);
  const recentSystems = useDesignStore((state) => state.recentSystems);
  const language = useDesignStore((state) => state.language);
  const graphicMode = useDesignStore((state) => state.graphicMode);
  const [template, setTemplate] = useState<DesignTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  /** Sizes of the chosen template; they are not written to the remembered sizes. */
  const [sizesOverride, setSizesOverride] = useState<string[] | null>(null);
  const [kitChoice, setKitChoice] = useState<{ id: string; name: string; tokens: DesignTokens } | null>(null);

  const [kind, setKind] = useState<DesignKind>(defaultKind);
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const [style, setStyle] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<'size' | 'style' | null>(null);
  const [customW, setCustomW] = useState('1200');
  const [customH, setCustomH] = useState('628');
  const dragDepth = useRef(0);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const styleButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  useDismiss(menu !== null, closeMenu, [menuRef, menuPanelRef]);

  const rtl = isRtlLanguage(language) || hasRtl(prompt);
  const formats = sizesOverride ?? lastPresets[kind] ?? [];
  const resolved = formats.map((id) => resolveFormat(id)).filter((entry): entry is NonNullable<ReturnType<typeof resolveFormat>> => entry !== null);
  // One size is chosen. A graphic makes as many canvases of it as its count says: the count is the size listed that many times.
  const chosenId = formats[0] ?? null;
  const chosenCount = chosenId ? formats.filter((id) => id === chosenId).length : 0;
  const distinctSizes = new Set(formats).size;
  const sizeSummary = resolved.length === 0
    ? 'Size'
    : distinctSizes > 1
      ? `${resolved.length} sizes`
      : `${findPreset(resolved[0].id) ? resolved[0].label : 'Custom'} · ${sizeLabel(resolved[0].width, resolved[0].height)}${resolved.length > 1 ? ` × ${resolved.length}` : ''}`;
  const customValid = [customW, customH].every((value) => Number(value) >= MIN_CANVAS && Number(value) <= MAX_CANVAS);
  /** The chosen size when the user typed it in (it is not a preset, so the preset list does not show it). */
  const chosenCustom = chosenId && findPreset(chosenId) === undefined && resolveFormat(chosenId) !== null ? chosenId : null;
  const sizeRow = (id: string, name: string, width: number, height: number, aspect: string): React.ReactNode => {
    const selected = chosenId === id;
    return (
      <button key={id} type="button" role="menuitemradio" aria-checked={selected} className="dz-menu__item" onClick={() => chooseSize(id)}>
        <span className="dz-menu__name">{name}</span>
        <span className="dz-menu__meta">{sizeLabel(width, height)}{aspect ? ` · ${aspect}` : ''}</span>
        <span className="dz-menu__tick">{selected && <Check size={13} />}</span>
      </button>
    );
  };
  const styleLabel = kitChoice ? kitChoice.name : style ? VISUAL_STYLES.find((entry) => entry.id === style)?.label ?? 'AI decides' : 'AI decides';
  const filledDetails = template ? template.fields.filter((entry) => (values[entry.id] ?? '').trim()) : [];

  const clearTemplate = (): void => {
    setTemplate(null);
    setValues({});
    setSizesOverride(null);
  };

  const chooseTemplate = (next: DesignTemplate): void => {
    setTemplate(next);
    setValues({});
    setSizesOverride(next.sizes);
  };

  const useExample = (example: ExamplePrompt): void => {
    const linked = findTemplate(example.templateId);
    if (linked) chooseTemplate(linked);
    else if (example.sizes) {
      setTemplate(null);
      setValues({});
      setSizesOverride(example.sizes);
    }
    setPrompt(rtl && example.ar ? example.ar.prompt : example.prompt);
  };

  const chooseKind = (next: DesignKind): void => {
    if (next !== kind) clearTemplate();
    setKind(next);
    setPreference('defaultKind', next);
  };

  /** Canvases of one size a graphic makes at once. */
  const MAX_CANVASES_PER_SIZE = 12;

  /** Chooses the one size. A graphic keeps the canvas count it had; an app or web screen is always one. */
  const chooseSize = (id: string, count = kind === 'graphic' ? Math.max(1, chosenCount) : 1): void => {
    // Changing the sizes by hand leaves the template's size list.
    if (sizesOverride) setSizesOverride(null);
    setLastPresets(kind, Array.from({ length: Math.min(MAX_CANVASES_PER_SIZE, count) }, () => id));
    if (kind !== 'graphic') setMenu(null);
  };

  const setCanvasCount = (count: number): void => {
    if (chosenId) chooseSize(chosenId, Math.max(1, Math.min(MAX_CANVASES_PER_SIZE, count)));
  };

  const addCustom = (): void => {
    if (!customValid) return;
    const width = clampCanvas(Number(customW));
    const height = clampCanvas(Number(customH));
    chooseSize(`${width}x${height}`);
  };

  const addPaths = async (paths: string[]): Promise<void> => {
    const next: ComposerFile[] = [];
    for (const path of paths) {
      if (files.some((file) => file.path.toLowerCase() === path.toLowerCase())) continue;
      const image = isImage(path);
      next.push({ path, name: baseName(path), kind: image ? 'image' : 'document', use: 'auto' });
    }
    setFiles((current) => [...current, ...next].slice(0, MAX_FILES));
  };

  const pick = async (): Promise<void> => {
    const picked = await open({ multiple: true, defaultPath: workspacePath, filters: [{ name: 'Pictures and documents', extensions: [...IMAGE_EXTENSIONS, ...SOURCE_EXTENSIONS] }] });
    if (!picked) return;
    void addPaths(Array.isArray(picked) ? picked : [picked]);
  };

  /** Pasted or dropped files are saved beside the designs, then attached like picked ones. */
  const addFiles = async (list: File[]): Promise<void> => {
    setFileError(null);
    const usable = list.filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      return file.type.startsWith('image/') || SOURCE_EXTENSIONS.includes(extension);
    });
    if (usable.length < list.length) setFileError('Some files were skipped: use pictures, PDFs, Word, Excel or text files.');
    try {
      const folder = joinPath(workspacePath, DESIGN_FOLDER, '.attachments');
      const paths = await Promise.all(usable.map((file) => saveDroppedFile(file, folder)));
      await addPaths(paths);
    } catch (reason) {
      setFileError(`Could not add the file: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };

  const submit = (draft = prompt): void => {
    if (busy) return;
    const firstDetail = filledDetails[0] ? (values[filledDetails[0].id] ?? '').trim() : '';
    const text = draft.trim() || (template ? `${template.name}${firstDetail ? `: ${firstDetail}` : ''}` : '');
    if (text.length < MIN_PROMPT && filledDetails.length === 0) {
      setFileError('Describe the design a little more before creating.');
      return;
    }
    if (resolved.length === 0) {
      setFileError('Choose a size for the design first.');
      return;
    }
    onCreate({
      prompt: text,
      kind,
      formats: resolved.map((entry) => entry.id),
      style: kitChoice ? null : style,
      files,
      kit: kitChoice ? kitChoice.tokens : null,
      explore: exploreDirections && !kitChoice && style === null,
      extra: template ? composeExtra(template, values) : '',
      series: Boolean(template?.series),
      template: template?.id ?? null,
      format: kind !== 'graphic' ? 'html' : graphicMode === 'auto' ? template?.draw ?? 'svg' : graphicMode,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    // Typing in the composer never reaches the workspace shortcuts. Enter is
    // the bar's own: it sends, or opens the picker it is part of.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.stopPropagation();
  };

  const groups = Array.from(new Set(presetsFor(kind).map((preset) => preset.group)));

  return (
    <div
      className="dz-home"
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
      <div className="dz-home__inner">
        <header className="dz-hero">
          <div className="dz-home__workspace">{workspaceName}</div>
          <h1 className="dz-home__title">What shall we design?</h1>
        </header>

        <div className="dz-composer">
          <div className="dz-composer__head">
            <div className="dz-kinds" role="radiogroup" aria-label="What to design">
              {(['app', 'web', 'graphic'] as const).map((value) => (
                <button key={value} type="button" role="radio" className="dz-kind" aria-checked={kind === value} disabled={busy} onClick={() => chooseKind(value)}>
                  {KIND_ICON[value]} {KIND_LABEL[value]}
                </button>
              ))}
            </div>
            {kind === 'graphic' && (
              <div className="dz-composer__mode" title="Free layout: exact positions, vector export, drag editing. Text layout: the page wraps the words (menus, certificates, infographics).">
                <span>Layout</span>
                <div className="dz-segmented dz-segmented--sm" role="radiogroup" aria-label="How graphics are drawn">
                  {([['auto', 'Auto'], ['svg', 'Free'], ['html', 'Text']] as const).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={graphicMode === value} disabled={busy} onClick={() => setPreference('graphicMode', value)}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <StudioPromptBar
            engine={engine}
            onEngineChange={setEngine}
            placeholder={template ? templateQuestion(template, rtl) : PLACEHOLDER[kind]}
            inputLabel="Describe the design"
            busy={busy}
            canSend={prompt.trim().length > 0 || filledDetails.length > 0}
            draft={prompt}
            onDraftChange={setPrompt}
            onSend={submit}
            onStop={onCancel}
            onAttach={() => void pick()}
            onPaste={(event) => {
              const pasted = Array.from(event.clipboardData.files);
              if (pasted.length > 0) {
                event.preventDefault();
                void addFiles(pasted);
              }
            }}
            extras={
              <div className="dz-composer__opts" ref={menuRef}>
                <div className="dz-menu-anchor">
                  <button ref={sizeButtonRef} type="button" className={`dz-opt${menu === 'size' ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={menu === 'size'} disabled={busy} onClick={() => setMenu(menu === 'size' ? null : 'size')}>
                    <span className="dz-opt__label">Size</span>
                    <span className="dz-opt__value">{sizeSummary}</span>
                    <CaretDown size={11} className="dz-opt__caret" />
                  </button>
                  {menu === 'size' && (
                    <FloatingMenu anchor={sizeButtonRef} panelRef={menuPanelRef} label="Size" width={280}>
                      {groups.map((group) => (
                        <div key={group}>
                          <div className="dz-menu__group">{group}</div>
                          {presetsFor(kind).filter((preset) => preset.group === group).map((preset) => sizeRow(preset.id, preset.label, preset.width, preset.height, aspectLabel(preset.width, preset.height)))}
                        </div>
                      ))}
                      {chosenCustom && (() => {
                        const entry = resolveFormat(chosenCustom);
                        return entry ? (
                          <div>
                            <div className="dz-menu__group">Custom</div>
                            {sizeRow(chosenCustom, 'Custom', entry.width, entry.height, aspectLabel(entry.width, entry.height))}
                          </div>
                        ) : null;
                      })()}
                      {kind === 'graphic' && (
                        <div className="dz-menu__count">
                          <span>Canvases of this size</span>
                          <div className="dz-stepper">
                            <button type="button" aria-label="Fewer canvases" disabled={chosenCount <= 1} onClick={() => setCanvasCount(chosenCount - 1)}><Minus size={12} /></button>
                            <output aria-live="polite">{Math.max(1, chosenCount)}</output>
                            <button type="button" aria-label="More canvases" disabled={chosenCount >= MAX_CANVASES_PER_SIZE} onClick={() => setCanvasCount(chosenCount + 1)}><Plus size={12} /></button>
                          </div>
                        </div>
                      )}
                      {kind === 'graphic' && (
                        <div className="dz-menu__custom">
                          <input className="dz-input" inputMode="numeric" aria-label="Width in pixels" value={customW} onChange={(event) => setCustomW(event.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(event) => { if (event.key === 'Enter') addCustom(); }} />
                          <span>×</span>
                          <input className="dz-input" inputMode="numeric" aria-label="Height in pixels" value={customH} onChange={(event) => setCustomH(event.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(event) => { if (event.key === 'Enter') addCustom(); }} />
                          <button type="button" className="dz-btn dz-btn--sm" disabled={!customValid} title={customValid ? undefined : `Between ${MIN_CANVAS} and ${MAX_CANVAS} pixels`} onClick={addCustom}>Add size</button>
                        </div>
                      )}
                    </FloatingMenu>
                  )}
                </div>
                <div className="dz-menu-anchor">
                  <button ref={styleButtonRef} type="button" className={`dz-opt${menu === 'style' ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={menu === 'style'} disabled={busy} onClick={() => setMenu(menu === 'style' ? null : 'style')}>
                    <span className="dz-opt__label">Style</span>
                    <span className="dz-opt__value">{styleLabel}</span>
                    <CaretDown size={11} className="dz-opt__caret" />
                  </button>
                  {menu === 'style' && (
                    <FloatingMenu anchor={styleButtonRef} panelRef={menuPanelRef} label="Style">
                      <button type="button" role="menuitemradio" aria-checked={style === null && !kitChoice} className="dz-menu__item" onClick={() => { setStyle(null); setKitChoice(null); setMenu(null); }}>
                        <span>AI decides</span>{style === null && !kitChoice && <Check size={13} />}
                      </button>
                      <button type="button" role="menuitemcheckbox" aria-checked={exploreDirections} className="dz-menu__item" title="The AI proposes three looks and you choose one before the screens are drawn" onClick={() => setPreference('exploreDirections', !exploreDirections)}>
                        <span>Show three directions first</span>{exploreDirections && <Check size={13} />}
                      </button>
                      {kits.length > 0 && <div className="dz-menu__group">My kits</div>}
                      {kits.map((kit) => (
                        <button key={kit.id} type="button" role="menuitemradio" aria-checked={kitChoice?.id === kit.id} className="dz-menu__item" onClick={() => { setKitChoice({ id: kit.id, name: kit.name, tokens: kit.tokens }); setMenu(null); }}>
                          <span>{kit.name}</span>{kitChoice?.id === kit.id && <Check size={13} />}
                        </button>
                      ))}
                      {recentSystems.length > 0 && <div className="dz-menu__group">Recently used</div>}
                      {recentSystems.map((entry) => (
                        <button key={entry.id} type="button" role="menuitemradio" aria-checked={kitChoice?.id === entry.id} className="dz-menu__item" onClick={() => { setKitChoice({ id: entry.id, name: entry.tokens.name, tokens: entry.tokens }); setMenu(null); }}>
                          <span>{entry.tokens.name} · {entry.tokens.fonts.heading}</span>{kitChoice?.id === entry.id && <Check size={13} />}
                        </button>
                      ))}
                      <div className="dz-menu__group">Styles</div>
                      {VISUAL_STYLES.map((entry) => (
                        <button key={entry.id} type="button" role="menuitemradio" aria-checked={!kitChoice && style === entry.id} className="dz-menu__item" title={entry.character} onClick={() => { setStyle(entry.id); setKitChoice(null); setMenu(null); }}>
                          <span>{entry.label}</span>{!kitChoice && style === entry.id && <Check size={13} />}
                        </button>
                      ))}
                    </FloatingMenu>
                  )}
                </div>
              </div>
            }
            background="var(--dz-card-bg)"
            color="var(--dz-ink)"
            menuBackground="var(--dz-surface)"
            sparkColor="var(--accent)"
            width="100%"
            autoFocus
          />

          {template && (
            <div className="dz-template-banner">
              <span className="dz-chip">
                <span className="dz-chip__name">{rtl ? 'قالب' : 'Template'}: {templateName(template, rtl)}</span>
                <button type="button" className="dz-chip__remove" aria-label="Remove the template" disabled={busy} onClick={clearTemplate}><X size={11} /></button>
              </span>
              {template.fields.length > 0 && (
                <div className="dz-details">
                  {template.fields.map((entry) => (
                    <label key={entry.id} className="dz-details__field">
                      <span>{rtl ? entry.ar.label : entry.label}</span>
                      <input
                        dir="auto"
                        className="dz-input dz-input--wide"
                        value={values[entry.id] ?? ''}
                        disabled={busy}
                        placeholder={rtl ? entry.ar.placeholder : entry.placeholder}
                        onChange={(event) => setValues((current) => ({ ...current, [entry.id]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {files.length > 0 && (
            <div className="dz-chips">
              {files.map((file) => (
                <span key={file.path} className="dz-chip" title={file.path}>
                  {file.preview ? <img className="dz-chip__thumb" src={file.preview} alt="" /> : file.kind === 'image' ? <ImageSquare size={13} /> : <FileText size={13} />}
                  <span className="dz-chip__name">{file.name}</span>
                  <button type="button" className="dz-chip__remove" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => setFiles((current) => current.filter((entry) => entry.path !== file.path))}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}

        </div>

        {(error || fileError) && <p className="dz-error">{error ?? fileError}</p>}

        {!busy && !prompt.trim() && (
          <div className="dz-hints">
            <span className="dz-hints__lead">Try</span>
            {EXAMPLES[kind].map((example) => (
              <button key={example.label} type="button" className="dz-hints__item" title={example.prompt} onClick={() => setPrompt(example.prompt)}>
                {example.label}
              </button>
            ))}
          </div>
        )}

        {!busy && (
          <TemplateGallery kind={kind} rtl={rtl} activeId={template?.id ?? null} onPick={chooseTemplate} onExample={useExample} />
        )}

        {projects.length > 0 && (
          <section className="dz-section">
            <h2 className="dz-section__heading">Recent</h2>
            <div className="dz-projects">
              {projects.slice(0, 12).map((project) => <ProjectCard key={project.path} project={project} disabled={busy} onOpen={onOpen} onDelete={onDelete} />)}
            </div>
          </section>
        )}
      </div>
      {dragging && <div className="dz-drop" aria-hidden="true">Drop pictures or documents to use them</div>}
    </div>
  );
};
