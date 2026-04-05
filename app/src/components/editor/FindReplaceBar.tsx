import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import {
  SearchQuery,
  setSearchQuery as setSearchQueryEffect,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '@codemirror/search';

interface FindReplaceBarProps {
  view: EditorView | null;
  theme: 'dark' | 'light';
  onClose: () => void;
  showReplaceInitially?: boolean;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  view,
  theme,
  onClose,
  showReplaceInitially = false,
}) => {
  const getInitialSearchTerm = (): string => {
    if (!view) return '';
    const sel = view.state.selection.main;
    if (!sel || sel.empty) return '';
    const text = view.state.sliceDoc(sel.from, sel.to);
    return text && !text.includes('\n') ? text : '';
  };

  const [searchTerm, setSearchTerm] = useState(getInitialSearchTerm);
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [showReplace, setShowReplace] = useState(showReplaceInitially);
  const [isValidRegex, setIsValidRegex] = useState(true);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
      if (searchInputRef.current && searchTerm) {
        searchInputRef.current.select();
      }
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  const countMatches = useCallback((query: SearchQuery, doc: any): number => {
    let count = 0;
    try {
      const cursor = query.getCursor(doc);
      while (cursor.next()) count++;
    } catch {
      return -1;
    }
    return count;
  }, []);

  const applySearchQuery = useCallback((query: SearchQuery) => {
    if (!view) return;
    view.dispatch({ effects: setSearchQueryEffect.of(query) });
  }, [view]);

  useEffect(() => {
    if (!view) return;

    if (!searchTerm) {
      applySearchQuery(new SearchQuery({ search: '' }));
      setMatchCount(null);
      setCurrentMatch(0);
      setIsValidRegex(true);
      return;
    }

    let query: SearchQuery;
    try {
      query = new SearchQuery({
        search: searchTerm,
        caseSensitive,
        regexp: useRegex,
        wholeWord,
      });
      new RegExp(searchTerm);
      setIsValidRegex(true);
    } catch {
      applySearchQuery(new SearchQuery({ search: '' }));
      setMatchCount(null);
      setCurrentMatch(0);
      setIsValidRegex(false);
      return;
    }

    applySearchQuery(query);

    const count = countMatches(query, view.state.doc);
    setMatchCount(count);

    if (count > 0) {
      findNext(view);
      setCurrentMatch(1);
    } else {
      setCurrentMatch(0);
    }
  }, [searchTerm, caseSensitive, wholeWord, useRegex, view, countMatches, applySearchQuery]);

  const handleFindNext = useCallback(() => {
    if (!view || !matchCount || matchCount <= 0) return;
    findNext(view);
    setCurrentMatch((prev) => (prev >= matchCount ? 1 : prev + 1));
  }, [view, matchCount]);

  const handleFindPrevious = useCallback(() => {
    if (!view || !matchCount || matchCount <= 0) return;
    findPrevious(view);
    setCurrentMatch((prev) => (prev <= 1 ? matchCount : prev - 1));
  }, [view, matchCount]);

  const recountAndUpdate = useCallback(() => {
    if (!view || !searchTerm) return;
    try {
      const query = new SearchQuery({
        search: searchTerm,
        caseSensitive,
        regexp: useRegex,
        wholeWord,
      });
      const count = countMatches(query, view.state.doc);
      setMatchCount(count);
      setCurrentMatch((prev) => (count > 0 ? Math.min(prev, count) : 0));
    } catch {
      // ignore
    }
  }, [view, searchTerm, caseSensitive, wholeWord, useRegex, countMatches]);

  const handleReplace = useCallback(() => {
    if (!view || !matchCount || matchCount <= 0) return;
    replaceNext(view);
    recountAndUpdate();
  }, [view, matchCount, recountAndUpdate]);

  const handleReplaceAll = useCallback(() => {
    if (!view || !searchTerm) return;
    replaceAll(view);
    setMatchCount(0);
    setCurrentMatch(0);
  }, [view, searchTerm]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          handleFindPrevious();
        } else {
          handleFindNext();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && !e.shiftKey && showReplace) {
        e.preventDefault();
        replaceInputRef.current?.focus();
      }
    },
    [handleFindNext, handleFindPrevious, onClose, showReplace],
  );

  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleReplace();
      }
    },
    [onClose, handleReplace],
  );

  const toggleOption = useCallback(
    (option: 'case' | 'whole' | 'regex') => {
      if (option === 'case') setCaseSensitive((p) => !p);
      else if (option === 'whole') setWholeWord((p) => !p);
      else setUseRegex((p) => !p);
      searchInputRef.current?.focus();
    },
    [],
  );

  const toggleReplace = useCallback(() => {
    setShowReplace((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => replaceInputRef.current?.focus(), 30);
      } else {
        setTimeout(() => searchInputRef.current?.focus(), 30);
      }
      return next;
    });
  }, []);

  const inputCls = `flex-1 bg-transparent text-xs font-mono outline-none min-w-0 ${
    isDark
      ? 'text-zinc-200 placeholder:text-zinc-600'
      : 'text-zinc-800 placeholder:text-zinc-400'
  }`;

  const fieldCls = `flex items-center flex-1 gap-1.5 px-2.5 py-1 rounded-md border transition-colors ${
    isDark
      ? 'bg-zinc-950/80 border-zinc-700/80 focus-within:border-zinc-500'
      : 'bg-zinc-50 border-zinc-300 focus-within:border-zinc-500'
  }`;

  const iconBtnCls = (active: boolean) =>
    `p-1 rounded-md transition-all duration-150 cursor-pointer select-none ${
      active
        ? isDark
          ? 'bg-zinc-700/80 text-zinc-100 shadow-sm'
          : 'bg-zinc-300 text-zinc-800 shadow-sm'
        : isDark
          ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
          : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200'
    }`;

  const actionBtnCls = (disabled: boolean) =>
    `px-2.5 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer select-none ${
      disabled
        ? 'opacity-40 cursor-not-allowed'
        : isDark
          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 border border-zinc-700/60'
          : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 border border-zinc-300'
    }`;

  const navBtnCls = `p-1 rounded-md transition-colors duration-100 cursor-pointer ${
    isDark
      ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
      : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200'
  }`;

  const closeBtnCls = `p-1 rounded-md transition-colors duration-100 cursor-pointer ${
    isDark
      ? 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
      : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200'
  }`;

  const matchLabel = (() => {
    if (searchTerm === '') return null;
    if (!isValidRegex && useRegex) return <span className="text-red-400/80 text-[10px] font-mono">Invalid</span>;
    if (matchCount === null) return null;
    if (matchCount === 0) return <span className="text-red-400/70 text-[10px] font-mono">No results</span>;
    return (
      <span className={`text-[10px] font-mono tabular-nums ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
        {currentMatch}<span className="opacity-40">/</span>{matchCount}
      </span>
    );
  })();

  return (
    <div
      className={`absolute top-2 right-2 z-50 w-[440px] rounded-lg border overflow-hidden shadow-2xl ${
        isDark
          ? 'bg-zinc-900/95 border-zinc-700/60 shadow-black/50 backdrop-blur-sm'
          : 'bg-white/95 border-zinc-300 shadow-black/10 backdrop-blur-sm'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Toggle Replace Chevron */}
        <button
          onClick={toggleReplace}
          className={`p-1 rounded-md transition-all duration-200 cursor-pointer ${
            showReplace
              ? isDark
                ? 'text-zinc-300 bg-zinc-800 rotate-180'
                : 'text-zinc-600 bg-zinc-200 rotate-180'
              : isDark
                ? 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
                : 'text-zinc-400 hover:text-zinc-500 hover:bg-zinc-200'
          }`}
          title={showReplace ? 'Hide Replace' : 'Show Replace (Ctrl+H)'}
          aria-label={showReplace ? 'Hide replace' : 'Show replace'}
          aria-expanded={showReplace}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Search Field */}
        <div className={fieldCls}>
          <svg className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentMatch(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find"
            className={inputCls}
            spellCheck={false}
            aria-label="Find"
          />
          {matchLabel}
        </div>

        {/* Option Toggles */}
        <button
          onClick={() => toggleOption('case')}
          className={iconBtnCls(caseSensitive)}
          title="Match Case"
          aria-label="Match case"
          aria-pressed={caseSensitive}
        >
          <span className="text-[10px] font-bold leading-none">Aa</span>
        </button>
        <button
          onClick={() => toggleOption('whole')}
          className={iconBtnCls(wholeWord)}
          title="Match Whole Word"
          aria-label="Match whole word"
          aria-pressed={wholeWord}
        >
          <span className="text-[10px] font-bold leading-none">Ab</span>
        </button>
        <button
          onClick={() => toggleOption('regex')}
          className={`${iconBtnCls(useRegex)} ${!isValidRegex && useRegex ? (isDark ? '!text-red-400 !bg-red-500/10' : '!text-red-500 !bg-red-50') : ''}`}
          title="Use Regular Expression"
          aria-label="Use regex"
          aria-pressed={useRegex}
        >
          <span className="text-[10px] font-bold leading-none">.*</span>
        </button>

        {/* Navigation Arrows */}
        <div className={`flex flex-col rounded-md overflow-hidden border ${isDark ? 'border-zinc-700/50' : 'border-zinc-300'}`}>
          <button
            onClick={handleFindPrevious}
            className={navBtnCls}
            title="Previous Match (Shift+Enter)"
            aria-label="Previous match"
            disabled={!matchCount}
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <div className={`h-px ${isDark ? 'bg-zinc-700/50' : 'bg-zinc-300'}`} />
          <button
            onClick={handleFindNext}
            className={navBtnCls}
            title="Next Match (Enter)"
            aria-label="Next match"
            disabled={!matchCount}
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className={closeBtnCls}
          title="Close (Escape)"
          aria-label="Close find bar"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Replace Row */}
      {showReplace && (
        <div className={`flex items-center gap-1.5 px-2 py-1.5 border-t ${isDark ? 'border-zinc-800/60' : 'border-zinc-200/80'}`}>
          <div className="w-[22px]" />

          {/* Replace Field */}
          <div className={fieldCls}>
            <input
              ref={replaceInputRef}
              type="text"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="Replace"
              className={inputCls}
              spellCheck={false}
              aria-label="Replace"
            />
          </div>

          <button
            onClick={handleReplace}
            className={actionBtnCls(!matchCount || matchCount <= 0)}
            disabled={!matchCount || matchCount <= 0}
            title="Replace current match"
          >
            Replace
          </button>
          <button
            onClick={handleReplaceAll}
            className={actionBtnCls(!matchCount || matchCount <= 0)}
            disabled={!matchCount || matchCount <= 0}
            title="Replace all matches"
          >
            Replace All
          </button>
        </div>
      )}
    </div>
  );
};
