import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowClockwise, DotsSixVertical, Hash, Plus, Rows, Trash } from '@phosphor-icons/react';
import LatticeLoader from '../../reactbits/LatticeLoader';
import { newSectionId, wordsToPages } from '../../../utils/writing/reportTypes';
import type { OutlineSection } from '../../../utils/writing/types';
import { NumberField } from '../controls';

interface OutlineStepProps {
  outline: OutlineSection[];
  loading: boolean;
  error: string | null;
  onChange: (outline: OutlineSection[]) => void;
  onRegenerate: () => void;
  onUseTemplate: () => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

export const OutlineStep: React.FC<OutlineStepProps> = ({ outline, loading, error, onChange, onRegenerate, onUseTemplate }) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const total = outline.reduce((sum, section) => sum + section.targetWords, 0);
  const update = (index: number, patch: Partial<OutlineSection>): void =>
    onChange(outline.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  const move = (from: number, to: number): void => {
    if (from === to) return;
    const next = [...outline];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  let number = 0;

  return (
    <div className="wr-wizard__step">
      <span className="wr-eyebrow">Step five · Architecture</span>
      <h2 className="wr-wizard__question">Here is the <em>shape</em> of it.</h2>
      <p className="wr-wizard__lede">The outline the writer will follow, section by section. Rename, reorder, add notes or change the length of anything before writing begins.</p>

      {loading ? (
        <div className="wr-outline-loading">
          <LatticeLoader label="Designing the outline" status="working" pattern="spiral" grid={4} color="var(--wr-gold)" fontSize={15} showTimer glow />
          <p className="wr-field__hint">Reading the brief and sources, weighing the conventions for this kind of report…</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="wr-ai__error" style={{ marginBottom: 16 }}>
              {error}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="wr-pill-btn" onClick={onRegenerate}><ArrowClockwise size={14} /> Try again</button>
                <button type="button" className="wr-pill-btn" onClick={onUseTemplate}><Rows size={14} /> Use the standard outline</button>
              </div>
            </div>
          )}

          <div className="wr-row" style={{ marginBottom: 12 }}>
            <span className="wr-field__hint">
              {outline.length} sections · {total.toLocaleString()} words · about {wordsToPages(total)} pages
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="wr-pill-btn" onClick={onUseTemplate}><Rows size={14} /> Standard outline</button>
              <button type="button" className="wr-pill-btn" onClick={onRegenerate}><ArrowClockwise size={14} /> Ask again</button>
            </span>
          </div>

          <div className="wr-outline">
            <AnimatePresence initial>
              {outline.map((section, index) => {
                const label = section.unnumbered ? '—' : String((number += 1));
                return (
                  <motion.div
                    key={section.id}
                    layout
                    initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.5, ease: EASE, delay: Math.min(index, 14) * 0.045 }}
                    className={`wr-outline__row${dragIndex === index ? ' is-dragging' : ''}`}
                    draggable
                    onDragStart={(event) => {
                      setDragIndex(index);
                      (event as unknown as DragEvent).dataTransfer?.setData('text/plain', String(index));
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (dragIndex !== null && dragIndex !== index) {
                        move(dragIndex, index);
                        setDragIndex(index);
                      }
                    }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    <span className="wr-outline__grip" title="Drag to reorder"><DotsSixVertical size={18} /></span>
                    <span className="wr-outline__num">{label}</span>
                    <div style={{ minWidth: 0 }}>
                      <input className="wr-outline__title" value={section.title} onChange={(event) => update(index, { title: event.target.value })} aria-label="Section title" />
                      <textarea className="wr-outline__notes" rows={2} value={section.notes} onChange={(event) => update(index, { notes: event.target.value })} placeholder="What this section must cover…" aria-label="Section notes" />
                      <input
                        className="wr-outline__notes"
                        value={section.subsections.join(' · ')}
                        onChange={(event) => update(index, { subsections: event.target.value.split(/\s*[·;|]\s*/).filter((entry, i, all) => entry || i === all.length - 1) })}
                        onBlur={(event) => update(index, { subsections: event.target.value.split(/\s*[·;|]\s*/).map((entry) => entry.trim()).filter(Boolean) })}
                        placeholder="Subsections, separated by ·"
                        aria-label="Subsections"
                        style={{ fontStyle: 'italic' }}
                      />
                    </div>
                    <div className="wr-outline__words">
                      <NumberField value={section.targetWords} min={50} max={20000} step={50} suffix="w" onChange={(value) => update(index, { targetWords: value })} />
                    </div>
                    <div className="wr-outline__actions">
                      <button type="button" className={`wr-icon-btn${section.unnumbered ? '' : ' is-active'}`} title={section.unnumbered ? 'Unnumbered (front/back matter)' : 'Numbered'} onClick={() => update(index, { unnumbered: !section.unnumbered })}><Hash size={14} /></button>
                      <button type="button" className="wr-icon-btn" title="Remove section" onClick={() => onChange(outline.filter((_, i) => i !== index))}><Trash size={14} /></button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <button
              type="button"
              className="wr-pill-btn wr-outline__add"
              onClick={() => onChange([...outline, { id: newSectionId(), title: 'New section', notes: '', targetWords: 500, subsections: [] }])}
            >
              <Plus size={14} /> Add a section
            </button>
          </div>
        </>
      )}
    </div>
  );
};
