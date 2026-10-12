// Native Excel charts (DrawingML): reading them into the chart model and
// writing the model back as chart parts and drawing anchors.

import type { ChartData } from './charts';
import { CHART_COLORS } from './charts';
import type { ChartDef, ChartKind, ChartSeries } from './types';
import { attr, child, children, elements, escapeXml, localName, parseXml, relId, xmlText } from './xlsxXml';

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';

// ---- reading ----

const textRuns = (el: Element | null): string => {
  if (!el) return '';
  const out: string[] = [];
  const walk = (node: Element): void => {
    for (const c of elements(node)) {
      if (localName(c) === 't') out.push(c.textContent ?? '');
      else walk(c);
    }
  };
  walk(el);
  return out.join('');
};

const refOf = (el: Element | null): string | undefined => {
  if (!el) return undefined;
  const ref = child(child(el, 'strRef') ?? child(el, 'numRef') ?? child(el, 'multiLvlStrRef'), 'f');
  return ref?.textContent ?? undefined;
};

function seriesColor(ser: Element, theme: string[]): string | undefined {
  const fill = child(child(ser, 'spPr'), 'solidFill');
  if (fill) {
    const srgb = child(fill, 'srgbClr');
    if (srgb) return `#${(attr(srgb, 'val') ?? '000000').toUpperCase()}`;
    const scheme = child(fill, 'schemeClr');
    const val = attr(scheme, 'val');
    const map: Record<string, number> = { accent1: 4, accent2: 5, accent3: 6, accent4: 7, accent5: 8, accent6: 9, dk1: 1, lt1: 0, dk2: 3, lt2: 2 };
    if (val && map[val] !== undefined) return theme[map[val]];
  }
  const line = child(child(child(ser, 'spPr'), 'ln'), 'solidFill');
  const srgb = child(line, 'srgbClr');
  if (srgb) return `#${(attr(srgb, 'val') ?? '000000').toUpperCase()}`;
  return undefined;
}

export type ParsedChart = Omit<ChartDef, 'id' | 'from' | 'to'>;

export function readChartXml(xml: string, theme: string[]): ParsedChart | null {
  const root = parseXml(xml).documentElement;
  const chart = child(root, 'chart');
  const plot = child(chart, 'plotArea');
  if (!plot) return null;
  const typeEls = elements(plot).filter((el) => /Chart$/.test(localName(el)));
  if (typeEls.length === 0) return null;

  const series: ChartSeries[] = [];
  let kind: ChartKind = 'column';
  let stacked = false;
  let percent = false;
  let smooth = false;
  const kinds = new Set<string>();

  typeEls.forEach((typeEl, typeIndex) => {
    const name = localName(typeEl).replace(/3D$/, '');
    kinds.add(name);
    const grouping = attr(child(typeEl, 'grouping'), 'val');
    if (typeIndex === 0) {
      stacked = grouping === 'stacked' || grouping === 'percentStacked';
      percent = grouping === 'percentStacked';
      if (name === 'barChart') kind = attr(child(typeEl, 'barDir'), 'val') === 'bar' ? 'bar' : 'column';
      else if (name === 'lineChart') kind = 'line';
      else if (name === 'areaChart') kind = 'area';
      else if (name === 'pieChart') kind = 'pie';
      else if (name === 'doughnutChart') kind = 'doughnut';
      else if (name === 'scatterChart') kind = 'scatter';
    }
    for (const ser of children(typeEl, 'ser')) {
      const tx = child(ser, 'tx');
      const nameRef = refOf(tx);
      const literal = child(tx, 'v')?.textContent ?? undefined;
      const isScatter = name === 'scatterChart';
      const vals = refOf(child(ser, isScatter ? 'yVal' : 'val')) ?? '';
      const cats = refOf(child(ser, isScatter ? 'xVal' : 'cat'));
      if (!vals) continue;
      series.push({
        name: literal,
        nameRef,
        cats,
        vals,
        color: seriesColor(ser, theme),
        line: typeIndex > 0 && name === 'lineChart' ? true : undefined,
      });
      if (attr(child(ser, 'smooth'), 'val') === '1') smooth = true;
    }
  });
  if (series.length === 0) return null;
  if (kinds.size > 1 && (kinds.has('barChart') || kinds.has('areaChart')) && kinds.has('lineChart')) kind = 'combo';

  const legendEl = child(chart, 'legend');
  const legendPos = attr(child(legendEl, 'legendPos'), 'val');
  const legend = !legendEl ? 'none' : legendPos === 'b' ? 'bottom' : legendPos === 't' ? 'top' : legendPos === 'l' ? 'left' : 'right';
  const axes = elements(plot).filter((el) => /Ax$/.test(localName(el)));
  const catAxis = axes.find((el) => localName(el) === 'catAx' || (localName(el) === 'valAx' && ['b', 't'].includes(attr(child(el, 'axPos'), 'val') ?? '')));
  const valAxis = axes.find((el) => localName(el) === 'valAx' && ['l', 'r'].includes(attr(child(el, 'axPos'), 'val') ?? ''));
  const dataLabels = typeEls.some((el) => attr(child(child(el, 'dLbls'), 'showVal'), 'val') === '1' || children(el, 'ser').some((ser) => attr(child(child(ser, 'dLbls'), 'showVal'), 'val') === '1'));

  return {
    kind,
    title: textRuns(child(chart, 'title')) || undefined,
    series: series.map((entry, index) => ({ ...entry, color: entry.color ?? CHART_COLORS[index % CHART_COLORS.length] })),
    stacked: stacked && !percent ? true : undefined,
    percent: percent || undefined,
    legend,
    xTitle: catAxis ? textRuns(child(catAxis, 'title')) || undefined : undefined,
    yTitle: valAxis ? textRuns(child(valAxis, 'title')) || undefined : undefined,
    smooth: smooth || undefined,
    gridlines: true,
    dataLabels: dataLabels || undefined,
  };
}

export interface DrawingChartAnchor {
  /** Relationship id of the chart part. */
  rid: string;
  from: { col: number; row: number };
  to: { col: number; row: number };
  /** The anchor element's XML, so a drawing can be rebuilt without it. */
  element: Element;
}

/** Chart anchors in a drawing part, and the other anchors (pictures, shapes) left untouched. */
export function readDrawing(xml: string): { charts: DrawingChartAnchor[]; others: Element[]; root: Element } {
  const root = parseXml(xml).documentElement;
  const charts: DrawingChartAnchor[] = [];
  const others: Element[] = [];
  for (const anchor of elements(root)) {
    const name = localName(anchor);
    if (!/Anchor$/.test(name)) continue;
    const frame = child(anchor, 'graphicFrame');
    const graphicData = child(child(frame, 'graphic'), 'graphicData');
    const chartEl = child(graphicData, 'chart');
    const rid = relId(chartEl);
    if (chartEl && rid) {
      const from = child(anchor, 'from');
      const to = child(anchor, 'to');
      const pos = (el: Element | null, fallback: { col: number; row: number }): { col: number; row: number } => ({
        col: Number(child(el, 'col')?.textContent ?? fallback.col),
        row: Number(child(el, 'row')?.textContent ?? fallback.row),
      });
      const start = pos(from, { col: 0, row: 0 });
      charts.push({ rid, from: start, to: to ? pos(to, start) : { col: start.col + 8, row: start.row + 15 }, element: anchor });
    } else others.push(anchor);
  }
  return { charts, others, root };
}

// ---- writing ----

const numCache = (values: number[]): string =>
  `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;
const strCache = (values: string[]): string =>
  `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlText(v)}</c:v></c:pt>`).join('')}</c:strCache>`;

const solid = (hex: string): string => `<a:solidFill><a:srgbClr val="${hex.replace('#', '').toUpperCase()}"/></a:solidFill>`;

function textXml(tag: string, text: string, size = 1000, bold = false): string {
  return `<c:${tag}><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="${size}" b="${bold ? 1 : 0}"/></a:pPr><a:r><a:rPr lang="en-US" sz="${size}" b="${bold ? 1 : 0}"/><a:t>${xmlText(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:${tag}>`;
}

function serXml(chart: ChartDef, data: ChartData, index: number, asLine: boolean, kind: 'bar' | 'line' | 'area' | 'pie' | 'scatter'): string {
  const entry = chart.series[index];
  const resolved = data.series[index];
  const color = entry.color ?? CHART_COLORS[index % CHART_COLORS.length];
  const tx = entry.nameRef
    ? `<c:tx><c:strRef><c:f>${xmlText(entry.nameRef)}</c:f>${strCache([resolved.name])}</c:strRef></c:tx>`
    : `<c:tx><c:v>${xmlText(resolved.name)}</c:v></c:tx>`;
  const spPr = kind === 'line' || asLine
    ? `<c:spPr><a:ln w="28575" cap="rnd">${solid(color)}<a:round/></a:ln></c:spPr>`
    : kind === 'scatter'
      ? `<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>`
      : `<c:spPr>${solid(color)}</c:spPr>`;
  const marker = kind === 'line' || asLine
    ? `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${solid('#FFFFFF')}<a:ln w="19050">${solid(color)}</a:ln></c:spPr></c:marker>`
    : kind === 'scatter'
      ? `<c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>${solid(color)}</c:spPr></c:marker>`
      : '';
  const pointColors = kind === 'pie'
    ? resolved.values.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${solid(CHART_COLORS[i % CHART_COLORS.length])}</c:spPr></c:dPt>`).join('')
    : '';
  const labels = chart.dataLabels
    ? `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
    : '';
  const catRef = entry.cats
    ? `<c:cat><c:strRef><c:f>${xmlText(entry.cats)}</c:f>${strCache(data.categories)}</c:strRef></c:cat>`
    : `<c:cat><c:strLit><c:ptCount val="${data.categories.length}"/>${data.categories.map((c, i) => `<c:pt idx="${i}"><c:v>${xmlText(c)}</c:v></c:pt>`).join('')}</c:strLit></c:cat>`;
  const base = `<c:idx val="${index}"/><c:order val="${index}"/>${tx}${spPr}`;
  if (kind === 'scatter') {
    const xs = resolved.xs ?? resolved.values.map((_, i) => i + 1);
    const xRef = entry.cats ? `<c:xVal><c:numRef><c:f>${xmlText(entry.cats)}</c:f>${numCache(xs)}</c:numRef></c:xVal>` : `<c:xVal><c:numLit><c:ptCount val="${xs.length}"/>${xs.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numLit></c:xVal>`;
    return `<c:ser>${base}${marker}${xRef}<c:yVal><c:numRef><c:f>${xmlText(entry.vals)}</c:f>${numCache(resolved.values)}</c:numRef></c:yVal><c:smooth val="0"/></c:ser>`;
  }
  const val = `<c:val><c:numRef><c:f>${xmlText(entry.vals)}</c:f>${numCache(resolved.values)}</c:numRef></c:val>`;
  if (kind === 'bar') return `<c:ser>${base}<c:invertIfNegative val="0"/>${labels}${catRef}${val}</c:ser>`;
  if (kind === 'line') return `<c:ser>${base}${marker}${labels}${catRef}${val}<c:smooth val="${chart.smooth ? 1 : 0}"/></c:ser>`;
  if (kind === 'area') return `<c:ser>${base}${labels}${catRef}${val}</c:ser>`;
  return `<c:ser>${base}${pointColors}${labels}${catRef}${val}</c:ser>`;
}

/** The chart part (`xl/charts/chartN.xml`). */
export function chartPartXml(chart: ChartDef, data: ChartData): string {
  const catAxId = 50010;
  const valAxId = 50020;
  const grouping = chart.percent ? 'percentStacked' : chart.stacked ? 'stacked' : 'clustered';
  const lineGrouping = chart.percent ? 'percentStacked' : chart.stacked ? 'stacked' : 'standard';
  const axIds = `<c:axId val="${catAxId}"/><c:axId val="${valAxId}"/>`;
  const barSeries = (): string => chart.series.map((entry, i) => ({ entry, i })).filter(({ entry }) => !(chart.kind === 'combo' && entry.line)).map(({ i }) => serXml(chart, data, i, false, 'bar')).join('');
  const lineSeries = (all: boolean): string => chart.series.map((entry, i) => ({ entry, i })).filter(({ entry }) => all || entry.line).map(({ i }) => serXml(chart, data, i, true, 'line')).join('');

  let plot = '';
  let axes = '';
  const catTitle = chart.xTitle ? textXml('title', chart.xTitle) : '';
  const valTitle = chart.yTitle ? textXml('title', chart.yTitle) : '';
  const horizontal = chart.kind === 'bar';
  const standardAxes = (): string => `<c:catAx><c:axId val="${catAxId}"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/>${catTitle}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${valAxId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    + `<c:valAx><c:axId val="${valAxId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 't' : 'l'}"/>${chart.gridlines === false ? '' : '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>'}${valTitle}<c:numFmt formatCode="${chart.percent ? '0%' : 'General'}" sourceLinked="${chart.percent ? 0 : 1}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${catAxId}"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;

  switch (chart.kind) {
    case 'column':
    case 'bar':
      plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${barSeries()}<c:gapWidth val="80"/>${chart.stacked || chart.percent ? '<c:overlap val="100"/>' : ''}${axIds}</c:barChart>`;
      axes = standardAxes();
      break;
    case 'line':
      plot = `<c:lineChart><c:grouping val="${lineGrouping}"/><c:varyColors val="0"/>${lineSeries(true)}<c:marker val="1"/>${axIds}</c:lineChart>`;
      axes = standardAxes();
      break;
    case 'area':
      plot = `<c:areaChart><c:grouping val="${lineGrouping}"/><c:varyColors val="0"/>${chart.series.map((_, i) => serXml(chart, data, i, false, 'area')).join('')}${axIds}</c:areaChart>`;
      axes = standardAxes();
      break;
    case 'combo':
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${barSeries()}<c:gapWidth val="80"/>${axIds}</c:barChart><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lineSeries(false)}<c:marker val="1"/>${axIds}</c:lineChart>`;
      axes = standardAxes();
      break;
    case 'pie':
      plot = `<c:pieChart><c:varyColors val="1"/>${serXml(chart, data, 0, false, 'pie')}<c:firstSliceAng val="0"/></c:pieChart>`;
      break;
    case 'doughnut':
      plot = `<c:doughnutChart><c:varyColors val="1"/>${serXml(chart, data, 0, false, 'pie')}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
      break;
    case 'scatter':
      plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${chart.series.map((_, i) => serXml(chart, data, i, false, 'scatter')).join('')}${axIds}</c:scatterChart>`;
      axes = `<c:valAx><c:axId val="${catAxId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${catTitle}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${valAxId}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
        + `<c:valAx><c:axId val="${valAxId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/>${valTitle}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${catAxId}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
      break;
  }

  const legendPos = chart.legend === 'bottom' ? 'b' : chart.legend === 'top' ? 't' : chart.legend === 'left' ? 'l' : 'r';
  const showLegend = chart.legend !== 'none' && (chart.legend !== undefined || data.series.length > 1);
  const title = chart.title ? textXml('title', chart.title, 1400, true) : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${title}<c:autoTitleDeleted val="${chart.title ? 0 : 1}"/><c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${showLegend ? `<c:legend><c:legendPos val="${legendPos}"/><c:overlay val="0"/></c:legend>` : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
}

/** A drawing anchor that places chart part `rid` between two cells. */
export function chartAnchorXml(chart: ChartDef, rid: string, shapeId: number): string {
  const pos = (p: { col: number; row: number }): string => `<xdr:col>${p.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
  return `<xdr:twoCellAnchor><xdr:from>${pos(chart.from)}</xdr:from><xdr:to>${pos(chart.to)}</xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${shapeId}" name="${escapeXml(chart.title || `Chart ${shapeId - 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

export const DRAWING_ROOT_OPEN = `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:c="${NS_C}">`;

export { NS_XDR };
