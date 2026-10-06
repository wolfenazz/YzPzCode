import { useEffect } from 'react';
import { CheckCircle, CircleNotch, Info, WarningCircle } from '@phosphor-icons/react';
import { useExtensionStore, type ExtensionPromptNotice as Notice } from '../../stores/extensionStore';

/** How long each outcome of a prompt handoff stays on the panel's header. */
const HOLD_MS: Record<Notice['tone'], number | null> = { pending: null, success: 4000, info: 8000, error: 12000 };
const ICONS = { pending: CircleNotch, success: CheckCircle, info: Info, error: WarningCircle } as const;
const COLORS = {
  pending: 'text-[var(--text-secondary)]',
  success: 'text-emerald-500',
  info: 'text-[var(--text-secondary)]',
  error: 'text-rose-500',
} as const;

/** The outcome of the last prompt sent to this panel from the browser (utils/extensionPrompt.ts). */
export function ExtensionPromptNotice({ panelId }: { panelId: string }): React.JSX.Element | null {
  const notice = useExtensionStore((state) => state.promptNoticeByPanel[panelId]);
  const setPromptNotice = useExtensionStore((state) => state.setPromptNotice);

  useEffect(() => {
    const hold = notice ? HOLD_MS[notice.tone] : null;
    if (!notice || hold === null) return;
    const timer = setTimeout(() => {
      if (useExtensionStore.getState().promptNoticeByPanel[panelId]?.at === notice.at) setPromptNotice(panelId, null);
    }, hold);
    return () => clearTimeout(timer);
  }, [notice, panelId, setPromptNotice]);

  if (!notice) return null;
  const Icon = ICONS[notice.tone];
  return (
    <span role="status" title={notice.text} className={`flex min-w-0 max-w-[240px] shrink items-center gap-1 text-[10px] ${COLORS[notice.tone]}`}>
      <Icon size={12} weight="bold" className={`shrink-0${notice.tone === 'pending' ? ' animate-spin' : ''}`} aria-hidden="true" />
      <span className="truncate">{notice.text}</span>
    </span>
  );
}
