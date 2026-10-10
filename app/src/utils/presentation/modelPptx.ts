// Writes slide-model elements (`slideModel.ts`) as native PowerPoint shapes:
// text boxes with real paragraphs, runs and bullets, preset and custom
// geometry, cropped pictures, tables and groups. Used by the PPTX export for
// every element that carries its model, so an imported deck goes back out as
// the PowerPoint objects it came from. Dependency-free.

import type { Geometry } from './slideGeometry';
import type { LineStyle, Paint, Shadow, SlideElement, TableCell, TxBody, TxPara, TxRun } from './slideModel';

export interface ModelExportContext {
  /** EMU per slide px. */
  emuPerPx: number;
  /** px → EMU for positions (with the view origin). */
  x: (px: number) => number;
  y: (px: number) => number;
  nextId: () => number;
  /** Registers a picture and returns its relationship id, or null when it cannot be used. */
  picture: (href: string) => string | null;
  lang: string;
}

const xml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
const hex = (color: string): string => color.replace('#', '').toUpperCase().slice(0, 6).padEnd(6, '0');
const pct = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 100000);

function colorXml(color: string, alpha?: number): string {
  return `<a:srgbClr val="${hex(color)}">${alpha !== undefined && alpha < 1 ? `<a:alpha val="${pct(alpha)}"/>` : ''}</a:srgbClr>`;
}

function fillXml(paint: Paint, ctx: ModelExportContext): string {
  switch (paint.t) {
    case 'none': return '<a:noFill/>';
    case 'solid': return `<a:solidFill>${colorXml(paint.c, paint.a)}</a:solidFill>`;
    case 'grad': {
      const stops = paint.stops.map((stop) => `<a:gs pos="${pct(stop.o)}">${colorXml(stop.c, stop.a)}</a:gs>`).join('');
      const shade = paint.path ? `<a:path path="${paint.path}"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>` : `<a:lin ang="${Math.round(((((paint.ang ?? 0) % 360) + 360) % 360) * 60000)}" scaled="0"/>`;
      return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst>${shade}</a:gradFill>`;
    }
    case 'img': {
      const rId = ctx.picture(paint.href);
      if (!rId) return '<a:noFill/>';
      return `<a:blipFill rotWithShape="1"><a:blip r:embed="${rId}"/>${srcRect(paint.crop)}<a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
    }
    default: return '<a:noFill/>';
  }
}

function srcRect(crop?: [number, number, number, number]): string {
  if (!crop || !crop.some((value) => Math.abs(value) > 0.0001)) return '';
  const value = (n: number): number => Math.round(n * 100000);
  return `<a:srcRect l="${value(crop[0])}" t="${value(crop[1])}" r="${value(crop[2])}" b="${value(crop[3])}"/>`;
}

function lineXml(line: LineStyle | null, ctx: ModelExportContext): string {
  if (!line || line.c.t === 'none') return '<a:ln><a:noFill/></a:ln>';
  const paint: Paint = line.c.t === 'img' ? { t: 'none' } : line.c;
  const cap = line.cap ? ` cap="${line.cap}"` : '';
  const dash = line.dash ? `<a:prstDash val="${line.dash}"/>` : '';
  const join = line.join === 'round' ? '<a:round/>' : line.join === 'bevel' ? '<a:bevel/>' : line.join === 'miter' ? '<a:miter lim="800000"/>' : '';
  const end = (tagName: string, arrow: LineStyle['head']): string => (arrow ? `<a:${tagName} type="${arrow.type}" w="${arrow.w}" len="${arrow.len}"/>` : '');
  return `<a:ln w="${Math.round(line.w * ctx.emuPerPx)}"${cap}>${fillXml(paint, ctx)}${dash}${join}${end('headEnd', line.head)}${end('tailEnd', line.tail)}</a:ln>`;
}

function effectXml(shadow: Shadow | undefined, ctx: ModelExportContext): string {
  if (!shadow) return '';
  const dist = Math.hypot(shadow.dx, shadow.dy);
  const dir = ((Math.atan2(shadow.dy, shadow.dx) * 180) / Math.PI + 360) % 360;
  return `<a:effectLst><a:outerShdw blurRad="${Math.round(shadow.blur * ctx.emuPerPx)}" dist="${Math.round(dist * ctx.emuPerPx)}" dir="${Math.round(dir * 60000)}" algn="ctr" rotWithShape="0">${colorXml(shadow.c, shadow.a)}</a:outerShdw></a:effectLst>`;
}

function geometryXml(geom: Geometry | undefined): string {
  if (geom?.paths?.length) {
    const paths = geom.paths.map((path) => {
      const cmds = path.cmds.map(([op, ...n]) => {
        const p = (x: number, y: number): string => `<a:pt x="${Math.round(x)}" y="${Math.round(y)}"/>`;
        switch (op) {
          case 'M': return `<a:moveTo>${p(n[0], n[1])}</a:moveTo>`;
          case 'L': return `<a:lnTo>${p(n[0], n[1])}</a:lnTo>`;
          case 'C': return `<a:cubicBezTo>${p(n[0], n[1])}${p(n[2], n[3])}${p(n[4], n[5])}</a:cubicBezTo>`;
          case 'Q': return `<a:quadBezTo>${p(n[0], n[1])}${p(n[2], n[3])}</a:quadBezTo>`;
          case 'A': return `<a:arcTo wR="${Math.round(n[0])}" hR="${Math.round(n[1])}" stAng="${Math.round(n[2])}" swAng="${Math.round(n[3])}"/>`;
          case 'Z': return '<a:close/>';
          default: return '';
        }
      }).join('');
      const fill = path.fill === 'norm' ? '' : ` fill="${path.fill}"`;
      return `<a:path w="${Math.round(path.w)}" h="${Math.round(path.h)}"${fill}${path.stroke ? '' : ' stroke="0"'}>${cmds}</a:path>`;
    }).join('');
    return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${paths}</a:pathLst></a:custGeom>`;
  }
  const prst = geom?.prst ?? 'rect';
  const adjust = Object.entries(geom?.av ?? {}).map(([name, value]) => `<a:gd name="${xml(name)}" fmla="val ${Math.round(value)}"/>`).join('');
  return `<a:prstGeom prst="${xml(prst)}"><a:avLst>${adjust}</a:avLst></a:prstGeom>`;
}

function xfrmXml(el: SlideElement, ctx: ModelExportContext, group = false): string {
  const { x, y, w, h } = el.box;
  const rot = el.rot ? ` rot="${Math.round(el.rot * 60000)}"` : '';
  const flips = `${el.flipH ? ' flipH="1"' : ''}${el.flipV ? ' flipV="1"' : ''}`;
  const off = `<a:off x="${ctx.x(x)}" y="${ctx.y(y)}"/>`;
  const ext = `<a:ext cx="${Math.max(0, Math.round(w * ctx.emuPerPx))}" cy="${Math.max(0, Math.round(h * ctx.emuPerPx))}"/>`;
  return group ? `<a:xfrm${rot}${flips}>${off}${ext}<a:chOff x="${ctx.x(x)}" y="${ctx.y(y)}"/><a:chExt cx="${Math.max(0, Math.round(w * ctx.emuPerPx))}" cy="${Math.max(0, Math.round(h * ctx.emuPerPx))}"/></a:xfrm>` : `<a:xfrm${rot}${flips}>${off}${ext}</a:xfrm>`;
}

// Text --------------------------------------------------------------------------------------------

const sizeHundredths = (px: number, ctx: ModelExportContext): number => Math.max(100, Math.round((px * ctx.emuPerPx * 100) / 12700));
const spacingPts = (px: number, ctx: ModelExportContext): number => Math.round((px * ctx.emuPerPx * 100) / 12700);

function runProps(run: TxRun, ctx: ModelExportContext, tagName: 'a:rPr' | 'a:endParaRPr' = 'a:rPr'): string {
  const attributes = [`lang="${xml(ctx.lang)}"`, `sz="${sizeHundredths(run.sz, ctx)}"`, `b="${run.b ? 1 : 0}"`, `i="${run.i ? 1 : 0}"`];
  if (run.u) attributes.push('u="sng"');
  if (run.s) attributes.push('strike="sngStrike"');
  if (run.bl) attributes.push(`baseline="${Math.round(run.bl * 100000)}"`);
  if (run.sp) attributes.push(`spc="${spacingPts(run.sp, ctx)}"`);
  if (run.cap) attributes.push(`cap="${run.cap}"`);
  attributes.push('dirty="0"');
  const fill = run.c ? `<a:solidFill>${colorXml(run.c, run.a)}</a:solidFill>` : '<a:noFill/>';
  const font = xml(run.f || 'Calibri');
  return `<${tagName} ${attributes.join(' ')}>${fill}<a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/></${tagName}>`;
}

function paragraphXml(para: TxPara, ctx: ModelExportContext): string {
  const attributes: string[] = [];
  if (para.lv) attributes.push(`lvl="${para.lv}"`);
  if (para.ml !== undefined) attributes.push(`marL="${Math.round(para.ml * ctx.emuPerPx)}"`);
  if (para.ind !== undefined) attributes.push(`indent="${Math.round(para.ind * ctx.emuPerPx)}"`);
  attributes.push(`algn="${para.al === 'c' ? 'ctr' : para.al === 'r' ? 'r' : para.al === 'j' ? 'just' : 'l'}"`);
  let children = '';
  if (para.ls !== undefined) children += para.ls < 0 ? `<a:lnSpc><a:spcPts val="${spacingPts(-para.ls, ctx)}"/></a:lnSpc>` : `<a:lnSpc><a:spcPct val="${Math.round(para.ls * 100000)}"/></a:lnSpc>`;
  children += `<a:spcBef><a:spcPts val="${spacingPts(para.sb ?? 0, ctx)}"/></a:spcBef><a:spcAft><a:spcPts val="${spacingPts(para.sa ?? 0, ctx)}"/></a:spcAft>`;
  if (para.bu) {
    if (para.bu.c) children += `<a:buClr>${colorXml(para.bu.c)}</a:buClr>`;
    if (para.bu.sz && Math.abs(para.bu.sz - 1) > 0.01) children += `<a:buSzPct val="${Math.round(para.bu.sz * 100000)}"/>`;
    if (para.bu.f) children += `<a:buFont typeface="${xml(para.bu.f)}"/>`;
    children += para.bu.num ? `<a:buAutoNum type="${xml(para.bu.num)}"${para.bu.start && para.bu.start !== 1 ? ` startAt="${para.bu.start}"` : ''}/>` : `<a:buChar char="${xml(para.bu.ch ?? '•')}"/>`;
  } else children += '<a:buNone/>';
  const runs = para.r.map((run) => (run.t === '\n' ? `<a:br>${runProps(run, ctx)}</a:br>` : `<a:r>${runProps(run, ctx)}<a:t>${xml(run.t)}</a:t></a:r>`)).join('');
  const end = runProps({ t: '', sz: para.esz ?? para.r[0]?.sz ?? 18, f: para.ef ?? para.r[0]?.f ?? 'Calibri', c: para.ec ?? para.r[0]?.c }, ctx, 'a:endParaRPr');
  return `<a:p><a:pPr ${attributes.join(' ')}>${children}</a:pPr>${runs}${end}</a:p>`;
}

export function textBodyXml(body: TxBody, ctx: ModelExportContext, tagName = 'p:txBody'): string {
  const ins = body.ins.map((value) => Math.round(value * ctx.emuPerPx));
  const anchor = body.anc === 'ctr' ? 'ctr' : body.anc === 'b' ? 'b' : 't';
  const vert = body.vert ? ` vert="${body.vert}"` : '';
  const fit = body.fit === 'norm'
    ? `<a:normAutofit${body.fs && body.fs < 1 ? ` fontScale="${Math.round(body.fs * 100000)}"` : ''}${body.lr ? ` lnSpcReduction="${Math.round(body.lr * 100000)}"` : ''}/>`
    : body.fit === 'shape' ? '<a:spAutoFit/>' : '<a:noAutofit/>';
  const paragraphs = body.p.length ? body.p.map((para) => paragraphXml(para, ctx)).join('') : `<a:p><a:endParaRPr lang="${xml(ctx.lang)}" dirty="0"/></a:p>`;
  return `<${tagName}><a:bodyPr wrap="${body.wrap ? 'square' : 'none'}" lIns="${ins[0]}" tIns="${ins[1]}" rIns="${ins[2]}" bIns="${ins[3]}" anchor="${anchor}" rtlCol="0"${vert}>${fit}</a:bodyPr><a:lstStyle/>${paragraphs}</${tagName}>`;
}

// Tables ------------------------------------------------------------------------------------------

function cellXml(cell: TableCell, ctx: ModelExportContext): string {
  const attributes: string[] = [];
  if (cell.span && cell.span[0] > 1) attributes.push(`gridSpan="${cell.span[0]}"`);
  if (cell.span && cell.span[1] > 1) attributes.push(`rowSpan="${cell.span[1]}"`);
  const border = (tagName: string, line: LineStyle | null | undefined): string => {
    if (line === undefined) return '';
    const inner = lineXml(line, ctx).replace(/^<a:ln/, `<a:${tagName}`).replace(/<\/a:ln>$/, `</a:${tagName}>`);
    return inner;
  };
  const [l, t, r, b] = cell.tx.ins.map((value) => Math.round(value * ctx.emuPerPx));
  const anchor = cell.tx.anc === 'ctr' ? 'ctr' : cell.tx.anc === 'b' ? 'b' : 't';
  const pr = `<a:tcPr marL="${l}" marR="${r}" marT="${t}" marB="${b}" anchor="${anchor}">${border('lnL', cell.bl)}${border('lnR', cell.br)}${border('lnT', cell.bt)}${border('lnB', cell.bb)}${fillXml(cell.fill, ctx)}</a:tcPr>`;
  return `<a:tc${attributes.length ? ` ${attributes.join(' ')}` : ''}>${textBodyXml(cell.tx, ctx, 'a:txBody')}${pr}</a:tc>`;
}

/** Marks the cells covered by spans so PowerPoint reads the merges. */
function mergeFlags(rows: Array<{ cells: TableCell[] }>): Array<Array<'h' | 'v' | 'hv' | ''>> {
  const flags = rows.map((row) => row.cells.map(() => '' as 'h' | 'v' | 'hv' | ''));
  rows.forEach((row, r) => row.cells.forEach((cell, c) => {
    if (cell.merged || !cell.span) return;
    const [cs, rs] = cell.span;
    for (let dr = 0; dr < rs; dr += 1) {
      for (let dc = 0; dc < cs; dc += 1) {
        if (!dr && !dc) continue;
        if (flags[r + dr]?.[c + dc] !== undefined) flags[r + dr][c + dc] = dr && dc ? 'hv' : dr ? 'v' : 'h';
      }
    }
  }));
  return flags;
}

// Elements ------------------------------------------------------------------------------------------

export function elementXml(el: SlideElement, ctx: ModelExportContext): string {
  const id = ctx.nextId();
  const name = xml(el.name || `${el.k === 'pic' ? 'Picture' : el.k === 'table' ? 'Table' : el.k === 'group' ? 'Group' : 'Shape'} ${id}`);
  switch (el.k) {
    case 'shape': {
      const textBox = el.fill.t === 'none' && (!el.line || el.line.c.t === 'none') && el.tx ? ' txBox="1"' : '';
      const body = el.tx ? textBodyXml(el.tx, ctx) : '';
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr${textBox}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(el, ctx)}${geometryXml(el.geom)}${fillXml(el.fill, ctx)}${lineXml(el.line, ctx)}${effectXml(el.shadow, ctx)}</p:spPr>${body}</p:sp>`;
    }
    case 'pic': {
      const rId = el.href ? ctx.picture(el.href) : null;
      if (!rId) return '';
      const alpha = el.alpha !== undefined && el.alpha < 1 ? `<a:alphaModFix amt="${pct(el.alpha)}"/>` : '';
      const gray = el.gray ? '<a:grayscl/>' : '';
      return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}">${alpha}${gray}</a:blip>${srcRect(el.crop)}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(el, ctx)}${geometryXml(el.geom)}${el.line ? lineXml(el.line, ctx) : ''}${effectXml(el.shadow, ctx)}</p:spPr></p:pic>`;
    }
    case 'table': {
      const flags = mergeFlags(el.rows);
      const grid = el.cols.map((width) => `<a:gridCol w="${Math.round(width * ctx.emuPerPx)}"/>`).join('');
      const rows = el.rows.map((row, r) => `<a:tr h="${Math.round(row.h * ctx.emuPerPx)}">${row.cells.map((cell, c) => {
        const flag = flags[r][c];
        const xmlCell = cellXml(cell, ctx);
        if (!flag) return xmlCell;
        const attribute = flag === 'h' ? ' hMerge="1"' : flag === 'v' ? ' vMerge="1"' : ' hMerge="1" vMerge="1"';
        return xmlCell.replace(/^<a:tc/, `<a:tc${attribute}`);
      }).join('')}</a:tr>`).join('');
      const { x, y, w, h } = el.box;
      return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${ctx.x(x)}" y="${ctx.y(y)}"/><a:ext cx="${Math.round(w * ctx.emuPerPx)}" cy="${Math.round(h * ctx.emuPerPx)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    }
    case 'group': {
      const children = el.ch.map((child) => elementXml(child, ctx)).join('');
      if (!children) return '';
      return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${xfrmXml(el, ctx, true)}</p:grpSpPr>${children}</p:grpSp>`;
    }
    default: return '';
  }
}
