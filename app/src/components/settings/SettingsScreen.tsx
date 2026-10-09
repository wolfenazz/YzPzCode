import { useEffect, useState } from 'react';
import type { ElementType, ReactElement } from 'react';
import {
  ArrowsClockwise,
  BracketsAngle,
  ChatsCircle,
  Code,
  Database,
  Feather,
  PresentationChart,
  Flask,
  Info,
  Keyboard,
  PaintBrushBroad,
  Play,
  PlugsConnected,
  SquaresFour,
  TerminalWindow,
} from '@phosphor-icons/react';
import { AppChrome } from '../common/AppChrome';
import { AppFooter } from '../common/AppFooter';
import { SettingsAbout } from './sections/SettingsAbout';
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
import { SettingsRuns } from './sections/SettingsRuns';
import { SettingsWriting } from './sections/SettingsWriting';
import { SettingsPresentation } from './sections/SettingsPresentation';
import './settings.css';

type SettingsSection =
  | 'appearance'
  | 'terminal'
  | 'editor'
  | 'workspace'
  | 'agents'
  | 'runs'
  | 'writing'
  | 'presentation'
  | 'ide'
  | 'quickPrompts'
  | 'environment'
  | 'updates'
  | 'data'
  | 'shortcuts'
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
  description: string;
  icon: ElementType;
  render: () => ReactElement;
}

interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

const ICON_SIZE = 17;

const GROUPS: SettingsNavGroup[] = [
  {
    label: 'General',
    items: [
      {
        id: 'appearance',
        label: 'Appearance',
        description: 'Theme, accent color, backgrounds and interface size.',
        icon: PaintBrushBroad,
        render: () => <SettingsAppearance />,
      },
      {
        id: 'terminal',
        label: 'Terminal',
        description: 'Font, colors and behavior of terminal panes.',
        icon: TerminalWindow,
        render: () => <SettingsTerminal />,
      },
      {
        id: 'editor',
        label: 'Editor',
        description: 'How code looks and how files are saved.',
        icon: Code,
        render: () => <SettingsEditor />,
      },
      {
        id: 'workspace',
        label: 'Workspace',
        description: 'Defaults for new workspaces and what is remembered.',
        icon: SquaresFour,
        render: () => <SettingsWorkspace />,
      },
    ],
  },
  {
    label: 'Tools',
    items: [
      {
        id: 'agents',
        label: 'CLI tools',
        description: 'Check which AI agents and service CLIs are installed.',
        icon: PlugsConnected,
        render: () => <SettingsAgents />,
      },
      {
        id: 'writing',
        label: 'Writing',
        description: 'Report profiles, the humanizer, writing engines and saving.',
        icon: Feather,
        render: () => <SettingsWriting />,
      },
      {
        id: 'presentation',
        label: 'Presentation',
        description: 'Deck themes, presenter engines, slide batches and saving.',
        icon: PresentationChart,
        render: () => <SettingsPresentation />,
      },
      {
        id: 'runs',
        label: 'Application runs',
        description: 'Commands offered by each terminal’s Run button.',
        icon: Play,
        render: () => <SettingsRuns />,
      },
      {
        id: 'ide',
        label: 'IDE integration',
        description: 'Open new workspaces in your installed editors.',
        icon: BracketsAngle,
        render: () => <SettingsIde />,
      },
      {
        id: 'quickPrompts',
        label: 'Quick prompts',
        description: 'One-click prompts for the element inspector.',
        icon: ChatsCircle,
        render: () => <SettingsQuickPrompts />,
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        id: 'environment',
        label: 'Environment',
        description: 'Software the app depends on, and whether it is installed.',
        icon: Flask,
        render: () => <SettingsEnvironment />,
      },
      {
        id: 'updates',
        label: 'Updates',
        description: 'Keep YzPzCode current.',
        icon: ArrowsClockwise,
        render: () => <SettingsUpdates />,
      },
      {
        id: 'data',
        label: 'Data and storage',
        description: 'Back up, restore or clear what the app stores on this device.',
        icon: Database,
        render: () => <SettingsData />,
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        description: 'Every shortcut available in the app.',
        icon: Keyboard,
        render: () => <SettingsShortcuts />,
      },
      {
        id: 'about',
        label: 'About',
        description: 'Version, credits and links.',
        icon: Info,
        render: () => <SettingsAbout />,
      },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((group) => group.items);

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

  const active = ALL_ITEMS.find((item) => item.id === activeSection) ?? ALL_ITEMS[0];
  const ActiveIcon = active.icon;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-theme-main text-theme-main">
      <AppChrome
        crumbs={['Settings', active.label]}
        isWindows={isWindows}
        onBack={onBack}
        onClose={onCloseWindow}
        onMaximize={onMaximizeWindow}
        onMinimize={onMinimizeWindow}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav aria-label="Settings" className="st-nav custom-scrollbar">
          {GROUPS.map((group) => (
            <div className="st-nav__group" key={group.label}>
              <p className="st-nav__label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    aria-current={activeSection === item.id ? 'page' : undefined}
                    className="st-nav__item"
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    type="button"
                  >
                    <Icon size={ICON_SIZE} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="st-main custom-scrollbar">
          <div className="st-page" key={active.id}>
            <header className="st-page__header">
              <span className="st-page__icon">
                <ActiveIcon size={20} aria-hidden="true" />
              </span>
              <div>
                <h1 className="st-page__title">{active.label}</h1>
                <p className="st-page__desc">{active.description}</p>
              </div>
            </header>
            {active.render()}
          </div>
        </main>
      </div>

      <AppFooter />
    </div>
  );
};
