import { useEffect, useRef, useState } from 'react';
import { previewKey, previewScale, systemSignature } from '../../utils/design/previewCache';
import type { Board, DesignTokens } from '../../utils/design/types';
import { renderBoard } from './exportBoards';

/** Small pictures of boards, kept for the session (a board's picture is redrawn only when it changes). */
const cache = new Map<string, { key: string; url: string }>();

interface Options {
  boards: Board[];
  /** Boards that should show a picture instead of a live frame. */
  wanted: string[];
  tokens: DesignTokens;
  projectDir: string;
}

/**
 * Renders the boards in `wanted` to small JPEGs, one at a time and after the view has been
 * still for a moment, and returns the picture URL of each board that has one. A stale
 * picture stays until its replacement is ready.
 */
export function useBoardPreviews({ boards, wanted, tokens, projectDir }: Options): Record<string, string> {
  const [, bump] = useState(0);
  const running = useRef(false);
  const latest = useRef({ boards, tokens, projectDir });
  latest.current = { boards, tokens, projectDir };
  const wantedKey = wanted.join(',');

  useEffect(() => {
    if (wanted.length === 0 || !projectDir) return undefined;
    let stopped = false;
    const timer = window.setTimeout(() => {
      if (running.current) return;
      const run = async (): Promise<void> => {
        running.current = true;
        try {
          for (const id of wanted) {
            if (stopped) break;
            const { boards: current, tokens: system, projectDir: dir } = latest.current;
            const board = current.find((entry) => entry.id === id);
            if (!board || !board.source) continue;
            const key = previewKey(board, systemSignature(system));
            if (cache.get(id)?.key === key) continue;
            try {
              const bytes = await renderBoard(board, system, dir, previewScale(board.width, board.height), 'jpg');
              const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
              const old = cache.get(id);
              if (old) URL.revokeObjectURL(old.url);
              cache.set(id, { key, url });
              bump((value) => value + 1);
            } catch {
              /* the board keeps its name card */
            }
            await new Promise((resolve) => window.setTimeout(resolve, 40));
          }
        } finally {
          running.current = false;
        }
      };
      void run();
    }, 350);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // `boards` changes with every edit; the pictures are checked after the edits settle.
  }, [boards, wantedKey, tokens, projectDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const out: Record<string, string> = {};
  for (const id of wanted) {
    const entry = cache.get(id);
    if (entry) out[id] = entry.url;
  }
  return out;
}
