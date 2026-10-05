/**
 * DOM side of the global right-click menu: work out what was clicked, and run
 * the clipboard commands against it.
 *
 * The menu takes keyboard focus while it is open, so every command first hands
 * focus back to the original target. The rules for which commands are offered
 * live in `contextMenuModel.ts`.
 */

import type { MenuTargetInfo } from './contextMenuModel';
import type { RegisteredTerminal } from './terminalRegistry';
import { getTerminalForTarget } from './terminalRegistry';

export interface ContextTarget extends MenuTargetInfo {
  terminal: RegisteredTerminal | null;
  editable: HTMLElement | null;
  /** The selection at right-click time; reading it later races with the menu taking focus. */
  selectedText: string;
}

export const EMPTY_TARGET: ContextTarget = {
  kind: 'page',
  hasSelection: false,
  readOnly: false,
  secret: false,
  terminal: null,
  editable: null,
  selectedText: '',
};

type TextField = HTMLInputElement | HTMLTextAreaElement;

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number']);

const isTextField = (el: Element | null): el is TextField =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

function findEditable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const host = target.closest<HTMLElement>('input, textarea, [contenteditable]');
  if (!host) return null;
  if (host instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(host.type) ? host : null;
  if (host instanceof HTMLTextAreaElement) return host;
  return host.isContentEditable ? host : null;
}

function readFieldSelection(field: TextField): string {
  let start: number | null = null;
  let end: number | null = null;
  try {
    start = field.selectionStart;
    end = field.selectionEnd;
  } catch {
    // Some input types throw instead of returning null.
  }
  if (start !== null && end !== null) return start === end ? '' : field.value.slice(start, end);
  // number/email inputs expose no range; the document selection still covers their text.
  return document.activeElement === field ? (window.getSelection()?.toString() ?? '') : '';
}

function readEditableSelection(el: HTMLElement): string {
  if (isTextField(el)) return readFieldSelection(el);
  const selection = window.getSelection();
  return selection && el.contains(selection.anchorNode) ? selection.toString() : '';
}

const isReadOnly = (el: HTMLElement): boolean =>
  el.matches(':read-only') || el.getAttribute('aria-readonly') === 'true';

export function detectContextTarget(eventTarget: EventTarget | null): ContextTarget {
  const terminal = getTerminalForTarget(eventTarget) ?? null;
  if (terminal) {
    const selectedText = terminal.xterm.getSelection();
    return {
      kind: 'terminal',
      hasSelection: selectedText.length > 0,
      readOnly: false,
      secret: false,
      terminal,
      editable: null,
      selectedText,
    };
  }

  const editable = findEditable(eventTarget);
  if (editable) {
    const secret = editable instanceof HTMLInputElement && editable.type === 'password';
    // Copy and Cut are disabled for passwords, so never read or hold the text.
    const selectedText = secret ? '' : readEditableSelection(editable);
    return {
      kind: 'editable',
      hasSelection: selectedText.length > 0,
      readOnly: isReadOnly(editable),
      secret,
      terminal: null,
      editable,
      selectedText,
    };
  }

  const selectedText = window.getSelection()?.toString() ?? '';
  return { ...EMPTY_TARGET, hasSelection: selectedText.length > 0, selectedText };
}

/** Give the original target focus back; the menu moved it into itself. */
export function restoreTargetFocus(target: ContextTarget): void {
  if (target.terminal) {
    target.terminal.focus();
  } else if (target.editable?.isConnected) {
    target.editable.focus({ preventScroll: true });
  }
}

export async function copyFromTarget(target: ContextTarget): Promise<void> {
  restoreTargetFocus(target);
  if (target.selectedText) await navigator.clipboard.writeText(target.selectedText);
}

export async function cutFromTarget(target: ContextTarget): Promise<void> {
  const field = target.editable;
  if (!field?.isConnected || !target.selectedText) return;
  restoreTargetFocus(target);
  await navigator.clipboard.writeText(target.selectedText);
  // execCommand keeps the undo stack and fires real input events (React onChange).
  if (document.execCommand('delete')) return;
  if (isTextField(field)) {
    try {
      field.setRangeText('');
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteByCut' }));
    } catch {
      // Input types without a selection range cannot be edited this way.
    }
  }
}

/**
 * Replay the clipboard as a real paste event first, so components with their
 * own onPaste handling (the rich prompt editor, sanitising fields) behave
 * exactly as they do for Ctrl+V. Returns true when one of them handled it.
 */
function dispatchPaste(el: HTMLElement, text: string): boolean {
  try {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true });
    // Some engines drop clipboardData on synthetic events; a handler would then fail halfway.
    if (event.clipboardData?.getData('text/plain') !== text) return false;
    return !el.dispatchEvent(event);
  } catch {
    return false;
  }
}

function insertText(el: HTMLElement, text: string): void {
  if (document.execCommand('insertText', false, text)) return;
  if (!isTextField(el)) return;
  try {
    const start = el.selectionStart ?? el.value.length;
    el.setRangeText(text, start, el.selectionEnd ?? start, 'end');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
  } catch {
    // Input types without a selection range cannot be edited this way.
  }
}

export async function pasteIntoTarget(target: ContextTarget): Promise<void> {
  restoreTargetFocus(target);
  const text = await navigator.clipboard.readText();
  if (!text) return;

  if (target.terminal) {
    await target.terminal.paste(text);
    return;
  }

  const field = target.editable;
  if (!field?.isConnected) return;
  restoreTargetFocus(target);
  if (!dispatchPaste(field, text)) insertText(field, text);
}

export function selectAllInTarget(target: ContextTarget): void {
  restoreTargetFocus(target);
  if (target.terminal) {
    target.terminal.xterm.selectAll();
    return;
  }
  const field = target.editable;
  if (!field?.isConnected) return;
  if (isTextField(field)) {
    try {
      field.select();
    } catch {
      // Input types without a selection range have nothing to select.
    }
    return;
  }
  document.execCommand('selectAll');
}

export function clearTerminalTarget(target: ContextTarget): void {
  if (!target.terminal) return;
  target.terminal.xterm.clear();
  target.terminal.focus();
}
