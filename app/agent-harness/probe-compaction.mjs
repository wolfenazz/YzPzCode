// Deterministic regression probe for YZPZ compaction preference resolution.
// Run after `npm run build`.
import { resolveCompactionPreference } from './dist/harness.js';

const checks = [
  ['global Off stays off', { compactionEnabled: false, compactionStrategy: 'basic' }, undefined, false, 'basic'],
  ['global Basic stays enabled', { compactionEnabled: true, compactionStrategy: 'basic' }, undefined, true, 'basic'],
  ['global Agentic stays enabled', { compactionEnabled: true, compactionStrategy: 'agentic' }, undefined, true, 'agentic'],
  ['legacy defaults remain enabled', {}, undefined, true, 'basic'],
  ['explicit session strategy enables compaction', { compactionEnabled: false }, 'agentic', true, 'agentic'],
];

let failures = 0;
for (const [name, global, sessionStrategy, enabled, strategy] of checks) {
  const actual = resolveCompactionPreference(global, sessionStrategy);
  const ok = actual.enabled === enabled && actual.strategy === strategy;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    failures += 1;
    console.error('  expected:', { enabled, strategy }, 'actual:', actual);
  }
}

if (failures) process.exit(1);
console.log(`\nprobe-compaction: ${checks.length}/${checks.length} passed`);