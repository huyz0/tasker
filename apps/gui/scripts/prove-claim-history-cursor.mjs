import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../tests/e2e/claim-attempts.spec.ts', import.meta.url));
const original = readFileSync(source, 'utf8');
const line = original.split('\n').find(value => value.includes('claim-history refresh must retain the visible older-page cursor'));
if (!line?.includes('cursors.slice(before).every')) throw new Error('Claim cursor proof anchor needs review.');
const fault = `    const headAccepted = await page.evaluate(async ({ endpoint, taskId }) => {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', 'connect-protocol-version': '1' },
        signal: AbortSignal.timeout(15_000), body: JSON.stringify({ taskId, page: { limit: 20 } }) });
      await response.arrayBuffer();
      return response.ok;
    }, { endpoint: api + '/tasker.health.v1.TaskService/ListTaskAttempts', taskId: task.id });
    if (!headAccepted) throw new Error('Owned head-page cursor fault was refused.');
    console.log('Owned head-page cursor fault accepted.');`;
let result;
try {
  writeFileSync(source, original.replace(line, fault + '\n' + line));
  result = Bun.spawnSync({ cmd: [process.execPath, 'x', 'playwright', 'test', 'tests/e2e/claim-attempts.spec.ts',
    '--project=chromium', '--workers=1', '--retries=0', '--reporter=json'],
    cwd: fileURLToPath(new URL('..', import.meta.url)), stdout: 'pipe', stderr: 'pipe', timeout: 180_000 });
} finally {
  writeFileSync(source, original);
  if (readFileSync(source, 'utf8') !== original) throw new Error('Claim browser source restoration failed.');
}
let report;
try { report = JSON.parse(new TextDecoder().decode(result.stdout)); }
catch { throw new Error('Claim cursor fault did not return a complete browser report.'); }
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
  error?.message?.includes('claim-history refresh must retain the visible older-page cursor'))
  && (attempt.stdout ?? []).some(value => value.text?.includes('Owned head-page cursor fault accepted.'))
  && !(attempt.errors ?? [attempt.error]).some(error => error?.message?.includes('Owned worker credential cleanup failed.')));
if (result.exitCode !== 1 || report.stats?.unexpected !== 1 || !intended) {
  throw new Error('Head-page fault did not fail its intended cursor invariant; bootstrap and cleanup failures are not proof.');
}
console.log('Actual head-page browser request fails the intended cursor invariant; source restored byte-for-byte.');
