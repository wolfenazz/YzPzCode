import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '@iconify/react';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { useTitlebarDrag } from '../../hooks/useTitlebarDrag';
import { docPages, docCategories, getPage } from '../../assets/docs';
import type { DocPage } from '../../assets/docs';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface SearchResult extends TocItem {
  pageId: string;
  pageTitle: string;
}

interface DocsScreenProps {
  isWindows: boolean;
  onBack: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  'Getting Started': 'ph:rocket-launch',
  'AI Agents': 'ph:robot',
  Workspace: 'ph:squares-four',
  Design: 'ph:palette',
  Reference: 'ph:books',
};

const PAGE_ICONS: Record<string, string> = {
  introduction: 'ph:book-open-text',
  'getting-started': 'ph:steps',
  'ai-agents': 'ph:robot',
  'tool-clis': 'ph:plugs-connected',
  terminals: 'ph:terminal-window',
  'editor-files': 'ph:code',
  'source-control': 'ph:git-branch',
  'browser-design': 'ph:monitor-browser',
  'ai-designer': 'ph:magic-wand',
  settings: 'ph:gear-six',
  integrations: 'ph:plug-box',
  'shortcuts-help': 'ph:keyboard',
};

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const textOf = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
};

type CalloutKind = 'tip' | 'note' | 'warning' | null;

const detectCallout = (children: React.ReactNode): CalloutKind => {
  const text = textOf(children).trim().toLowerCase();
  if (text.startsWith('tip:')) return 'tip';
  if (text.startsWith('warning:')) return 'warning';
  if (text.startsWith('note:')) return 'note';
  return null;
};

const CALLOUT_STYLES: Record<Exclude<CalloutKind, null>, { border: string; bg: string; text: string; icon: string }> = {
  tip: { border: 'border-emerald-500/60', bg: 'bg-emerald-500/10', text: 'text-emerald-500', icon: 'ph:lightbulb' },
  note: { border: 'border-blue-500/60', bg: 'bg-blue-500/10', text: 'text-blue-500', icon: 'ph:info' },
  warning: { border: 'border-amber-500/60', bg: 'bg-amber-500/10', text: 'text-amber-500', icon: 'ph:warning' },
};

export const DocsScreen: React.FC<DocsScreenProps> = ({ isWindows, onBack }) => {
  const [activePageId, setActivePageId] = useState<string>(() => {
    const match = window.location.hash.match(/^#docs\/([a-z0-9-]+)/);
    return match && getPage(match[1]) ? match[1] : 'introduction';
  });
  const [activeSection, setActiveSection] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const titlebarRef = useTitlebarDrag<HTMLElement>();

  const activePage: DocPage = getPage(activePageId) ?? docPages[0];
  const activeIndex = docPages.findIndex((page) => page.id === activePage.id);
  const prevPage = activeIndex > 0 ? docPages[activeIndex - 1] : null;
  const nextPage = activeIndex < docPages.length - 1 ? docPages[activeIndex + 1] : null;

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
      setSidebarOpen(false);
    }
  }, []);

  const goToPage = useCallback((pageId: string, sectionId?: string) => {
    if (pageId !== activePageId) {
      setActivePageId(pageId);
      window.location.hash = `docs/${pageId}`;
      scrollContainerRef.current?.scrollTo({ top: 0 });
      if (sectionId) {
        setTimeout(() => {
          const element = document.getElementById(sectionId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveSection(sectionId);
          }
        }, 80);
      }
    } else if (sectionId) {
      scrollToSection(sectionId);
    }
    setSidebarOpen(false);
  }, [activePageId, scrollToSection]);

  useEffect(() => {
    const handleHashChange = () => {
      const match = window.location.hash.match(/^#docs\/([a-z0-9-]+)/);
      if (match && getPage(match[1]) && match[1] !== activePageId) {
        setActivePageId(match[1]);
        scrollContainerRef.current?.scrollTo({ top: 0 });
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activePageId]);

  const tocItems = useMemo<TocItem[]>(() => {
    const lines = activePage.content.split(/\r?\n/);
    const items: TocItem[] = [];

    lines.forEach((line) => {
      const h2Match = line.match(/^##\s+(.+)$/);
      const h3Match = line.match(/^###\s+(.+)$/);

      if (h2Match) {
        const text = h2Match[1].trim();
        items.push({ id: slugify(text), text, level: 2 });
      } else if (h3Match) {
        const text = h3Match[1].trim();
        items.push({ id: slugify(text), text, level: 3 });
      }
    });

    return items;
  }, [activePage]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);

    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const normalizedQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    docPages.forEach((page) => {
      const lines = page.content.split(/\r?\n/);
      let currentSection: { id: string; text: string; level: number } | null = null;

      lines.forEach((line) => {
        const h2Match = line.match(/^##\s+(.+)$/);
        const h3Match = line.match(/^###\s+(.+)$/);

        if (h2Match) {
          const text = h2Match[1].trim();
          currentSection = { id: slugify(text), text, level: 2 };
          if (text.toLowerCase().includes(normalizedQuery)) {
            results.push({ ...currentSection, pageId: page.id, pageTitle: page.title });
          }
        } else if (h3Match) {
          const text = h3Match[1].trim();
          currentSection = { id: slugify(text), text, level: 3 };
          if (text.toLowerCase().includes(normalizedQuery)) {
            results.push({ ...currentSection, pageId: page.id, pageTitle: page.title });
          }
        } else if (line.trim() && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('-') && !line.startsWith('>')) {
          const contentLine = line.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
          if (contentLine.toLowerCase().includes(normalizedQuery)) {
            const section = currentSection ?? { id: '', text: 'Introduction', level: 2 };
            if (!results.find((r) => r.pageId === page.id && r.id === section.id)) {
              results.push({ ...section, pageId: page.id, pageTitle: page.title });
            }
          }
        }
      });
    });

    setSearchResults(results.slice(0, 10));
    setShowSearchResults(true);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  }, []);

  const selectSearchResult = useCallback((result: SearchResult) => {
    clearSearch();
    searchInputRef.current?.blur();
    goToPage(result.pageId, result.id || undefined);
  }, [clearSearch, goToPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        clearSearch();
        searchInputRef.current?.blur();
      }
      if (showSearchResults && searchResults.length > 0) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= Math.min(9, searchResults.length)) {
          selectSearchResult(searchResults[num - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearchResults, searchResults, clearSearch, selectSearchResult]);

  useEffect(() => {
    const highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach((h) => h.classList.remove('search-highlight'));

    if (searchQuery.trim().length >= 2 && scrollContainerRef.current) {
      const article = document.querySelector('article');
      if (!article) return;

      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, null);
      const nodesToHighlight: Text[] = [];
      let node: Text | null;

      while ((node = walker.nextNode() as Text)) {
        const text = node.textContent?.toLowerCase() || '';
        if (text.includes(searchQuery.toLowerCase())) {
          nodesToHighlight.push(node);
        }
      }

      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');

      nodesToHighlight.forEach((textNode) => {
        const parent = textNode.parentNode;
        if (!parent) return;

        const text = textNode.textContent || '';
        if (!regex.test(text)) return;
        regex.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        text.replace(regex, (match, _p1, offset) => {
          if (offset > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
          }
          const span = document.createElement('span');
          span.className = 'search-highlight bg-yellow-500/20 text-yellow-200 rounded px-0.5';
          span.textContent = match;
          fragment.appendChild(span);
          lastIndex = offset + match.length;
          return match;
        });

        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        parent.replaceChild(fragment, textNode);
      });
    }
  }, [searchQuery, activePageId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const headings = tocItems.map((item) => ({
        id: item.id,
        element: document.getElementById(item.id),
      }));

      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = headings[i];
        if (heading.element) {
          const rect = heading.element.getBoundingClientRect();
          if (rect.top <= 100) {
            setActiveSection(heading.id);
            return;
          }
        }
      }
      setActiveSection('');
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [tocItems]);

  const renderMarkdown = () => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-3xl font-bold text-theme-main tracking-tight mb-8 pb-4 border-b border-theme">
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => {
          const text = String(children);
          return (
            <h2
              id={slugify(text)}
              className="text-2xl font-bold text-theme-main mt-10 mb-4 pt-4 border-t border-theme/30 first:mt-0 first:border-t-0 first:pt-0"
              {...props}
            >
              {children}
            </h2>
          );
        },
        h3: ({ children, ...props }) => {
          const text = String(children);
          return (
            <h3
              id={slugify(text)}
              className="text-xl font-semibold text-theme-main mt-6 mb-3"
              {...props}
            >
              {children}
            </h3>
          );
        },
        p: ({ children }) => <p className="text-theme-main leading-relaxed mb-4">{children}</p>,
        ul: ({ children }) => (
          <ul className="list-disc list-inside text-theme-main space-y-2 mb-4 ml-4">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside text-theme-main space-y-2 mb-4 ml-4">{children}</ol>
        ),
        li: ({ children }) => <li className="text-theme-main leading-relaxed">{children}</li>,
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code
                className="bg-theme-card px-1.5 py-0.5 rounded-md text-sm text-emerald-400 font-mono border border-theme/50"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <code
              className="block bg-theme-card p-4 rounded-md overflow-x-auto text-sm font-mono text-theme-main"
              {...props}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-theme-card p-4 rounded-md overflow-x-auto mb-4 border border-theme">{children}</pre>
        ),
        blockquote: ({ children }) => {
          const kind = detectCallout(children);
          if (!kind) {
            return (
              <blockquote className="border-l-4 border-theme-secondary/40 pl-4 italic text-theme-secondary my-4">
                {children}
              </blockquote>
            );
          }
          const style = CALLOUT_STYLES[kind];
          return (
            <div className={`border-l-4 ${style.border} ${style.bg} rounded-r-md px-4 py-3 my-4`}>
              <div className={`flex items-center gap-2 ${style.text} text-sm font-semibold mb-1`}>
                <Icon icon={style.icon} className="w-4 h-4" />
                <span className="capitalize">{kind}</span>
              </div>
              <div className="text-theme-main text-sm leading-relaxed [&>p]:mb-0">{children}</div>
            </div>
          );
        },
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4 rounded-md border border-theme">
            <table className="min-w-full border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-theme-card border-b border-theme">{children}</thead>,
        th: ({ children }) => (
          <th className="px-4 py-2 text-left text-xs font-semibold text-theme-secondary uppercase tracking-wider">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="px-4 py-2 text-sm text-theme-main">{children}</td>,
        a: ({ href, children }) => {
          const internalPage = href?.match(/^#docs\/([a-z0-9-]+)/);
          if (internalPage) {
            return (
              <a
                href={`#docs/${internalPage[1]}`}
                onClick={(e) => {
                  e.preventDefault();
                  goToPage(internalPage[1]);
                }}
                className="text-blue-400 hover:text-blue-300 underline transition-colors cursor-pointer"
              >
                {children}
              </a>
            );
          }
          return (
            <a
              href={href}
              className="text-blue-400 hover:text-blue-300 underline transition-colors cursor-pointer"
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          );
        },
        hr: () => <hr className="border-theme my-8" />,
        strong: ({ children }) => <strong className="font-bold text-theme-main">{children}</strong>,
      }}
    >
      {activePage.content}
    </ReactMarkdown>
  );

  const pageNavButton = (page: DocPage, direction: 'prev' | 'next') => (
    <button
      onClick={() => goToPage(page.id)}
      className={`flex-1 min-w-0 flex flex-col gap-1 p-4 rounded-md border border-theme bg-theme-card/50 hover:bg-theme-hover transition-colors text-left ${
        direction === 'next' ? 'items-end text-right' : ''
      }`}
    >
      <span className="text-xs text-theme-secondary flex items-center gap-1">
        {direction === 'prev' && <Icon icon="ph:arrow-left" className="w-3 h-3" />}
        {direction === 'prev' ? 'Previous' : 'Next'}
        {direction === 'next' && <Icon icon="ph:arrow-right" className="w-3 h-3" />}
      </span>
      <span className="text-sm font-semibold text-theme-main truncate w-full">{page.title}</span>
    </button>
  );

  return (
    <div className="h-screen bg-theme-main text-theme-main font-mono flex flex-col overflow-hidden">
      <header
        ref={titlebarRef}
        className="relative z-50 flex items-center h-10 bg-theme-card/50 backdrop-blur-md border-b border-theme select-none transition-colors flex-shrink-0"
      >
        <div className="flex items-center h-full">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-full border-l border-theme hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main"
            title="Back"
          >
            <Icon icon="ph:arrow-left" className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 px-3 h-full border-r border-theme bg-theme-card cursor-default">
            <Icon icon="ph:book-open-text" className="w-4 h-4 text-theme-secondary" />
            <span className="text-xs font-bold text-theme-main tracking-wider uppercase">Documentation</span>
          </div>
        </div>

        <div className="flex-1 h-full flex items-center justify-center px-4">
          <div className="relative w-full max-w-md">
            <div
              className={`flex items-center h-7 px-3 rounded-md border transition-all duration-200 ${
                searchFocused
                  ? 'border-blue-500 bg-theme-card shadow-lg shadow-blue-500/10'
                  : 'border-theme bg-theme-card/50 hover:border-theme-secondary'
              }`}
            >
              <Icon icon="ph:magnifying-glass" className="w-4 h-4 text-theme-secondary" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  setTimeout(() => setSearchFocused(false), 200);
                }}
                placeholder="Search the docs..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-theme-main placeholder-theme-secondary ml-2 w-32"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="flex items-center justify-center text-theme-secondary hover:text-theme-main transition-colors"
                  title="Clear search"
                >
                  <Icon icon="ph:x" className="w-4 h-4" />
                </button>
              )}
              <span className="text-xs text-theme-secondary/60 ml-2 hidden sm:block">Ctrl+K</span>
            </div>

            {showSearchResults && searchResults.length > 0 && (
              <div
                className={`absolute top-full left-0 right-0 mt-2 bg-theme-card border border-theme rounded-md shadow-xl z-50 transition-all duration-200 ${
                  searchFocused
                    ? 'opacity-100 transform translate-y-0'
                    : 'opacity-0 transform -translate-y-2 pointer-events-none'
                }`}
              >
                <div className="max-h-96 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <button
                      key={`${result.pageId}-${result.id}-${index}`}
                      onClick={() => selectSearchResult(result)}
                      className="w-full text-left px-4 py-3 border-b border-theme last:border-b-0 transition-colors hover:bg-theme-hover"
                    >
                      <div className="text-sm font-medium text-theme-main">{result.text}</div>
                      <div className="text-xs text-theme-secondary/60 mt-1 flex items-center gap-1">
                        <Icon icon={PAGE_ICONS[result.pageId] ?? 'ph:file-text'} className="w-3 h-3" />
                        {result.pageTitle}
                        <span className="text-theme-secondary/40">Press {index + 1}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showSearchResults && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <div
                className={`absolute top-full left-0 right-0 mt-2 bg-theme-card border border-theme rounded-md shadow-xl z-50 transition-all duration-200 ${
                  searchFocused
                    ? 'opacity-100 transform translate-y-0'
                    : 'opacity-0 transform -translate-y-2 pointer-events-none'
                }`}
              >
                <div className="px-4 py-6 text-center">
                  <Icon icon="ph:magnifying-glass" className="w-5 h-5 text-theme-secondary mx-auto" />
                  <p className="text-sm text-theme-secondary mt-2">No results found for "{searchQuery}"</p>
                  <p className="text-xs text-theme-secondary/60 mt-1">Try different keywords</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center w-10 h-full border-l border-theme hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main md:hidden"
          title="Toggle Sidebar"
        >
          <Icon icon={sidebarOpen ? 'ph:x' : 'ph:list'} className="w-5 h-5" />
        </button>

        <div className="flex items-center h-full gap-0">
          {isWindows && (
            <div className="flex h-full border-l border-theme">
              <button
                onClick={minimizeWindow}
                className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-[var(--text-secondary)] hover:text-theme-main transition-colors"
                title="Minimize"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6" /></svg>
              </button>
              <button
                onClick={maximizeWindow}
                className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-[var(--text-secondary)] hover:text-theme-main transition-colors"
                title="Maximize"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12"><rect fill="none" stroke="currentColor" width="9" height="9" x="1.5" y="1.5" strokeWidth="1" /></svg>
              </button>
              <button
                onClick={closeWindow}
                className="w-12 h-full flex items-center justify-center hover:bg-rose-600 text-[var(--text-secondary)] hover:text-white transition-colors"
                title="Close"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12">
                  <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M1,1 L11,11 M1,11 L11,1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`fixed md:relative z-40 w-64 h-[calc(100vh-2.5rem)] bg-theme-card border-r border-theme overflow-y-auto transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <nav className="p-4">
            {docCategories.map((category) => (
              <div key={category} className="mb-5 last:mb-0">
                <div className="flex items-center gap-1.5 mb-2 px-2">
                  <Icon icon={CATEGORY_ICONS[category] ?? 'ph:circle'} className="w-3.5 h-3.5 text-theme-secondary/70" />
                  <h2 className="text-[10px] font-bold text-theme-secondary uppercase tracking-wider">
                    {category}
                  </h2>
                </div>
                <ul className="space-y-0.5">
                  {docPages
                    .filter((page) => page.category === category)
                    .map((page) => (
                      <li key={page.id}>
                        <button
                          onClick={() => goToPage(page.id)}
                          className={`w-full flex items-center gap-2 text-left py-2 px-3 rounded-md text-sm transition-colors cursor-pointer ${
                            activePage.id === page.id
                              ? 'bg-theme-hover text-theme-main font-semibold'
                              : 'text-theme-secondary hover:text-theme-main hover:bg-theme-hover/50'
                          }`}
                        >
                          <Icon
                            icon={PAGE_ICONS[page.id] ?? 'ph:file-text'}
                            className={`w-4 h-4 flex-shrink-0 ${
                              activePage.id === page.id ? 'text-blue-400' : 'text-theme-secondary/70'
                            }`}
                          />
                          <span className="truncate">{page.title}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <main ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-12">
          <div className="max-w-5xl mx-auto flex gap-10">
            <article className="flex-1 min-w-0 max-w-3xl">
              <div className="mb-6">
                <div className="flex items-center gap-2 text-xs text-theme-secondary mb-3">
                  <Icon icon={CATEGORY_ICONS[activePage.category] ?? 'ph:circle'} className="w-3.5 h-3.5" />
                  <span className="uppercase tracking-wider">{activePage.category}</span>
                </div>
                <h1 className="text-3xl font-bold text-theme-main tracking-tight">{activePage.title}</h1>
                <p className="text-sm text-theme-secondary mt-2">{activePage.description}</p>
                <div className="h-px bg-theme mt-6" />
              </div>
              {renderMarkdown()}
              {(prevPage || nextPage) && (
                <div className="flex gap-3 mt-12 pt-6 border-t border-theme">
                  {prevPage ? (
                    pageNavButton(prevPage, 'prev')
                  ) : (
                    <div className="flex-1" />
                  )}
                  {nextPage ? (
                    pageNavButton(nextPage, 'next')
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
              )}
            </article>

            {tocItems.length > 0 && (
              <aside className="hidden xl:block w-56 flex-shrink-0">
                <div className="sticky top-8">
                  <h2 className="text-[10px] font-bold text-theme-secondary uppercase tracking-wider mb-3">
                    On this page
                  </h2>
                  <ul className="space-y-1 border-l border-theme">
                    {tocItems.map((item) => (
                      <li key={item.id}>
                        <button
                          onClick={() => scrollToSection(item.id)}
                          className={`w-full text-left py-1 text-xs transition-colors cursor-pointer border-l-2 -ml-px ${
                            item.level === 3 ? 'pl-7' : 'pl-3'
                          } ${
                            activeSection === item.id
                              ? 'text-blue-400 border-blue-400 font-medium'
                              : 'text-theme-secondary border-transparent hover:text-theme-main'
                          }`}
                        >
                          {item.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
