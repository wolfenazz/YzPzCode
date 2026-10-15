import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CaretLeft, CaretRight, Cursor, X } from '@phosphor-icons/react';
import { useDesignStore } from '../../stores/designStore';
import { bundledFontFaceCss } from '../../utils/bundledFonts';
import { resolveGoto } from '../../utils/design/flow';
import { applySvgTweaks } from '../../utils/design/svgTweaks';
import { rootAttributes } from '../../utils/design/tweaks';
import { joinPath } from '../../utils/design/project';
import type { Board, DesignProject } from '../../utils/design/types';
import { localFileUrl } from '../../utils/mediaFiles';
import { SvgSlide } from '../presentation/SvgSlide';
import { boardDocument } from './HtmlBoard';

interface DesignPreviewProps {
  project: DesignProject;
  projectDir: string;
  startId: string | null;
  onClose: () => void;
}

const LINK_STYLE = '[data-goto]{outline:2px dashed #2563eb;outline-offset:3px;cursor:pointer}';

/** Full-screen preview: one board at a time in its device, links between screens work. */
export const DesignPreview: React.FC<DesignPreviewProps> = ({ project, projectDir, startId, onClose }) => {
  const boards = useMemo(() => project.boards.filter((entry) => !entry.hidden && entry.source), [project.boards]);
  const [currentId, setCurrentId] = useState<string | null>(startId && boards.some((entry) => entry.id === startId) ? startId : boards[0]?.id ?? null);
  const [trail, setTrail] = useState<string[]>([]);
  const [showLinks, setShowLinks] = useState(false);
  const [feed, setFeed] = useState(false);
  const [fontCss, setFontCss] = useState('');
  const [area, setArea] = useState({ width: 1000, height: 640 });
  const transition = useDesignStore((state) => state.previewTransition);
  const setPreference = useDesignStore((state) => state.setPreference);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const board: Board | undefined = boards.find((entry) => entry.id === currentId) ?? boards[0];

  const families = `${project.system.fonts.heading}|${project.system.fonts.body}`;
  useEffect(() => {
    let alive = true;
    bundledFontFaceCss(families.split('|')).then((css) => { if (alive) setFontCss(css); }).catch(() => undefined);
    return () => { alive = false; };
  }, [families]);

  useEffect(() => {
    const element = stage.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) setArea({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const go = useCallback((id: string, remember = true): void => {
    setCurrentId((current) => {
      if (remember && current && current !== id) setTrail((steps) => [...steps, current]);
      return id;
    });
  }, []);

  const back = useCallback((): void => {
    setTrail((steps) => {
      if (steps.length === 0) return steps;
      setCurrentId(steps[steps.length - 1]);
      return steps.slice(0, -1);
    });
  }, []);

  const step = useCallback((delta: number): void => {
    const at = boards.findIndex((entry) => entry.id === currentId);
    const next = boards[at + delta];
    if (next) go(next.id, false);
  }, [boards, currentId, go]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === 'escape') onClose();
      else if (key === 'arrowright' || key === 'pagedown') step(1);
      else if (key === 'arrowleft' || key === 'pageup') step(-1);
      else if (key === 'backspace') back();
      else if (key === 'l') setShowLinks((value) => !value);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [back, onClose, step]);

  const isHtml = board?.format === 'html';
  const doc = useMemo(() => (board && board.format === 'html'
    ? boardDocument(board.source, project.system, board.width, projectDir, fontCss, board.theme, false, rootAttributes(board.tweaks, board.tweakValues), project.kind === 'graphic' ? board.height : 0)
    : null), [board, fontCss, project.system, projectDir]);

  // Clicks inside the page: a link goes to its board, nothing else navigates.
  const onFrameLoad = (): void => {
    const document = frame.current?.contentDocument;
    if (!document || !board) return;
    const style = document.createElement('style');
    style.id = 'yz-links';
    style.textContent = showLinks ? LINK_STYLE : '[data-goto]{cursor:pointer}';
    document.head.appendChild(style);
    document.addEventListener('click', (event) => {
      const target = event.target as Element | null;
      const link = target?.closest?.('[data-goto]');
      const anchor = target?.closest?.('a');
      if (anchor) event.preventDefault();
      if (!link) return;
      event.preventDefault();
      const next = resolveGoto(project.boards, link.getAttribute('data-goto') ?? '', board.id);
      if (next && next.source) go(next.id);
    });
  };

  useEffect(() => {
    const style = frame.current?.contentDocument?.getElementById('yz-links');
    if (style) style.textContent = showLinks ? LINK_STYLE : '[data-goto]{cursor:pointer}';
  }, [showLinks]);

  if (!board) return null;

  const viewportHeight = project.kind === 'web' ? Math.round(board.width * 0.625) : board.height;
  const phone = project.kind === 'app' && board.frame !== 'browser';
  const padding = phone ? 56 : 24;
  const scale = Math.min((area.width - 32 - padding) / board.width, (area.height - 32 - padding) / (isHtml ? viewportHeight : board.height), 1.6);
  const shownWidth = Math.round(board.width * scale);
  const shownHeight = Math.round((isHtml ? viewportHeight : board.height) * scale);
  const at = boards.findIndex((entry) => entry.id === board.id);
  const resolveHref = (href: string): string => (/^(?:data:|#|https?:|blob:)/i.test(href) ? href : localFileUrl(joinPath(projectDir, href)));

  return createPortal(
    <div className="dz-pv" role="dialog" aria-modal="true" aria-label="Preview">
      <header className="dz-pv__bar">
        <button type="button" className="dz-btn dz-btn--ghost" disabled={trail.length === 0} onClick={back}><ArrowLeft size={14} /> Back</button>
        <div className="dz-pv__title" dir="auto">{board.name}<span>{at + 1} / {boards.length}</span></div>
        <div className="dz-pv__actions">
          <select className="dz-select" aria-label="Transition" value={transition} onChange={(event) => setPreference('previewTransition', event.target.value as 'fade' | 'slide' | 'none')}>
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="none">No transition</option>
          </select>
          {isHtml && <button type="button" className="dz-btn dz-btn--ghost" aria-pressed={showLinks} title="Outline what is clickable (L)" onClick={() => setShowLinks((value) => !value)}><Cursor size={14} /> Links</button>}
          {!isHtml && <button type="button" className="dz-btn dz-btn--ghost" aria-pressed={feed} onClick={() => setFeed((value) => !value)}>In a feed</button>}
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Previous board" disabled={at <= 0} onClick={() => step(-1)}><CaretLeft size={14} /></button>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Next board" disabled={at >= boards.length - 1} onClick={() => step(1)}><CaretRight size={14} /></button>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Close preview" title="Close (Esc)" onClick={onClose}><X size={14} /></button>
        </div>
      </header>

      <div className="dz-pv__stage" ref={stage}>
        {isHtml && doc && (
          <div key={board.id} className="dz-pv__device" data-transition={transition} data-device={project.kind === 'graphic' ? 'plain' : phone ? 'phone' : 'browser'} style={{ width: shownWidth, height: shownHeight }}>
            <iframe
              ref={frame}
              title={board.name}
              sandbox="allow-same-origin"
              srcDoc={doc}
              onLoad={onFrameLoad}
              style={{ width: board.width, height: viewportHeight, border: 0, background: project.system.palette.background, transform: `scale(${scale})`, transformOrigin: '0 0' }}
            />
          </div>
        )}
        {!isHtml && !feed && (
          <div key={board.id} className="dz-pv__device" data-transition={transition} data-device="plain" style={{ width: shownWidth, height: shownHeight }}>
            <SvgSlide svg={applySvgTweaks(board.source, board.tweaks, board.tweakValues)} width={shownWidth} canvas={{ width: board.width, height: board.height }} resolveHref={resolveHref} />
          </div>
        )}
        {!isHtml && feed && (
          <div key={`${board.id}-feed`} className="dz-feed" aria-label="How it looks in a feed">
            <div className="dz-feed__head"><span className="dz-feed__avatar" /><span className="dz-feed__lines"><i /><i /></span></div>
            <div className="dz-feed__picture" style={{ aspectRatio: `${board.width} / ${board.height}`, maxHeight: Math.max(240, area.height - 220) }}>
              <SvgSlide svg={applySvgTweaks(board.source, board.tweaks, board.tweakValues)} width={Math.min(440, Math.round((area.height - 220) * (board.width / board.height)))} canvas={{ width: board.width, height: board.height }} resolveHref={resolveHref} />
            </div>
            <div className="dz-feed__actions"><i /><i /><i /></div>
            <div className="dz-feed__caption"><i /><i /></div>
          </div>
        )}
      </div>

      <nav className="dz-pv__strip" aria-label="Boards">
        {boards.map((entry) => (
          <button key={entry.id} type="button" className="dz-pv__chip" aria-current={entry.id === board.id || undefined} onClick={() => go(entry.id)} dir="auto">{entry.name}</button>
        ))}
      </nav>
    </div>,
    document.body,
  );
};
