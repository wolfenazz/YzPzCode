import React, { memo, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prepareSvgForDisplay } from '../../utils/presentation/svgSafe';

interface SvgSlideProps {
  /** Sanitised slide SVG; empty while the slide is being drawn. */
  svg: string;
  width: number;
  canvas: { width: number; height: number };
  resolveHref: (href: string) => string;
  /** Shown while there is no SVG yet. */
  placeholder?: { title: string; busy: boolean; failed?: boolean };
  /** Click-to-edit: text and picture elements report their index. */
  interactive?: boolean;
  selectedText?: number | null;
  onText?: (index: number) => void;
  onImage?: (index: number) => void;
  onBackground?: () => void;
}

/** One designed slide, drawn from its SVG at `width` px. */
export const SvgSlide: React.FC<SvgSlideProps> = memo(function SvgSlide({ svg, width, canvas, resolveHref, placeholder, interactive, selectedText, onText, onImage, onBackground }) {
  const prefix = `s${useId().replace(/[^\w]/g, '')}`;
  const height = (width / canvas.width) * canvas.height;
  const host = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const markup = useMemo(() => (svg ? prepareSvgForDisplay(svg, { prefix, resolveHref, indexTargets: interactive }) : ''), [interactive, prefix, resolveHref, svg]);

  // A frame around the selected text, measured from the drawn element.
  useLayoutEffect(() => {
    if (!interactive || selectedText === null || selectedText === undefined || !host.current) {
      setHighlight(null);
      return;
    }
    const target = host.current.querySelector(`[data-ti="${selectedText}"]`);
    if (!target) {
      setHighlight(null);
      return;
    }
    const outer = host.current.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    setHighlight({ left: rect.left - outer.left - 6, top: rect.top - outer.top - 4, width: rect.width + 12, height: rect.height + 8 });
  }, [interactive, markup, selectedText, width]);

  if (!svg) {
    return (
      <div className="pd-slide pd-slide--empty" style={{ width, height }} data-busy={placeholder?.busy || undefined} data-failed={placeholder?.failed || undefined}>
        <span className="pd-slide__shimmer" aria-hidden="true" />
        {placeholder?.title && width > 220 && <span className="pd-slide__ghost-title">{placeholder.title}</span>}
      </div>
    );
  }

  const onClick = interactive ? (event: React.MouseEvent): void => {
    const target = event.target as Element;
    const text = target.closest('[data-ti]');
    if (text) {
      onText?.(Number(text.getAttribute('data-ti')));
      return;
    }
    const image = target.closest('[data-ii]');
    if (image) {
      onImage?.(Number(image.getAttribute('data-ii')));
      return;
    }
    onBackground?.();
  } : undefined;

  return (
    <div ref={host} className="pd-slide" data-interactive={interactive || undefined} style={{ width, height }} onClick={onClick}>
      <div className="pd-slide__svg" dangerouslySetInnerHTML={{ __html: markup }} />
      {highlight && <span className="pd-slide__highlight" style={highlight} aria-hidden="true" />}
    </div>
  );
});
