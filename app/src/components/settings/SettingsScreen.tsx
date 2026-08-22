import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowsClockwise,
  BracketsAngle,
  ChatsCircle,
  Code,
  Database,
  Flask,
  Info,
  Keyboard,
  PaintBrushBroad,
  PlugsConnected,
  Robot,
  SquaresFour,
  TerminalWindow,
} from '@phosphor-icons/react';
import { AppChrome } from '../common/AppChrome';
import { AppFooter } from '../common/AppFooter';
import { SettingsAbout } from './sections/SettingsAbout';
import { SettingsAgent } from './sections/SettingsAgent';
import { SettingsAgents } from './sections/SettingsAgents';
import { SettingsAppearance } from './sections/SettingsAppearance';
import { SettingsData } from './sections/SettingsData';
import { SettingsEditor } from './sections/SettingsEditor';
import { SettingsEnvironment } from './sections/SettingsEnvironment';
import { SettingsIde } from './sections/SettingsIde';
import { SettingsQuickPrompts } from './sections/SettingsQuickPrompts';
import { SettingsShortcuts } from './sections/SettingsShortcuts';
import { SettingsTerminal } from './sections/SettingsTerminal';
import { SettingsUpdates } from './sections/SettingsUpdates';
import { SettingsWorkspace } from './sections/SettingsWorkspace';

type SettingsSection =
  | 'appearance'
  | 'terminal'
  | 'editor'
  | 'workspace'
  | 'environment'
  | 'agents'
  | 'agent'
  | 'ide'
  | 'shortcuts'
  | 'updates'
  | 'data'
  | 'quickPrompts'
  | 'about';

interface SettingsScreenProps {
  isWindows: boolean;
  onBack: () => void;
  onMinimizeWindow: () => void;
  onMaximizeWindow: () => void;
  onCloseWindow: () => void;
}

interface SettingsNavItem {
  id: SettingsSection;
  label: string;
  icon: ReactNode;
}

const ICON_SIZE = 17;

const SECTIONS: SettingsNavItem[] = [
  { id: 'appearance', label: 'Appearance', icon: <PaintBrushBroad size={ICON_SIZE} /> },
  { id: 'terminal', label: 'Terminal', icon: <TerminalWindow size={ICON_SIZE} /> },
  { id: 'editor', label: 'Editor', icon: <Code size={ICON_SIZE} /> },
  { id: 'workspace', label: 'Workspace', icon: <SquaresFour size={ICON_SIZE} /> },
  { id: 'environment', label: 'Environment', icon: <Flask size={ICON_SIZE} /> },
  { id: 'agents', label: 'CLI tools', icon: <PlugsConnected size={ICON_SIZE} /> },
  { id: 'agent', label: 'YzPz Agent', icon: <Robot size={ICON_SIZE} /> },
  { id: 'ide', label: 'IDE integration', icon: <BracketsAngle size={ICON_SIZE} /> },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: <Keyboard size={ICON_SIZE} /> },
  { id: 'updates', label: 'Updates', icon: <ArrowsClockwise size={ICON_SIZE} /> },
  { id: 'data', label: 'Data and storage', icon: <Database size={ICON_SIZE} /> },
  { id: 'quickPrompts', label: 'Quick prompts', icon: <ChatsCircle size={ICON_SIZE} /> },
  { id: 'about', label: 'About', icon: <Info size={ICON_SIZE} /> },
];

export const SettingsScreen = ({
  isWindows,
  onBack,
  onMinimizeWindow,
  onMaximizeWindow,
  onCloseWindow,
}: SettingsScreenProps) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
      case 'environment':
        return <SettingsEnvironment />;
      case 'agents':
        return <SettingsAgents />;
      case 'agent':
        return <SettingsAgent />;
      case 'ide':
        return <SettingsIde />;
      case 'shortcuts':
        return <SettingsShortcuts />;
      case 'updates':
        return <SettingsUpdates />;
      case 'data':
        return <SettingsData />;
      case 'quickPrompts':
        return <SettingsQuickPrompts />;
      case 'about':
        return <SettingsAbout />;
    }
  }, [activeSection]);

  const activeLabel = SECTIONS.find((section) => section.id === activeSection)?.label ?? activeSection;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-theme-main text-theme-main">
      <AppChrome
        center={<span className="text-xs text-[var(--text-secondary)]">Settings · {activeLabel}</span>}
        isWindows={isWindows}
        onBack={onBack}
        onClose={onCloseWindow}
        onMaximize={onMaximizeWindow}
        onMinimize={onMinimizeWindow}
        title="Settings"
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="app-sidebar w-60 shrink-0 overflow-y-auto px-3 py-5 custom-scrollbar" aria-label="Settings">
          <p className="app-section-label mb-3 px-2">Preferences</p>
          <div className="space-y-0.5">
            {SECTIONS.map((section) => (
              <button
                aria-current={activeSection === section.id ? 'page' : undefined}
                className="app-nav-item"
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                <span className="text-[var(--text-secondary)]">{section.icon}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="app-page app-page--narrow">
            <header className="mb-10 border-b border-[var(--border-primary)] pb-6">
              <h1 className="m-0 text-3xl leading-none">{activeLabel}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                Changes are saved automatically and apply across every workspace.
              </p>
            </header>
            {renderSection()}
          </div>
        </main>
      </div>

      <AppFooter />
    </div>
  );
};
