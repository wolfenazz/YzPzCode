// Static HTML for slides: one <section> per slide with `@page` sized to the
// slide, for the existing `export_writing_pdf` printer. Uses the same render
// plan and CSS helpers as the in-app renderer. Dependency-free.

import { chartSvg } from './chartSvg';
import { PX_PER_IN, slideWidth, SLIDE_HEIGHT } from './layouts';
import {
  boxCss,
  cssText,
  fillCss,
  listNumbers,
  markerCss,
  markerText,
  paraCss,
  planSlide,
  runCss,
  shapeCss,
  textBoxCss,
  type El,
  type PlanContext,
} from './render';
import { escapeHtml } from './richText';
import { fontStack } from './themes';
import type { Slide } from './types';

export interface StaticAssets {
  /** Image src (as stored in the slide) → data URL. */
  images: Record<string, string>;
  /** Iconify name → SVG markup. */
  icons: Record<string, string>;
}

function runsHtml(runs: Array<{ text: string; bold?: boolean; italic?: boolean; color?: string }>): string {
  return runs.map((run) => {
    const css = cssText(runCss(run));
    const body = escapeHtml(run.text).replace(/\n/g, '<br>');
    return css ? `<span style="${css}">${body}</span>` : body;
  }).join('');
}

export function elementHtml(el: El, assets: StaticAssets): string {
  switch (el.kind) {
    case 'shape':
      return `<div style="${cssText(shapeCss(el))}"></div>`;
    case 'text': {
      if (el.paras.length === 0) return '';
      const numbers = listNumbers(el.paras);
      const paras = el.paras.map((item, index) => {
        const marker = el.list ? `<span style="${cssText(markerCss(el, item))}">${escapeHtml(markerText(el, numbers[index], item))}</span>` : '';
        return `<p style="${cssText(paraCss(el, item, index === el.paras.length - 1))}">${marker}${runsHtml(item.runs)}</p>`;
      }).join('');
      return `<div style="${cssText(textBoxCss(el))}"><div>${paras}</div></div>`;
    }
    case 'image': {
      const src = assets.images[el.src];
      if (!src) return `<div style="${cssText({ ...boxCss(el.rect), background: '#d4d4d8' })}"></div>`;
      return `<img alt="${escapeHtml(el.alt)}" src="${src}" style="${cssText({ ...boxCss(el.rect), objectFit: el.fit, display: 'block' })}">`;
    }
    case 'placeholder':
      // Empty image slots print as a quiet panel, never as a "replace me" prompt.
      return `<div style="${cssText({ ...boxCss(el.rect), background: el.background })}"></div>`;
    case 'chart':
      return `<div style="${cssText(boxCss(el.rect))}">${chartSvg(el)}</div>`;
    case 'table': {
      const { block } = el;
      const rows = block.rows.map((row, rowIndex) => {
        const head = block.header && rowIndex === 0;
        const cells = row.map((cell) => {
          const css = cssText({
            padding: '0.07in 0.12in',
            borderBottom: `1px solid ${el.border}`,
            textAlign: 'left',
            verticalAlign: 'middle',
            ...(head ? { background: el.headerFill, color: el.headerText, fontWeight: 700 } : rowIndex % 2 === 0 ? { background: el.stripe } : {}),
          });
          return `<${head ? 'th' : 'td'} style="${css}">${escapeHtml(cell)}</${head ? 'th' : 'td'}>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      const css = cssText({ width: '100%', borderCollapse: 'collapse', fontFamily: fontStack(el.font), fontSize: `${el.size}pt`, color: el.text, lineHeight: 1.25 });
      return `<div style="${cssText({ ...boxCss(el.rect), overflow: 'hidden' })}"><table style="${css}">${rows}</table></div>`;
    }
    case 'icon': {
      const svg = assets.icons[el.name];
      return svg ? `<div style="${cssText({ ...boxCss(el.rect), color: el.color })}">${svg}</div>` : '';
    }
    default:
      return '';
  }
}

export function slideHtml(context: PlanContext, slide: Slide, index: number, assets: StaticAssets): string {
  const plan = planSlide(context, slide, index);
  const css = cssText({
    position: 'relative',
    width: `${plan.width}in`,
    height: `${plan.height}in`,
    overflow: 'hidden',
    ...fillCss(plan.background),
    opacity: 1,
  });
  return `<section class="slide" style="${css}">${plan.elements.map((el) => elementHtml(el, assets)).join('')}</section>`;
}

/** The whole deck as one printable HTML document (hidden slides left out). */
export function buildDeckPrintHtml(context: PlanContext & { title: string }, slides: Slide[], assets: StaticAssets): string {
  const width = slideWidth(context.size);
  const visible = slides.map((slide, index) => ({ slide, index })).filter(({ slide }) => !slide.hidden);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(context.title)}</title>
<style>
@page { size: ${width}in ${SLIDE_HEIGHT}in; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #ffffff; }
.slide { page-break-after: always; break-after: page; }
.slide:last-child { page-break-after: auto; break-after: auto; }
.slide p { margin: 0; }
@media screen { body { background: #d9d9df; } .slide { margin: 0 auto ${(0.25 * PX_PER_IN).toFixed(0)}px; box-shadow: 0 8px 30px -10px rgba(0,0,0,.35); } }
</style>
</head>
<body>
${visible.map(({ slide, index }) => slideHtml(context, slide, index, assets)).join('\n')}
</body>
</html>`;
}
