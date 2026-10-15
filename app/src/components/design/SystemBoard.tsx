import React from 'react';
import type { DesignTokens } from '../../utils/design/types';

const ROLES: Array<[string, keyof DesignTokens['palette']]> = [
  ['Background', 'background'], ['Surface', 'surface'], ['Text', 'text'], ['Muted', 'muted'],
  ['Primary', 'primary'], ['Secondary', 'secondary'], ['Accent', 'accent'],
];

const RAMP: Array<[string, keyof DesignTokens['type'], 'heading' | 'body', number]> = [
  ['Display', 'display', 'heading', 700], ['Heading 1', 'h1', 'heading', 700], ['Heading 2', 'h2', 'heading', 600],
  ['Body', 'body', 'body', 400], ['Caption', 'caption', 'body', 400],
];

/** Readable text colour on a hex background. */
function inkOn(hex: string): string {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '000000';
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff';
}

/** The design system as a sheet: palette with values, type ramp, shape and a few controls. It grows with its content. */
export const SystemBoard: React.FC<{ tokens: DesignTokens }> = ({ tokens }) => {
  const { palette } = tokens;
  const heading = `'${tokens.fonts.heading}', system-ui, sans-serif`;
  const body = `'${tokens.fonts.body}', system-ui, sans-serif`;
  const faint = { color: palette.muted, fontSize: 11 } as const;
  return (
    <div className="dz-system" style={{ background: palette.background, color: palette.text, fontFamily: body }}>
      <div style={{ fontSize: 12, color: palette.muted }}>Design system</div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 4, fontFamily: heading }} dir="auto">{tokens.name}</div>
      {tokens.concept && <div style={{ marginTop: 8, fontSize: 14, color: palette.muted, maxWidth: 520 }} dir="auto">{tokens.concept}</div>}

      <div className="dz-system__title" style={faint}>Colour</div>
      <div className="dz-system__swatches">
        {ROLES.map(([label, role]) => (
          <div key={role} className="dz-system__swatch">
            <div className="dz-system__chip" style={{ background: palette[role], color: inkOn(palette[role]), borderColor: palette.muted + '55' }}>Aa</div>
            <span style={{ color: palette.text }}>{label}</span>
            <span style={faint}>{palette[role].toUpperCase()}</span>
          </div>
        ))}
      </div>

      <div className="dz-system__title" style={faint}>Type · {tokens.fonts.heading} / {tokens.fonts.body}</div>
      <div className="dz-system__ramp">
        {RAMP.map(([label, key, face, weight]) => (
          <div key={key} className="dz-system__row" style={{ borderColor: palette.muted + '33' }}>
            <span style={{ ...faint, width: 84, flexShrink: 0 }}>{label} · {tokens.type[key]}px</span>
            <span style={{ fontFamily: face === 'heading' ? heading : body, fontSize: Math.min(tokens.type[key], 44), fontWeight: weight, lineHeight: 1.15 }} dir="auto">
              {key === 'caption' || key === 'body' ? 'The quick brown fox jumps over the lazy dog' : 'Quick brown fox'}
            </span>
          </div>
        ))}
      </div>

      <div className="dz-system__title" style={faint}>Shape and controls · radius {tokens.radius}px · space {tokens.spacing}px</div>
      <div className="dz-system__controls">
        <span className="dz-system__button" style={{ background: palette.primary, color: inkOn(palette.primary), borderRadius: tokens.radius }}>Primary</span>
        <span className="dz-system__button" style={{ background: 'transparent', color: palette.text, border: `1px solid ${palette.muted}`, borderRadius: tokens.radius }}>Secondary</span>
        <span className="dz-system__button" style={{ background: palette.accent, color: inkOn(palette.accent), borderRadius: tokens.radius }}>Accent</span>
        <span className="dz-system__input" style={{ background: palette.surface, border: `1px solid ${palette.muted}66`, borderRadius: tokens.radius, color: palette.muted }}>Input</span>
        <span className="dz-system__card" style={{ background: palette.surface, borderRadius: tokens.radius, border: `1px solid ${palette.muted}33` }}>Card</span>
      </div>
    </div>
  );
};
