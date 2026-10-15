import React, { useMemo, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { resolveFormat } from '../../utils/design/formats';
import { examplesFor, type ExamplePrompt } from '../../utils/design/promptLibrary';
import { categoriesOf, categoryLabel, findTemplate, templateName, templatesFor, thumbRects, type DesignTemplate } from '../../utils/design/templates';
import type { DesignKind } from '../../utils/design/types';

interface TemplateGalleryProps {
  kind: DesignKind;
  /** Draw names and copy in Arabic. */
  rtl: boolean;
  activeId: string | null;
  disabled?: boolean;
  onPick: (template: DesignTemplate) => void;
  onExample: (example: ExamplePrompt) => void;
}

/** A wireframe of the template's boards: true to their sizes, nothing drawn inside. */
const Thumb: React.FC<{ template: DesignTemplate }> = ({ template }) => {
  const rects = useMemo(() => {
    const sizes = template.sizes.map((id) => resolveFormat(id)).filter((entry): entry is NonNullable<ReturnType<typeof resolveFormat>> => entry !== null);
    // An app or web template shows as many boards as it plans, in its one size.
    const shown = template.kind === 'graphic' ? sizes : template.boards.slice(0, 4).map(() => sizes[0]).filter(Boolean);
    return thumbRects(shown, 72, 44, 4);
  }, [template]);
  return (
    <svg className="dz-tpl__thumb" viewBox="0 0 72 44" aria-hidden="true">
      {rects.map((rect, index) => (
        <g key={index}>
          <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={2} className="dz-tpl__board" />
          <rect x={rect.x + rect.width * 0.14} y={rect.y + rect.height * 0.16} width={rect.width * 0.5} height={Math.max(1.5, rect.height * 0.07)} rx={1} className="dz-tpl__line" />
          <rect x={rect.x + rect.width * 0.14} y={rect.y + rect.height * 0.3} width={rect.width * 0.7} height={Math.max(1, rect.height * 0.04)} rx={0.8} className="dz-tpl__line dz-tpl__line--faint" />
          <rect x={rect.x + rect.width * 0.14} y={rect.y + rect.height * 0.7} width={rect.width * 0.32} height={Math.max(2, rect.height * 0.1)} rx={1.5} className="dz-tpl__accent" />
        </g>
      ))}
    </svg>
  );
};

/** "Start from": the kind's templates by category, and worked example briefs. */
export const TemplateGallery: React.FC<TemplateGalleryProps> = ({ kind, rtl, activeId, disabled, onPick, onExample }) => {
  const [tab, setTab] = useState<'templates' | 'examples'>('templates');
  const [category, setCategory] = useState<string>('all');
  const categories = useMemo(() => categoriesOf(kind), [kind]);
  const all = useMemo(() => templatesFor(kind), [kind]);
  const shown = category === 'all' || !categories.includes(category) ? all : all.filter((template) => template.category === category);
  const examples = useMemo(() => examplesFor(kind), [kind]);

  return (
    <section className="dz-gallery" aria-label="Start from">
      <div className="dz-gallery__head">
        <h2 className="dz-gallery__title">Start from</h2>
        <div className="dz-segmented" role="tablist" aria-label="Kind of starting point">
          <button type="button" role="tab" aria-selected={tab === 'templates'} onClick={() => setTab('templates')}>Templates</button>
          <button type="button" role="tab" aria-selected={tab === 'examples'} onClick={() => setTab('examples')}>Examples</button>
        </div>
      </div>

      {tab === 'templates' && (
        <>
          <div className="dz-gallery__cats" role="group" aria-label="Category">
            {['all', ...categories].map((entry) => {
              const sample = all.find((template) => template.category === entry);
              const label = entry === 'all' ? (rtl ? 'الكل' : 'All') : sample ? categoryLabel(sample, rtl) : entry;
              return <button key={entry} type="button" className="dz-hints__item" aria-pressed={category === entry} onClick={() => setCategory(entry)}>{label}</button>;
            })}
          </div>
          <div className="dz-gallery__grid">
            {shown.map((template) => (
              <button key={template.id} type="button" className="dz-tpl" aria-pressed={activeId === template.id} disabled={disabled} onClick={() => onPick(template)}>
                <Thumb template={template} />
                <span className="dz-tpl__name" dir="auto">{templateName(template, rtl)}</span>
                <span className="dz-tpl__meta">
                  {template.kind === 'graphic' ? (template.sizes.length > 1 ? `${template.sizes.length} ${template.series ? 'cards' : 'sizes'}` : resolveFormat(template.sizes[0])?.label ?? '') : `${template.boards.length} ${template.boards.length === 1 ? 'screen' : 'screens'}`}
                </span>
                {activeId === template.id && <Check className="dz-tpl__check" size={13} weight="bold" />}
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'examples' && (
        <div className="dz-gallery__examples">
          {examples.map((example) => {
            const template = findTemplate(example.templateId);
            const title = rtl && example.ar ? example.ar.title : example.title;
            const text = rtl && example.ar ? example.ar.prompt : example.prompt;
            return (
              <button key={example.id} type="button" className="dz-example" disabled={disabled} onClick={() => onExample(example)}>
                <span className="dz-example__title" dir="auto">{title}</span>
                <span className="dz-example__text" dir="auto">{text}</span>
                {template && <span className="dz-tpl__meta">{templateName(template, false)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
