import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../../types';
import { FileIcon } from '../explorer/FileIcon';

interface QuickOpenPaletteProps {
  workspacePath: string;
  onSelect: (entry: FileEntry) => void;
  onClose: () => void;
}

function fuzzyMatch(query: string, text: string): { match: boolean; score: number; indices: Set<number> } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  const indices = new Set<number>();

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.add(ti);
      if (ti === 0 || t[ti - 1] === '/' || t[ti - 1] === '\\') {
        score += 10;
      } else if (ti > 0 && text[ti] === text[ti].toUpperCase() && text[ti - 1] === text[ti - 1].toLowerCase()) {
        score += 8;
      } else {
        score += 1;
      }
      qi++;
    }
  }

  return { match: qi === q.length, score, indices };
}

function HighlightedText({ text, indices }: { text: string; indices: Set<number> }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    if (indices.has(i)) {
      if (last < i) parts.push(<span key={`t-${i}`}>{text.slice(last, i)}</span>);
      parts.push(
        <span key={`m-${i}`} className="text-blue-400 font-semibold">
          {text[i]}
        </span>
      );
      last = i + 1;
    }
  }
  if (last < text.length) parts.push(<span key="end">{text.slice(last)}</span>);
  return <>{parts}</>;
}

export const QuickOpenPalette: React.FC<QuickOpenPaletteProps> = ({
  workspacePath,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<FileEntry[]>('list_all_files', { path: workspacePath })
      .then((result) => {
        if (!cancelled) {
          setFiles(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workspacePath]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return files.slice(0, 50).map((f) => ({ entry: f, score: 0, indices: new Set<number>() }));
    }
    const results: { entry: FileEntry; score: number; indices: Set<number> }[] = [];
    for (const file of files) {
      const relPath = file.path.startsWith(workspacePath)
        ? file.path.slice(workspacePath.length).replace(/^[\\/]/, '')
        : file.name;
      const nameResult = fuzzyMatch(query, file.name);
      const pathResult = fuzzyMatch(query, relPath);
      const best = nameResult.match && nameResult.score >= (pathResult.match ? pathResult.score : 0)
        ? { match: nameResult.match, score: nameResult.score + 5, indices: nameResult.indices }
        : pathResult;
      if (best.match) {
        results.push({ entry: file, score: best.score, indices: best.indices });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 50);
  }, [query, files, workspacePath]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (entry: FileEntry) => {
      onSelect(entry);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex].entry);
        }
      }
    },
    [onClose, filtered, selectedIndex, handleSelect]
  );

  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[9999] pt-[15vh] font-mono animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick open file"
        className="w-full max-w-lg mx-4 rounded-xl shadow-2xl border overflow-hidden animate-scale-in bg-zinc-950 border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <svg className="w-4 h-4 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name..."
            className="flex-1 bg-transparent text-sm outline-none text-zinc-200 placeholder:text-zinc-600"
            aria-label="Search files"
          />
          {loading && (
            <svg className="w-3.5 h-3.5 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        <div
          ref={listRef}
          className={`max-h-[300px] overflow-y-auto custom-scrollbar ${filtered.length === 0 ? 'py-6' : ''}`}
        >
          {filtered.length === 0 && !loading && (
            <div className="text-center text-[10px] uppercase tracking-widest py-4 text-zinc-600">
              {query ? 'No matching files' : 'No files found'}
            </div>
          )}
          {filtered.map(({ entry, indices }, idx) => {
            const relPath = entry.path.startsWith(workspacePath)
              ? entry.path.slice(workspacePath.length).replace(/^[\\/]/, '')
              : entry.name;
            const dirPath = relPath.includes('/') || relPath.includes('\\')
              ? relPath.substring(0, Math.max(relPath.lastIndexOf('/'), relPath.lastIndexOf('\\')))
              : '';
            return (
              <div
                key={entry.path}
                data-selected={idx === selectedIndex}
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors ${
                  idx === selectedIndex
                    ? 'bg-zinc-800/80'
                    : 'hover:bg-zinc-900/50'
                }`}
                onClick={() => handleSelect(entry)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <FileIcon
                  extension={entry.extension}
                  isDir={false}
                  className="w-4 h-4 shrink-0"
                  name={entry.name}
                />
                <span className="text-xs truncate text-zinc-200">
                  <HighlightedText text={entry.name} indices={indices} />
                </span>
                {dirPath && (
                  <span className="text-[10px] truncate ml-auto pl-2 text-zinc-600">
                    {dirPath}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t text-[9px] uppercase tracking-wider border-zinc-800 text-zinc-600">
          <span>{filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
          <span>↑↓ navigate · Enter open · Esc close</span>
        </div>
      </div>
    </div>
  );
};
