import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/test/wire/domainEventRecovery.integration.test.ts', import.meta.url));
const original = readFileSync(source, 'utf8');
const anchor = '      const resumedProjector = consumer(url);';
if (!original.includes(anchor)) throw new Error('Recovery observer proof anchor is missing.');
const directory = mkdtempSync(join(tmpdir(), 'tasker-recovery-observer-'));
const stdoutPath = join(directory, 'stdout'), stderrPath = join(directory, 'stderr');
let exitCode, output = '', timedOut = false;
try {
  writeFileSync(source, original.replace(anchor, anchor
    + "\n      console.error(JSON.stringify({ kind: 'runbook-recovery-stage', driver, stage: 'before-consumer-kill' }));"
    + "\n      resumedProjector.process.kill('SIGKILL');\n      await resumedProjector.process.exited;"
    + "\n      console.error(JSON.stringify({ kind: 'runbook-recovery-stage', driver, stage: 'after-consumer-kill' }));"));
  const child = Bun.spawn({ cmd: [process.execPath, 'test', 'src/test/wire/domainEventRecovery.integration.test.ts',
    '--test-name-pattern', 'domain recovery.*sqlite'], cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, TASKER_REAL_INTEGRATION: '1', TASKER_MYSQL_INTEGRATION: '0', STANDALONE: 'true' },
    stdout: Bun.file(stdoutPath), stderr: Bun.file(stderrPath) });
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 60_000);
  try { exitCode = await child.exited; } finally { clearTimeout(timeout); }
  output = (await Bun.file(stdoutPath).slice(0, 1_048_576).text()) + '\n'
    + (await Bun.file(stderrPath).slice(0, 1_048_576).text());
} finally {
  writeFileSync(source, original);
  if (readFileSync(source, 'utf8') !== original) throw new Error('Recovery observer source restoration failed.');
  rmSync(directory, { recursive: true, force: true });
}
function records(kind) {
  return output.split('\n').flatMap(line => {
    const at = line.indexOf('{"kind":"' + kind + '"');
    if (at < 0) return [];
    try { return [JSON.parse(line.slice(at))]; } catch { return []; }
  });
}
const observations = records('runbook-broker-recovery-observation');
const observation = observations.find(value => value.driver === 'sqlite' && value.phase === 'complete'
  && value.expectedAuditRows === 4 && value.sourceCount === 4 && value.auditRows === 3
  && value.consumerWasRunning === false && Number.isInteger(value.consumerExitCode) && value.consumerExitCode !== 0);
const stages = records('runbook-recovery-stage').map(value => value.stage)
  .filter(value => ['first-audit-start', 'first-audit-ready', 'broker-restarted', 'before-consumer-kill', 'after-consumer-kill'].includes(value));
console.log(JSON.stringify({ kind: 'runbook-recovery-observer-fault', exitCode, timedOut,
  stoppedConsumerObserved: Boolean(observation), backupObserved: records('runbook-backup-observation').length > 0,
  observedPhases: observations.map(value => value.phase), stages }));
if (exitCode !== 1 || timedOut || !observation || !output.includes('owned audit consumer exited during broker recovery')
  || !output.includes('1 fail') || output.includes('"cleanupErrors"')) {
  for (const value of observations) console.log(JSON.stringify(value));
  throw new Error('Owned consumer kill did not reach the intended recovery observer and checkpoint.');
}
console.log('Actual owned consumer kill fails its checkpoint with four source/three audit rows; source restored byte-for-byte.');
