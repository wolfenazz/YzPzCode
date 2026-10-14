import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/presenceIcons.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { agentPresenceIcon, extensionPresenceIcon, materialIconPresenceIcon } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

// Paths are repo-relative (the backend proxies them from the GitHub repo), so resolve from the repo root.
const repoRoot = new URL('../../', import.meta.url);
const repoPath = path => new URL(path, repoRoot);
// The same rule as discord_presence.rs `small_image_url`.
const RUST_ACCEPTS = path => path.startsWith('app/') && !path.includes('..') && /^[A-Za-z0-9_./-]+$/.test(path);

// Every AI agent in the catalog (cliCatalog.ts CORE_AGENTS and data/additionalAgents.ts).
const AGENT_IDS = [
  'claude', 'codex', 'antigravity', 'opencode', 'cursor', 'kilo', 'hermes', 'pi', 'commandcode', 'cline', 'grok', 'jcode',
  'devin', 'trae', 'kimi', 'qoder', 'copilot', 'kiro', 'mistralvibe', 'deepseektui', 'aider', 'reasonix', 'amp', 'dsh',
  'codebuddy', 'mimo', 'atomcode',
];

// Every extension with a logo (data/extensionIcons.ts).
const EXTENSION_IDS = [
  'kilocode.Kilo-Code', 'saoudrizwan.claude-dev', 'openai.chatgpt', 'Anthropic.claude-code', 'Continue.continue',
  'Google.google-antigravity', 'amazonwebservices.amazon-q-vscode', 'TabbyML.vscode-tabby', 'Codeium.codeium',
  'mistralai.mistral-vibe-code', 'RooVeterinaryInc.roo-cline', 'Alibaba-Cloud.tongyi-lingma', 'Augment.vscode-augment',
  'NexrallCode.nexrall-code-vscode',
];

test('every AI agent badge points at a logo that exists in the repo', () => {
  for (const id of AGENT_IDS) {
    const icon = agentPresenceIcon(id);
    assert.ok(icon, `${id} has no badge`);
    assert.ok(RUST_ACCEPTS(icon.path), `${id}: ${icon.path} would be refused by the backend`);
    assert.ok(existsSync(repoPath(icon.path)), `${id}: ${icon.path} is missing`);
    assert.ok(icon.label.length > 0);
  }
});

test('every extension badge points at a logo that exists in the repo', () => {
  for (const id of EXTENSION_IDS) {
    const path = extensionPresenceIcon(id);
    assert.ok(path, `${id} has no badge`);
    assert.ok(RUST_ACCEPTS(path), `${id}: ${path} would be refused by the backend`);
    assert.ok(existsSync(repoPath(path)), `${id}: ${path} is missing`);
  }
});

test('extension ids match regardless of case', () => {
  assert.equal(extensionPresenceIcon('anthropic.claude-code'), extensionPresenceIcon('Anthropic.claude-code'));
});

test('shells and tool CLIs get no agent badge', () => {
  assert.equal(agentPresenceIcon('gh'), null);
  assert.equal(agentPresenceIcon('vercel'), null);
  assert.equal(agentPresenceIcon(''), null);
  assert.equal(extensionPresenceIcon('unknown.extension'), null);
});

test('file badges use the Material icon set under the app public folder', () => {
  const path = materialIconPresenceIcon('react_ts');
  assert.equal(path, 'app/public/material-icons/react_ts.svg');
  assert.ok(existsSync(repoPath(path)));
});
