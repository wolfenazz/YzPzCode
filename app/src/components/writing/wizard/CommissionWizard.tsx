import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, BookmarkSimple, Check, Feather, X } from '@phosphor-icons/react';
import HoldButton from '../../reactbits/HoldButton';
import { briefForNewReport, profileFromBrief, useWritingStore } from '../../../stores/writingStore';
import { createBrief } from '../../../utils/writing/document';
import { defaultOutline, getReportType } from '../../../utils/writing/reportTypes';
import type { OutlineSection, Reference, ReportBrief, ReportProfile } from '../../../utils/writing/types';
import { DetailsStep } from './DetailsStep';
import { OutlineStep } from './OutlineStep';
import { StyleStep } from './StyleStep';
import { TypeStep } from './TypeStep';
import { VoiceStep } from './VoiceStep';

type StepId = 'type' | 'details' | 'style' | 'voice' | 'outline';

const STEPS: Array<{ id: StepId; title: string; hint: string }> = [
  { id: 'type', title: 'Report type', hint: 'What kind of document' },
  { id: 'details', title: 'Brief & sources', hint: 'What it must say' },
  { id: 'style', title: 'House style', hint: 'Type, page, apparatus' },
  { id: 'voice', title: 'Voice', hint: 'Register & humanizer' },
  { id: 'outline', title: 'Outline', hint: 'The shape of it' },
];

export interface OutlineResult {
  outline: OutlineSection[] | null;
  error: string | null;
}

interface CommissionWizardProps {
  mode: 'report' | 'profile';
  workspacePath: string;
  /** Profile being edited (profile mode) or to start from (report mode). */
  profile?: ReportProfile | null;
  onClose: () => void;
  onDesignOutline?: (brief: ReportBrief, bibliography: Reference[]) => Promise<OutlineResult>;
  onCancelOutline?: () => void;
  onCommission?: (brief: ReportBrief, outline: OutlineSection[], bibliography: Reference[]) => void;
  onSaveProfile?: (profile: ReportProfile) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

export const CommissionWizard: React.FC<CommissionWizardProps> = ({
  mode,
  workspacePath,
  profile,
  onClose,
  onDesignOutline,
  onCancelOutline,
  onCommission,
  onSaveProfile,
}) => {
  const profiles = useWritingStore((state) => state.profiles);
  const defaultProfileId = useWritingStore((state) => state.defaultProfileId);
  const saveProfile = useWritingStore((state) => state.saveProfile);
  const startProfile = profile ?? (mode === 'report' && defaultProfileId ? profiles.find((entry) => entry.id === defaultProfileId) ?? null : null);

  const [profileId, setProfileId] = useState<string | null>(startProfile?.id ?? null);
  const [brief, setBrief] = useState<ReportBrief>(() => (
    startProfile ? createBrief(startProfile.typeId, startProfile) : briefForNewReport('senior-project', null)
  ));
  const [bibliography, setBibliography] = useState<Reference[]>([]);
  const [outline, setOutline] = useState<OutlineSection[]>([]);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>(mode === 'profile' && profile ? 'details' : 'type');
  const [visited, setVisited] = useState<Set<StepId>>(new Set(['type']));
  const [profileName, setProfileName] = useState(profile?.name ?? '');
  const [profileDescription, setProfileDescription] = useState(profile?.description ?? '');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const steps = mode === 'profile' ? STEPS.filter((entry) => entry.id !== 'outline') : STEPS;
  const index = steps.findIndex((entry) => entry.id === step);
  const type = getReportType(brief.typeId);

  const goTo = useCallback((next: StepId) => {
    setStep(next);
    setVisited((current) => new Set(current).add(next));
  }, []);

  const designOutline = useCallback(async (from: ReportBrief = brief, refs: Reference[] = bibliography): Promise<void> => {
    if (!onDesignOutline) return;
    setOutlineLoading(true);
    setOutlineError(null);
    const result = await onDesignOutline(from, refs);
    setOutlineLoading(false);
    if (result.outline) setOutline(result.outline);
    else {
      setOutlineError(result.error ?? 'The outline could not be designed.');
      setOutline((current) => (current.length > 0 ? current : defaultOutline(getReportType(from.typeId), from.details.targetWords)));
    }
  }, [bibliography, brief, onDesignOutline]);

  const next = useCallback((): void => {
    const target = steps[index + 1];
    if (!target) return;
    goTo(target.id);
    if (target.id === 'outline' && outline.length === 0 && !outlineLoading) void designOutline();
  }, [designOutline, goTo, index, outline.length, outlineLoading, steps]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !outlineLoading) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, outlineLoading]);

  const pickType = (typeId: string): void => {
    setProfileId(null);
    const fresh = briefForNewReport(typeId, null);
    // Keep what the user already typed about the report itself.
    setBrief((current) => ({
      ...fresh,
      details: { ...fresh.details, title: current.details.title, subtitle: current.details.subtitle, brief: current.details.brief, authors: current.details.authors || fresh.details.authors, organization: current.details.organization || fresh.details.organization, sourceNotes: current.details.sourceNotes, sourceFiles: current.details.sourceFiles },
      engine: current.engine,
    }));
    setOutline([]);
  };

  const pickProfile = (entry: ReportProfile): ReportBrief => {
    setProfileId(entry.id);
    const fresh = createBrief(entry.typeId, entry);
    const merged: ReportBrief = {
      ...fresh,
      details: { ...fresh.details, title: brief.details.title, subtitle: brief.details.subtitle, brief: brief.details.brief, sourceNotes: brief.details.sourceNotes, sourceFiles: brief.details.sourceFiles },
    };
    setBrief(merged);
    setOutline([]);
    return merged;
  };

  const quickStart = (entry: ReportProfile): void => {
    const merged = pickProfile(entry);
    goTo('details');
    setVisited(new Set(['type', 'details', 'style', 'voice']));
    if (!merged.details.title && !merged.details.brief) return;
    goTo('outline');
    void designOutline(merged, bibliography);
  };

  const saveAsProfile = (): void => {
    const name = profileName.trim() || `${type.name} profile`;
    if (mode === 'profile' && profile && !profile.builtIn) {
      const updated: ReportProfile = { ...profileFromBrief(brief, name, profileDescription), id: profile.id, createdAt: profile.createdAt };
      onSaveProfile?.(updated);
    } else {
      const created = profileFromBrief(brief, name, profileDescription);
      if (mode === 'profile') onSaveProfile?.(created);
      else {
        saveProfile(created);
        setSavedNotice(`Saved “${name}” — it will appear first next time.`);
      }
    }
  };

  const canAdvance = useMemo(() => {
    if (step === 'details') return Boolean(brief.details.title.trim() || brief.details.brief.trim());
    return true;
  }, [brief.details.brief, brief.details.title, step]);

  return (
    <motion.div
      className="wr-wizard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'profile' ? 'Edit report profile' : 'Commission a report'}
    >
      <nav className="wr-wizard__rail">
        <div className="wr-wizard__brand">
          <span className="wr-wizard__brand-mark"><Feather size={16} weight="fill" /></span>
          {mode === 'profile' ? 'Report profile' : 'The commission'}
        </div>
        {steps.map((entry, i) => {
          const state = entry.id === step ? 'is-active' : visited.has(entry.id) && i < index ? 'is-done' : '';
          return (
            <React.Fragment key={entry.id}>
              {i > 0 && <span className="wr-step__connector" aria-hidden="true" />}
              <button type="button" className={`wr-step ${state}`} disabled={!visited.has(entry.id) || outlineLoading} onClick={() => goTo(entry.id)}>
                <span className="wr-step__dot">{state === 'is-done' ? <Check size={13} weight="bold" /> : i + 1}</span>
                <span className="wr-step__text">
                  <strong>{entry.title}</strong>
                  <span>{entry.hint}</span>
                </span>
              </button>
            </React.Fragment>
          );
        })}
        <div className="wr-wizard__rail-foot">
          {type.name}
          <br />
          {brief.style.bodyFont} · {brief.style.citationStyle.toUpperCase()} · {brief.details.targetWords.toLocaleString()} words
        </div>
      </nav>

      <div className="wr-wizard__main">
        <div className="wr-wizard__top">
          <button type="button" className="wr-icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)" disabled={outlineLoading}><X size={16} /></button>
        </div>
        <div className="wr-wizard__body">
          {step === 'type' && (
            <TypeStep
              typeId={brief.typeId}
              profileId={profileId}
              profiles={mode === 'report' ? profiles : []}
              onPickType={(typeId) => { pickType(typeId); goTo('details'); }}
              onPickProfile={(entry) => { pickProfile(entry); goTo('details'); }}
              onQuickStart={quickStart}
            />
          )}
          {step === 'details' && (
            <DetailsStep
              typeId={brief.typeId}
              details={brief.details}
              bibliography={bibliography}
              workspacePath={workspacePath}
              onChange={(patch) => setBrief((current) => ({ ...current, details: { ...current.details, ...patch } }))}
              onBibliographyChange={setBibliography}
            />
          )}
          {step === 'style' && (
            <StyleStep style={brief.style} title={brief.details.title} onChange={(style) => setBrief((current) => ({ ...current, style }))} />
          )}
          {step === 'voice' && (
            <VoiceStep
              voice={brief.voice}
              humanizer={brief.humanizer}
              engine={brief.engine}
              onVoice={(voice) => setBrief((current) => ({ ...current, voice }))}
              onHumanizer={(humanizer) => setBrief((current) => ({ ...current, humanizer }))}
              onEngine={(engine) => setBrief((current) => ({ ...current, engine }))}
            />
          )}
          {step === 'outline' && (
            <OutlineStep
              outline={outline}
              loading={outlineLoading}
              error={outlineError}
              onChange={setOutline}
              onRegenerate={() => void designOutline()}
              onUseTemplate={() => { setOutline(defaultOutline(type, brief.details.targetWords)); setOutlineError(null); }}
            />
          )}
        </div>

        <footer className="wr-wizard__foot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {index > 0 && (
              <button type="button" className="wr-pill-btn" onClick={() => goTo(steps[index - 1].id)} disabled={outlineLoading}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {(mode === 'profile' || step === 'outline' || step === 'voice') && (
              <span style={{ display: 'flex', gap: 6 }}>
                <input className="wr-input" style={{ width: 200, height: 32, borderRadius: 999 }} value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={mode === 'profile' ? 'Profile name' : 'Save these settings as…'} />
                {mode === 'profile' && <input className="wr-input" style={{ width: 240, height: 32, borderRadius: 999 }} value={profileDescription} onChange={(event) => setProfileDescription(event.target.value)} placeholder="Short description" />}
                {mode === 'report' && (
                  <button type="button" className="wr-pill-btn" onClick={saveAsProfile} disabled={!profileName.trim()}>
                    <BookmarkSimple size={14} /> Save profile
                  </button>
                )}
              </span>
            )}
            {savedNotice && <span className="wr-wizard__foot-hint">{savedNotice}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step === 'outline' && outlineLoading && (
              <button type="button" className="wr-pill-btn is-danger" onClick={() => { onCancelOutline?.(); }}>Stop</button>
            )}
            {mode === 'profile' && index === steps.length - 1 ? (
              <button type="button" className="wr-pill-btn is-gold" onClick={saveAsProfile} disabled={!profileName.trim()}>
                <BookmarkSimple size={14} /> Save profile
              </button>
            ) : step === 'outline' ? (
              <HoldButton
                holdTime={900}
                size="md"
                radius={999}
                backgroundColor="var(--text-primary)"
                textColor="var(--bg-primary)"
                fillColor="var(--wr-gold)"
                fillTextColor="#1b1408"
                doneLabel="Writing…"
                disabled={outlineLoading || outline.length === 0}
                onHold={() => onCommission?.(brief, outline, bibliography)}
              >
                Hold to begin writing
              </HoldButton>
            ) : (
              <>
                {!canAdvance && <span className="wr-wizard__foot-hint">Give it a title or a brief to continue</span>}
                <button type="button" className="wr-pill-btn is-primary" onClick={next} disabled={!canAdvance || index === steps.length - 1}>
                  {steps[index + 1]?.id === 'outline' ? 'Design the outline' : 'Continue'}
                  <span className="wr-pill-btn__orb"><ArrowRight size={12} /></span>
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </motion.div>
  );
};

