import { spawn } from 'node:child_process';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

// Self-contained regression probe for the YZPZ Agent sidecar. Unlike the
// other probe-*.mjs scripts (which hardcode a developer's Windows paths),
// this one resolves the harness dist from its own location and uses a
// throwaway temp data dir, so it runs anywhere Node + a build exist.
//   node probe-regression.mjs   (after `npm run build`)
const DATA_DIR = mkdtempSync(join(tmpdir(), 'yzpz-probe-'));
const ENTRY = join(dirname(fileURLToPath(import.meta.url)), 'dist', 'index.js');
const child = spawn(process.execPath, [ENTRY, '--data-dir', DATA_DIR], { stdio: ['ignore', 'pipe', 'inherit'] });

const port = await new Promise((resolve, reject) => {
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/READY (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  child.on('exit', (c) => reject(new Error('sidecar exited ' + c)));
  setTimeout(() => reject(new Error('READY timeout')), 20000);
});

const ws = new WebSocket('ws://127.0.0.1:' + port);
await new Promise((r) => ws.on('open', r));
let id = 1;
const cmd = (command, args) => new Promise((resolve) => {
  const myId = String(id++);
  const onMsg = (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'response' && m.id === myId) { ws.off('message', onMsg); resolve(m); }
  };
  ws.on('message', onMsg);
  ws.send(JSON.stringify({ type: 'command', id: myId, command, args }));
});

const checks = [];
const ok = (name, cond) => { checks.push([name, cond]); console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); };

// 1) Provider config persisted with 0600 and private dir
const cfg = await cmd('set-provider-config', { providerId: 'verify-test', apiKey: 'sk-test-123', baseUrl: 'https://example.com' });
ok('set-provider-config ok', cfg.ok === true);
await new Promise((r) => setTimeout(r, 300));
const provFile = join(DATA_DIR, 'providers.json');
const dirMode = statSync(DATA_DIR).mode & 0o777;
const fileMode = statSync(provFile).mode & 0o777;
ok('data dir 0700', dirMode === 0o700);
ok('providers.json 0600', fileMode === 0o600);

// 2) Key redaction: list-provider-configs must not leak the key
const listed = await cmd('list-provider-configs', {});
const hasKey = JSON.stringify(listed.result).includes('sk-test-123');
const hasFlag = JSON.stringify(listed.result).includes('hasApiKey');
ok('list redacts apiKey', listed.ok === true && !hasKey && hasFlag);

// 3) resume-session for a missing session returns a clean error (not a crash)
const resume = await cmd('resume-session', { sessionId: 'no-such-session' });
ok('resume missing session -> clean error', resume.ok === true && resume.result.error.includes('no longer exists'));

// 4) stop on a missing session does not crash the sidecar
const stop = await cmd('stop-session', { sessionId: 'no-such-session' });
ok('stop missing session handled', stop.ok === true || stop.ok === false);

// 5) create-session missing args -> clean error
const create = await cmd('create-session', { providerId: 'x' });
ok('create-session validates args', create.ok === false && /Missing required arg/.test(create.error));

// 6) health + ping
const health = await cmd('health', {});
ok('health', health.ok === true && health.result.ready === true);
const ping = await cmd('ping', {});
ok('ping', ping.ok === true && ping.result.pong === true);

ws.close();
child.kill();
console.log('\nRESULT: ' + checks.filter(([, c]) => c).length + '/' + checks.length + ' passed');
process.exit(checks.every(([, c]) => c) ? 0 : 1);
