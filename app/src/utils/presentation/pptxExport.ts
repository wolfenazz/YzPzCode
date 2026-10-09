// Writes a deck as a native PowerPoint file with pptxgenjs, from the same
// render plan as the in-app renderer: real text boxes and bullets (autofit
// off: the design check already fitted the text), native editable charts and
// tables, embedded images, icons as PNG and speaker notes.

import type PptxGenJS from 'pptxgenjs';
import {
  gradientPng,
  iconNames,
  iconPng,
  imageSize,
  imageSources,
  loadIconSvgs,
  loadImageDataUrls,
  toPowerPointImage,
  writeFileBytes,
  base64ToBytes,
} from './assets';
import { bulletIndent, planSlide, type El, type Fill, type PlanContext, type RenderPara } from './render';
import type { YzDeck } from './types';

type PptxSlide = PptxGenJS.Slide;

/** CSS colour (#hex or rgba) → pptxgenjs colour + transparency. */
export function pptxColor(css: string): { color: string; transparency?: number } {
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(css.trim());
  if (rgba) {
    const hex = [rgba[1], rgba[2], rgba[3]].map((value) => Number(value).toString(16).padStart(2, '0')).join('');
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return alpha < 1 ? { color: hex.toUpperCase(), transparency: Math.round((1 - alpha) * 100) } : { color: hex.toUpperCase() };
  }
  const hex = css.replace('#', '').trim();
  return { color: (hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex).toUpperCase() };
}

const dataForPptx = (dataUrl: string): string => dataUrl.replace(/^data:/, '');

interface ExportAssets {
  images: Record<string, string>;
  icons: Record<string, string>;
}

function textRuns(el: Extract<El, { kind: 'text' }>): PptxGenJS.TextProps[] {
  const out: PptxGenJS.TextProps[] = [];
  el.paras.forEach((para: RenderPara, paraIndex) => {
    const size = para.size ?? el.style.size;
    const last = paraIndex === el.paras.length - 1;
    const paragraph: PptxGenJS.TextPropsOptions = {
      lineSpacing: Math.round(size * el.style.lineHeight * 10) / 10,
      paraSpaceAfter: last ? 0 : el.style.spaceAfter,
      align: el.style.align,
    };
    if (el.list) {
      const level = para.level ?? 0;
      paragraph.bullet = el.list === 'number' && !level
        ? { type: 'number', indent: bulletIndent(el.style, 0) }
        : { characterCode: level ? '2013' : '2022', indent: bulletIndent(el.style, 0) };
      if (level) paragraph.indentLevel = level;
    }
    const runs = para.runs.length > 0 ? para.runs : [{ text: '' }];
    runs.forEach((run, runIndex) => {
      const color = run.color ?? para.color;
      const text = el.style.uppercase ? run.text.toUpperCase() : run.text;
      out.push({
        text,
        options: {
          ...paragraph,
          fontSize: size,
          ...(para.font ? { fontFace: para.font } : {}),
          ...(run.bold || para.bold ? { bold: true } : {}),
          ...(run.italic ? { italic: true } : {}),
          ...(color ? pptxColor(color) : {}),
          ...(runIndex === runs.length - 1 && !last ? { breakLine: true } : {}),
        },
      });
    });
  });
  return out;
}

function addFillShape(pptx: PptxGenJS, slide: PptxSlide, el: Extract<El, { kind: 'shape' }>): void {
  const { x, y, w, h } = el.rect;
  if ('gradient' in el.fill) {
    slide.addImage({ data: dataForPptx(gradientPng(el.fill, w, h)), x, y, w, h });
    return;
  }
  const color = pptxColor(el.fill.color);
  const transparency = el.fill.opacity !== undefined && el.fill.opacity < 1 ? Math.round((1 - el.fill.opacity) * 100) : color.transparency;
  const fill = { color: color.color, ...(transparency ? { transparency } : {}) };
  if (el.shape === 'ellipse') {
    slide.addShape(pptx.ShapeType.ellipse, { x, y, w, h, fill, line: { type: 'none' } });
  } else if (el.shape === 'corner') {
    // A right triangle turned so its right angle sits in the top-right corner.
    slide.addShape(pptx.ShapeType.rtTriangle, { x, y, w, h, fill, line: { type: 'none' }, rotate: 180 });
  } else if (el.radius) {
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill, line: { type: 'none' }, rectRadius: Math.min(0.5, el.radius / Math.min(w, h)) });
  } else {
    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill, line: { type: 'none' } });
  }
}

function addChart(pptx: PptxGenJS, slide: PptxSlide, el: Extract<El, { kind: 'chart' }>): void {
  const { block } = el;
  const colors = el.colors.map((color) => pptxColor(color).color);
  const pie = block.kind === 'pie' || block.kind === 'donut';
  const series = (pie ? block.series.slice(0, 1) : block.series).map((entry) => ({ name: entry.name, labels: block.categories, values: entry.values }));
  const type = pie ? (block.kind === 'donut' ? pptx.ChartType.doughnut : pptx.ChartType.pie) : block.kind === 'line' ? pptx.ChartType.line : pptx.ChartType.bar;
  const text = pptxColor(el.text).color;
  const muted = pptxColor(el.muted).color;
  const grid = pptxColor(el.grid).color;
  const options: PptxGenJS.IChartOpts = {
    x: el.rect.x,
    y: el.rect.y,
    w: el.rect.w,
    h: el.rect.h,
    chartColors: colors,
    showLegend: pie || series.length > 1,
    legendPos: pie ? 'r' : 't',
    legendFontFace: el.font,
    legendFontSize: el.size,
    legendColor: text,
    showTitle: false,
  };
  if (pie) {
    Object.assign(options, {
      showPercent: true,
      showValue: false,
      dataLabelColor: 'FFFFFF',
      dataLabelFontSize: el.size,
      dataLabelFontFace: el.font,
      ...(block.kind === 'donut' ? { holeSize: 56 } : {}),
    });
  } else {
    Object.assign(options, {
      barDir: block.kind === 'bar' ? 'bar' : 'col',
      barGapWidthPct: 47,
      catAxisLabelColor: block.kind === 'bar' ? text : muted,
      catAxisLabelFontFace: el.font,
      catAxisLabelFontSize: el.size,
      valAxisLabelColor: muted,
      valAxisLabelFontFace: el.font,
      valAxisLabelFontSize: el.size,
      valGridLine: { color: grid, size: 1 },
      catGridLine: { style: 'none' },
      valAxisLineShow: false,
      catAxisLineShow: true,
      showValue: series.length === 1 && block.kind !== 'line' && block.categories.length <= 8,
      dataLabelColor: text,
      dataLabelFontSize: el.size,
      dataLabelFontFace: el.font,
      dataLabelFontBold: true,
      dataLabelPosition: 'outEnd',
      lineSize: 3,
      lineDataSymbol: 'circle',
      lineDataSymbolSize: 7,
      ...(block.unit ? { valAxisTitle: block.unit, showValAxisTitle: true, valAxisTitleColor: muted, valAxisTitleFontSize: el.size } : {}),
    });
  }
  slide.addChart(type, series, options);
}

function addTable(slide: PptxSlide, el: Extract<El, { kind: 'table' }>): void {
  const { block } = el;
  const text = pptxColor(el.text).color;
  const border = { type: 'solid' as const, pt: 0.75, color: pptxColor(el.border).color };
  const rows: PptxGenJS.TableRow[] = block.rows.map((row, rowIndex) => {
    const head = block.header && rowIndex === 0;
    return row.map((cell) => ({
      text: cell,
      options: head
        ? { bold: true, color: pptxColor(el.headerText).color, fill: { color: pptxColor(el.headerFill).color } }
        : rowIndex % 2 === 0 ? { color: text, fill: { color: pptxColor(el.stripe).color } } : { color: text },
    }));
  });
  slide.addTable(rows, {
    x: el.rect.x,
    y: el.rect.y,
    w: el.rect.w,
    fontFace: el.font,
    fontSize: el.size,
    color: text,
    valign: 'middle',
    margin: [0.07, 0.12, 0.07, 0.12],
    border: [{ type: 'none' }, { type: 'none' }, border, { type: 'none' }],
    autoPage: false,
  });
}

async function addImage(slide: PptxSlide, el: Extract<El, { kind: 'image' }>, assets: ExportAssets): Promise<void> {
  const raw = assets.images[el.src];
  if (!raw) return;
  const data = await toPowerPointImage(raw);
  const { width, height } = await imageSize(data);
  // pptxgenjs crops for "cover" from the image's own proportions, given as w/h.
  const ratio = width / height;
  const boxRatio = el.rect.w / el.rect.h;
  const fitW = el.fit === 'cover' ? (ratio > boxRatio ? el.rect.h * ratio : el.rect.w) : (ratio > boxRatio ? el.rect.w : el.rect.h * ratio);
  const fitH = fitW / ratio;
  slide.addImage({
    data: dataForPptx(data),
    x: el.rect.x,
    y: el.rect.y,
    w: fitW,
    h: fitH,
    sizing: { type: el.fit, w: el.rect.w, h: el.rect.h },
    altText: el.alt,
  });
}

/** Builds the .pptx; returns its bytes. */
export async function buildPptx(deck: YzDeck, deckDir: string): Promise<Uint8Array> {
  const { default: PptxGenJSClass } = await import('pptxgenjs');
  const pptx = new PptxGenJSClass();
  pptx.layout = deck.size === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_WIDE';
  pptx.title = deck.meta.title;
  pptx.subject = deck.brief.topic.slice(0, 200);
  pptx.company = '';
  pptx.theme = { headFontFace: deck.theme.headingFont, bodyFontFace: deck.theme.bodyFont };

  const [images, iconSvgs] = await Promise.all([
    loadImageDataUrls(imageSources(deck.slides), deckDir),
    loadIconSvgs(iconNames(deck.slides)),
  ]);
  const assets: ExportAssets = { images, icons: iconSvgs };
  const context: PlanContext = { theme: deck.theme, size: deck.size, showNumbers: deck.showNumbers };

  for (const [index, source] of deck.slides.entries()) {
    const plan = planSlide(context, source, index);
    const slide = pptx.addSlide();
    if (source.hidden) slide.hidden = true;
    slide.background = 'gradient' in plan.background
      ? { data: dataForPptx(gradientPng(plan.background as Extract<Fill, { gradient: unknown }>, plan.width, plan.height)) }
      : pptxColor(plan.background.color);

    for (const el of plan.elements) {
      switch (el.kind) {
        case 'shape':
          addFillShape(pptx, slide, el);
          break;
        case 'placeholder':
          slide.addShape(pptx.ShapeType.rect, { ...el.rect, fill: pptxColor(el.background), line: { type: 'none' } });
          break;
        case 'text': {
          if (el.paras.length === 0 || el.paras.every((item) => item.runs.every((run) => !run.text.trim()))) break;
          const color = pptxColor(el.style.color);
          slide.addText(textRuns(el), {
            ...el.rect,
            fontFace: el.style.font,
            fontSize: el.style.size,
            color: color.color,
            ...(color.transparency ? { transparency: color.transparency } : {}),
            bold: el.style.bold,
            italic: el.style.italic,
            align: el.style.align,
            valign: el.valign,
            margin: 0,
            fit: 'none',
            wrap: true,
            isTextBox: true,
            ...(el.style.letterSpacing ? { charSpacing: el.style.letterSpacing } : {}),
          });
          break;
        }
        case 'image':
          await addImage(slide, el, assets).catch((error: unknown) => console.warn('Could not embed image:', error));
          break;
        case 'chart':
          addChart(pptx, slide, el);
          break;
        case 'table':
          addTable(slide, el);
          break;
        case 'icon': {
          const svg = assets.icons[el.name];
          if (!svg) break;
          const png = await iconPng(svg, el.color).catch(() => null);
          if (png) slide.addImage({ data: dataForPptx(png), ...el.rect });
          break;
        }
        default:
          break;
      }
    }
    if (source.notes.trim()) slide.addNotes(source.notes);
  }

  const base64 = await pptx.write({ outputType: 'base64' }) as string;
  return base64ToBytes(base64);
}

export async function exportPptx(deck: YzDeck, deckDir: string, outputPath: string): Promise<void> {
  await writeFileBytes(outputPath, await buildPptx(deck, deckDir));
}
