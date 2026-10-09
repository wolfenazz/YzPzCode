import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { open } from '@tauri-apps/plugin-dialog';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowClockwise, ArrowLeft, ArrowRight, BookmarkSimple, Check, DotsSixVertical, FileText, PresentationChart, Plus, Sparkle, Trash, X } from '@phosphor-icons/react';
import LatticeLoader from '../../reactbits/LatticeLoader';
import { usePresentationStore } from '../../../stores/presentationStore';
import { createBrief, DECK_TONES, MAX_SLIDES, MIN_SLIDES, newOutlineId } from '../../../utils/presentation/deck';
import { LAYOUTS } from '../../../utils/presentation/layouts';
import { textBlock } from '../../../utils/presentation/richText';
import { emptySlide } from '../../../utils/presentation/sanitize';
import { outlineFromTemplate } from '../../../utils/presentation/templates';
import { DECK_THEMES, getTheme } from '../../../utils/presentation/themes';
import type { DeckBrief, DeckSize, DeckTemplate, DeckTheme, LayoutId, OutlineSlide, Slide } from '../../../utils/presentation/types';
import { fileName } from '../../../utils/writing/document';
import { SOURCE_EXTENSIONS } from '../../../utils/writing/sources';
import { EnginePicker } from '../EnginePicker';
import { SlideRenderer } from '../SlideRenderer';

type StepId = 'topic' | 'style' | 'outline';

const STEPS: Array<{ id: StepId; title: string; hint: string }> = [
  { id: 'topic', title: 'Topic', hint: 'What the talk is for' },
  { id: 'style', title: 'Style', hint: 'Theme and shape' },
  { id: 'outline', title: 'Storyline', hint: 'Slide by slide' },
];

export interface OutlineResult {
  title: string;
  outline: OutlineSlide[] | null;
  error: string | null;
}

interface DeckWizardProps {
  workspacePath: string;
  onClose: () => void;
  onDesignOutline: (brief: DeckBrief) => Promise<OutlineResult>;
  onCancelOutline: () => void;
  onGenerate: (input: { brief: DeckBrief; theme: DeckTheme; size: DeckSize; title: string; outline: OutlineSlide[] }) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;
const noImage = (): string => '';

/** A storyline to start from when the AI cannot design one. */
function fallbackOutline(brief: DeckBrief): OutlineSlide[] {
  const items: OutlineSlide[] = [{ id: newOutlineId(), title: brief.topic.trim().slice(0, 80) || 'Our topic', purpose: 'Open the talk', layout: 'title', keyPoints: [] }];
  if (brief.slideCount >= 8) items.push({ id: newOutlineId(), title: 'Agenda', purpose: 'What we cover', layout: 'agenda', keyPoints: [] });
  let point = 1;
  while (items.length < brief.slideCount - 1) {
    items.push({ id: newOutlineId(), title: `Key point ${point}`, purpose: '', layout: 'bullets', keyPoints: [] });
    point += 1;
  }
  items.push({ id: newOutlineId(), title: 'Thank you', purpose: 'The ask and next steps', layout: 'closing', keyPoints: [] });
  return items;
}

function SortableOutlineRow({ item, index, onChange, onRemove }: { item: OutlineSlide; index: number; onChange: (patch: Partial<OutlineSlide>) => void; onRemove: () => void }): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div ref={setNodeRef} className="pr-outline__row" data-dragging={isDragging || undefined} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className="pr-outline__grip" aria-label="Drag to reorder" {...attributes} {...listeners}><DotsSixVertical size={16} /></button>
      <span className="pr-outline__num">{index + 1}</span>
      <div className="pr-outline__fields">
        <input className="pr-outline__title" value={item.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Slide title" placeholder="Takeaway title" />
        <input className="pr-outline__notes" value={item.purpose} onChange={(event) => onChange({ purpose: event.target.value })} aria-label="Purpose" placeholder="What this slide must make clear" />
        <input
          className="pr-outline__notes"
          value={item.keyPoints.join(' · ')}
          onChange={(event) => onChange({ keyPoints: event.target.value.split(/\s*[·;]\s*/) })}
          onBlur={(event) => onChange({ keyPoints: event.target.value.split(/\s*[·;]\s*/).map((point) => point.trim()).filter(Boolean) })}
          aria-label="Key points"
          placeholder="Key points, separated by ·"
        />
      </div>
      <select className="pr-select pr-outline__layout" value={item.layout} onChange={(event) => onChange({ layout: event.target.value as LayoutId })} aria-label="Layout">
        {LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
      </select>
      <button type="button" className="pr-icon-btn" title="Remove slide" onClick={onRemove}><Trash size={14} /></button>
    </div>
  );
}

export const DeckWizard: React.FC<DeckWizardProps> = ({ workspacePath, onClose, onDesignOutline, onCancelOutline, onGenerate }) => {
  const prefs = usePresentationStore();
  const [brief, setBrief] = useState<DeckBrief>(() => createBrief(prefs.defaultEngine, prefs.defaultSlideCount, prefs.defaultTone));
  const [themeId, setThemeId] = useState(prefs.defaultThemeId);
  const [template, setTemplate] = useState<DeckTemplate | null>(null);
  // Templates bring their own theme, which may be in neither list.
  const themes = useMemo(() => {
    const list = [...prefs.customThemes, ...DECK_THEMES];
    if (template && !list.some((theme) => theme.id === template.theme.id)) list.unshift(template.theme);
    return list;
  }, [prefs.customThemes, template]);
  const pickedTheme = themes.find((theme) => theme.id === themeId) ?? getTheme(themeId);
  const [size, setSize] = useState<DeckSize>(prefs.defaultSize);
  const [title, setTitle] = useState('');
  const [outline, setOutline] = useState<OutlineSlide[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>('topic');
  const [visited, setVisited] = useState<Set<StepId>>(new Set(['topic']));
  const index = STEPS.findIndex((entry) => entry.id === step);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const goTo = useCallback((next: StepId) => {
    setStep(next);
    setVisited((current) => new Set(current).add(next));
  }, []);

  const design = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await onDesignOutline(brief);
    setLoading(false);
    if (result.outline) {
      setOutline(result.outline);
      if (result.title && !title.trim()) setTitle(result.title);
    } else {
      setError(result.error ?? 'The storyline could not be designed.');
      setOutline((current) => (current.length > 0 ? current : fallbackOutline(brief)));
    }
  }, [brief, onDesignOutline, title]);

  const next = (): void => {
    const target = STEPS[index + 1];
    if (!target) return;
    goTo(target.id);
    if (target.id === 'outline' && outline.length === 0 && !loading) {
      if (template) setOutline(outlineFromTemplate(template));
      else void design();
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !loading) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [loading, onClose]);

  const set = (patch: Partial<DeckBrief>): void => setBrief((current) => ({ ...current, ...patch }));

  const addFiles = async (): Promise<void> => {
    const picked = await open({ multiple: true, defaultPath: workspacePath, filters: [{ name: 'Sources', extensions: SOURCE_EXTENSIONS }] });
    const list = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
    if (list.length > 0) set({ sourceFiles: [...new Set([...brief.sourceFiles, ...list])] });
  };

  // The user's own title slide, for the theme gallery.
  const previewSlide = useMemo<Slide>(() => {
    const slide = emptySlide('title');
    slide.slots.title = textBlock(title.trim() || brief.topic.trim().slice(0, 70) || 'Your presentation title');
    slide.slots.subtitle = textBlock(brief.goal.trim().slice(0, 110) || brief.audience.trim() || 'A one-line promise of what the audience gets');
    delete slide.slots.kicker;
    return slide;
  }, [brief.audience, brief.goal, brief.topic, title]);

  const canAdvance = step !== 'topic' || brief.topic.trim().length > 0;
  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOutline((items) => arrayMove(items, items.findIndex((item) => item.id === active.id), items.findIndex((item) => item.id === over.id)));
  };

  return (
    <motion.div className="pr-wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} role="dialog" aria-modal="true" aria-label="New presentation">
      <nav className="pr-wizard__rail">
        <div className="pr-wizard__brand"><span className="pr-wizard__mark"><PresentationChart size={15} weight="fill" /></span>New presentation</div>
        {STEPS.map((entry, i) => {
          const state = entry.id === step ? 'active' : visited.has(entry.id) && i < index ? 'done' : 'todo';
          return (
            <button key={entry.id} type="button" className="pr-step" data-state={state} disabled={!visited.has(entry.id) || loading} onClick={() => goTo(entry.id)}>
              <span className="pr-step__dot">{state === 'done' ? <Check size={12} weight="bold" /> : i + 1}</span>
              <span className="pr-step__text"><strong>{entry.title}</strong><span>{entry.hint}</span></span>
            </button>
          );
        })}
        <div className="pr-wizard__rail-foot">
          {pickedTheme.name} · {size}
          <br />
          {brief.slideCount} slides · {DECK_TONES.find((tone) => tone.id === brief.tone)?.label}
        </div>
      </nav>

      <div className="pr-wizard__main">
        <div className="pr-wizard__top">
          <button type="button" className="pr-icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)" disabled={loading}><X size={16} /></button>
        </div>
        <div className="pr-wizard__body">
          {step === 'topic' && (
            <div className="pr-wizard__step">
              <h2 className="pr-wizard__question">What is the talk about?</h2>
              <p className="pr-wizard__lede">The AI designs the storyline from this, then writes every slide. Be specific: numbers, names and the decision you want.</p>
              <label className="pr-field">
                <span className="pr-field__label">Topic</span>
                <textarea className="pr-input" rows={3} autoFocus value={brief.topic} onChange={(event) => set({ topic: event.target.value })} placeholder="e.g. Q3 results for the board: revenue up 18%, churn down, the case for hiring a second sales team" />
              </label>
              <div className="pr-grid-2">
                <label className="pr-field">
                  <span className="pr-field__label">Audience</span>
                  <input className="pr-input" value={brief.audience} onChange={(event) => set({ audience: event.target.value })} placeholder="Board of directors" />
                </label>
                <label className="pr-field">
                  <span className="pr-field__label">Goal</span>
                  <input className="pr-input" value={brief.goal} onChange={(event) => set({ goal: event.target.value })} placeholder="Approve the hiring plan" />
                </label>
              </div>
              <div className="pr-grid-3">
                <label className="pr-field">
                  <span className="pr-field__label">Slides · {brief.slideCount}</span>
                  <input type="range" className="pr-range" min={MIN_SLIDES} max={MAX_SLIDES} value={brief.slideCount} onChange={(event) => set({ slideCount: Number(event.target.value) })} />
                </label>
                <label className="pr-field">
                  <span className="pr-field__label">Tone</span>
                  <select className="pr-select" value={brief.tone} onChange={(event) => set({ tone: event.target.value as DeckBrief['tone'] })}>
                    {DECK_TONES.map((tone) => <option key={tone.id} value={tone.id}>{tone.label} — {tone.hint}</option>)}
                  </select>
                </label>
                <label className="pr-field">
                  <span className="pr-field__label">Language</span>
                  <input className="pr-input" value={brief.language} onChange={(event) => set({ language: event.target.value })} placeholder="English" />
                </label>
              </div>
              <label className="pr-field">
                <span className="pr-field__label">Notes, figures and facts to use <span className="pr-field__opt">optional</span></span>
                <textarea className="pr-input" rows={3} value={brief.sourceNotes} onChange={(event) => set({ sourceNotes: event.target.value })} placeholder="Paste data, bullet points or a draft. The AI only uses figures you give it." />
              </label>
              <div className="pr-field">
                <span className="pr-field__label">Source files <span className="pr-field__opt">PDF, Word, Excel, text</span></span>
                <div className="pr-chips">
                  {brief.sourceFiles.map((path) => (
                    <span key={path} className="pr-chip" title={path}>
                      <FileText size={12} /> {fileName(path)}
                      <button type="button" aria-label={`Remove ${fileName(path)}`} onClick={() => set({ sourceFiles: brief.sourceFiles.filter((entry) => entry !== path) })}><X size={10} /></button>
                    </span>
                  ))}
                  <button type="button" className="pr-btn pr-btn--sm" onClick={() => void addFiles()}><Plus size={12} /> Attach files</button>
                </div>
              </div>
              <EnginePicker value={brief.engine} onChange={(engine) => set({ engine })} />
            </div>
          )}

          {step === 'style' && (
            <div className="pr-wizard__step pr-wizard__step--wide">
              <div className="pr-row">
                <div>
                  <h2 className="pr-wizard__question">Pick a look.</h2>
                  <p className="pr-wizard__lede">Your title slide in every theme. Themes only use fonts every copy of PowerPoint has, so the file looks the same anywhere. You can switch later.</p>
                </div>
                <div className="pr-segmented" role="radiogroup" aria-label="Slide size">
                  {(['16:9', '4:3'] as const).map((value) => (
                    <button key={value} type="button" role="radio" aria-checked={size === value} className="pr-segmented__item" data-active={size === value || undefined} onClick={() => setSize(value)}>{value === '16:9' ? 'Widescreen 16:9' : 'Standard 4:3'}</button>
                  ))}
                </div>
              </div>
              {prefs.templates.length > 0 && (
                <div className="pr-field">
                  <span className="pr-field__label">Start from a template <span className="pr-field__opt">its theme, size and storyline</span></span>
                  <div className="pr-chips">
                    {prefs.templates.map((entry) => (
                      <button key={entry.id} type="button" className="pr-btn pr-btn--sm" data-active={template?.id === entry.id || undefined} title={entry.description || `${entry.slides.length} slides`}
                        onClick={() => {
                          if (template?.id === entry.id) { setTemplate(null); return; }
                          setTemplate(entry);
                          setThemeId(entry.theme.id);
                          setSize(entry.size);
                          setOutline([]);
                        }}>
                        <BookmarkSimple size={12} weight={template?.id === entry.id ? 'fill' : 'regular'} /> {entry.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pr-theme-grid">
                {themes.map((theme, themeIndex) => (
                  <motion.button
                    key={theme.id}
                    type="button"
                    className="pr-theme-card"
                    data-active={theme.id === themeId || undefined}
                    onClick={() => setThemeId(theme.id)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: EASE, delay: Math.min(themeIndex, 11) * 0.03 }}
                  >
                    <SlideRenderer context={{ theme, size, showNumbers: false }} slide={previewSlide} index={0} width={236} resolveImage={noImage} />
                    <span className="pr-theme-card__meta">
                      <strong>{theme.name}</strong>
                      <span className="pr-theme-card__swatches">
                        {[theme.palette.accent1, theme.palette.accent2, theme.palette.accent3].map((color) => <i key={color} style={{ background: color }} />)}
                      </span>
                    </span>
                    {theme.id === themeId && <span className="pr-theme-card__check"><Check size={12} weight="bold" /></span>}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {step === 'outline' && (
            <div className="pr-wizard__step pr-wizard__step--wide">
              <h2 className="pr-wizard__question">The storyline.</h2>
              <p className="pr-wizard__lede">One idea per slide, each title a takeaway. Reorder, retitle, change layouts or add slides before the AI writes them.</p>
              {loading ? (
                <div className="pr-outline-loading">
                  <LatticeLoader label="Designing the storyline" status="working" pattern="spiral" grid={4} color="var(--accent)" fontSize={14} showTimer glow />
                  <p className="pr-hint">Reading the brief and sources, choosing a layout for every slide…</p>
                  <button type="button" className="pr-btn pr-btn--danger pr-btn--sm" onClick={onCancelOutline}>Stop</button>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="pr-error">
                      {error}
                      <div className="pr-error__actions">
                        <button type="button" className="pr-btn pr-btn--sm" onClick={() => void design()}><ArrowClockwise size={13} /> Try again</button>
                      </div>
                    </div>
                  )}
                  <div className="pr-row pr-outline__head">
                    <label className="pr-field" style={{ flex: 1, margin: 0 }}>
                      <span className="pr-field__label">Deck title</span>
                      <input className="pr-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={brief.topic.slice(0, 80)} />
                    </label>
                    {template && <button type="button" className="pr-btn" onClick={() => setOutline(outlineFromTemplate(template))}><BookmarkSimple size={14} /> Template storyline</button>}
                    <button type="button" className="pr-btn" onClick={() => void design()}><ArrowClockwise size={14} /> {template ? 'Ask the AI' : 'Ask again'}</button>
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={outline.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                      <div className="pr-outline">
                        {outline.map((item, itemIndex) => (
                          <SortableOutlineRow
                            key={item.id}
                            item={item}
                            index={itemIndex}
                            onChange={(patch) => setOutline((items) => items.map((entry) => (entry.id === item.id ? { ...entry, ...patch } : entry)))}
                            onRemove={() => setOutline((items) => items.filter((entry) => entry.id !== item.id))}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <button
                    type="button"
                    className="pr-btn pr-outline__add"
                    disabled={outline.length >= MAX_SLIDES}
                    onClick={() => setOutline((items) => [...items, { id: newOutlineId(), title: 'New slide', purpose: '', layout: 'bullets', keyPoints: [] }])}
                  >
                    <Plus size={14} /> Add a slide
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <footer className="pr-wizard__foot">
          <div>
            {index > 0 && (
              <button type="button" className="pr-btn" onClick={() => goTo(STEPS[index - 1].id)} disabled={loading}><ArrowLeft size={14} /> Back</button>
            )}
          </div>
          <div className="pr-wizard__foot-right">
            {!canAdvance && <span className="pr-hint">Describe the topic to continue</span>}
            {step === 'outline' ? (
              <button
                type="button"
                className="pr-btn pr-btn--primary pr-btn--lg"
                disabled={loading || outline.length === 0}
                onClick={() => onGenerate({ brief: { ...brief, slideCount: outline.length }, theme: pickedTheme, size, title: title.trim() || brief.topic.trim().slice(0, 80) || 'Untitled presentation', outline })}
              >
                <Sparkle size={15} weight="fill" /> Generate {outline.length} slides
              </button>
            ) : (
              <button type="button" className="pr-btn pr-btn--primary" onClick={next} disabled={!canAdvance}>
                {STEPS[index + 1]?.id === 'outline' ? 'Design the storyline' : 'Continue'} <ArrowRight size={14} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </motion.div>
  );
};
