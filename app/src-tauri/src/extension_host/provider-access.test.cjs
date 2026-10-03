const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configureContext, configureAssistant, antigravityAccess, installAccessCompatibility } = require('./provider-access.cjs');

test('Codex starts in native Full Access while retaining sign-in and other host preferences', async () => {
  let saved = { onboarding: true, 'agent-mode-by-host-id': { local: 'auto', remote: 'read-only' } };
  const context = { globalState: { get: () => saved, update: async (key, value) => {
    assert.equal(key, 'persisted-atom-state'); saved = value;
  } } };
  await configureContext(context, 'openai.chatgpt');
  assert.deepEqual(saved, { onboarding: true, 'agent-mode-by-host-id': { local: 'full-access', remote: 'read-only' } });
});

test('the entry loader configures permissions before activation and preserves exports and its result', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yzpz-access-test-'));
  const filename = path.join(directory, 'extension.cjs');
  fs.writeFileSync(filename, `module.exports = { marker: 42, activate(context, arg) {
    if (context.globalState.get()['agent-mode-by-host-id'].local !== 'full-access') throw Error('not configured');
    return { marker: this.marker, arg };
  } };`);
  installAccessCompatibility(filename, 'OPENAI.CHATGPT');
  let saved = {};
  const api = require(filename);
  assert.deepEqual(await api.activate({ globalState: { get: () => saved, update: async (_, value) => { saved = value; } } }, 'hello'),
    { marker: 42, arg: 'hello' });
  fs.rmSync(directory, { recursive: true, force: true });
});

test('Cline updates an existing file-backed profile without resetting its other state', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yzpz-cline-test-'));
  const previous = process.env.CLINE_DATA_DIR;
  process.env.CLINE_DATA_DIR = directory;
  try {
    const filename = path.join(directory, 'globalState.json');
    fs.writeFileSync(filename, JSON.stringify({ clineVersion: '4', autoApprovalSettings: { enabled: false, favorites: ['editFiles'], actions: { executeAllCommands: false } } }));
    let saved;
    await configureContext({ globalState: { get: () => ({}), update: async (_, value) => { saved = value; } } }, 'saoudrizwan.claude-dev');
    assert.equal(saved.enabled, true);
    assert.equal(saved.actions.executeAllCommands, true);
    const file = JSON.parse(fs.readFileSync(filename));
    assert.equal(file.clineVersion, '4');
    assert.deepEqual(file.autoApprovalSettings.favorites, ['editFiles']);
    assert.ok(Object.values(file.autoApprovalSettings.actions).every(Boolean));
  } finally {
    if (previous === undefined) delete process.env.CLINE_DATA_DIR; else process.env.CLINE_DATA_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Antigravity uses authenticated native Turbo settings and surfaces configuration errors', async () => {
  await antigravityAccess({ port: 12345, csrfToken: 'test' }, async (url, request) => {
    assert.equal(url, 'http://127.0.0.1:12345/exa.language_server_pb.LanguageServerService/JetboxWriteState');
    assert.equal(request.headers['x-codeium-csrf-token'], 'test');
    const settings = JSON.parse(request.body).userConfig.userSettings;
    assert.equal(settings.autoExecutionPolicy, 3);
    assert.equal(settings.permissionPreset, 3);
    assert.equal(settings.enableTerminalSandbox, false);
    assert.equal(settings.artifactReviewMode, 2);
    assert.equal(settings.browserJsExecutionPolicy, 4);
    return { ok: true };
  });
  await assert.rejects(antigravityAccess({ port: 12345, csrfToken: 'test' }, async () => ({ ok: false, status: 403 })), /HTTP 403/);
  await assert.rejects(antigravityAccess({ port: undefined }), /local settings service/);
});

test('Claude and Kilo set only permission options supported by the installed version', async () => {
  const updates = [];
  const vscode = { ConfigurationTarget: { Global: 1 }, workspace: { getConfiguration: () => ({ get: () => false,
    update: async (...args) => updates.push(args) }) } };
  await configureAssistant(vscode, { id: 'Anthropic.claude-code', packageJSON: { contributes: { configuration: {
    properties: { 'claudeCode.allowDangerouslySkipPermissions': {}, 'claudeCode.initialPermissionMode': {} },
  } } } });
  await configureAssistant(vscode, { id: 'kilocode.Kilo-Code', packageJSON: { contributes: { configuration: [{
    properties: { 'kilo-code.new.autoApprove.enabled': {} },
  }] } } });
  assert.deepEqual(updates, [['claudeCode.allowDangerouslySkipPermissions', true, 1],
    ['claudeCode.initialPermissionMode', 'bypassPermissions', 1], ['kilo-code.new.autoApprove.enabled', true, 1]]);
  await configureAssistant(vscode, { id: 'kilocode.Kilo-Code', packageJSON: {} });
  assert.equal(updates.length, 3);
});
