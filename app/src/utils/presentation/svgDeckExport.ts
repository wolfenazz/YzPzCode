// Builds the .pptx for a designed deck. pptxgenjs writes the package (slide
// size, master, theme fonts, speaker notes); each slide's shapes come from
// `convertSvgSlide` and are put into its `<p:spTree>`, with their pictures
// added as media. "Picture" mode instead places one full-slide image per
// page, for a pixel-exact copy. Runs in the browser and in node (tests).

import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { designCanvas } from './designStyles';
import type { DesignSystem } from './designTypes';
import { convertSvgSlide, type PptxPicture, type TextMeasurer } from './svgPptx';
import type { DeckSize } from './types';

export interface DesignedPptxSlide {
  svg: string;
  notes: string;
  /** Kept in the file but skipped in the slideshow. */
  hidden?: boolean;
  /** Picture mode: the slide rendered to PNG. */
  png?: Uint8Array;
}

export interface DesignedPptxInput {
  title: string;
  size: DeckSize;
  system: DesignSystem;
  slides: DesignedPptxSlide[];
  mode: 'editable' | 'pictures';
  picture: (href: string) => PptxPicture | null;
  measure?: TextMeasurer;
  lang?: string;
}

export interface DesignedPptxResult {
  bytes: Uint8Array;
  warnings: string[];
}

const EMU_PER_INCH = 914400;
/** One SVG px is 1/96 in (9525 EMU), so 1280 px is PowerPoint's 13.333 in widescreen. */
const PX_PER_INCH = 96;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Theme colours from the deck palette, so PowerPoint's own pickers offer them. */
function patchTheme(theme: string, system: DesignSystem): string {
  const { palette, dark } = system;
  const roles: Record<string, string> = {
    dk1: dark ? palette.background : palette.text,
    lt1: dark ? palette.text : palette.background,
    dk2: dark ? palette.surface : palette.muted,
    lt2: dark ? palette.muted : palette.surface,
    accent1: palette.primary,
    accent2: palette.accent,
    accent3: palette.secondary,
    accent4: system.chartColors[3] ?? palette.muted,
    accent5: system.chartColors[4] ?? palette.secondary,
    accent6: system.chartColors[5] ?? palette.primary,
  };
  let out = theme;
  for (const [role, hex] of Object.entries(roles)) {
    out = out.replace(new RegExp(`<a:${role}>[\\s\\S]*?</a:${role}>`), `<a:${role}><a:srgbClr val="${hex.slice(1)}"/></a:${role}>`);
  }
  return out.replace(/<a:clrScheme name="[^"]*">/, `<a:clrScheme name="${system.name.replace(/[<>&"]/g, '')}">`);
}

export async function buildDesignedPptx(input: DesignedPptxInput): Promise<DesignedPptxResult> {
  const canvas = designCanvas(input.size);
  const widthIn = canvas.width / PX_PER_INCH;
  const heightIn = canvas.height / PX_PER_INCH;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'YZPZ', width: widthIn, height: heightIn });
  pptx.layout = 'YZPZ';
  pptx.title = input.title;
  pptx.theme = { headFontFace: input.system.fonts.heading, bodyFontFace: input.system.fonts.body };
  for (const slide of input.slides) {
    const page = pptx.addSlide();
    if (slide.notes.trim()) page.addNotes(slide.notes);
    if (input.mode === 'pictures' && slide.png) {
      page.addImage({ data: `data:image/png;base64,${toBase64(slide.png)}`, x: 0, y: 0, w: widthIn, h: heightIn });
    }
  }
  const written = await pptx.write({ outputType: 'uint8array' }) as Uint8Array;
  const warnings = new Set<string>();
  const zip = await JSZip.loadAsync(written);
  const themePath = 'ppt/theme/theme1.xml';
  const theme = await zip.file(themePath)?.async('string');
  if (theme) zip.file(themePath, patchTheme(theme, input.system));

  for (const [index, slide] of input.slides.entries()) {
    if (!slide.hidden) continue;
    const path = `ppt/slides/slide${index + 1}.xml`;
    const xml = await zip.file(path)?.async('string');
    if (xml) zip.file(path, xml.replace(/<p:sld\b(?![^>]*\sshow=)/, '<p:sld show="0"'));
  }

  if (input.mode === 'editable') {
    const slideWidthEmu = Math.round(widthIn * EMU_PER_INCH);
    const slideHeightEmu = Math.round(heightIn * EMU_PER_INCH);
    for (const [index, slide] of input.slides.entries()) {
      if (!slide.svg) continue;
      const number = index + 1;
      const slidePath = `ppt/slides/slide${number}.xml`;
      const relsPath = `ppt/slides/_rels/slide${number}.xml.rels`;
      const slideXml = await zip.file(slidePath)?.async('string');
      const relsXml = await zip.file(relsPath)?.async('string');
      if (!slideXml || !relsXml) continue;
      let converted;
      try {
        converted = convertSvgSlide(slide.svg, {
          slideWidthEmu,
          slideHeightEmu,
          picture: input.picture,
          measure: input.measure,
          lang: input.lang,
          relPrefix: 'rIdYz',
        });
      } catch (error) {
        warnings.add(`Slide ${number} could not be converted: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      converted.warnings.forEach((warning) => warnings.add(`Slide ${number}: ${warning}`));
      let next = slideXml.replace(/(<\/p:grpSpPr>)([\s\S]*?)(<\/p:spTree>)/, (_match, open: string, _shapes: string, close: string) => `${open}${converted.shapes}${close}`);
      if (converted.background) {
        next = next.replace(/<p:bg>[\s\S]*?<\/p:bg>/, '').replace(/(<p:cSld\b[^>]*>)/, `$1${converted.background}`);
      }
      zip.file(slidePath, next);
      if (converted.media.length > 0) {
        const rels = converted.media.map(({ rId, picture }, mediaIndex) => {
          const name = `yz-slide${number}-${mediaIndex + 1}.${picture.ext}`;
          zip.file(`ppt/media/${name}`, picture.data);
          return `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/>`;
        }).join('');
        zip.file(relsPath, relsXml.replace('</Relationships>', `${rels}</Relationships>`));
      }
    }
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, warnings: [...warnings] };
}
