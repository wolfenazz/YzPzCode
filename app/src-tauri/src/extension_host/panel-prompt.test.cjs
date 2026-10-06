const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./panel-prompt.js'), 'utf8');
const ID = '0b6f8c1e-3c2a-4f5e-9d7b-1a2b3c4d5e6f';
// Objects from the vm realm have their own prototypes.
const plain = value => JSON.parse(JSON.stringify(value));
const PROMPT = 'UI edit request for the running local app.\n\nSelected element context:\n- Tag: <button>';

// A minimal DOM: enough for panel-prompt.js to find, fill and submit a composer.
class Event {
  constructor(type, init = {}) { Object.assign(this, init); this.type = type; this.defaultPrevented = false; }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
}

function matches(element, selector) {
  return selector.split(',').map(part => part.trim()).some(part => {
    const attribute = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
    if (attribute) return element.attributes[attribute[1]] !== undefined &&
      (attribute[2] === undefined || element.attributes[attribute[1]] === attribute[2]);
    return element.tagName === part.toUpperCase();
  });
}

class Element {
  constructor(doc, tag, attributes = {}, parent = doc.body) {
    Object.assign(this, { ownerDocument: doc, tagName: tag.toUpperCase(), attributes: { ...attributes }, children: [], listeners: {} });
    this.parentElement = parent;
    parent?.children.push(this);
    this.rect = { width: 300, height: 40, bottom: 500 };
    this.text = '';
  }
  get isConnected() { return true; }
  get isContentEditable() { return this.attributes.contenteditable !== undefined && this.attributes.contenteditable !== 'false'; }
  get innerText() { return this.text; }
  get disabled() { return this.attributes.disabled !== undefined; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  getBoundingClientRect() { return this.rect; }
  closest(selector) { return matches(this, selector) ? this : this.parentElement?.closest?.(selector) ?? null; }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelectorAll(selector) { return this.descendants().filter(element => matches(element, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatchEvent(event) {
    for (let node = this; node; node = event.bubbles ? node.parentElement : null)
      for (const listener of node.listeners[event.type] || []) listener(event);
    return !event.defaultPrevented;
  }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true })); }
}

class TextArea extends Element {
  get value() { return this.text; }
  set value(value) { this.text = value; }
  setSelectionRange() {}
}

function page({ execCommand = true } = {}) {
  const win = {
    Event, KeyboardEvent: Event, InputEvent: Event, ClipboardEvent: Event,
    DataTransfer: class { constructor() { this.data = {}; } setData(type, value) { this.data[type] = value; } getData(type) { return this.data[type] ?? ''; } },
    HTMLTextAreaElement: TextArea, HTMLInputElement: TextArea,
    getComputedStyle: element => ({ visibility: 'hidden' in element.attributes ? 'hidden' : 'visible', display: 'block' }),
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
  };
  const doc = { defaultView: win, activeElement: null, createRange: () => ({ selectNodeContents() {}, collapse() {} }) };
  doc.body = new Element(doc, 'body', {}, null);
  doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  // Chromium's insertText: types into the focused field and fires `input`.
  doc.execCommand = (command, _ui, value) => {
    if (!execCommand || command !== 'insertText' || !doc.activeElement) return false;
    doc.activeElement.text += value;
    doc.activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  return { doc, win };
}

function load(context = {}) {
  const window = context.window || {};
  window.parent ??= window;
  window.addEventListener ??= () => {};
  return vm.runInNewContext(source, {
    window, document: context.document || {}, location: context.location || { search: '' },
    URL, URLSearchParams, MessageChannel, setTimeout, clearTimeout, Date,
  })({ mode: 'webview', ...context.config });
}

test('a React textarea that ignores insertText is filled through its value setter and submitted with Enter', async () => {
  const { doc } = page({ execCommand: false });
  const composer = new TextArea(doc, 'textarea', { placeholder: 'Ask Kilo anything' });
  let state = '';
  composer.addEventListener('input', () => { state = composer.value; });
  composer.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.keyCode === 13 && state) { event.preventDefault(); composer.value = state = ''; }
  });
  const status = await load().deliver([doc], { id: ID, text: PROMPT, submit: true });
  assert.equal(status, 'submitted');
  assert.equal(composer.value, '');
});

test('a rich editor takes the text as a paste and is submitted with its send button', async () => {
  const { doc } = page();
  const form = new Element(doc, 'div');
  const editor = new Element(doc, 'div', { contenteditable: 'true', role: 'textbox' }, form);
  new Element(doc, 'p', { 'data-placeholder': 'Ask Codex to do anything' }, editor);
  editor.addEventListener('paste', event => { event.preventDefault(); editor.text += event.clipboardData.getData('text/plain'); });
  const send = new Element(doc, 'button', { 'aria-label': 'Send message' }, form);
  const pasted = [];
  send.addEventListener('click', () => { pasted.push(editor.text); editor.text = ''; });
  const status = await load().deliver([doc], { id: ID, text: PROMPT, submit: true });
  assert.equal(status, 'submitted');
  assert.deepEqual(pasted, [PROMPT]);
});

test('text that cannot be submitted stays in the box and keeps an existing draft', async t => {
  const { doc } = page();
  const editor = new Element(doc, 'div', { contenteditable: 'plaintext-only' });
  editor.text = 'my draft';
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const pending = load().deliver([doc], { id: ID, text: PROMPT, submit: true });
  for (let i = 0; i < 80; i++) { await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(50); }
  assert.equal(await pending, 'inserted');
  assert.equal(editor.text, `my draft\n\n${PROMPT}`);
});

test('the composer is the focused box, else the chat-like one; hidden boxes and search fields are skipped', () => {
  const { doc } = page();
  const prompt = load();
  const search = new TextArea(doc, 'input', { type: 'search', placeholder: 'Search history' });
  const hidden = new TextArea(doc, 'textarea', { placeholder: 'Message', hidden: '' });
  const chat = new Element(doc, 'div', { contenteditable: 'true', 'aria-label': 'Message Claude' });
  const other = new TextArea(doc, 'textarea', { placeholder: 'Commit message' });
  other.rect = { width: 300, height: 40, bottom: 100 };
  search.focus();
  assert.equal(prompt.findInput([doc]), chat, 'a focused search field is not the composer');
  other.focus();
  assert.equal(prompt.findInput([doc]), other, 'the box the user last typed in wins');
  doc.activeElement = null;
  hidden.rect = { width: 300, height: 40, bottom: 900 };
  assert.equal(prompt.findInput([doc]), chat, 'lowest chat-like visible box');
  assert.equal(load().findInput([page().doc]), null);
});

test('webview frames accept prompts only from the workbench and answer the sender', async () => {
  const { doc } = page();
  const composer = new TextArea(doc, 'textarea', { placeholder: 'Ask Claude' });
  composer.addEventListener('keydown', event => { event.preventDefault(); composer.value = ''; });
  let onMessage;
  const replies = [];
  const parent = { postMessage: (message, origin) => replies.push({ message, origin }) };
  load({
    window: { parent, addEventListener: (type, listener) => { if (type === 'message') onMessage = listener; } },
    document: { getElementById: id => (id === 'active-frame' ? { contentDocument: doc } : null) },
    location: { search: '?id=1&parentOrigin=http%3A%2F%2Fpanel-a.localhost%3A4000' },
  });
  const request = { id: ID, text: PROMPT, submit: true };
  onMessage({ source: parent, origin: 'http://evil.localhost:4000', data: { yzpzPanelPrompt: request } });
  onMessage({ source: {}, origin: 'http://panel-a.localhost:4000', data: { yzpzPanelPrompt: request } });
  onMessage({ source: parent, origin: 'http://panel-a.localhost:4000', data: { yzpzPanelPrompt: { ...request, id: 'x' } } });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(replies.length, 0);
  assert.equal(composer.value, '');

  onMessage({ source: parent, origin: 'http://panel-a.localhost:4000', data: { yzpzPanelPrompt: request } });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(plain(replies), [{ message: { yzpzPanelPromptResult: { id: ID, status: 'submitted' } }, origin: 'http://panel-a.localhost:4000' }]);
});

test('a chat in a cross-origin frame (Antigravity) receives the forwarded prompt', async () => {
  const { doc } = page();
  const frame = new Element(doc, 'iframe');
  frame.src = 'http://127.0.0.1:5123/';
  frame.rect = { width: 400, height: 600, bottom: 600 };
  let onMessage;
  const parent = { postMessage: (message) => replies.push(message) };
  const replies = [];
  frame.contentWindow = {
    postMessage: (message, origin) => {
      assert.equal(origin, 'http://127.0.0.1:5123');
      queueMicrotask(() => onMessage({ source: frame.contentWindow, data: { yzpzPanelPromptResult: { id: message.yzpzPanelPrompt.id, status: 'submitted' } } }));
    },
  };
  Object.defineProperty(frame, 'contentDocument', { get: () => null });
  load({
    window: { parent, addEventListener: (type, listener) => { if (type === 'message') onMessage = listener; } },
    document: { getElementById: () => ({ contentDocument: doc }) },
    location: { search: '?parentOrigin=http%3A%2F%2Fpanel-a.localhost%3A4000' },
  });
  onMessage({ source: parent, origin: 'http://panel-a.localhost:4000', data: { yzpzPanelPrompt: { id: ID, text: PROMPT, submit: true } } });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(plain(replies), [{ yzpzPanelPromptResult: { id: ID, status: 'submitted' } }]);
});

test('nested pages accept prompts only from an ancestor on the pane\'s webview origins', async () => {
  const { doc } = page();
  const composer = new TextArea(doc, 'textarea', { placeholder: 'Ask Antigravity' });
  composer.addEventListener('keydown', event => { event.preventDefault(); composer.value = ''; });
  const webviewHost = { postMessage: () => replies.push('host') };
  webviewHost.parent = webviewHost;
  const activeFrame = { parent: webviewHost };
  const replies = [];
  let onMessage;
  doc.getElementById = () => null;
  load({
    config: { mode: 'nested', upstreamSuffix: '.panel-a.localhost:4000' },
    window: { parent: activeFrame, addEventListener: (type, listener) => { if (type === 'message') onMessage = listener; } },
    document: doc,
  });
  const hashed = `http://${'a'.repeat(52)}.panel-a.localhost:4000`;
  const request = { yzpzPanelPrompt: { id: ID, text: PROMPT, submit: true } };
  const stranger = { postMessage: () => replies.push('stranger') };
  onMessage({ source: stranger, origin: hashed, data: request });
  onMessage({ source: webviewHost, origin: `http://${'a'.repeat(52)}.panel-b.localhost:4000`, data: request });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(replies, []);
  onMessage({ source: webviewHost, origin: hashed, data: request });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(replies, ['host']);
});

test('the host relays only well-formed prompt results to the app', () => {
  const { panelEventLine } = require('./host-preload.cjs');
  assert.equal(panelEventLine({ event: 'prompt-result', id: ID.toUpperCase(), status: 'inserted' }),
    `[YzPzCode panel event] prompt-result ${ID} inserted\n`);
  assert.equal(panelEventLine({ event: 'task-complete' }), '[YzPzCode panel event] task-complete\n');
  for (const value of [
    { event: 'prompt-result', id: ID, status: 'rm -rf' },
    { event: 'prompt-result', id: `${ID}\n[YzPzCode panel event] task-complete`, status: 'submitted' },
    { event: 'prompt-result', id: ID },
    { event: 'shell' },
  ]) assert.throws(() => panelEventLine(value));
});

test('webview frames load activity reporting and prompt delivery as one valid script', () => {
  const { webviewScript } = require('./host-preload.cjs');
  const script = webviewScript(__dirname);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(script, /yzpzPanelEvent/);
  assert.match(script, /\(\{ mode: 'webview' \}\);\n$/);
});
