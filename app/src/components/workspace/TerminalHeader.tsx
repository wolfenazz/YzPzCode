import React, { useRef } from 'react';
import type { ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  ArrowClockwise,
  Broom,
  CaretRight,
  DotsThree,
  FolderSimple,
  ListBullets,
  MagnifyingGlass,
  MouseSimple,
  Plus,
  Sparkle,
  TerminalWindow,
  X,
} from '@phosphor-icons/react';
import { Icon } from '@iconify/react';
import { CliType, AgentType, ToolCliType, TerminalSession, ManagedTerminalCommandState } from '../../types';
import { QuickActions } from './QuickActions';
import { PaneMaximizeButton, TerminalLayoutPicker } from './TerminalLayoutPicker';
import { AGENT_COMMANDS, getCommandIcon } from '../../data/agentCommands';
import { terminalDirectoryLabel } from '../../utils/terminalCwd';

import claudeLogo from '../../assets/claude.png';
import codexLogo from '../../assets/codex.png';
import antigravityLogo from '../../assets/antigravity.png';
import opencodeLogo from '../../assets/opencode.png';
import cursorLogo from '../../assets/cursor-ai.png';
import kiloLogo from '../../assets/kiloCode.gif';
import hermesLogo from '../../assets/Hermes-logo.png';
import piLogo from '../../assets/pi.svg';
import commandCodeLogo from '../../assets/commandcode-logo.svg';
import clineLogo from '../../assets/cline.webp';
import grokLogo from '../../assets/Grok.png';
import { ADDITIONAL_AGENT_LABELS, ADDITIONAL_AGENT_LOGOS } from '../../data/additionalAgents';

export const AGENT_LOGOS: Record<AgentType, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  antigravity: antigravityLogo,
  opencode: opencodeLogo,
  cursor: cursorLogo,
  kilo: kiloLogo,
  hermes: hermesLogo,
  pi: piLogo,
  commandcode: commandCodeLogo,
  cline: clineLogo,
  grok: grokLogo,
  ...ADDITIONAL_AGENT_LOGOS,
};

const TOOL_ICON_MAP: Record<ToolCliType, { icon: string; color: string }> = {
  gh: { icon: 'simple-icons:github', color: '#ffffff' },
  stripe: { icon: 'simple-icons:stripe', color: '#635BFF' },
  supabase: { icon: 'simple-icons:supabase', color: '#3FCF8E' },
  valyu: { icon: 'simple-icons:search', color: '#F59E0B' },
  posthog: { icon: 'simple-icons:posthog', color: '#1D4AFF' },
  elevenlabs: { icon: 'simple-icons:elevenlabs', color: '#8B5CF6' },
  ramp: { icon: 'simple-icons:creditcard', color: '#1AE65E' },
  gws: { icon: 'simple-icons:google', color: '#4285F4' },
  agentmail: { icon: 'simple-icons:mailgun', color: '#EC4899' },
  vercel: { icon: 'simple-icons:vercel', color: '#ffffff' },
};

const CLI_LABELS: Partial<Record<CliType, string>> = {
  claude: 'Claude',
  codex: 'Codex',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  kilo: 'Kilo',
  hermes: 'Hermes',
  pi: 'Pi',
  commandcode: 'Command Code',
  cline: 'Cline',
  grok: 'Grok',
  ...ADDITIONAL_AGENT_LABELS,
  gh: 'GitHub',
  stripe: 'Stripe',
  supabase: 'Supabase',
  valyu: 'Valyu',
  posthog: 'PostHog',
  elevenlabs: 'ElevenLabs',
  ramp: 'Ramp',
  gws: 'Google Workspace',
  agentmail: 'AgentMail',
  vercel: 'Vercel',
};

export const isAgentType = (cli: CliType): cli is AgentType => cli in AGENT_LOGOS;

const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

// Toggle rows flip in place; Radix would otherwise close the menu on select.
const keepMenuOpen = (event: Event): void => event.preventDefault();

const stopDrag = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

interface TerminalHeaderProps {
  session: TerminalSession;
  currentCwd: string;
  onRefreshCli: () => void;
  isRefreshing: boolean;
  onClose?: () => void;
  cliStatusBadge: ReactNode;
  /** Shown in place of the status badge while an agent works or just finished. */
  activityChip?: ReactNode;
  dragListeners?: Record<string, unknown>;
  mouseTrackingEnabled?: boolean;
  onToggleMouseTracking?: () => void;
  onNewSession?: () => void;
  onRunCommand?: (command: string) => void;
  agentOverride?: CliType | null;
  isActive?: boolean;
  showQuickPrompts?: boolean;
  onToggleQuickPrompts?: () => void;
  managedCommandState: ManagedTerminalCommandState | null;
  onStopManagedCommand: () => void;
  onFind?: () => void;
  onClear?: () => void;
  onFocusTerminal?: () => void;
}

const AgentMark: React.FC<{ agent: CliType }> = ({ agent }) => {
  if (!isAgentType(agent)) {
    const tool = TOOL_ICON_MAP[agent as ToolCliType];
    return tool ? <Icon icon={tool.icon} style={{ color: tool.color }} /> : <TerminalWindow size={14} />;
  }
  if (agent === 'claude') {
    return <Icon icon="simple-icons:anthropic" style={{ color: '#D97757' }} />;
  }
  const invert = agent === 'opencode' || agent === 'cursor' || agent === 'codex';
  return (
    <img
      src={AGENT_LOGOS[agent]}
      alt=""
      className={invert ? 'invert brightness-[3.5] contrast-[1.5]' : 'brightness-[2.2] contrast-[1.2]'}
    />
  );
};

const Kbd: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="term-menu__kbd" aria-hidden="true">
    {keys.map((key) => <kbd key={key}>{key}</kbd>)}
  </span>
);

export const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  session,
  currentCwd,
  onRefreshCli,
  isRefreshing,
  onClose,
  cliStatusBadge,
  activityChip,
  dragListeners,
  mouseTrackingEnabled = false,
  onToggleMouseTracking,
  onNewSession,
  onRunCommand,
  agentOverride,
  showQuickPrompts = false,
  onToggleQuickPrompts,
  managedCommandState,
  onStopManagedCommand,
  onFind,
  onClear,
  onFocusTerminal,
}) => {
  // The effective agent combines the fleet-assigned agent with a runtime
  // detection of an agent launched manually inside the terminal, so the badge
  // and agent actions appear in both cases.
  const effectiveAgent = agentOverride ?? session.agent;
  const isAiAgent = !!effectiveAgent && isAgentType(effectiveAgent);
  const agentCommands = isAiAgent && effectiveAgent ? AGENT_COMMANDS[effectiveAgent as AgentType] ?? [] : [];
  const agentLabel = effectiveAgent ? CLI_LABELS[effectiveAgent] ?? effectiveAgent : 'Shell';
  // Run starts its own PTY and streams into this pane, which would fight an AI
  // agent's UI. Hide it while an agent owns the terminal, but keep it mounted
  // if a managed command is still live so the user can always stop it.
  const managedCommandLive = ['Starting', 'Running', 'Stopping'].includes(managedCommandState?.status ?? '');
  const showRunControls = !isAiAgent || managedCommandLive;
  // Radix restores focus to the trigger when the menu closes. Send it to the
  // terminal instead, unless the chosen action owns focus (the find widget).
  const keepFocusRef = useRef(false);

  return (
    <div className="drag-handle term-header" {...dragListeners}>
      <div className="term-header__identity">
        <span className="term-index" title={`Terminal ${session.index + 1}`}>{session.index + 1}</span>

        <span className="term-agent" title={effectiveAgent ?? session.shell}>
          <span className="term-agent__logo">
            {effectiveAgent ? <AgentMark agent={effectiveAgent} /> : <TerminalWindow size={14} />}
          </span>
          <span className="term-agent__name">{agentLabel}</span>
        </span>

        <span className="term-sep" aria-hidden="true">/</span>

        <span className="term-cwd" title={currentCwd}>
          <FolderSimple size={12} aria-hidden="true" />
          <span>{terminalDirectoryLabel(currentCwd)}</span>
        </span>

        {effectiveAgent && (activityChip ?? cliStatusBadge)}
      </div>

      <div className="term-header__actions">
        {mouseTrackingEnabled && (
          <button
            type="button"
            {...stopDrag}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMouseTracking?.();
            }}
            className="term-btn term-btn--mouse"
            title="Mouse mode is on (click to turn off)"
            aria-label="Turn off mouse mode"
          >
            <MouseSimple size={14} weight="fill" aria-hidden="true" />
          </button>
        )}

        {showRunControls && (
          <QuickActions
            sessionId={session.id}
            workspaceId={session.workspaceId}
            cwd={currentCwd}
            managedState={managedCommandState}
            onStop={onStopManagedCommand}
          />
        )}

        <TerminalLayoutPicker session={session} />
        <PaneMaximizeButton session={session} />

        {isAiAgent && onNewSession && (
          <button
            type="button"
            {...stopDrag}
            onClick={(e) => {
              e.stopPropagation();
              onNewSession();
            }}
            className="term-btn"
            title="New session"
            aria-label="New session"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        )}

        <div className="term-divider" aria-hidden="true" />

        <div className="contents" {...stopDrag}>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="term-btn" title="Terminal options" aria-label="Terminal options">
                <DotsThree size={18} weight="bold" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="term-menu"
                align="end"
                sideOffset={6}
                collisionPadding={12}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  if (keepFocusRef.current) {
                    keepFocusRef.current = false;
                    return;
                  }
                  onFocusTerminal?.();
                }}
              >
                {isAiAgent && (
                  <>
                    <DropdownMenu.Label className="term-menu__label">
                      <span>Agent</span>
                      <span className="term-menu__label-meta">{agentLabel}</span>
                    </DropdownMenu.Label>
                    {onRunCommand && agentCommands.length > 0 && (
                      <DropdownMenu.Sub>
                        <DropdownMenu.SubTrigger className="term-menu__item">
                          <span className="term-menu__icon"><ListBullets size={14} /></span>
                          <span className="term-menu__text"><span>Agent commands</span></span>
                          <span className="term-menu__hint">{agentCommands.length}</span>
                          <CaretRight size={11} className="term-menu__chevron" />
                        </DropdownMenu.SubTrigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.SubContent className="term-menu term-menu--commands" sideOffset={6} collisionPadding={12}>
                            {agentCommands.map((cmd) => (
                              <DropdownMenu.Item
                                key={cmd.command}
                                className="term-menu__item"
                                onSelect={() => onRunCommand(cmd.command)}
                                title={cmd.description}
                              >
                                <span className="term-menu__icon">{getCommandIcon(cmd.command)}</span>
                                <span className="term-menu__text">
                                  <span className="term-menu__mono">{cmd.command}</span>
                                  <span className="term-menu__desc">{cmd.description}</span>
                                </span>
                              </DropdownMenu.Item>
                            ))}
                          </DropdownMenu.SubContent>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Sub>
                    )}
                    {onToggleQuickPrompts && (
                      <DropdownMenu.CheckboxItem
                        className="term-menu__item"
                        checked={showQuickPrompts}
                        onSelect={keepMenuOpen}
                        onCheckedChange={onToggleQuickPrompts}
                      >
                        <span className="term-menu__icon"><Sparkle size={14} /></span>
                        <span className="term-menu__text"><span>Quick prompts</span></span>
                        <span className="term-switch" aria-hidden="true" />
                      </DropdownMenu.CheckboxItem>
                    )}
                    <DropdownMenu.Separator className="term-menu__sep" />
                  </>
                )}

                <DropdownMenu.Label className="term-menu__label"><span>Terminal</span></DropdownMenu.Label>
                {onFind && (
                  <DropdownMenu.Item
                    className="term-menu__item"
                    onSelect={() => {
                      keepFocusRef.current = true;
                      onFind();
                    }}
                  >
                    <span className="term-menu__icon"><MagnifyingGlass size={14} /></span>
                    <span className="term-menu__text"><span>Find</span></span>
                    <Kbd keys={[MOD_KEY, 'F']} />
                  </DropdownMenu.Item>
                )}
                {onClear && (
                  <DropdownMenu.Item className="term-menu__item" onSelect={onClear}>
                    <span className="term-menu__icon"><Broom size={14} /></span>
                    <span className="term-menu__text"><span>Clear</span></span>
                    <Kbd keys={[MOD_KEY, 'L']} />
                  </DropdownMenu.Item>
                )}
                {onToggleMouseTracking && (
                  <DropdownMenu.CheckboxItem
                    className="term-menu__item"
                    checked={mouseTrackingEnabled}
                    onSelect={keepMenuOpen}
                    onCheckedChange={onToggleMouseTracking}
                  >
                    <span className="term-menu__icon"><MouseSimple size={14} /></span>
                    <span className="term-menu__text">
                      <span>Mouse mode</span>
                      <span className="term-menu__desc">Send clicks and scrolls to the running app</span>
                    </span>
                    <span className="term-switch" aria-hidden="true" />
                  </DropdownMenu.CheckboxItem>
                )}
                {(session.agent || onClose) && <DropdownMenu.Separator className="term-menu__sep" />}
                {session.agent && (
                  <DropdownMenu.Item className="term-menu__item" disabled={isRefreshing} onSelect={onRefreshCli}>
                    <span className="term-menu__icon">
                      <ArrowClockwise size={14} className={isRefreshing ? 'term-spin' : ''} />
                    </span>
                    <span className="term-menu__text"><span>{isRefreshing ? 'Restarting CLI…' : 'Restart CLI'}</span></span>
                  </DropdownMenu.Item>
                )}
                {onClose && (
                  <DropdownMenu.Item className="term-menu__item term-menu__item--danger" onSelect={onClose}>
                    <span className="term-menu__icon"><X size={14} /></span>
                    <span className="term-menu__text"><span>Close terminal</span></span>
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        {onClose && (
          <button
            type="button"
            {...stopDrag}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="term-btn term-btn--close"
            title="Close terminal"
            aria-label="Close terminal"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
