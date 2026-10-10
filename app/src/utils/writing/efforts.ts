import type { WritingModelInfo } from './aiClient';

const ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const LABELS: Record<string, string> = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' };

export const effortLabel = (effort: string): string => LABELS[effort] ?? effort;

/**
 * Reasoning-effort levels to offer. A chosen model decides its own; with the
 * CLI's default model (or a model typed by hand) every level any listed model
 * accepts is offered. Empty means the control stays hidden.
 */
export function effortOptions(models: WritingModelInfo[], model: string): string[] {
  const chosen = model.trim() ? models.find((entry) => entry.id === model.trim()) : undefined;
  if (chosen) return chosen.efforts;
  const all = new Set(models.flatMap((entry) => entry.efforts));
  return [...all].sort((a, b) => (ORDER.indexOf(a) + 1 || ORDER.length + 1) - (ORDER.indexOf(b) + 1 || ORDER.length + 1));
}
