const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const CHAT_ORIGIN = `http://${'a'.repeat(52)}.panel-a.localhost:4000`;

/** The Antigravity workbench with its chat sidebar and a settings editor. */
async function setup() {
  const elements = [];
  class Element {
    constructor(classes = '', parent) {
      const names = new Set(classes.split(' ').filter(Boolean));
      this.parentElement = parent; this.dataset = {}; this.isConnected = true;
      this.classList = { contains: name => names.has(name), add: name => names.add(name),
        remove: name => names.delete(name), toggle: (name, value) => value ? names.add(name) : names.delete(name) };
      this.style = { getPropertyValue: name => this.style[name] || '', setProperty: (name, value) => { this.style[name] = value; } };
      elements.push(this);
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
    matches(selector) { return selector.split('.').filter(Boolean).every(name => this.classList.contains(name)); }
    contains(element) { return element === this || Boolean(element?.parentElement && this.contains(element.parentElement)); }
    querySelectorAll(selector) { return elements.filter(element => this.contains(element) && element.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 500, height: 400 }; }
    setAttribute() {}
    append() {}
    appendChild() {}
  }
  const root = new Element(), body = new Element('', root), head = new Element('', root);
  const sidebar = new Element('part', body), composite = new Element('', sidebar);
  composite.id = 'workbench.view.extension.antigravity-sidebar';
  const chatOwner = new Element('', composite); chatOwner.id = 'chat-owner';
  const editor = new Element('part editor', body), settingsOwner = new Element('editor-instance', editor);
  settingsOwner.id = 'settings-owner'; settingsOwner.rect = { left: 0, top: 35, width: 500, height: 365 };
  const chatRoot = new Element('', body), chatOverlay = new Element('webview-overlay-content', chatRoot);
  chatOverlay.dataset.parentFlowToElementId = chatOwner.id;
  const chat = new Element('webview ready', chatOverlay);
  const settingsRoot = new Element('', body), settingsOverlay = new Element('webview-overlay-content', settingsRoot);
  settingsOverlay.dataset.parentFlowToElementId = settingsOwner.id;
  const settings = new Element('webview ready', settingsOverlay);
  chat.src = settings.src = `${CHAT_ORIGIN}/index.html?extensionId=google.google-antigravity`;
  chat.contentWindow = { posted: [], postMessage(message, origin) { this.posted.push({ message, origin }); } };
  const document = { documentElement: root, body, head, createElement: () => new Element(),
    getElementById: id => elements.find(element => element.id === id),
    querySelectorAll: selector => selector === 'iframe.webview' ? [chat, settings] : elements.filter(element => element.matches(selector)),
    querySelector: selector => elements.find(element => element.matches(selector)) };
  const pane = { status: { stage: 'ready', container: composite.id }, poll: null, posts: [], listeners: {}, timers: [] };
  const frames = [];
  const window = { addEventListener: (type, listener) => { pane.listeners[type] = listener; }, dispatchEvent() {} };
  window.top = window;
  vm.runInNewContext(fs.readFileSync(`${__dirname}/panel-chrome.js`, 'utf8'), {
    window, document, URL, Event: class {}, WeakMap, Map, Promise, JSON, String, console,
    MutationObserver: class { observe() {} }, getComputedStyle: () => ({ display: 'block' }),
    YZPZ_PANEL: { id: 'Google.google-antigravity', name: 'Antigravity', containers: { activitybar: [{ id: 'antigravity-sidebar' }] } },
    YZPZ_AUTH_ROUTE: '/?tkn=test', location: { replace() {}, hostname: 'panel-a.localhost', port: '4000' },
    fetch: async (route, options) => {
      if (options?.method === 'POST') pane.posts.push({ route, body: JSON.parse(options.body) });
      return { ok: true, json: async () => pane.status };
    },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    setTimeout: callback => { if (callback.name === 'poll') pane.poll = callback; else pane.timers.push(callback); return pane.timers.length; },
    clearTimeout: () => {},
  });
  const render = async () => { await new Promise(resolve => setImmediate(resolve)); while (frames.length) frames.shift()(); };
  await render();
  return { ...pane, pane, window, document, root, chat, chatOverlay, settingsOverlay, render };
}

test('settings custom editors replace the chat overlay, preserve tab bounds, and return to chat', async () => {
  const { pane, document, root, chatOverlay, settingsOverlay, render } = await setup();
  assert.equal(chatOverlay.classList.contains('yzpz-assistant-overlay'), true);
  assert.equal(settingsOverlay.classList.contains('yzpz-assistant-overlay'), false);
  pane.status = { ...pane.status, stage: 'editor' }; await pane.poll(); await render();
  assert.equal(root.classList.contains('yzpz-editor-mode'), true);
  assert.equal(chatOverlay.classList.contains('yzpz-assistant-overlay'), false);
  assert.equal(settingsOverlay.classList.contains('yzpz-editor-overlay'), true);
  assert.equal(settingsOverlay.style.getPropertyValue('--yzpz-editor-top'), '35px');
  assert.equal(settingsOverlay.style.getPropertyValue('--yzpz-editor-height'), '365px');
  assert.equal(document.getElementById('yzpz-panel-status').style.display, 'none');
  assert.equal(document.getElementById('yzpz-trust-back').style.display, 'block');
  pane.status = { ...pane.status, stage: 'ready' }; await pane.poll(); await render();
  assert.equal(root.classList.contains('yzpz-editor-mode'), false);
  assert.equal(settingsOverlay.classList.contains('yzpz-editor-overlay'), false);
  assert.equal(chatOverlay.classList.contains('yzpz-assistant-overlay'), true);
});

test('prompts go to the chat webview only, and only its result is reported to the app', async () => {
  const { pane, window, chat } = await setup();
  const id = '0b6f8c1e-3c2a-4f5e-9d7b-1a2b3c4d5e6f';
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const results = () => pane.posts.filter(post => post.body.event === 'prompt-result').map(post => post.body.status);
  await pane.poll();

  window.__yzpzPanelPrompt({ id, text: 'Make the button blue', submit: true });
  assert.equal(chat.contentWindow.posted.length, 1);
  const [{ message, origin }] = chat.contentWindow.posted;
  assert.equal(origin, CHAT_ORIGIN);
  assert.equal(JSON.stringify(message), JSON.stringify({ yzpzPanelPrompt: { id, text: 'Make the button blue', submit: true } }));

  // Other frames and other origins cannot report for the chat.
  pane.listeners.message({ source: {}, origin: CHAT_ORIGIN, data: { yzpzPanelPromptResult: { id, status: 'submitted' } } });
  pane.listeners.message({ source: chat.contentWindow, origin: 'http://evil.localhost:4000', data: { yzpzPanelPromptResult: { id, status: 'submitted' } } });
  await flush();
  assert.deepEqual(results(), []);
  pane.listeners.message({ source: chat.contentWindow, origin: CHAT_ORIGIN, data: { yzpzPanelPromptResult: { id, status: 'submitted' } } });
  pane.listeners.message({ source: chat.contentWindow, origin: CHAT_ORIGIN, data: { yzpzPanelPromptResult: { id, status: 'submitted' } } });
  await flush();
  assert.deepEqual(results(), ['submitted'], 'one report per request');

  // A pane waiting on sign-in or trust says so instead of typing into it.
  pane.status = { ...pane.status, stage: 'waitingTrust' }; await pane.poll();
  window.__yzpzPanelPrompt({ id: '1b6f8c1e-3c2a-4f5e-9d7b-1a2b3c4d5e6f', text: 'x', submit: true });
  await flush();
  assert.deepEqual(results(), ['submitted', 'not-ready']);
  assert.equal(chat.contentWindow.posted.length, 1);
});
