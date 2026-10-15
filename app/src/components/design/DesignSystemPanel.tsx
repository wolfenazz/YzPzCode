import React, { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { ArrowsClockwise, Check, Copy, FileArrowDown, Image as ImageIcon, Trash, Warning } from '@phosphor-icons/react';
import type { FileContent } from '../../types';
import { useDesignSessionStore } from '../../stores/designSessionStore';
import { restyleSvg } from '../../utils/design/svgRestyle';
import { contrastRatio, deriveDarkPalette, fixContrast, paletteIdeas, refontSvg, TYPE_RATIOS, typeScale } from '../../utils/design/color';
import { parseDesignMd, tokensToCssFile, tokensToDesignMd, tokensToJson, tokensToTailwind } from '../../utils/design/kits';
import type { DesignPalette, DesignProject, DesignTokens, ShadowLevel } from '../../utils/design/types';
import { paletteColorMap } from '../../utils/presentation/slideEdit';
import { Field, Hint, ColorInput, Section, Segmented, Select, Slider, Toggle } from '../studio/Inspector';
import { FontOptions } from '../studio/FontOptions';
import type { SavedKit } from './useDesignKits';

const ROLES: Array<keyof DesignPalette> = ['background', 'surface', 'text', 'muted', 'primary', 'secondary', 'accent'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const SHADOW_OPTIONS: Array<{ id: ShadowLevel; label: string }> = [
  { id: 'none', label: 'None' }, { id: 'soft', label: 'Soft' }, { id: 'medium', label: 'Medium' }, { id: 'strong', label: 'Strong' },
];

interface DesignSystemPanelProps {
  workspaceId: string;
  project: DesignProject;
  busy: boolean;
  kits: SavedKit[];
  onSaveKit: (name: string, tokens: DesignTokens) => Promise<unknown>;
  onDeleteKit: (kit: SavedKit) => Promise<void>;
  onDeriveFromPicture: (path: string) => Promise<DesignTokens>;
  onDeriveFromUrl: (address: string) => Promise<DesignTokens>;
  onRestyle: (instruction: string) => void;
}

/** Recolours every hex colour in an SVG through a palette map. */
function recolor(svg: string, map: (hex: string) => string): string {
  return svg.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
    try {
      return map(hex);
    } catch {
      return hex;
    }
  });
}

const ratioLabel = (value: number): string => `${value >= 10 ? Math.round(value) : value.toFixed(1)}:1`;

/** The Design tab: colours, light and dark, type, shape, and saved kits. Changes reach every HTML board at once. */
export const DesignSystemPanel: React.FC<DesignSystemPanelProps> = ({ workspaceId, project, busy, kits, onSaveKit, onDeleteKit, onDeriveFromPicture, onDeriveFromUrl, onRestyle }) => {
  const edit = useDesignSessionStore((state) => state.edit);
  const update = useDesignSessionStore((state) => state.update);
  const tokens = project.system;
  const baseline = useRef<DesignProject | null>(null);
  const settleTimer = useRef<number | null>(null);
  const [kitName, setKitName] = useState('');
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [working, setWorking] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [address, setAddress] = useState('');
  const [restyleText, setRestyleText] = useState('');

  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
  }, []);

  /** Ends a run of live changes: the whole run becomes one undo step. */
  const settle = (): void => {
    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    const before = baseline.current;
    baseline.current = null;
    if (before) update(workspaceId, (state) => ({ past: [...state.past, before].slice(-50), future: [], dirty: true }));
  };

  /** Applies a changed system to the project; `live` changes (sliders, pickers) share one undo step. */
  const commit = (build: (before: DesignTokens) => DesignTokens, live = false): void => {
    const current = useDesignSessionStore.getState().sessions[workspaceId]?.project;
    if (!current) return;
    if (live && !baseline.current) baseline.current = current;
    edit(workspaceId, (state) => {
      const next = build(state.system);
      const paletteChanged = ROLES.some((role) => state.system.palette[role] !== next.palette[role]);
      const map = paletteChanged ? paletteColorMap(state.system.palette, next.palette) : null;
      const fontsChanged = state.system.fonts.heading !== next.fonts.heading || state.system.fonts.body !== next.fonts.body;
      return {
        ...state,
        system: next,
        // HTML boards follow the variables on their own; drawn graphics are recoloured and set in the new faces.
        boards: state.boards.map((board) => {
          if (board.format !== 'svg' || !board.source) return board;
          let source = board.source;
          if (map) source = recolor(source, map);
          source = restyleSvg(source, state.system, next, { width: board.width, height: board.height });
          if (fontsChanged) source = refontSvg(source, state.system.fonts, next.fonts, state.system.type.h2 * 0.9);
          return source === board.source ? board : { ...board, source };
        }),
      };
    }, { skipHistory: live });
    if (live) {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 700);
    }
  };

  const setRole = (role: keyof DesignPalette, value: string, dark = false): void => {
    commit((before) => (dark && before.darkPalette
      ? { ...before, darkPalette: { ...before.darkPalette, [role]: value } }
      : { ...before, palette: { ...before.palette, [role]: value } }), true);
  };

  const p = tokens.palette;
  const checks: Array<{ label: string; ratio: number; need: number }> = [
    { label: 'Text on background', ratio: contrastRatio(p.text, p.background), need: 4.5 },
    { label: 'Text on surface', ratio: contrastRatio(p.text, p.surface), need: 4.5 },
    { label: 'Muted on background', ratio: contrastRatio(p.muted, p.background), need: 3 },
    { label: 'Primary on background', ratio: contrastRatio(p.primary, p.background), need: 3 },
  ];
  const failing = checks.some((entry) => entry.ratio < entry.need);

  const fixAll = (): void => {
    commit((before) => ({
      ...before,
      palette: {
        ...before.palette,
        text: fixContrast(fixContrast(before.palette.text, before.palette.background, 4.5), before.palette.surface, 4.5),
        muted: fixContrast(before.palette.muted, before.palette.background, 3),
        primary: fixContrast(before.palette.primary, before.palette.background, 3),
      },
    }));
  };

  const ideas = showIdeas ? paletteIdeas(tokens.palette, 5) : [];

  // Kits ----------------------------------------------------------------------------

  const flash = (text: string, error = false): void => {
    setNote({ text, error });
    window.setTimeout(() => setNote((current) => (current?.text === text ? null : current)), 4000);
  };

  const copy = (text: string, what: string): void => {
    void navigator.clipboard.writeText(text).then(() => flash(`${what} copied.`), () => flash('Could not copy.', true));
  };

  const saveKit = async (): Promise<void> => {
    try {
      await onSaveKit(kitName || tokens.name, tokens);
      setKitName('');
      flash('Saved as a kit. It is in the style menu of the composer.');
    } catch (error) {
      flash(`Could not save: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  };

  const importFile = async (): Promise<void> => {
    const picked = await open({ multiple: false, filters: [{ name: 'Design system', extensions: ['md', 'markdown', 'json'] }] });
    if (!picked || Array.isArray(picked)) return;
    try {
      const file = await invoke<FileContent>('read_file_content', { path: picked });
      let next: DesignTokens;
      if (/\.json$/i.test(picked)) {
        const parsed = JSON.parse(file.content) as { tokens?: unknown };
        const { parseKit } = await import('../../utils/design/kits');
        const kit = parseKit(JSON.stringify({ tokens: parsed.tokens ?? parsed }));
        if (!kit) throw new Error('This file is not a design system.');
        next = kit.tokens;
      } else {
        next = parseDesignMd(file.content);
      }
      commit((before) => ({ ...next, motif: next.motif || before.motif, imagery: next.imagery || before.imagery }));
      flash('Design system imported.');
    } catch (error) {
      flash(`Could not read it: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  };

  const fromPicture = async (): Promise<void> => {
    const picked = await open({ multiple: false, filters: [{ name: 'Pictures', extensions: IMAGE_EXTENSIONS }] });
    if (!picked || Array.isArray(picked)) return;
    setWorking(true);
    try {
      const next = await onDeriveFromPicture(picked);
      commit((before) => ({ ...next, motif: next.motif || before.motif, imagery: next.imagery || before.imagery }));
      flash('Design system made from the picture.');
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error), true);
    } finally {
      setWorking(false);
    }
  };

  const fromUrl = async (): Promise<void> => {
    if (!address.trim()) return;
    setWorking(true);
    try {
      const next = await onDeriveFromUrl(address);
      commit((before) => ({ ...next, motif: next.motif || before.motif, imagery: next.imagery || before.imagery }));
      flash('Design system made from the page.');
      setAddress('');
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error), true);
    } finally {
      setWorking(false);
    }
  };

  const restyle = (text: string): void => {
    if (!text.trim() || busy) return;
    onRestyle(text.trim());
    setRestyleText('');
  };

  const fonts = tokens.fonts;
  const darkOn = Boolean(tokens.darkPalette);

  return (
    <div className="sx-inspector dz-sysdoc">
      <Section title="Restyle with AI">
        <textarea
          className="dz-code dz-code--short"
          dir="auto"
          placeholder="e.g. warmer and softer, more contrast, a serif for headings"
          value={restyleText}
          disabled={busy}
          aria-label="How to restyle"
          onChange={(event) => setRestyleText(event.target.value)}
          onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) restyle(restyleText); }}
        />
        <div className="dz-chips">
          {['Warmer', 'Calmer', 'More contrast', 'Playful', 'Darker'].map((word) => (
            <button key={word} type="button" className="dz-btn dz-btn--sm" disabled={busy} onClick={() => restyle(word === 'Darker' ? 'Make the whole system darker: a dark background and lighter text' : `Make the system ${word.toLowerCase()}`)}>{word}</button>
          ))}
        </div>
        <button type="button" className="dz-btn dz-btn--primary dz-btn--block" disabled={busy || !restyleText.trim()} onClick={() => restyle(restyleText)}>Restyle</button>
        <Hint>Colours, fonts and shape change for every screen. You keep or discard the result.</Hint>
      </Section>

      <Section title="Kits" aside={kits.length > 0 ? String(kits.length) : undefined} collapsible defaultOpen={false}>
        <div className="dz-kitsave">
          <input className="dz-input dz-input--wide" dir="auto" placeholder={tokens.name || 'Kit name'} value={kitName} aria-label="Kit name" onChange={(event) => setKitName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') void saveKit(); }} />
          <button type="button" className="dz-btn dz-btn--sm dz-btn--primary" onClick={() => void saveKit()}>Save</button>
        </div>
        {kits.map((kit) => (
          <div key={kit.id} className="dz-kit">
            <span className="dz-kit__chips">{(['background', 'primary', 'secondary', 'accent'] as const).map((role) => <i key={role} style={{ background: kit.tokens.palette[role] }} />)}</span>
            <span className="dz-kit__name" dir="auto" title={kit.tokens.fonts.heading}>{kit.name}</span>
            <button type="button" className="dz-btn dz-btn--sm" disabled={busy} onClick={() => commit(() => kit.tokens)}>Apply</button>
            <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-label={`Delete ${kit.name}`} onClick={() => void onDeleteKit(kit)}><Trash size={12} /></button>
          </div>
        ))}
        <div className="dz-actions dz-actions--pair">
          <button type="button" className="dz-btn dz-btn--sm" disabled={busy || working} onClick={() => void fromPicture()}><ImageIcon size={13} /> From a picture…</button>
          <button type="button" className="dz-btn dz-btn--sm" disabled={busy} onClick={() => void importFile()}><FileArrowDown size={13} /> Import…</button>
        </div>
        <div className="dz-actions">
          <button type="button" className="dz-btn dz-btn--sm" onClick={() => copy(tokensToDesignMd(tokens), 'DESIGN.md')}><Copy size={13} /> DESIGN.md</button>
          <button type="button" className="dz-btn dz-btn--sm" onClick={() => copy(tokensToCssFile(tokens), 'CSS variables')}><Copy size={13} /> CSS</button>
          <button type="button" className="dz-btn dz-btn--sm" onClick={() => copy(tokensToJson(tokens), 'Design tokens')}><Copy size={13} /> JSON</button>
          <button type="button" className="dz-btn dz-btn--sm" onClick={() => copy(tokensToTailwind(), 'Tailwind theme')}><Copy size={13} /> Tailwind</button>
        </div>
        <div className="dz-kitsave">
          <input className="dz-input dz-input--wide" dir="ltr" placeholder="From a web page: example.com" value={address} disabled={busy || working} aria-label="Web address" onChange={(event) => setAddress(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') void fromUrl(); }} />
          <button type="button" className="dz-btn dz-btn--sm" disabled={busy || working || !address.trim()} onClick={() => void fromUrl()}>Read</button>
        </div>
        {working && <Hint>Reading…</Hint>}
        {note && <Hint error={note.error}>{note.text}</Hint>}
      </Section>

      <Section title="Colour">
        <div onPointerUp={settle} onBlurCapture={settle}>
          {ROLES.map((role) => (
            <Field key={role} label={role[0].toUpperCase() + role.slice(1)}>
              <ColorInput value={p[role]} label={role} onChange={(value) => setRole(role, value)} />
            </Field>
          ))}
        </div>
        <div className="dz-checks" aria-label="Contrast">
          {checks.map((entry) => (
            <div key={entry.label} className="dz-check" data-fail={entry.ratio < entry.need || undefined}>
              {entry.ratio < entry.need ? <Warning size={12} /> : <Check size={12} />}
              <span>{entry.label}</span>
              <span className="dz-check__ratio">{ratioLabel(entry.ratio)}</span>
            </div>
          ))}
        </div>
        <div className="dz-actions dz-actions--pair">
          <button type="button" className="dz-btn dz-btn--sm" disabled={busy || !failing} onClick={fixAll}>Fix contrast</button>
          <button type="button" className="dz-btn dz-btn--sm" aria-pressed={showIdeas} onClick={() => setShowIdeas((value) => !value)}><ArrowsClockwise size={13} /> Palette ideas</button>
        </div>
        {ideas.length > 0 && (
          <div className="dz-ideas">
            {ideas.map((idea) => (
              <button key={idea.name} type="button" className="dz-idea" disabled={busy} title={`Use ${idea.name.toLowerCase()} colours`} onClick={() => commit((before) => ({ ...before, palette: idea.palette, darkPalette: before.darkPalette ? deriveDarkPalette(idea.palette) : undefined }))}>
                <span className="dz-idea__strip">{ROLES.map((role) => <i key={role} style={{ background: idea.palette[role] }} />)}</span>
                <span>{idea.name}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Light and dark" collapsible defaultOpen={darkOn}>
        <Toggle
          label="Dark palette"
          hint="Screens can be switched to it per board. It is made from the light colours and can be edited."
          checked={darkOn}
          disabled={busy}
          onChange={(checked) => commit((before) => ({ ...before, darkPalette: checked ? deriveDarkPalette(before.palette) : undefined }))}
        />
        {tokens.darkPalette && (
          <div onPointerUp={settle} onBlurCapture={settle}>
            {ROLES.map((role) => (
              <Field key={role} label={role[0].toUpperCase() + role.slice(1)}>
                <ColorInput value={(tokens.darkPalette as DesignPalette)[role]} label={`Dark ${role}`} onChange={(value) => setRole(role, value, true)} />
              </Field>
            ))}
            <div className="dz-actions dz-actions--pair">
              <button type="button" className="dz-btn dz-btn--sm" disabled={busy} onClick={() => commit((before) => ({ ...before, darkPalette: deriveDarkPalette(before.palette) }))}>Make again from light</button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Type">
        <Field label="Headings">
          <Select value={fonts.heading} disabled={busy} onChange={(event) => commit((before) => ({ ...before, fonts: { ...before.fonts, heading: event.target.value } }))}>
            <FontOptions current={[fonts.heading, fonts.body]} />
          </Select>
        </Field>
        <Field label="Body">
          <Select value={fonts.body} disabled={busy} onChange={(event) => commit((before) => ({ ...before, fonts: { ...before.fonts, body: event.target.value } }))}>
            <FontOptions current={[fonts.heading, fonts.body]} />
          </Select>
        </Field>
        <Field label="Scale">
          <Select value="" disabled={busy} onChange={(event) => {
            const ratio = TYPE_RATIOS.find((entry) => entry.id === event.target.value);
            if (ratio) commit((before) => ({ ...before, type: typeScale(before.type.body, ratio.ratio) }));
          }}>
            <option value="">Set from a ratio…</option>
            {TYPE_RATIOS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </Select>
        </Field>
        <div onPointerUp={settle} onKeyUp={settle}>
          <Slider label="Body size" value={tokens.type.body} display={`${tokens.type.body}px`} min={12} max={24} onChange={(value) => commit((before) => ({ ...before, type: { ...before.type, body: value } }), true)} />
          <Slider label="Heading weight" value={tokens.headingWeight} display={String(tokens.headingWeight)} min={300} max={900} step={100} onChange={(value) => commit((before) => ({ ...before, headingWeight: value }), true)} />
          <Slider label="Line height" value={tokens.lineHeight} display={tokens.lineHeight.toFixed(2)} min={1.1} max={2} step={0.05} onChange={(value) => commit((before) => ({ ...before, lineHeight: value }), true)} />
        </div>
      </Section>

      <Section title="Shape">
        <div onPointerUp={settle} onKeyUp={settle}>
          <Slider label="Corner radius" value={tokens.radius} display={`${tokens.radius}px`} min={0} max={40} onChange={(value) => commit((before) => ({ ...before, radius: value }), true)} />
          <Slider label="Spacing unit" value={tokens.spacing} display={`${tokens.spacing}px`} min={2} max={16} onChange={(value) => commit((before) => ({ ...before, spacing: value }), true)} />
          <Slider label="Border width" value={tokens.borderWidth} display={`${tokens.borderWidth}px`} min={0} max={4} onChange={(value) => commit((before) => ({ ...before, borderWidth: value }), true)} />
        </div>
        <Field label="Shadows" stack>
          <Segmented label="Shadow strength" value={tokens.shadow} options={SHADOW_OPTIONS} onChange={(value) => commit((before) => ({ ...before, shadow: value }))} />
        </Field>
        <Hint>App and web screens follow these at once. Drawn graphics follow colours, fonts, type size, weight, line height, corner radius, border width and shadows too.</Hint>
      </Section>
    </div>
  );
};
