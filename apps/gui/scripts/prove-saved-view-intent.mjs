import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// This changes only the disposable runner checkout and always restores its bytes.
// A native assertion, rather than a transport/bootstrap failure, must reject it.
const source = fileURLToPath(new URL('../src/components/SavedViews/SavedViews.tsx', import.meta.url));
const original = readFileSync(source, 'utf8');
const line = original.split('\n').find(value => value.trimStart().startsWith('const sameIntent = '));
if (!line?.includes('now.key === before.key') || !line.includes('now.search === before.search')) throw new Error('The intent fault needs review after the guard changed.');
let result;
try {
  writeFileSync(source, original.replace(line, '  const sameIntent = (_before: Intent) => sameSession();'));
  result = Bun.spawnSync({ cmd: [process.execPath, 'x', 'playwright', 'test', 'tests/e2e/saved-views.spec.ts',
    '--grep', 'preserve intentional history', '--workers=1', '--retries=0', '--reporter=json'],
    cwd: fileURLToPath(new URL('..', import.meta.url)), stdout: 'pipe', stderr: 'pipe', timeout: 180_000 });
} finally {
  writeFileSync(source, original);
  if (readFileSync(source, 'utf8') !== original) throw new Error('Saved-view source was not restored byte-for-byte.');
}
let report;
try { report = JSON.parse(new TextDecoder().decode(result.stdout)); }
catch { throw new Error('The native fault run did not return a complete browser report.'); }
const failures = [];
function inspect(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      for (const attempt of test.results ?? []) if (attempt.status === 'failed') failures.push(attempt);
    }
    inspect(suite.suites);
  }
}
inspect(report.suites);
const intended = failures.find(attempt => (attempt.errors ?? [attempt.error]).some(error =>
  error?.message?.includes('late authorized Open must refuse newer browser intent')));
if (result.exitCode !== 1 || report.stats?.unexpected !== 1 || !intended) {
  throw new Error('The intent fault did not fail its intended native assertion; infrastructure failures are not proof.');
}
console.log('Native authorized-Open intent fault fails the expected assertion; source restored byte-for-byte.');
