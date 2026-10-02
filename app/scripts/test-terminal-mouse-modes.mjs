import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import xterm from '@xterm/xterm';
import ts from 'typescript';

const { Terminal } = xterm;

// Exercise the production observer with the installed xterm parser, without a
// browser or a separate test runner. Type-only imports disappear on transpile.
const source = await readFile(new URL('../src/utils/terminalMouseModes.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { registerTerminalMouseModes, buildMouseModeSequence, DEFAULT_MOUSE_TRACKING_MODES } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function createTerminal(context) {
  const terminal = new Terminal({ allowProposedApi: true });
  const updates = [];
  const subscription = registerTerminalMouseModes(terminal, (modes, enabled) => {
    updates.push({ modes, enabled });
  });
  context.after(() => {
    subscription.dispose();
    terminal.dispose();
  });
  return {
    terminal,
    updates,
    write: (data) => new Promise((resolve) => terminal.write(data, resolve)),
    latest: () => updates.at(-1),
  };
}

test('automatic CLI enable and disable are saved after parsing', async (context) => {
  const session = createTerminal(context);
  await session.write('\x1b[?1002;1006h');
  assert.deepEqual(session.latest(), { modes: [1002, 1006], enabled: true });
  assert.equal(session.terminal.modes.mouseTrackingMode, 'drag');
  await session.write('\x1b[?1002;1006l');
  assert.deepEqual(session.latest(), { modes: [], enabled: false });
  assert.equal(session.terminal.modes.mouseTrackingMode, 'none');
});

test('enable and disable survive every possible output chunk boundary', async (context) => {
  for (const sequence of ['\x1b[?1002;1006h', '\x9b?1002;1006h']) {
    for (let boundary = 1; boundary < sequence.length; boundary++) {
      const session = createTerminal(context);
      await session.write(sequence.slice(0, boundary));
      await session.write(sequence.slice(boundary));
      assert.deepEqual(session.latest(), { modes: [1002, 1006], enabled: true });
      const disable = '\x1b[?1002;1006l';
      await session.write(disable.slice(0, boundary));
      await session.write(disable.slice(boundary));
      assert.deepEqual(session.latest(), { modes: [], enabled: false });
    }
  }
});

test('multiple protocol flags follow xterm semantics instead of accumulating', async (context) => {
  const session = createTerminal(context);
  await session.write('\x1b[?1000;1002;1003;1006h');
  assert.deepEqual(session.latest(), { modes: [1003, 1006], enabled: true });
  // xterm disables tracking on any protocol reset, even a different protocol.
  await session.write('\x1b[?1000l');
  assert.deepEqual(session.latest(), { modes: [1006], enabled: false });
});

test('encoding alone and unsupported encodings do not enable mouse mode', async (context) => {
  const session = createTerminal(context);
  await session.write('\x1b[?1005;1006;1015h');
  assert.deepEqual(session.latest(), { modes: [1006], enabled: false });
  await session.write('\x1b[?1006l');
  assert.deepEqual(session.latest(), { modes: [], enabled: false });
});

test('X10 tracking and SGR pixel encoding are observed', async (context) => {
  const session = createTerminal(context);
  await session.write('\x1b[?9;1016h');
  assert.deepEqual(session.latest(), { modes: [9, 1016], enabled: true });
  await session.write('\x1b[?1006h');
  assert.deepEqual(session.latest(), { modes: [9, 1006], enabled: true });
  await session.write('\x1b[?1016l');
  assert.deepEqual(session.latest(), { modes: [9], enabled: true });
});

test('a real terminal reset clears saved tracking and encoding', async (context) => {
  const session = createTerminal(context);
  await session.write('\x1b[?1002;1006h');
  await session.write('\x1bc');
  assert.deepEqual(session.latest(), { modes: [], enabled: false });
  await session.write('\x1b[?1000h');
  assert.deepEqual(session.latest(), { modes: [1000], enabled: true });
});

test('soft reset and ordinary output retain mouse mode without redundant updates', async (context) => {
  const session = createTerminal(context);
  await session.write('\x1b[?1002;1006h');
  const count = session.updates.length;
  await session.write('agent output\r\n\x1b[!p');
  assert.deepEqual(session.latest(), { modes: [1002, 1006], enabled: true });
  assert.equal(session.updates.length, count);
});

test('manual toggle sequences update both the terminal and observer', async (context) => {
  const session = createTerminal(context);
  await session.write(buildMouseModeSequence(DEFAULT_MOUSE_TRACKING_MODES, 'h'));
  assert.deepEqual(session.latest(), { modes: [1002, 1006], enabled: true });
  await session.write(buildMouseModeSequence(session.latest().modes, 'l'));
  assert.deepEqual(session.latest(), { modes: [], enabled: false });
});

test('a replacement terminal restores the saved protocol and encoding', async (context) => {
  const original = createTerminal(context);
  await original.write('\x1b[?1003;1016h');
  const replacement = createTerminal(context);
  await replacement.write(buildMouseModeSequence(original.latest().modes, 'h'));
  assert.deepEqual(replacement.latest(), original.latest());
  assert.equal(replacement.terminal.modes.mouseTrackingMode, 'any');
});

test('two live workspace terminals retain independent states through background output', async (context) => {
  const first = createTerminal(context);
  const second = createTerminal(context);
  await first.write('\x1b[?1002;1006h');
  await second.write('\x1b[?1000;1016h');
  await first.write('\x1b[?1002l');
  await first.write('\x1b[?1003h');
  assert.deepEqual(first.latest(), { modes: [1003, 1006], enabled: true });
  assert.deepEqual(second.latest(), { modes: [1000, 1016], enabled: true });
});
