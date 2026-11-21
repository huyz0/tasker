import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/test/wire/domainEventRecovery.integration.test.ts', import.meta.url));
const original = readFileSync(source, 'utf8');
const anchor = '      const resumedProjector = consumer(url);';
if (!original.includes(anchor)) throw new Error('Recovery observer proof anchor is missing.');
let result;
try {
  writeFileSync(source, original.replace(anchor, anchor + "\n      resumedProjector.process.kill('SIGKILL');\n      await resumedProjector.process.exited;"));
  result = Bun.spawnSync({ cmd: [process.execPath, 'test', 'src/test/wire/domainEventRecovery.integration.test.ts',
    '--test-name-pattern', 'domain recovery.*sqlite'], cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, TASKER_REAL_INTEGRATION: '1', TASKER_MYSQL_INTEGRATION: '0', STANDALONE: 'true' },
    stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
} finally {
  writeFileSync(source, original);
  if (readFileSync(source, 'utf8') !== original) throw new Error('Recovery observer source restoration failed.');
}
const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
const observations = output.split('\n').flatMap(line => {
  const at = line.indexOf('{"kind":"runbook-broker-recovery-observation"');
  if (at < 0) return [];
  try { return [JSON.parse(line.slice(at))]; } catch { return []; }
});
const observation = observations.find(value => value.driver === 'sqlite' && value.phase === 'complete' && value.sourceCount === 4
  && value.auditRows === 3 && value.consumerWasRunning === false && Number.isInteger(value.consumerExitCode)
  && value.consumerExitCode !== 0);
console.log(JSON.stringify({ kind: 'runbook-recovery-observer-fault', exitCode: result.exitCode,
  stoppedConsumerObserved: Boolean(observation), observedPhases: observations.map(value => value.phase) }));
if (result.exitCode !== 1 || !observation || !output.includes('owned audit consumer exited during broker recovery')
  || !output.includes('1 fail') || output.includes('"cleanupErrors"')) {
  throw new Error('Owned consumer kill did not reach the intended recovery observer and checkpoint.');
}
console.log('Actual owned consumer kill fails its checkpoint with four source/three audit rows; source restored byte-for-byte.');
