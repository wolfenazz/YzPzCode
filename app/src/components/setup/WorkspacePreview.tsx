import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Icon } from '@iconify/react';
import { TerminalWindow } from '@phosphor-icons/react';
import DecryptedText from '../reactbits/DecryptedText';
import { getLayoutDimensions } from '../../utils/grid';
import { cliMeta, slotAssignments } from './cliCatalog';
import { SETUP_EASE, useSetupMotion } from './useSetupMotion';
import type { AgentFleet, CliType, WorkspaceKind } from '../../types';

interface WorkspacePreviewProps {
  title: string;
  folderName?: string;
  sessions: number;
  agentFleet: AgentFleet;
  extensionNames: string[];
  external?: boolean;
  /** Writing and presentation workspaces show their studio instead of terminals. */
  kind?: WorkspaceKind;
}

const WRITING_LINES = [0.92, 0.86, 0.95, 0.6, 0.9, 0.82, 0.97, 0.45];

/** A sheet of paper whose lines ink in, the way a report streams onto the page. */
function WritingMock({ title, motionEnabled }: { title: string; motionEnabled: boolean }): React.JSX.Element {
  return (
    <div className="ws-canvas ws-writing">
      <div className="ws-writing__desk" aria-hidden="true">
        <div className="ws-writing__sheet ws-writing__sheet--back" />
        <div className="ws-writing__sheet">
          <div className="ws-writing__kind">Report</div>
          <div className="ws-writing__title">{title}</div>
          <div className="ws-writing__rule" />
          {WRITING_LINES.map((width, index) => (
            <motion.div
              key={index}
              className="ws-writing__line"
              style={{ width: `${width * 100}%`, transformOrigin: 'left' }}
              initial={motionEnabled ? { scaleX: 0, opacity: 0.4 } : false}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.7, ease: SETUP_EASE, delay: motionEnabled ? 0.3 + index * 0.22 : 0, repeat: motionEnabled ? Infinity : 0, repeatDelay: 3.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const DECK_FILM = [0, 1, 2, 3];
const DECK_BULLETS = [0.86, 0.72, 0.8];

/** A slide deck building itself: slides fill the filmstrip while the current one inks in. */
function DeckMock({ title, motionEnabled }: { title: string; motionEnabled: boolean }): React.JSX.Element {
  const loop = (delay: number) => ({ duration: 0.55, ease: SETUP_EASE, delay: motionEnabled ? delay : 0, repeat: motionEnabled ? Infinity : 0, repeatDelay: 3.4 });
  return (
    <div className="ws-canvas ws-deck" aria-hidden="true">
      <div className="ws-deck__film">
        {DECK_FILM.map((index) => (
          <motion.div
            key={index}
            className="ws-deck__thumb"
            data-active={index === 1 || undefined}
            initial={motionEnabled ? { opacity: 0.25, scale: 0.9 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={loop(0.2 + index * 0.35)}
          >
            <span className="ws-deck__thumb-title" />
            <span className="ws-deck__thumb-line" />
          </motion.div>
        ))}
      </div>
      <div className="ws-deck__stage">
        <div className="ws-deck__slide">
          <span className="ws-deck__kicker">Slide 2</span>
          <div className="ws-deck__title">{title}</div>
          <span className="ws-deck__rule" />
          <div className="ws-deck__content">
            <div className="ws-deck__bullets">
              {DECK_BULLETS.map((width, index) => (
                <motion.div key={index} className="ws-deck__bullet" style={{ width: `${width * 100}%`, transformOrigin: 'left' }}
                  initial={motionEnabled ? { scaleX: 0, opacity: 0.4 } : false} animate={{ scaleX: 1, opacity: 1 }} transition={loop(0.6 + index * 0.25)} />
              ))}
            </div>
            <div className="ws-deck__chart">
              {[0.45, 0.7, 0.58, 0.92].map((height, index) => (
                <motion.span key={index} style={{ height: `${height * 100}%`, transformOrigin: 'bottom' }}
                  initial={motionEnabled ? { scaleY: 0 } : false} animate={{ scaleY: 1 }} transition={loop(1.2 + index * 0.12)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SHELL_HINTS = ['git status', 'npm run dev', 'ls', 'npm test', 'cargo check', 'git log --oneline', 'docker ps', 'code .'];

function Pane({ cli, index, compact, folderName }: { cli: CliType | null; index: number; compact: boolean; folderName: string }): React.JSX.Element {
  const meta = cli ? cliMeta(cli) : null;
  const command = meta?.command ?? SHELL_HINTS[index % SHELL_HINTS.length];
  return (
    <>
      <motion.div layout="position" className="ws-pane__head">
        {meta && <span className="ws-pane__accent" style={{ background: meta.color }} />}
        {meta?.logo ? <img src={meta.logo} alt="" draggable={false} />
          : meta?.icon ? <Icon icon={meta.icon} width={11} height={11} style={{ color: meta.color }} />
            : <TerminalWindow size={11} className="shrink-0 text-[#8a8a8a]" />}
        <span>{meta?.label ?? (compact ? 'Shell' : `Shell ${index + 1}`)}</span>
      </motion.div>
      {/* Keyed by the CLI so reassigning a pane re-types its command. */}
      <motion.div layout="position" key={cli ?? 'shell'} className="ws-pane__body">
        <div className="ws-prompt">
          {!compact && <span className="ws-prompt__sigil">~/{folderName}&nbsp;</span>}
          <span className="ws-prompt__sigil">$&nbsp;</span>
          <span className="ws-typed" style={{ '--chars': command.length } as React.CSSProperties}>{command}</span>
          <span className="ws-caret" />
        </div>
        {!compact && meta && <div className="ws-pane__line" style={{ animationDelay: `${180 + command.length * 55 + 120}ms` }}>{meta.description}</div>}
      </motion.div>
    </>
  );
}

function EditorMock({ extensionNames, folderName }: { extensionNames: string[]; folderName: string }): React.JSX.Element {
  const tabs = ['index.ts', ...extensionNames].slice(0, 4);
  return (
    <div className="ws-editor">
      <div className="ws-editor__tree" aria-hidden="true">
        <span className="truncate font-mono text-[9px] text-[#8a8a8a]">{folderName}</span>
        {[70, 55, 82, 48, 64, 40].map((width, index) => <span key={index} className="ws-bar" style={{ width: `${width}%`, marginLeft: index % 3 === 1 ? 8 : 0 }} />)}
      </div>
      <div className="ws-editor__main">
        <div className="ws-editor__tabs">
          {tabs.map((tab, index) => <span key={tab} className="ws-editor__tab" data-active={index === tabs.length - 1}>{tab}</span>)}
        </div>
        <div className="ws-editor__code" aria-hidden="true">
          {[38, 64, 52, 0, 72, 44, 58, 30].map((width, index) => width === 0
            ? <span key={index} className="h-1" />
            : <span key={index} className={`ws-bar${index % 4 === 0 ? ' ws-bar--accent' : ''}`} style={{ width: `${width}%`, marginLeft: index % 3 === 2 ? 14 : 0 }} />)}
        </div>
      </div>
    </div>
  );
}

/**
 * Live mock of the workspace about to open. Panes are laid out exactly like the
 * real terminal grid and glide into place when the layout changes; each one
 * "types" the command its agent or tool will start with. Purely presentational.
 */
export function WorkspacePreview({ title, folderName, sessions, agentFleet, extensionNames, external, kind = 'coding' }: WorkspacePreviewProps): React.JSX.Element {
  const motionEnabled = useSetupMotion();
  const slots = slotAssignments(sessions, agentFleet);
  const { cols, rows } = getLayoutDimensions(sessions);
  const compact = sessions >= 6;
  const folder = folderName || 'project';
  const writing = kind === 'writing';
  const presenting = kind === 'presentation';
  const spring = motionEnabled ? { type: 'spring' as const, stiffness: 420, damping: 38 } : { duration: 0 };

  return (
    <div className="ws-window">
      <div className="ws-window__bar">
        <span className="ws-window__lights" aria-hidden="true"><span /><span /><span /></span>
        <DecryptedText text={title} className="ws-window__title" disabled={!motionEnabled} />
        <span className="ws-window__tag">{writing ? 'writing' : presenting ? 'slides' : sessions === 0 ? 'editor' : external ? 'external' : `${cols}×${rows}`}</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {writing ? (
          <motion.div key="writing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionEnabled ? 0.25 : 0 }}>
            <WritingMock title={title} motionEnabled={motionEnabled} />
          </motion.div>
        ) : presenting ? (
          <motion.div key="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionEnabled ? 0.25 : 0 }}>
            <DeckMock title={title} motionEnabled={motionEnabled} />
          </motion.div>
        ) : sessions === 0 ? (
          <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionEnabled ? 0.2 : 0 }}>
            <EditorMock extensionNames={extensionNames} folderName={folder} />
          </motion.div>
        ) : (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionEnabled ? 0.2 : 0 }}>
            <LayoutGroup>
              <div className="ws-canvas" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
                <AnimatePresence initial={false} mode="popLayout">
                  {slots.map((cli, index) => (
                    <motion.div key={index} layout className="ws-pane"
                      initial={motionEnabled ? { opacity: 0, scale: 0.92 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={motionEnabled ? { opacity: 0, scale: 0.92 } : undefined}
                      transition={{ ...spring, opacity: { duration: 0.2, ease: SETUP_EASE } }}>
                      <Pane cli={cli} index={index} compact={compact} folderName={folder} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </LayoutGroup>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
