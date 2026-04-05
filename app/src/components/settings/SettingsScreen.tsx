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
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeWidth={1.5} d="M6 8l4 4-4 4M12 16h6" />
      </svg>
    ),
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={1.5} />
        <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={1.5} />
        <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={1.5} />
        <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth={1.5} />
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'AI Agents',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'ide',
    label: 'IDE Integration',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'shortcuts',
    label: 'Keyboard Shortcuts',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeWidth={1.5} d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
      </svg>
    ),
  },
  {
    id: 'updates',
    label: 'Updates',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data & Storage',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <ellipse cx="12" cy="5" rx="9" ry="3" strokeWidth={1.5} />
        <path strokeWidth={1.5} d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path strokeWidth={1.5} d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

  return (
    <div className={`h-screen bg-theme-main text-theme-main font-mono flex flex-col overflow-hidden ${theme === 'light' ? 'light-theme' : ''}`}>
      <header
        data-tauri-drag-region
        className="relative z-50 flex items-center h-11 bg-theme-card/60 backdrop-blur-md border-b border-theme select-none titlebar-drag flex-shrink-0"
      >
        <div className="flex items-center h-full titlebar-nodrag">
          <button
            onClick={onBack}
            className="group/back flex items-center gap-1.5 px-4 h-full border-r border-theme hover:bg-theme-hover transition-colors duration-150 text-zinc-500 hover:text-theme-main cursor-pointer"
            title="Back (Esc)"
          >
            <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover/back:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[9px] font-mono tracking-[0.15em] uppercase">back</span>
          </button>

          <div className="flex items-center gap-2.5 px-4 h-full border-r border-theme bg-theme-card/40 cursor-default">
            <img src={logo} alt="YzPzCode" className="h-5 w-auto opacity-70" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold tracking-tight text-theme-main">YZPZ</span>
              <span className="text-[9px] text-zinc-600">/</span>
              <span className="text-[10px] font-mono text-theme-secondary tracking-wide">settings</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center h-full min-w-0">
          <div className="hidden lg:flex items-center gap-4 px-5 text-[9px] font-mono tracking-[0.2em] text-zinc-600 uppercase titlebar-nodrag">
            <span>_settings</span>
            <span className="text-zinc-700">:</span>
            <span>{activeSection}</span>
          </div>
        </div>

        <div className="flex items-center h-full titlebar-nodrag">
          <div className="flex items-center h-full border-l border-theme">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
          </div>

          {isWindows && (
            <div className="flex h-full border-l border-theme">
              <button
                onClick={onMinimizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                title="Minimize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="currentColor" width="10" height="1" x="1" y="5.5" />
                </svg>
              </button>
              <button
                onClick={onMaximizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
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
        <nav className="w-56 flex-shrink-0 bg-theme-card/40 border-r border-theme overflow-y-auto custom-scrollbar">
          <div className="p-3 space-y-1">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-mono transition-all duration-150 cursor-pointer ${
                  activeSection === section.id
                    ? 'bg-theme-main/10 text-theme-main border border-theme-main/20'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-theme-hover border border-transparent'
                }`}
              >
                <span className={activeSection === section.id ? 'text-theme-main' : 'text-zinc-600'}>
                  {section.icon}
                </span>
                <span className="tracking-wide">{section.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto p-8">
            {renderSection()}
          </div>
        </main>
      </div>

      <AppFooter />
    </div>
  );
};
