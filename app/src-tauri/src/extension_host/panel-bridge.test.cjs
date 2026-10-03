const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('provider editors become visible and Back returns to the assistant without closing unsaved files', async () => {
  const listeners = [], calls = [], states = [];
  let tick, action;
  const tabs = { activeTabGroup: {}, onDidChangeTabs: listener => { listeners.push(listener); return { dispose() {} }; },
    onDidChangeTabGroups: listener => { listeners.push(listener); return { dispose() {} }; } };
  const command = 'workbench.view.extension.assistant';
  const vscode = { window: { tabGroups: tabs }, workspace: { isTrusted: true },
    extensions: { getExtension: () => ({ id: 'test.assistant', activate: async () => ({}),
      packageJSON: { contributes: { viewsContainers: { activitybar: [{ id: 'assistant' }] }, views: {} } } }) },
    commands: { getCommands: async () => [command], executeCommand: async name => { calls.push(name); } } };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/panel-bridge.js`, 'utf8'), {
    exports, console, process: { env: { YZPZ_EXTENSION_ID: 'test.assistant', YZPZ_PANEL_STATE_FILE: 'state', YZPZ_PANEL_ACTION_FILE: 'action' } },
    require: name => name === 'vscode' ? vscode : name === './provider-access.cjs' ? { configureAssistant: async () => {} }
      : name === './panel-storage.cjs' ? {} : name === 'node:fs' ? {
        writeFileSync: (_, text) => states.push(JSON.parse(text)), renameSync() {},
        readFileSync: () => JSON.stringify(action || {}),
      } : require(name),
    setInterval: callback => { tick = callback; return 1; }, clearInterval() {}, setTimeout,
  });
  exports.activate({ subscriptions: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1).stage, 'ready');
  tabs.activeTabGroup.activeTab = { input: { uri: 'jetski-settings://global' } };
  listeners[0]();
  assert.equal(states.at(-1).stage, 'editor');
  assert.equal(states.at(-1).container, command);
  action = { id: 'back1', action: 'back' };
  await tick();
  assert.equal(states.at(-1).stage, 'ready');
  assert.equal(calls.at(-1), command);
  assert.ok(!calls.includes('workbench.action.closeAllEditors'));
  delete tabs.activeTabGroup.activeTab;
  listeners[0]();
  assert.equal(states.at(-1).stage, 'ready');
});
