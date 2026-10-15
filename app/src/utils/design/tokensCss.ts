import type { DesignPalette, DesignTokens, ShadowLevel } from './types';

const quote = (family: string): string => `'${family.replace(/['"\\<>]/g, '')}'`;

const SHADOWS: Record<ShadowLevel, [string, string, string]> = {
  none: ['none', 'none', 'none'],
  soft: ['0 1px 2px rgba(0,0,0,0.08)', '0 4px 12px rgba(0,0,0,0.10)', '0 12px 28px rgba(0,0,0,0.14)'],
  medium: ['0 1px 3px rgba(0,0,0,0.12)', '0 6px 18px rgba(0,0,0,0.16)', '0 16px 36px rgba(0,0,0,0.22)'],
  strong: ['0 2px 4px rgba(0,0,0,0.18)', '0 10px 26px rgba(0,0,0,0.26)', '0 24px 48px rgba(0,0,0,0.34)'],
};

const palette = (p: DesignPalette): string => [
  `--ds-background:${p.background};--ds-surface:${p.surface};--ds-text:${p.text};--ds-muted:${p.muted};`,
  `--ds-primary:${p.primary};--ds-secondary:${p.secondary};--ds-accent:${p.accent};`,
].join('');

/** The `:root` block every HTML screen draws its colours, fonts and spacing from. */
export function tokensToCss(tokens: DesignTokens): string {
  const shadows = SHADOWS[tokens.shadow] ?? SHADOWS.soft;
  const lines = [
    ':root{',
    palette(tokens.palette),
    `--ds-font-heading:${quote(tokens.fonts.heading)},system-ui,sans-serif;--ds-font-body:${quote(tokens.fonts.body)},system-ui,sans-serif;`,
    `--ds-size-display:${tokens.type.display}px;--ds-size-h1:${tokens.type.h1}px;--ds-size-h2:${tokens.type.h2}px;--ds-size-body:${tokens.type.body}px;--ds-size-caption:${tokens.type.caption}px;`,
    `--ds-radius:${tokens.radius}px;--ds-radius-sm:${Math.max(0, Math.round(tokens.radius / 2))}px;--ds-radius-lg:${Math.round(tokens.radius * 1.75)}px;--ds-space:${tokens.spacing}px;`,
    `--ds-weight-heading:${tokens.headingWeight};--ds-line-height:${tokens.lineHeight};--ds-border:${tokens.borderWidth}px;`,
    `--ds-shadow-1:${shadows[0]};--ds-shadow-2:${shadows[1]};--ds-shadow-3:${shadows[2]};`,
    '}',
  ];
  if (tokens.darkPalette) lines.push(`:root[data-theme="dark"]{${palette(tokens.darkPalette)}}`);
  return lines.join('\n');
}
