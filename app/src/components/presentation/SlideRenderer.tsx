import React, { memo, useCallback, useLayoutEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { ImageSquare } from '@phosphor-icons/react';
import { chartSvg } from '../../utils/presentation/chartSvg';
import { layoutSlots, PX_PER_IN } from '../../utils/presentation/layouts';
import {
  boxCss,
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
} from '../../utils/presentation/render';
import { fontStack } from '../../utils/presentation/themes';
import type { RichPara, Slide } from '../../utils/presentation/types';
import { RichTextEditor } from './RichTextEditor';

export interface SlideRendererProps {
  context: PlanContext;
  slide: Slide;
  index: number;
  /** Rendered width in CSS pixels; the slide scales to fit. */
  width: number;
  /** Image src → URL the webview can load. */
  resolveImage: (src: string) => string;
  /** Show slot hit boxes and placeholders, and allow editing. */
  interactive?: boolean;
  selectedSlot?: string | null;
  editingSlot?: string | null;
  warnings?: string[];
  onSlotPointer?: (slot: string, event: React.MouseEvent) => void;
  onCommitText?: (slot: string, items: RichPara[]) => void;
  onEndEdit?: () => void;
  /** Reports slots whose text does not fit (measured after layout). */
  onMeasure?: (slideId: string, overflowing: string[]) => void;
  className?: string;
}

type CssProps = React.CSSProperties;
const css = (value: Record<string, string | number>): CssProps => value as CssProps;

function TextElement({ el }: { el: Extract<El, { kind: 'text' }> }): React.JSX.Element {
  const numbers = listNumbers(el.paras);
  return (
    <div style={css(textBoxCss(el))} data-slot={el.slot} data-measure={el.slot && el.editable ? 'text' : undefined}>
      <div>
        {el.paras.map((item, index) => (
          <p key={index} style={css(paraCss(el, item, index === el.paras.length - 1))}>
            {el.list && <span style={css(markerCss(el, item))} aria-hidden="true">{markerText(el, numbers[index], item)}</span>}
            {item.runs.map((run, runIndex) => (
              <span key={runIndex} style={css(runCss(run))}>{run.text}</span>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}

function ElementView({ el, resolveImage, interactive }: { el: El; resolveImage: (src: string) => string; interactive: boolean }): React.JSX.Element | null {
  switch (el.kind) {
    case 'shape':
      return <div style={css(shapeCss(el))} />;
    case 'text':
      return el.paras.length > 0 ? <TextElement el={el} /> : null;
    case 'image':
      return <img src={resolveImage(el.src)} alt={el.alt} draggable={false} style={{ ...css(boxCss(el.rect)), objectFit: el.fit, display: 'block' }} />;
    case 'placeholder':
      return (
        <div className="pr-placeholder" style={{ ...css(boxCss(el.rect)), background: el.background, color: el.color }}>
          {interactive && (
            <span className="pr-placeholder__label">
              <ImageSquare size={28} weight="light" />
              <span>{el.label}</span>
            </span>
          )}
        </div>
      );
    case 'chart':
      return <div style={css(boxCss(el.rect))} dangerouslySetInnerHTML={{ __html: chartSvg(el) }} />;
    case 'table': {
      const { block } = el;
      return (
        <div style={{ ...css(boxCss(el.rect)), overflow: 'hidden' }} data-slot={el.slot} data-measure="table">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fontStack(el.font), fontSize: `${el.size}pt`, color: el.text, lineHeight: 1.25 }}>
            <tbody>
              {block.rows.map((row, rowIndex) => {
                const head = block.header && rowIndex === 0;
                return (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => {
                      const style: CssProps = {
                        padding: '0.07in 0.12in',
                        borderBottom: `1px solid ${el.border}`,
                        textAlign: 'left',
                        verticalAlign: 'middle',
                        ...(head ? { background: el.headerFill, color: el.headerText, fontWeight: 700 } : rowIndex % 2 === 0 ? { background: el.stripe } : {}),
                      };
                      return head ? <th key={cellIndex} style={style}>{cell}</th> : <td key={cellIndex} style={style}>{cell}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    case 'icon':
      return (
        <div style={{ ...css(boxCss(el.rect)), color: el.color }}>
          <Icon icon={el.name} width="100%" height="100%" />
        </div>
      );
    default:
      return null;
  }
}

/** A slide drawn from the shared render plan, at any size. */
export const SlideRenderer = memo(function SlideRenderer({
  context,
  slide,
  index,
  width,
  resolveImage,
  interactive = false,
  selectedSlot,
  editingSlot,
  warnings,
  onSlotPointer,
  onCommitText,
  onEndEdit,
  onMeasure,
  className,
}: SlideRendererProps): React.JSX.Element {
  const plan = planSlide(context, slide, index);
  const scale = width / (plan.width * PX_PER_IN);
  const stageRef = useRef<HTMLDivElement>(null);

  // Design check: which text slots overflow their box at this content.
  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !onMeasure) return;
    const overflowing = new Set<string>();
    let measurable = false;
    stage.querySelectorAll<HTMLElement>('[data-measure]').forEach((box) => {
      if (box.clientHeight === 0) return;
      measurable = true;
      const inner = box.firstElementChild as HTMLElement | null;
      const height = inner ? Math.max(inner.scrollHeight, inner.offsetHeight) : box.scrollHeight;
      if (height > box.clientHeight + 2 || box.scrollWidth > box.clientWidth + 2) overflowing.add(box.dataset.slot ?? '');
    });
    if (measurable) onMeasure(slide.id, [...overflowing].filter(Boolean));
  }, [onMeasure, slide.id]);

  useLayoutEffect(() => {
    measure();
    if (!onMeasure || typeof document === 'undefined' || !document.fonts) return;
    let alive = true;
    void document.fonts.ready.then(() => { if (alive) measure(); });
    return () => { alive = false; };
  }, [measure, onMeasure, plan]);

  const slots = interactive ? layoutSlots(slide.layout, context.size) : [];
  const editingEl = editingSlot
    ? plan.elements.find((el): el is Extract<El, { kind: 'text' }> => el.kind === 'text' && el.slot === editingSlot && Boolean(el.editable))
    : undefined;

  return (
    <div className={`pr-slide${className ? ` ${className}` : ''}`} style={{ width, height: plan.height * PX_PER_IN * scale }}>
      <div
        ref={stageRef}
        className="pr-slide__stage"
        style={{
          width: `${plan.width}in`,
          height: `${plan.height}in`,
          transform: `scale(${scale})`,
          ...css(fillCss(plan.background)),
          opacity: 1,
        }}
      >
        {plan.elements.map((el, elIndex) => (
          editingEl === el ? null : <ElementView key={elIndex} el={el} resolveImage={resolveImage} interactive={interactive} />
        ))}
        {editingEl && onCommitText && (
          <RichTextEditor
            key={`${slide.id}:${editingEl.slot}`}
            el={editingEl}
            onCommit={(items) => onCommitText(editingEl.slot!, items)}
            onDone={() => onEndEdit?.()}
          />
        )}
        {slots.map((slot) => {
          if (slot.name === editingSlot) return null;
          const empty = !slide.slots[slot.name];
          const warned = warnings?.includes(slot.name);
          return (
            <div
              key={slot.name}
              className="pr-hit"
              data-selected={selectedSlot === slot.name || undefined}
              data-empty={empty || undefined}
              data-warning={warned || undefined}
              style={css(boxCss(slot.rect))}
              onMouseDown={(event) => onSlotPointer?.(slot.name, event)}
              title={slot.label}
            >
              {empty && !slot.accepts.includes('image') && <span className="pr-hit__hint" style={{ fontSize: `${Math.min(28, Math.max(14, slot.rect.h * 18))}pt` }}>{slot.label}</span>}
              <span className="pr-hit__tag">{slot.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
