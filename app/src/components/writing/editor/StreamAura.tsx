import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { GenerationAura } from '../../studio/GenerationAura';
import { aiStreamKey } from './extensions';

/** Blocks closer than this (px, unzoomed) belong to the same page; a page break is wider. */
const PAGE_GAP = 44;
const PAD_X = 12;
const PAD_Y = 8;
/** How long a finished section's aura is kept so its finish animation can play. */
const KEEP_MS = 3200;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Segment {
  id: string;
  boxes: Box[];
  live: boolean;
}

const sameBoxes = (a: Box[], b: Box[]): boolean =>
  a.length === b.length && a.every((box, index) => Math.abs(box.left - b[index].left) < 0.5 && Math.abs(box.top - b[index].top) < 0.5 && Math.abs(box.width - b[index].width) < 0.5 && Math.abs(box.height - b[index].height) < 0.5);

/** One box per page of the blocks being written, in the host's own (unzoomed) pixels. */
function measureBoxes(editor: Editor, host: HTMLElement): Box[] {
  const nodes = Array.from(editor.view.dom.querySelectorAll<HTMLElement>(':scope > .wr-streaming, :scope > .wr-streaming-heading'));
  if (nodes.length === 0) return [];
  const origin = host.getBoundingClientRect();
  // Scaled by the app zoom and the document zoom alike; read it off the host itself.
  const k = host.offsetWidth > 0 && origin.width > 0 ? origin.width / host.offsetWidth : 1;
  const rects = nodes
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.height > 0)
    .map((rect) => ({ left: (rect.left - origin.left) / k, top: (rect.top - origin.top) / k, right: (rect.right - origin.left) / k, bottom: (rect.bottom - origin.top) / k }))
    .sort((a, b) => a.top - b.top);
  const boxes: Box[] = [];
  let current: { left: number; top: number; right: number; bottom: number } | null = null;
  const flush = (): void => {
    if (current) boxes.push({ left: current.left - PAD_X, top: current.top - PAD_Y, width: current.right - current.left + PAD_X * 2, height: current.bottom - current.top + PAD_Y * 2 });
  };
  for (const rect of rects) {
    if (current && rect.top - current.bottom <= PAGE_GAP) {
      current = { left: Math.min(current.left, rect.left), top: current.top, right: Math.max(current.right, rect.right), bottom: Math.max(current.bottom, rect.bottom) };
    } else {
      flush();
      current = { ...rect };
    }
  }
  flush();
  return boxes;
}

/**
 * The Gemini-colored aura around the section the AI is writing right now: one
 * frame per page it spans, following the text as it streams in, and the
 * finish animation once the section is complete. Lives beside the editor (not
 * inside the page) so it never touches the document.
 */
export const StreamAura: React.FC<{
  editor: Editor | null;
  host: React.RefObject<HTMLElement | null>;
  /** Run status per section id, so a failed or stopped section does not celebrate. */
  outcomes?: Record<string, string>;
}> = ({ editor, host, outcomes }) => {
  const [segments, setSegments] = useState<Segment[]>([]);
  const frame = useRef(0);

  useEffect(() => {
    const root = host.current;
    if (!editor || editor.isDestroyed || !root) return undefined;
    const dom = editor.view.dom as HTMLElement;

    const measure = (): void => {
      frame.current = 0;
      if (editor.isDestroyed) return;
      const sectionId = aiStreamKey.getState(editor.state)?.sectionId ?? null;
      const boxes = sectionId ? measureBoxes(editor, root) : [];
      setSegments((previous) => {
        const live = sectionId && boxes.length > 0 ? sectionId : null;
        let changed = false;
        const next = previous.map((entry) => {
          if (entry.live && entry.id !== live) {
            changed = true;
            return { ...entry, live: false };
          }
          return entry;
        });
        if (live) {
          const index = next.findIndex((entry) => entry.id === live);
          if (index < 0) {
            changed = true;
            next.push({ id: live, boxes, live: true });
          } else if (!next[index].live || !sameBoxes(next[index].boxes, boxes)) {
            changed = true;
            next[index] = { id: live, boxes, live: true };
          }
        }
        return changed ? next : previous;
      });
    };
    const schedule = (): void => {
      if (frame.current === 0) frame.current = requestAnimationFrame(measure);
    };

    const mutations = new MutationObserver(schedule);
    mutations.observe(dom, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    const resizes = new ResizeObserver(schedule);
    resizes.observe(dom);
    window.addEventListener('resize', schedule);
    editor.on('transaction', schedule);
    schedule();
    return () => {
      mutations.disconnect();
      resizes.disconnect();
      window.removeEventListener('resize', schedule);
      editor.off('transaction', schedule);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [editor, host]);

  // Finished sections stay just long enough for the finish animation.
  const finished = segments.filter((entry) => !entry.live).map((entry) => entry.id).join('|');
  useEffect(() => {
    if (!finished) return undefined;
    const timer = setTimeout(() => setSegments((previous) => previous.filter((entry) => entry.live)), KEEP_MS);
    return () => clearTimeout(timer);
  }, [finished]);

  if (segments.length === 0) return null;
  return (
    <div className="wr-aura-layer" aria-hidden="true">
      {segments.map((segment) => {
        const outcome = outcomes?.[segment.id];
        const failed = outcome === 'failed' || outcome === 'cancelled';
        return segment.boxes.map((box, index) => (
          <div key={`${segment.id}:${index}`} className="wr-aura-box" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
            <GenerationAura inside radius={10} active={segment.live} failed={failed} badge={index === 0} />
          </div>
        ));
      })}
    </div>
  );
};
