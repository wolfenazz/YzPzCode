import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { AppFooter } from '../common/AppFooter';
import { ThemeToggleButton } from '../common/ThemeToggleButton';
import { SettingsAppearance } from './sections/SettingsAppearance';
import { SettingsTerminal } from './sections/SettingsTerminal';
import { SettingsEditor } from './sections/SettingsEditor';
import { SettingsWorkspace } from './sections/SettingsWorkspace';
import { SettingsAgents } from './sections/SettingsAgents';
import { SettingsIde } from './sections/SettingsIde';
import { SettingsShortcuts } from './sections/SettingsShortcuts';
import { SettingsUpdates } from './sections/SettingsUpdates';
import { SettingsData } from './sections/SettingsData';
import { SettingsAbout } from './sections/SettingsAbout';
import logo from '../../assets/YzPzCodeLogo.png';

type SettingsSection =
  | 'appearance'
  | 'terminal'
  | 'editor'
  | 'workspace'
  | 'agents'
  | 'ide'
  | 'shortcuts'
  | 'updates'
  | 'data'
  | 'about';

interface SettingsScreenProps {
  isWindows: boolean;
  onBack: () => void;
  onMinimizeWindow: () => void;
  onMaximizeWindow: () => void;
  onCloseWindow: () => void;
}

const SECTIONS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.625 2.625 0 01-2.625 2.625h5.25a2.625 2.625 0 002.625-2.625 3 3 0 00-.772-.944" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3" />
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.5} />
      </svg>
    ),
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'AI Agents',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
      </svg>
    ),
  },
  {
    id: 'ide',
    label: 'IDE Integration',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
  },
  {
    id: 'shortcuts',
    label: 'Keyboard Shortcuts',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 5.25h16.5a1.5 1.5 0 011.5 1.5v10.5a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5V6.75a1.5 1.5 0 011.5-1.5z" />
        <path strokeLinecap="round" strokeWidth={1.5} d="M6 9h.008M9 9h.008M12 9h.008M15 9h.008M6 12.75h.008M9 12.75h.008M12 12.75h.008M15 12.75h.008M18 12.75h.008M7.5 15.75h9" />
      </svg>
    ),
  },
  {
    id: 'updates',
    label: 'Updates',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data & Storage',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  isWindows,
  onBack,
  onMinimizeWindow,
  onMaximizeWindow,
  onCloseWindow,
}) => {
  const { theme, toggleTheme } = useAppStore();
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const renderSection = useCallback(() => {
    switch (activeSection) {
      case 'appearance':
        return <SettingsAppearance />;
      case 'terminal':
        return <SettingsTerminal />;
      case 'editor':
        return <SettingsEditor />;
      case 'workspace':
        return <SettingsWorkspace />;
      case 'agents':
        return <SettingsAgents />;
      case 'ide':
        return <SettingsIde />;
      case 'shortcuts':
        return <SettingsShortcuts />;
      case 'updates':
        return <SettingsUpdates />;
      case 'data':
        return <SettingsData />;
      case 'about':
        return <SettingsAbout />;
      default:
        return null;
    }
  }, [activeSection]);

  const activeLabel = SECTIONS.find((s) => s.id === activeSection)?.label ?? activeSection;
  const activeIndex = SECTIONS.findIndex((s) => s.id === activeSection) + 1;

  return (
    <div className={`h-screen bg-theme-main text-theme-main font-mono flex flex-col overflow-hidden ${theme === 'light' ? 'light-theme' : ''}`}>
      <header
        data-tauri-drag-region
        className="relative z-50 flex items-center h-11 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-[var(--accent-border)] select-none titlebar-drag flex-shrink-0"
      >
        <div className="flex items-center h-full titlebar-nodrag">
          <button
            onClick={onBack}
            className="group/back flex items-center gap-1.5 px-4 h-full border-r border-white/[0.04] hover:bg-white/[0.03] transition-all duration-150 text-zinc-500 hover:text-[var(--accent)] cursor-pointer"
            title="Back (Esc)"
          >
            <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover/back:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[9px] font-mono tracking-[0.15em] uppercase">esc</span>
          </button>

          <div className="flex items-center gap-2.5 px-4 h-full border-r border-white/[0.04] cursor-default">
            <img src={logo} alt="YzPzCode" className="h-4 w-auto opacity-60" />
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-zinc-600 text-[10px]">~</span>
              <span className="text-[10px] text-zinc-500">/</span>
              <span className="text-[10px] text-zinc-400">yzpz</span>
              <span className="text-[10px] text-zinc-600">/</span>
              <span className="text-[10px] text-[var(--accent)]">settings</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center h-full min-w-0">
          <div className="hidden lg:flex items-center gap-2 px-4 text-[10px] font-mono titlebar-nodrag">
            <span className="text-zinc-600">{String(activeIndex).padStart(2, '0')}</span>
            <span className="text-zinc-700">//</span>
            <span className="text-zinc-500 tracking-wide">{activeSection}</span>
          </div>
        </div>

        <div className="flex items-center h-full titlebar-nodrag">
          <div className="flex items-center h-full border-l border-white/[0.04]">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
          </div>

          {isWindows && (
            <div className="flex h-full border-l border-white/[0.04]">
              <button
                onClick={onMinimizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
                title="Minimize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="currentColor" width="10" height="1" x="1" y="5.5" />
                </svg>
              </button>
              <button
                onClick={onMaximizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
                title="Maximize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="none" stroke="currentColor" width="8" height="8" x="2" y="2" strokeWidth="1" />
                </svg>
              </button>
              <button
                onClick={onCloseWindow}
                className="w-[48px] h-full flex items-center justify-center hover:bg-[#c42b1c] text-zinc-500 hover:text-white transition-colors duration-150 cursor-pointer"
                title="Close"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M2.5,2.5 L9.5,9.5 M2.5,9.5 L9.5,2.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <nav className="w-48 flex-shrink-0 bg-[#080810]/60 border-r border-white/[0.03] overflow-y-auto custom-scrollbar">
          <div className="py-4 px-3">
            <div className="mb-4 px-2">
              <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em]">Configuration</p>
            </div>
            <div className="space-y-[1px]">
              {SECTIONS.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-md text-[11px] font-mono transition-all duration-150 cursor-pointer group ${
                      isActive
                        ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                        : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.02]'
                    }`}
                  >
                    <span className={`transition-colors duration-150 ${
                      isActive ? 'text-[var(--accent)]' : 'text-zinc-700 group-hover:text-zinc-500'
                    }`}>
                      {section.icon}
                    </span>
                    <span className={`tracking-wide ${isActive ? 'font-medium' : ''}`}>
                      {section.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        <main className="flex-1 bg-[#06060b] overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto">
            <div className="sticky top-0 z-10 bg-[#06060b]/80 backdrop-blur-md px-8 pt-6 pb-4 border-b border-white/[0.03]">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-[var(--accent)]/40 text-[10px]">&gt;</span>
                <span className="text-[10px] text-zinc-600">settings</span>
                <span className="text-[10px] text-zinc-700">/</span>
                <span className="text-[11px] text-zinc-300 tracking-wide">{activeLabel}</span>
                <span className="text-[10px] text-zinc-700 ml-1">.config</span>
              </div>
            </div>
            <div className="p-8 pt-6">
              {renderSection()}
            </div>
          </div>
        </main>
      </div>

      <AppFooter />
    </div>
  );
};
