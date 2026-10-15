import React from 'react';
import { Stop } from '@phosphor-icons/react';
import type { DirectionChoice } from '../../stores/designSessionStore';

interface DirectionCardsProps {
  choice: DirectionChoice;
  onChoose: (index: number) => void;
  onStop: () => void;
}

const ROLES = ['background', 'surface', 'text', 'muted', 'primary', 'secondary', 'accent'] as const;

/** The looks the AI proposed for the same plan: pick one and drawing starts. */
export const DirectionCards: React.FC<DirectionCardsProps> = ({ choice, onChoose, onStop }) => (
  <div className="dz-directions" role="dialog" aria-label="Choose a direction">
    <div className="dz-directions__head">
      <div>
        <div className="dz-directions__title">Choose a direction</div>
        <div className="dz-directions__sub">The screens are planned. Pick the look they are drawn in; you can change colours and fonts afterwards.</div>
      </div>
      <button type="button" className="dz-btn" onClick={onStop}><Stop size={12} weight="fill" /> Stop</button>
    </div>
    <div className="dz-directions__grid">
      {choice.options.map((option, index) => {
        const { palette, fonts, radius } = option.tokens;
        const heading = `'${fonts.heading}', system-ui, sans-serif`;
        const body = `'${fonts.body}', system-ui, sans-serif`;
        return (
          <div key={option.id} className="dz-direction" style={{ background: palette.background, color: palette.text, fontFamily: body, borderRadius: Math.min(radius + 4, 20) }}>
            <div className="dz-direction__sample">
              <div style={{ fontFamily: heading, fontSize: 28, fontWeight: option.tokens.headingWeight, lineHeight: 1.1 }} dir="auto">{option.name}</div>
              {option.mood && <div style={{ color: palette.muted, fontSize: 13, marginTop: 6 }} dir="auto">{option.mood}</div>}
              <div className="dz-direction__chips">
                {ROLES.map((role) => <span key={role} title={role} style={{ background: palette[role], borderColor: `${palette.muted}66` }} />)}
              </div>
              <div className="dz-direction__row">
                <span className="dz-direction__button" style={{ background: palette.primary, color: palette.background, borderRadius: radius }}>Primary</span>
                <span className="dz-direction__button" style={{ border: `1px solid ${palette.muted}`, color: palette.text, borderRadius: radius }}>Secondary</span>
                <span className="dz-direction__card" style={{ background: palette.surface, borderRadius: radius, borderColor: `${palette.muted}44` }} />
              </div>
              <div style={{ color: palette.muted, fontSize: 11, marginTop: 10 }}>{fonts.heading} · {fonts.body}</div>
            </div>
            <button type="button" className="dz-btn dz-btn--primary dz-direction__use" onClick={() => onChoose(index)}>Use this look</button>
          </div>
        );
      })}
    </div>
  </div>
);
