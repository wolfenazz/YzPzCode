import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import { useExtensionStore } from '../stores/extensionStore';
import type { WorkspaceExtensionPanel } from '../types';

/**
 * Hands a prompt (browser inspector, UI references) to an extension panel's
 * assistant chat, the way the same prompt is pasted into an agent terminal.
 * The panel's webview finds the chat box, inserts the text and submits it
 * (src-tauri/src/extension_host/panel-prompt.js); the backend reports the
 * outcome as `extension-panel-prompt-result`.
 */

/** Agent target ids for extension panels; terminal targets are session ids. */
const TARGET_PREFIX = 'extension:';
export const extensionTargetId = (panelId: string): string => `${TARGET_PREFIX}${panelId}`;
export const extensionPanelIdFromTarget = (targetId: string): string | null =>
  targetId.startsWith(TARGET_PREFIX) ? targetId.slice(TARGET_PREFIX.length) : null;

/** 'inserted': the text is in the chat box but could not be submitted. */
export type ExtensionPromptOutcome = 'submitted' | 'inserted';

interface PromptResultPayload {
  panelId: string;
  requestId: string;
  status: string;
}

const RESULT_TIMEOUT_MS = 25_000;
/** A panel opened for the prompt may wait on sign-in or workspace trust. */
const START_TIMEOUT_MS = 120_000;
const RETRY_MS = 750;
/** Matches PANEL_NOT_RUNNING in extension_host/mod.rs. */
const NOT_RUNNING = 'extension panel is not running';
/** While a panel opened for the prompt starts, these mean "not yet". */
const STARTING_STATUSES = new Set(['starting', 'not-ready', 'no-view', 'unavailable', 'no-input']);

export function extensionPromptFailure(status: string, name: string): string {
  switch (status) {
    case 'no-input':
      return `Couldn't find ${name}'s message box. Open a chat in ${name}, then send again.`;
    case 'failed':
      return `${name} didn't accept the text. Click its message box, then send again.`;
    case 'not-ready':
      return `${name} isn't ready yet. Finish signing in or trusting the workspace, then send again.`;
    case 'no-view':
      return `${name}'s chat isn't showing. Return to its chat, then send again.`;
    default:
      return `${name} didn't respond. Wait for it to finish loading, then send again.`;
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function sendOnce(panelId: string, text: string): Promise<string> {
  const requestId = crypto.randomUUID();
  let settle: (status: string) => void = () => undefined;
  const result = new Promise<string>((resolve) => { settle = resolve; });
  const unlisten = await listen<PromptResultPayload>('extension-panel-prompt-result', ({ payload }) => {
    if (payload.panelId === panelId && payload.requestId === requestId) settle(payload.status);
  });
  const timer = window.setTimeout(() => settle('timeout'), RESULT_TIMEOUT_MS);
  try {
    await invoke('send_extension_panel_prompt', { panelId, requestId, text, submit: true });
    return await result;
  } finally {
    window.clearTimeout(timer);
    unlisten();
  }
}

/** Shows the panel where it lives (Extensions view or the editor's side panel), which starts it. */
export function revealExtensionPanel(panel: WorkspaceExtensionPanel): void {
  const extensions = useExtensionStore.getState();
  if (panel.dock === 'side') {
    extensions.setDockOpen(panel.workspaceId, true);
    extensions.setDockActivePanel(panel.workspaceId, panel.id);
    useAppStore.getState().setActiveView('editor');
  } else {
    useAppStore.getState().setActiveView('extensions');
  }
}

/**
 * Sends `text` to the panel's assistant and submits it. A panel that has not
 * started yet (never shown since launch) is opened first and receives the
 * prompt once its chat is up. The outcome is also shown on the panel itself,
 * since opening it replaces the caller's view.
 */
export async function sendPromptToExtensionPanel(
  panel: WorkspaceExtensionPanel,
  text: string,
): Promise<ExtensionPromptOutcome> {
  const { setPromptNotice } = useExtensionStore.getState();
  const deadline = Date.now() + START_TIMEOUT_MS;
  let revealed = false;
  try {
    for (;;) {
      let status: string;
      try {
        status = await sendOnce(panel.id, text);
      } catch (error) {
        if (!String(error).includes(NOT_RUNNING)) throw new Error(String(error));
        if (!revealed) {
          revealed = true;
          revealExtensionPanel(panel);
          setPromptNotice(panel.id, { tone: 'pending', text: 'Waiting to send prompt…' });
        }
        status = 'starting';
      }
      if (status === 'submitted' || status === 'inserted') {
        setPromptNotice(panel.id, status === 'submitted'
          ? { tone: 'success', text: 'Prompt sent' }
          : { tone: 'info', text: 'Prompt added — press Enter to send' });
        return status;
      }
      if (!revealed || !STARTING_STATUSES.has(status) || Date.now() > deadline) {
        throw new Error(extensionPromptFailure(status === 'starting' ? 'timeout' : status, panel.name));
      }
      await delay(RETRY_MS);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setPromptNotice(panel.id, { tone: 'error', text: message });
    throw new Error(message);
  }
}
