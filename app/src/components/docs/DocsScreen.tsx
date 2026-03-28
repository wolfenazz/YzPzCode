import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import docsContent from '../../assets/docs/userguid.md?raw';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface DocsScreenProps {
  isWindows: boolean;
  onBack: () => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

const BookIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export const DocsScreen: React.FC<DocsScreenProps> = ({
  isWindows,
  onBack,
  theme,
  onThemeToggle,
}) => {
  const [activeSection, setActiveSection] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<TocItem[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const tocItems = useMemo<TocItem[]>(() => {
    const lines = docsContent.split('\n');
    const items: TocItem[] = [];
    
    lines.forEach((line: string) => {
      const h2Match = line.match(/^## (.+)$/);
      const h3Match = line.match(/^### (.+)$/);
      
      if (h2Match) {
        const text = h2Match[1];
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        items.push({ id, text, level: 2 });
      } else if (h3Match) {
        const text = h3Match[1];
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        items.push({ id, text, level: 3 });
      }
    });
    
    return items;
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
      setSidebarOpen(false);
    }
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const normalizedQuery = query.toLowerCase();
    const results: TocItem[] = [];
    const lines = docsContent.split('\n');
    
    let currentSection: TocItem | null = null;

    lines.forEach((line: string) => {
      const h2Match = line.match(/^## (.+)$/);
      const h3Match = line.match(/^### (.+)$/);
      
      if (h2Match) {
        const text = h2Match[1];
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        currentSection = { id, text, level: 2 };
        if (text.toLowerCase().includes(normalizedQuery)) {
          results.push({ ...currentSection });
        }
      } else if (h3Match) {
        const text = h3Match[1];
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (text.toLowerCase().includes(normalizedQuery)) {
          results.push({ id, text, level: 3 });
        }
      } else if (line.trim() && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('-')) {
        const contentLine = line.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
        if (contentLine.toLowerCase().includes(normalizedQuery) && currentSection) {
          if (!results.find(r => r.id === currentSection!.id)) {
            results.push({ ...currentSection });
          }
        }
      }
    });

    setSearchResults(results.slice(0, 10));
    setShowSearchResults(true);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchQuery('');
        setSearchResults([]);
        setShowSearchResults(false);
        searchInputRef.current?.blur();
      }
      if (showSearchResults && searchResults.length > 0) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= Math.min(9, searchResults.length)) {
          const result = searchResults[num - 1];
          scrollToSection(result.id);
          clearSearch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearchResults, searchResults]);

  useEffect(() => {
    const highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach(h => h.classList.remove('search-highlight'));
    
    if (searchQuery.trim().length >= 2) {
      const walker = document.createTreeWalker(
        document.querySelector('article')!,
        NodeFilter.SHOW_TEXT,
        null
      );

      const nodesToHighlight: Text[] = [];
      let node: Text | null;
      
      while (node = walker.nextNode() as Text) {
        const text = node.textContent?.toLowerCase() || '';
        if (text.includes(searchQuery.toLowerCase())) {
          nodesToHighlight.push(node);
        }
      }

      nodesToHighlight.forEach(textNode => {
        const parent = textNode.parentNode;
        if (!parent) return;
        
        const text = textNode.textContent || '';
        const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const matches = text.match(regex);
        
        if (!matches) return;
        
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        
        text.replace(regex, (match, _p1, offset) => {
          if (offset > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
          }
          const span = document.createElement('span');
          span.className = 'search-highlight bg-yellow-500/20 text-yellow-200 rounded px-0.5 py-0.5';
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
  }, [searchQuery]);

  useEffect(() => {
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
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [tocItems]);

  return (
    <div className={`h-screen bg-theme-main text-theme-main font-mono flex flex-col overflow-hidden ${theme === 'light' ? 'light-theme' : ''}`}>
      <header
        data-tauri-drag-region
        className={`relative z-50 flex items-center h-10 bg-theme-card/50 backdrop-blur-md border-b border-theme select-none transition-colors flex-shrink-0 ${isWindows ? 'titlebar-drag active:cursor-grabbing' : ''}`}
      >
        <div className="flex items-center h-full titlebar-nodrag">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-full border-l border-theme hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main"
            title="Back"
          >
            <ArrowLeftIcon />
          </button>
          
          <div className="flex items-center gap-2 px-3 h-full border-r border-theme bg-theme-card cursor-default">
            <BookIcon />
            <span className="text-xs font-bold text-theme-main tracking-wider uppercase">
              Documentation
            </span>
          </div>
        </div>

        <div className="flex-1 h-full flex items-center justify-center px-4">
          <div className="relative w-full max-w-md titlebar-nodrag">
            <div className={`flex items-center h-7 px-3 rounded-sm border transition-all duration-200 ${
              searchFocused 
                ? 'border-blue-500 bg-theme-card shadow-lg shadow-blue-500/10' 
                : 'border-theme bg-theme-card/50 hover:border-theme-secondary'
            }`}>
              <SearchIcon />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  setTimeout(() => setSearchFocused(false), 200);
                }}
                placeholder="Search documentation..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-theme-main placeholder-theme-secondary ml-2 w-32"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="flex items-center justify-center text-theme-secondary hover:text-theme-main transition-colors"
                  title="Clear search"
                >
                  <XIcon />
                </button>
              )}
              <span className="text-xs text-theme-secondary/60 ml-2 hidden sm:block">
                Ctrl+K
              </span>
            </div>

            {showSearchResults && searchResults.length > 0 && (
              <div className={`absolute top-full left-0 right-0 mt-2 bg-theme-card border border-theme rounded-sm shadow-xl z-50 transition-all duration-200 ${
                searchFocused ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform -translate-y-2 pointer-events-none'
              }`}>
                <div className="max-h-96 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <button
                      key={result.id}
                      onClick={() => {
                        scrollToSection(result.id);
                        clearSearch();
                      }}
                      className={`w-full text-left px-4 py-3 border-b border-theme last:border-b-0 transition-colors ${
                        result.level === 3 ? 'pl-8' : ''
                      } hover:bg-theme-hover group`}
                    >
                      <div className={`text-sm font-medium ${result.level === 3 ? 'text-theme-secondary' : 'text-theme-main'}`}>
                        {result.text}
                      </div>
                      <div className="text-xs text-theme-secondary/60 mt-1">
                        {result.level === 2 ? 'Section' : 'Subsection'} · Press {index + 1} to navigate
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showSearchResults && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <div className={`absolute top-full left-0 right-0 mt-2 bg-theme-card border border-theme rounded-sm shadow-xl z-50 transition-all duration-200 ${
                searchFocused ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform -translate-y-2 pointer-events-none'
              }`}>
                <div className="px-4 py-6 text-center">
                  <SearchIcon />
                  <p className="text-sm text-theme-secondary mt-2">No results found for "{searchQuery}"</p>
                  <p className="text-xs text-theme-secondary/60 mt-1">Try different keywords</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center w-10 h-full border-l border-theme hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main md:hidden titlebar-nodrag"
          title="Toggle Sidebar"
        >
          {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        <div className="flex items-center h-full gap-0 titlebar-nodrag">
          <button
            onClick={onThemeToggle}
            className="flex items-center justify-center w-10 h-full border-l border-theme hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main"
            title="Switch Theme"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 18v1m9-9h1M3 9h1m12.728-4.272l-.707.707M6.343 17.657l-.707.707M16.95 16.95l.707.707M7.05 7.05l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            )}
          </button>

          {isWindows && (
            <div className="flex h-full border-l border-theme">
              <button
                onClick={minimizeWindow}
                className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors"
                title="Minimize"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6" /></svg>
              </button>
              <button
                onClick={maximizeWindow}
                className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors"
                title="Maximize"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12"><rect fill="none" stroke="currentColor" width="9" height="9" x="1.5" y="1.5" strokeWidth="1" /></svg>
              </button>
              <button
                onClick={closeWindow}
                className="w-12 h-full flex items-center justify-center hover:bg-rose-600 text-zinc-500 hover:text-white transition-colors"
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
            <h2 className="text-xs font-bold text-theme-secondary uppercase tracking-wider mb-4">
              Table of Contents
            </h2>
            <ul className="space-y-1">
              {tocItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => scrollToSection(item.id)}
                    className={`w-full text-left py-2 px-3 rounded-sm text-sm transition-colors cursor-pointer ${
                      item.level === 3 ? 'pl-6 text-xs' : ''
                    } ${
                      activeSection === item.id
                        ? 'bg-theme-hover text-theme-main'
                        : 'text-theme-secondary hover:text-theme-main hover:bg-theme-hover/50'
                    }`}
                  >
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-12">
          <article className="max-w-4xl mx-auto prose prose-invert prose-sm md:prose-base">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-3xl font-bold text-theme-main mb-8 pb-4 border-b border-theme">
                    {children}
                  </h1>
                ),
                h2: ({ children, ...props }) => {
                  const text = String(children);
                  const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                  return (
                    <h2
                      id={id}
                      className="text-2xl font-bold text-theme-main mt-10 mb-4 pt-4 border-t border-theme/30 first:mt-0 first:border-t-0 first:pt-0"
                      {...props}
                    >
                      {children}
                    </h2>
                  );
                },
                h3: ({ children, ...props }) => {
                  const text = String(children);
                  const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                  return (
                    <h3
                      id={id}
                      className="text-xl font-semibold text-theme-main mt-6 mb-3"
                      {...props}
                    >
                      {children}
                    </h3>
                  );
                },
                p: ({ children }) => (
                  <p className="text-theme-main leading-relaxed mb-4">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside text-theme-main space-y-2 mb-4 ml-4">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside text-theme-main space-y-2 mb-4 ml-4">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-theme-main">{children}</li>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code
                        className="bg-theme-card px-1.5 py-0.5 rounded text-sm text-emerald-400 font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code
                      className="block bg-theme-card p-4 rounded-sm overflow-x-auto text-sm font-mono text-theme-main border border-theme"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="bg-theme-card p-4 rounded-sm overflow-x-auto mb-4 border border-theme">
                    {children}
                  </pre>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-theme-secondary my-4">
                    {children}
                  </blockquote>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-4">
                    <table className="min-w-full border border-theme">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-theme-card border-b border-theme">
                    {children}
                  </thead>
                ),
                th: ({ children }) => (
                  <th className="px-4 py-2 text-left text-xs font-semibold text-theme-main uppercase tracking-wider">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-2 text-sm text-theme-main border-t border-theme">
                    {children}
                  </td>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-blue-400 hover:text-blue-300 underline transition-colors cursor-pointer"
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                  >
                    {children}
                  </a>
                ),
                hr: () => <hr className="border-theme my-8" />,
                strong: ({ children }) => (
                  <strong className="font-bold text-theme-main">{children}</strong>
                ),
              }}
            >
              {docsContent}
            </ReactMarkdown>
          </article>
        </main>
      </div>
    </div>
  );
};
