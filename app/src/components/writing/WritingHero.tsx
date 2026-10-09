import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, BookmarkSimple, FileArrowUp, Feather } from '@phosphor-icons/react';
import SoftAurora from '../effects/SoftAurora';
import type { ReportProfile } from '../../utils/writing/types';
import type { ReportListing } from './useWritingDocument';

interface WritingHeroProps {
  workspaceName: string;
  reports: ReportListing[];
  profiles: ReportProfile[];
  animations: boolean;
  onCommission: (profile?: ReportProfile) => void;
  onImport: () => void;
  onOpen: (path: string) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

const SHEETS = [
  { kind: 'Senior Project Report', title: 'A Low-Cost IoT Controller for Arid Irrigation', rotate: -9, x: -70, y: 14, delay: 0.25 },
  { kind: 'Financial Analysis', title: 'Q3 Performance & Liquidity Review', rotate: 7, x: 64, y: -6, delay: 0.35 },
  { kind: 'Research Paper', title: 'Feedback Timing and Learning Retention', rotate: -1.5, x: 0, y: 0, delay: 0.45 },
];

export const WritingHero: React.FC<WritingHeroProps> = ({ workspaceName, reports, profiles, animations, onCommission, onImport, onOpen }) => {
  const reduce = useReducedMotion();
  const still = reduce || !animations;
  return (
    <div className="wr-hero">
      {!still && (
        <div className="wr-hero__aurora" aria-hidden="true">
          <SoftAurora color1="#f3e2b8" color2="#b8862f" speed={0.25} brightness={0.55} scale={1.6} bandHeight={0.42} enableMouseInteraction={false} />
        </div>
      )}
      <div className="wr-hero__grid">
        <div>
          <motion.span className="wr-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            <Feather size={11} weight="fill" /> {workspaceName} · Writing studio
          </motion.span>
          <motion.h1 className="wr-hero__title" initial={{ opacity: 0, y: 26, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.9, ease: EASE, delay: 0.05 }}>
            Commission a report.<br /><em>Watch it write itself.</em>
          </motion.h1>
          <motion.p className="wr-hero__lede" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}>
            Academic, financial, technical, business — set the brief and the house style, approve the outline, and your AI writer sets it page by page. Edit like Word, humanize the prose, export PDF or .docx.
          </motion.p>
          <motion.div className="wr-hero__actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}>
            <button type="button" className="wr-pill-btn is-gold" onClick={() => onCommission()}>
              Commission a report
              <span className="wr-pill-btn__orb"><ArrowRight size={12} /></span>
            </button>
            <button type="button" className="wr-pill-btn" onClick={onImport}><FileArrowUp size={15} /> Import a Word document</button>
          </motion.div>

          {profiles.length > 0 && (
            <motion.div className="wr-hero__recent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }}>
              <div className="wr-sidebar__label" style={{ paddingLeft: 0 }}>Start from a profile</div>
              <div className="wr-chips">
                {profiles.slice(0, 6).map((profile) => (
                  <button key={profile.id} type="button" className="wr-pill-btn" style={{ height: 30 }} onClick={() => onCommission(profile)}>
                    <BookmarkSimple size={13} /> {profile.name}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {reports.length > 0 && (
            <motion.div className="wr-hero__recent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }}>
              <div className="wr-sidebar__label" style={{ paddingLeft: 0 }}>Continue writing</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 440 }}>
                {reports.slice(0, 4).map((report) => (
                  <button key={report.path} type="button" className="wr-report-row" onClick={() => onOpen(report.path)}>
                    <span className="wr-report-row__glyph" aria-hidden="true">
                      <svg width="14" height="18" viewBox="0 0 14 18"><path d="M3 5h8M3 8h8M3 11h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                    </span>
                    <span className="wr-report-row__text">
                      <span className="wr-report-row__name">{report.title}</span>
                      <span className="wr-report-row__meta">{new Date(report.modifiedAt).toLocaleString()}</span>
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        <div className="wr-hero__stack" aria-hidden="true">
          {SHEETS.map((sheet, index) => (
            <motion.div
              key={sheet.title}
              className="wr-hero__sheet"
              initial={{ opacity: 0, y: 80, rotate: sheet.rotate * 0.3, scale: 0.94 }}
              animate={still
                ? { opacity: 1, y: sheet.y, x: sheet.x, rotate: sheet.rotate, scale: 1 }
                : { opacity: 1, y: [sheet.y, sheet.y - 8, sheet.y], x: sheet.x, rotate: sheet.rotate, scale: 1 }}
              transition={still
                ? { duration: 0 }
                : {
                  opacity: { duration: 0.8, delay: sheet.delay },
                  scale: { duration: 1, ease: EASE, delay: sheet.delay },
                  rotate: { duration: 1.1, ease: EASE, delay: sheet.delay },
                  x: { duration: 1.1, ease: EASE, delay: sheet.delay },
                  y: { duration: 6 + index, repeat: Infinity, ease: 'easeInOut', delay: sheet.delay },
                }}
              style={{ zIndex: index }}
            >
              <div className="wr-hero__sheet-kind">{sheet.kind}</div>
              <div className="wr-hero__sheet-title">{sheet.title}</div>
              <div className="wr-hero__sheet-line is-accent" />
              {Array.from({ length: 9 }).map((_, line) => (
                <div key={line} className={`wr-hero__sheet-line${line % 4 === 3 ? ' is-short' : ''}`} />
              ))}
              <div className="wr-hero__sheet-line is-accent" style={{ width: '28%' }} />
              {Array.from({ length: 5 }).map((_, line) => (
                <div key={`b${line}`} className={`wr-hero__sheet-line${line === 4 ? ' is-short' : ''}`} />
              ))}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

