import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, BookmarkSimple, FileArrowUp, PresentationChart } from '@phosphor-icons/react';
import { emptySlide } from '../../utils/presentation/sanitize';
import { getTheme } from '../../utils/presentation/themes';
import type { DeckTemplate } from '../../utils/presentation/types';
import type { DeckListing } from './useDeckDocument';
import { SlideRenderer } from './SlideRenderer';

interface DeckHeroProps {
  workspaceName: string;
  decks: DeckListing[];
  templates: DeckTemplate[];
  animations: boolean;
  onTemplate: (template: DeckTemplate) => void;
  onNew: () => void;
  onImport: () => void;
  onOpen: (path: string) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;
const noImage = (): string => '';

const SAMPLES = [
  { theme: 'midnight', layout: 'stats' as const, rotate: -8, x: -70, y: 22, delay: 0.25 },
  { theme: 'bold-gradient', layout: 'title' as const, rotate: 6, x: 70, y: -10, delay: 0.35 },
  { theme: 'executive', layout: 'chart' as const, rotate: -1.5, x: 0, y: 0, delay: 0.45 },
];

export const DeckHero: React.FC<DeckHeroProps> = ({ workspaceName, decks, templates, animations, onTemplate, onNew, onImport, onOpen }) => {
  const reduce = useReducedMotion();
  const still = reduce || !animations;
  const samples = useMemo(() => SAMPLES.map((sample) => ({ ...sample, slide: emptySlide(sample.layout), context: { theme: getTheme(sample.theme), size: '16:9' as const, showNumbers: false } })), []);

  return (
    <div className="pr-hero">
      <div className="pr-hero__grid">
        <div>
          <motion.span className="pr-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            <PresentationChart size={12} weight="fill" /> {workspaceName} · Presentation studio
          </motion.span>
          <motion.h1 className="pr-hero__title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.05 }}>
            Brief it. <em>Present it.</em>
          </motion.h1>
          <motion.p className="pr-hero__lede" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}>
            Describe the talk, approve the storyline, and your AI writes every slide into a designed theme: takeaway titles, real charts, speaker notes. Edit anything, then export a native PowerPoint file or a PDF.
          </motion.p>
          <motion.div className="pr-hero__actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.25 }}>
            <button type="button" className="pr-btn pr-btn--primary pr-btn--lg" onClick={onNew}>
              New presentation <ArrowRight size={14} weight="bold" />
            </button>
            <button type="button" className="pr-btn pr-btn--lg" onClick={onImport}><FileArrowUp size={15} /> Open PowerPoint</button>
          </motion.div>

          {templates.length > 0 && (
            <motion.div className="pr-hero__recent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }}>
              <div className="pr-label">Start from a template</div>
              <div className="pr-chips">
                {templates.slice(0, 8).map((template) => (
                  <button key={template.id} type="button" className="pr-btn pr-btn--sm" title={template.description || `${template.slides.length} slides · ${template.theme.name}`} onClick={() => onTemplate(template)}>
                    <BookmarkSimple size={13} /> {template.name}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {decks.length > 0 && (
            <motion.div className="pr-hero__recent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.35 }}>
              <div className="pr-label">Recent presentations</div>
              <div className="pr-hero__list">
                {decks.slice(0, 5).map((deck) => (
                  <button key={deck.path} type="button" className="pr-deck-row" onClick={() => onOpen(deck.path)}>
                    <span className="pr-deck-row__glyph" aria-hidden="true"><PresentationChart size={15} /></span>
                    <span className="pr-deck-row__text">
                      <span className="pr-deck-row__name">{deck.title}</span>
                      <span className="pr-deck-row__meta">
                        {deck.slides} slide{deck.slides === 1 ? '' : 's'}{deck.preserve ? ' · original design' : ''} · {new Date(deck.modifiedAt).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        <div className="pr-hero__stack" aria-hidden="true">
          {samples.map((sample, index) => (
            <motion.div
              key={sample.theme}
              className="pr-hero__card"
              initial={{ opacity: 0, y: 60, rotate: sample.rotate * 0.3, scale: 0.94 }}
              animate={still
                ? { opacity: 1, y: sample.y, x: sample.x, rotate: sample.rotate, scale: 1 }
                : { opacity: 1, y: [sample.y, sample.y - 8, sample.y], x: sample.x, rotate: sample.rotate, scale: 1 }}
              transition={still ? { duration: 0 } : {
                opacity: { duration: 0.7, delay: sample.delay },
                scale: { duration: 0.9, ease: EASE, delay: sample.delay },
                rotate: { duration: 1, ease: EASE, delay: sample.delay },
                x: { duration: 1, ease: EASE, delay: sample.delay },
                y: { duration: 6 + index, repeat: Infinity, ease: 'easeInOut', delay: sample.delay },
              }}
              style={{ zIndex: index }}
            >
              <SlideRenderer context={sample.context} slide={sample.slide} index={index} width={340} resolveImage={noImage} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
