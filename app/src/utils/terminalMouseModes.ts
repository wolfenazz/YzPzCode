import type { IDisposable, Terminal } from '@xterm/xterm';

const SUPPORTED_MOUSE_MODES = [9, 1000, 1002, 1003, 1006, 1016] as const;
const TRACKING_MODE_CODES = { none: 0, x10: 9, vt200: 1000, drag: 1002, any: 1003 } as const;

export const DEFAULT_MOUSE_TRACKING_MODES = [1002, 1006] as const;

export const normalizeMouseModes = (modes: Iterable<number>): number[] =>
  Array.from(new Set(modes))
    .filter((mode) => SUPPORTED_MOUSE_MODES.includes(mode as typeof SUPPORTED_MOUSE_MODES[number]))
    .sort((a, b) => a - b);

export const buildMouseModeSequence = (modes: Iterable<number>, operation: 'h' | 'l'): string =>
  normalizeMouseModes(modes).map((mode) => `\x1b[?${mode}${operation}`).join('');

/** Observe parsed state, including sequences split across PTY output chunks. */
export const registerTerminalMouseModes = (
  terminal: Terminal,
  onChange: (modes: number[], enabled: boolean) => void,
): IDisposable => {
  // xterm exposes the active tracking protocol publicly, but not its encoding.
  // Observe supported encodings without consuming xterm's built-in handlers.
  let encoding: number | null = null;
  let previousModes: number[] | null = null;
  const subscriptions = (['h', 'l'] as const).map((operation) =>
    terminal.parser.registerCsiHandler({ prefix: '?', final: operation }, (params) => {
      for (const param of params) {
        if (param === 1006 || param === 1016) {
          encoding = operation === 'h' ? param : null;
        }
      }
      return false;
    }),
  );
  subscriptions.push(terminal.parser.registerEscHandler({ final: 'c' }, () => {
    encoding = null;
    return false;
  }));
  subscriptions.push(terminal.onWriteParsed(() => {
    const tracking = TRACKING_MODE_CODES[terminal.modes.mouseTrackingMode];
    const modes = normalizeMouseModes([
      ...(tracking ? [tracking] : []),
      ...(encoding ? [encoding] : []),
    ]);
    if (previousModes && modes.length === previousModes.length
      && modes.every((mode, index) => mode === previousModes?.[index])) return;
    previousModes = modes;
    onChange(modes, tracking !== 0);
  }));

  return { dispose: () => subscriptions.forEach((subscription) => subscription.dispose()) };
};
