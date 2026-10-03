const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('settings custom editors replace the chat overlay, preserve tab bounds, and return to chat', async () => {
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
  chat.src = settings.src = 'http://iframe.localhost/?extensionId=google.google-antigravity';
  const document = { documentElement: root, body, head, createElement: () => new Element(),
    getElementById: id => elements.find(element => element.id === id),
    querySelectorAll: selector => selector === 'iframe.webview' ? [chat, settings] : elements.filter(element => element.matches(selector)),
    querySelector: selector => elements.find(element => element.matches(selector)) };
  let status = { stage: 'ready', container: composite.id }, poll;
  const frames = [];
  const window = { addEventListener() {}, dispatchEvent() {} }; window.top = window;
  vm.runInNewContext(fs.readFileSync(`${__dirname}/panel-chrome.js`, 'utf8'), {
    window, document, URL, Event: class {}, WeakMap, console,
    MutationObserver: class { observe() {} }, getComputedStyle: () => ({ display: 'block' }),
    YZPZ_PANEL: { id: 'Google.google-antigravity', name: 'Antigravity', containers: { activitybar: [{ id: 'antigravity-sidebar' }] } },
    YZPZ_AUTH_ROUTE: '/?tkn=test', location: { replace() {} },
    fetch: async () => ({ ok: true, json: async () => status }),
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    setTimeout: callback => { poll = callback; },
  });
  const render = async () => { await new Promise(resolve => setImmediate(resolve)); while (frames.length) frames.shift()(); };
  await render();
  assert.equal(chatOverlay.classList.contains('yzpz-assistant-overlay'), true);
  assert.equal(settingsOverlay.classList.contains('yzpz-assistant-overlay'), false);
  status = { ...status, stage: 'editor' }; await poll(); await render();
  assert.equal(root.classList.contains('yzpz-editor-mode'), true);
  assert.equal(chatOverlay.classList.contains('yzpz-assistant-overlay'), false);
  assert.equal(settingsOverlay.classList.contains('yzpz-editor-overlay'), true);
  assert.equal(settingsOverlay.style.getPropertyValue('--yzpz-editor-top'), '35px');
  assert.equal(settingsOverlay.style.getPropertyValue('--yzpz-editor-height'), '365px');
  assert.equal(document.getElementById('yzpz-panel-status').style.display, 'none');
  assert.equal(document.getElementById('yzpz-trust-back').style.display, 'block');
  status = { ...status, stage: 'ready' }; await poll(); await render();
  assert.equal(root.classList.contains('yzpz-editor-mode'), false);
  assert.equal(settingsOverlay.classList.contains('yzpz-editor-overlay'), false);
  assert.equal(chatOverlay.classList.contains('yzpz-assistant-overlay'), true);
});
