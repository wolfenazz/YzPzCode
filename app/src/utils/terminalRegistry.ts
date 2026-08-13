import type { Terminal } from '@xterm/xterm';

export interface RegisteredTerminal {
  element: HTMLElement;
  xterm: Terminal;
  paste: (text: string) => void | Promise<void>;
  focus: () => void;
}

const registeredTerminals = new Map<HTMLElement, RegisteredTerminal>();

export function registerTerminal(entry: RegisteredTerminal): () => void {
  registeredTerminals.set(entry.element, entry);
  return () => {
    if (registeredTerminals.get(entry.element) === entry) {
      registeredTerminals.delete(entry.element);
    }
  };
}

export function getTerminalForTarget(target: EventTarget | null): RegisteredTerminal | undefined {
  if (!(target instanceof Node)) return undefined;
  for (const [element, entry] of registeredTerminals) {
    if (element === target || element.contains(target)) {
      return entry;
    }
  }
  return undefined;
}
