// Lightweight inline SVG charts for the in-app renderer and the PDF. The PPTX
// export writes native PowerPoint charts from the same data. Dependency-free.

import { PX_PER_IN } from './layouts';
import type { El } from './render';
import { escapeHtml } from './richText';
import { fontStack } from './themes';

type ChartEl = Extract<El, { kind: 'chart' }>;

const fmt = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(0)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 10 ? 1 : 0);
};

/** A round axis maximum and its tick step. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 0.25 };
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  return { max: Math.ceil(max / step) * step, step };
}

const text = (x: number, y: number, value: string, attrs: string): string =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attrs}>${escapeHtml(value)}</text>`;

export function chartSvg(el: ChartEl): string {
  const width = el.rect.w * PX_PER_IN;
  const height = el.rect.h * PX_PER_IN;
  const font = (el.size * 4) / 3;
  const family = escapeHtml(fontStack(el.font));
  const { block } = el;
  const color = (index: number): string => el.colors[index % el.colors.length];
  const parts: string[] = [];
  const base = `font-family="${family}" font-size="${font.toFixed(1)}"`;

  if (block.kind === 'pie' || block.kind === 'donut') {
    const values = block.series[0]?.values ?? [];
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
    const legendW = Math.min(width * 0.42, 260);
    const radius = Math.max(10, Math.min((width - legendW) / 2, height / 2) - 8);
    const cx = (width - legendW) / 2;
    const cy = height / 2;
    let angle = -Math.PI / 2;
    values.forEach((value, index) => {
      const share = Math.max(0, value) / total;
      if (share <= 0) return;
      const end = angle + share * Math.PI * 2;
      const large = end - angle > Math.PI ? 1 : 0;
      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(end - (share >= 1 ? 0.0001 : 0));
      const y2 = cy + radius * Math.sin(end - (share >= 1 ? 0.0001 : 0));
      parts.push(`<path d="M${cx.toFixed(1)},${cy.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} A${radius.toFixed(1)},${radius.toFixed(1)} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${color(index)}"/>`);
      if (share >= 0.06) {
        const mid = (angle + end) / 2;
        const lr = block.kind === 'donut' ? radius * 0.78 : radius * 0.62;
        parts.push(text(cx + lr * Math.cos(mid), cy + lr * Math.sin(mid) + font * 0.35, `${Math.round(share * 100)}%`, `${base} fill="#ffffff" font-weight="700" text-anchor="middle"`));
      }
      angle = end;
    });
    if (block.kind === 'donut') parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(radius * 0.56).toFixed(1)}" fill="${el.background}"/>`);
    const lineH = font * 1.6;
    const startY = cy - (block.categories.length * lineH) / 2 + font;
    block.categories.forEach((category, index) => {
      const y = startY + index * lineH;
      parts.push(`<rect x="${(width - legendW + 12).toFixed(1)}" y="${(y - font * 0.8).toFixed(1)}" width="${(font * 0.9).toFixed(1)}" height="${(font * 0.9).toFixed(1)}" rx="2" fill="${color(index)}"/>`);
      parts.push(text(width - legendW + 12 + font * 1.4, y, `${category} · ${fmt(values[index] ?? 0)}${block.unit ? ` ${block.unit}` : ''}`, `${base} fill="${el.text}"`));
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}">${parts.join('')}</svg>`;
  }

  const series = block.series;
  const legend = series.length > 1;
  const top = legend ? font * 2.6 : block.unit && block.kind !== 'bar' ? font * 1.9 : font;
  const allValues = series.flatMap((entry) => entry.values);
  const min = Math.min(0, ...allValues);
  const { max, step } = niceScale(Math.max(...allValues, 0) - min);
  const floor = min < 0 ? -niceScale(-min).max : 0;
  const span = max + (floor < 0 ? -floor : 0) || 1;
  const horizontal = block.kind === 'bar';
  const labelW = horizontal ? Math.min(width * 0.28, Math.max(...block.categories.map((category) => category.length)) * font * 0.56 + 10) : font * 3.2;
  const left = labelW;
  const bottom = horizontal ? font * 1.8 : font * 2.2;
  const plotW = width - left - 8;
  const plotH = height - top - bottom;
  const count = Math.max(1, block.categories.length);

  if (legend) {
    let x = left;
    series.forEach((entry, index) => {
      parts.push(`<rect x="${x.toFixed(1)}" y="${(font * 0.35).toFixed(1)}" width="${(font * 0.9).toFixed(1)}" height="${(font * 0.9).toFixed(1)}" rx="2" fill="${color(index)}"/>`);
      parts.push(text(x + font * 1.3, font * 1.15, entry.name, `${base} fill="${el.text}"`));
      x += font * 2 + entry.name.length * font * 0.58;
    });
  }

  // Grid and value axis.
  for (let value = floor; value <= max + 1e-9; value += step) {
    const ratio = (value - floor) / span;
    if (horizontal) {
      const x = left + ratio * plotW;
      parts.push(`<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${(top + plotH).toFixed(1)}" stroke="${el.grid}" stroke-width="1"/>`);
      parts.push(text(x, top + plotH + font * 1.3, fmt(value), `${base} fill="${el.muted}" text-anchor="middle"`));
    } else {
      const y = top + plotH - ratio * plotH;
      parts.push(`<line x1="${left}" y1="${y.toFixed(1)}" x2="${(left + plotW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${el.grid}" stroke-width="1"/>`);
      parts.push(text(left - 8, y + font * 0.35, fmt(value), `${base} fill="${el.muted}" text-anchor="end"`));
    }
  }
  const zero = (0 - floor) / span;

  if (block.kind === 'line') {
    series.forEach((entry, seriesIndex) => {
      const points = entry.values.map((value, index) => {
        const x = left + (count === 1 ? plotW / 2 : (index / (count - 1)) * plotW);
        const y = top + plotH - ((value - floor) / span) * plotH;
        return [x, y] as const;
      });
      parts.push(`<polyline points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${color(seriesIndex)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
      points.forEach(([x, y]) => parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color(seriesIndex)}"/>`));
    });
    block.categories.forEach((category, index) => {
      const x = left + (count === 1 ? plotW / 2 : (index / (count - 1)) * plotW);
      parts.push(text(x, top + plotH + font * 1.5, category, `${base} fill="${el.muted}" text-anchor="middle"`));
    });
  } else {
    const band = (horizontal ? plotH : plotW) / count;
    const groupW = band * 0.68;
    const barW = groupW / Math.max(1, series.length);
    block.categories.forEach((category, index) => {
      const start = index * band + (band - groupW) / 2;
      series.forEach((entry, seriesIndex) => {
        const value = entry.values[index] ?? 0;
        const ratio = (value - floor) / span;
        const from = Math.min(ratio, zero);
        const size = Math.abs(ratio - zero);
        if (horizontal) {
          const y = top + start + seriesIndex * barW;
          parts.push(`<rect x="${(left + from * plotW).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, size * plotW).toFixed(1)}" height="${(barW * 0.92).toFixed(1)}" rx="2" fill="${color(seriesIndex)}"/>`);
        } else {
          const x = left + start + seriesIndex * barW;
          const y = top + plotH - Math.max(ratio, zero) * plotH;
          parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW * 0.92).toFixed(1)}" height="${Math.max(1, size * plotH).toFixed(1)}" rx="2" fill="${color(seriesIndex)}"/>`);
          if (series.length === 1 && count <= 8) parts.push(text(x + barW * 0.46, y - font * 0.45, fmt(value), `${base} fill="${el.text}" font-weight="700" text-anchor="middle"`));
        }
      });
      if (horizontal) parts.push(text(left - 8, top + start + groupW / 2 + font * 0.35, category, `${base} fill="${el.text}" text-anchor="end"`));
      else parts.push(text(left + start + groupW / 2, top + plotH + font * 1.5, category, `${base} fill="${el.muted}" text-anchor="middle"`));
    });
  }
  if (block.unit) parts.push(text(horizontal ? left + plotW : left, horizontal ? height - 2 : top - font * 0.7, block.unit, `${base} fill="${el.muted}" text-anchor="${horizontal ? 'end' : 'start'}" font-size="${(font * 0.85).toFixed(1)}"`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}">${parts.join('')}</svg>`;
}
