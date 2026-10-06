// Hands a prompt from YzPzCode (the browser inspector, UI references) to an
// assistant's chat: finds its message box, inserts the text the way a paste
// would, then submits it like Enter. Each provider uses its own editor
// (textarea, contenteditable, ProseMirror, Lexical…), so every step has
// fallbacks and the result says how far it got.
//
// Evaluated as `(source)(config)` in two places:
// - mode 'webview': every VS Code webview bootstrap frame (served with
//   webview-activity.js). The assistant's document is the same-origin
//   #active-frame. Requests come only from the workbench (parentOrigin).
// - mode 'nested': Antigravity's tunnelled page, which is cross-origin to the
//   webview. The webview frame forwards the request when its own document has
//   no message box. Requests come only from an ancestor on this pane's hashed
//   webview origins (`upstreamSuffix`).
//
// Request: { yzpzPanelPrompt: { id, text, submit } }
// Result:  { yzpzPanelPromptResult: { id, status } }, posted to the sender.
// status: 'submitted' | 'inserted' (left in the box) | 'no-input' | 'failed'
(config => {
  const SUBMIT_WAIT_MS = 1500;
  const INSERT_WAIT_MS = 400;
  const FORWARD_WAIT_MS = 8000;
  const MAX_TEXT = 256 * 1024;
  const PROBE_LENGTH = 40;
  const EDITABLE = 'textarea, input, [contenteditable], [role="textbox"]';
  const LABEL = /ask|message|chat|prompt|type|describe|plan|task|question|request|follow|reply|instruct|send|build|code/i;
  const SEND = /^\s*(send|submit)\b/i;

  const isTextField = element => element?.tagName === 'TEXTAREA' ||
    (element?.tagName === 'INPUT' && /^(text|search)?$/i.test(element.getAttribute('type') || ''));
  const isEditable = element => Boolean(element && (isTextField(element) || element.isContentEditable));
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const textOf = element => (isTextField(element) ? element.value : element.innerText ?? element.textContent ?? '');

  function usable(element) {
    if (!isEditable(element) || !element.isConnected) return false;
    if (element.disabled || element.readOnly || element.getAttribute('aria-disabled') === 'true') return false;
    if (element.closest('[aria-hidden="true"], [inert]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle?.(element);
    return !style || (style.visibility !== 'hidden' && style.display !== 'none');
  }

  function labelOf(element) {
    return ['placeholder', 'aria-label', 'aria-placeholder', 'data-placeholder', 'title']
      .map(name => element.getAttribute(name))
      .concat(element.querySelector?.('[data-placeholder]')?.getAttribute('data-placeholder'))
      .filter(Boolean).join(' ');
  }

  /** The assistant's message box: the one the user last typed in, else the most chat-like one. */
  function findInput(docs) {
    for (const doc of docs) {
      let active = doc.activeElement;
      // The focus may sit inside the editing host (e.g. a mention chip).
      while (active?.parentElement?.isContentEditable) active = active.parentElement;
      // A last-used search/filter field is not the composer.
      if (usable(active) && (active.tagName !== 'INPUT' || LABEL.test(labelOf(active)))) return active;
    }
    let best = null;
    let bestScore = -Infinity;
    for (const doc of docs) {
      for (const element of doc.querySelectorAll(EDITABLE)) {
        // Only editing hosts: a nested contenteditable belongs to its host.
        if (element.parentElement?.isContentEditable || !usable(element)) continue;
        const rect = element.getBoundingClientRect();
        // Chat-like label, then rich/multiline over single-line fields, then
        // the lowest on screen (composers sit at the bottom of a chat).
        const score = (LABEL.test(labelOf(element)) ? 4 : 0) + (element.tagName === 'INPUT' ? 0 : 2) + rect.bottom / 100000;
        if (score > bestScore) { best = element; bestScore = score; }
      }
    }
    return best;
  }

  /** A macrotask yield that hidden (throttled) pages still run promptly. */
  const nextTask = () => new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
    channel.port2.postMessage(0);
  });

  const waitFor = (predicate, ms) => new Promise(resolve => {
    const deadline = Date.now() + ms;
    const check = () => {
      if (predicate()) resolve(true);
      else if (Date.now() >= deadline) resolve(false);
      else setTimeout(check, 50);
    };
    check();
  });

  /** Appends `text` to the box (keeping any draft) and reports whether it landed. */
  async function insert(element, text) {
    const doc = element.ownerDocument;
    const win = doc.defaultView;
    const before = textOf(element);
    const value = before.trim() ? `${/\n$/.test(before) ? '\n' : '\n\n'}${text}` : text;
    const changed = () => textOf(element) !== before;
    const command = () => { try { return doc.execCommand('insertText', false, value); } catch { return false; } };
    element.focus({ preventScroll: true });

    if (isTextField(element)) {
      const end = element.value.length;
      element.setSelectionRange?.(end, end);
      // execCommand keeps the field's undo stack and fires a real input event.
      if (command() && changed()) return true;
      // Framework-controlled fields (React) only see the native setter.
      const prototype = element.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, before + value);
      element.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: value }));
      return changed();
    }

    const selection = win.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    // Editors sync their model selection from the selectionchange task.
    await nextTask();
    // Rich editors (ProseMirror, Lexical, Tiptap) handle paste themselves and
    // keep multi-line text intact; plain contenteditables ignore it.
    try {
      const data = new win.DataTransfer();
      data.setData('text/plain', value);
      const paste = new win.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      if (!element.dispatchEvent(paste) && await waitFor(changed, INSERT_WAIT_MS)) return true;
    } catch { /* No synthetic clipboard support: insert directly below. */ }
    if (changed()) return true;
    if (command() && changed()) return true;
    const input = new win.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value });
    if (!element.dispatchEvent(input)) await waitFor(changed, INSERT_WAIT_MS);
    return changed();
  }

  function sendButton(element) {
    let node = element.parentElement;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const button = [...node.querySelectorAll('button, [role="button"]')].find(candidate =>
        !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true' &&
        (['aria-label', 'title'].some(name => SEND.test(candidate.getAttribute(name) || '')) ||
          SEND.test(candidate.textContent || '') ||
          (candidate.getAttribute('type') === 'submit' && candidate.closest('form'))));
      if (button) return button;
    }
    return null;
  }

  function pressEnter(element) {
    const win = element.ownerDocument.defaultView;
    const key = type => {
      const event = new win.KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true });
      // Chromium ignores keyCode in the event init; older handlers still read it.
      for (const name of ['keyCode', 'which']) Object.defineProperty(event, name, { get: () => 13 });
      return element.dispatchEvent(event);
    };
    // Like a real key press: no keypress once keydown was handled.
    if (key('keydown')) key('keypress');
    key('keyup');
  }

  /** Submits like Enter, else the composer's send button. True once the text left the box. */
  async function submit(element, probe) {
    const sent = () => !element.isConnected || !normalize(textOf(element)).includes(probe);
    await nextTask();
    pressEnter(element);
    if (await waitFor(sent, SUBMIT_WAIT_MS)) return true;
    const button = sendButton(element);
    if (!button) return false;
    button.click();
    return waitFor(sent, SUBMIT_WAIT_MS);
  }

  async function deliver(docs, request) {
    const element = findInput(docs);
    if (!element) return 'no-input';
    if (!(await insert(element, request.text))) return 'failed';
    if (!request.submit) return 'inserted';
    return (await submit(element, normalize(request.text).slice(0, PROBE_LENGTH))) ? 'submitted' : 'inserted';
  }

  /** `doc` and every same-origin document framed inside it. */
  function documents(doc) {
    const docs = [doc];
    for (let index = 0; index < docs.length; index++) {
      for (const frame of docs[index].querySelectorAll('iframe')) {
        try { if (frame.contentDocument) docs.push(frame.contentDocument); } catch { /* Cross-origin. */ }
      }
    }
    return docs;
  }

  function crossOriginFrames(docs) {
    return docs.flatMap(doc => [...doc.querySelectorAll('iframe')]).filter(frame => {
      try { if (frame.contentDocument) return false; } catch { /* Cross-origin. */ }
      const rect = frame.getBoundingClientRect();
      return frame.contentWindow && rect.width > 0 && rect.height > 0 && /^https?:/.test(frame.src);
    }).sort((a, b) => {
      const area = frame => { const rect = frame.getBoundingClientRect(); return rect.width * rect.height; };
      return area(b) - area(a);
    });
  }

  const forwarded = new Map();
  function forward(frame, request) {
    return new Promise(resolve => {
      const target = frame.contentWindow;
      const timer = setTimeout(() => { forwarded.delete(request.id); resolve(null); }, FORWARD_WAIT_MS);
      forwarded.set(request.id, { target, resolve: status => { clearTimeout(timer); forwarded.delete(request.id); resolve(status); } });
      target.postMessage({ yzpzPanelPrompt: request }, new URL(frame.src).origin);
    });
  }

  function contentDocument() {
    if (config.mode === 'nested') return document;
    try { return document.getElementById('active-frame')?.contentDocument ?? null; } catch { return null; }
  }

  async function handle(request) {
    const doc = contentDocument();
    if (!doc?.body) return 'no-input';
    const docs = documents(doc);
    const status = await deliver(docs, request);
    if (status !== 'no-input') return status;
    // Some assistants (Antigravity) render their chat in a cross-origin frame.
    for (const frame of crossOriginFrames(docs)) {
      const result = await forward(frame, request);
      if (result && result !== 'no-input') return result;
    }
    return 'no-input';
  }

  const validRequest = request => Boolean(request) && typeof request.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.id) &&
    typeof request.text === 'string' && request.text.trim().length > 0 && request.text.length <= MAX_TEXT &&
    typeof request.submit === 'boolean';

  function fromUpstream(event) {
    if (config.mode !== 'nested') {
      const parentOrigin = new URLSearchParams(location.search).get('parentOrigin');
      return event.source === window.parent && event.origin === parentOrigin;
    }
    const suffix = String(config.upstreamSuffix || '');
    if (!suffix || !event.origin.startsWith('http://') || !event.origin.endsWith(suffix) ||
        !/^[0-9a-v]{52}$/.test(event.origin.slice('http://'.length, -suffix.length))) return false;
    for (let frame = window.parent; frame; frame = frame === frame.parent ? null : frame.parent)
      if (frame === event.source) return true;
    return false;
  }

  const api = { findInput, insert, submit, deliver, handle };
  if (window.parent === window) return api;
  window.addEventListener('message', event => {
    const result = event.data?.yzpzPanelPromptResult;
    if (result) {
      const pending = forwarded.get(result.id);
      if (pending && event.source === pending.target) pending.resolve(String(result.status));
      return;
    }
    const request = event.data?.yzpzPanelPrompt;
    if (!request || !fromUpstream(event) || !validRequest(request)) return;
    const reply = status => event.source.postMessage({ yzpzPanelPromptResult: { id: request.id, status } }, event.origin);
    handle(request).then(reply, () => reply('failed'));
  });
  return api;
})
