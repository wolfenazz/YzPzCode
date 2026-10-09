import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BookmarkSimple, Lightning, MagnifyingGlass } from '@phosphor-icons/react';
import { REPORT_CATEGORIES, searchReportTypes, getReportType, type ReportCategory } from '../../../utils/writing/reportTypes';
import type { ReportProfile } from '../../../utils/writing/types';
import { Chips } from '../controls';
import { ReportIcon } from './reportIcons';

interface TypeStepProps {
  typeId: string;
  profileId: string | null;
  profiles: ReportProfile[];
  onPickType: (typeId: string) => void;
  onPickProfile: (profile: ReportProfile) => void;
  onQuickStart: (profile: ReportProfile) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

export const TypeStep: React.FC<TypeStepProps> = ({ typeId, profileId, profiles, onPickType, onPickProfile, onQuickStart }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ReportCategory | 'all'>('all');
  const types = useMemo(
    () => searchReportTypes(query).filter((type) => category === 'all' || type.category === category),
    [query, category],
  );

  return (
    <div className="wr-wizard__step">
      <span className="wr-eyebrow">Step one · The commission</span>
      <h2 className="wr-wizard__question">What are we <em>writing</em> today?</h2>
      <p className="wr-wizard__lede">
        Pick the kind of document. Each one brings its own structure, conventions and house style, and you can change everything after this.
      </p>

      {profiles.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div className="wr-sidebar__label" style={{ paddingLeft: 0 }}>Your profiles</div>
          <div className="wr-type-grid">
            {profiles.map((profile, index) => {
              const type = getReportType(profile.typeId);
              const selected = profileId === profile.id;
              return (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: index * 0.035 }}
                  className={`wr-type-card${selected ? ' is-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPickProfile(profile)}
                  onKeyDown={(event) => { if (event.key === 'Enter') onPickProfile(profile); }}
                >
                  <span className="wr-type-card__tag"><BookmarkSimple size={11} weight="fill" /> Profile</span>
                  <span className="wr-type-card__icon"><ReportIcon name={type.icon} /></span>
                  <span className="wr-type-card__name">{profile.name}</span>
                  <span className="wr-type-card__desc">{profile.description || type.name}</span>
                  <button
                    type="button"
                    className="wr-pill-btn"
                    style={{ alignSelf: 'flex-start', marginTop: 'auto', height: 28 }}
                    onClick={(event) => { event.stopPropagation(); onQuickStart(profile); }}
                    title="Use this profile and go straight to the outline"
                  >
                    <Lightning size={13} weight="fill" /> Quick start
                  </button>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      <div className="wr-type-toolbar">
        <label className="wr-type-search">
          <MagnifyingGlass size={15} />
          <input className="wr-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search report types…" aria-label="Search report types" />
        </label>
        <Chips
          items={[{ value: 'all', label: 'All' }, ...REPORT_CATEGORIES.map((entry) => ({ value: entry.id, label: entry.label }))]}
          value={category}
          onChange={(value) => setCategory(value as ReportCategory | 'all')}
          label="Category"
        />
      </div>

      <div className="wr-type-grid">
        {types.map((type, index) => (
          <motion.button
            key={type.id}
            type="button"
            layout
            initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.55, ease: EASE, delay: Math.min(index, 18) * 0.025 }}
            className={`wr-type-card${!profileId && typeId === type.id ? ' is-selected' : ''}`}
            onClick={() => onPickType(type.id)}
          >
            <span className="wr-type-card__icon"><ReportIcon name={type.icon} /></span>
            <span className="wr-type-card__name">{type.name}</span>
            <span className="wr-type-card__desc">{type.description}</span>
          </motion.button>
        ))}
        {types.length === 0 && <p className="wr-wizard__lede">No report type matches “{query}”. Try “Custom Report” and describe it in the brief.</p>}
      </div>
    </div>
  );
};
