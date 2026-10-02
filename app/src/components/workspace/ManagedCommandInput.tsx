import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function ManagedCommandInput({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  return (
    <form className="shrink-0 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5" onSubmit={(event) => {
      event.preventDefault();
      if (sending) return;
      setSending(true);
      setError('');
      void invoke('send_managed_terminal_input', { sessionId, input: `${input}\n` })
        .then(() => setInput(''))
        .catch((reason: unknown) => setError(String(reason)))
        .finally(() => setSending(false));
    }}>
      <div className="flex items-center gap-2">
        <input aria-label="Application input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Send input to running application…" className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        <button type="submit" disabled={sending} className="text-xs text-[var(--text-secondary)] disabled:opacity-40">{sending ? 'Sending…' : 'Send'}</button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-rose-400">{error}</p>}
    </form>
  );
}
