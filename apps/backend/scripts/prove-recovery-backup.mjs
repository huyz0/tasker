import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/test/wire/domainEventRecovery.integration.test.ts', import.meta.url));
const original = readFileSync(source, 'utf8');
const anchor = '        copyFileSync(backupPath, path);';
if (!original.includes(anchor)) throw new Error('Backup proof restore anchor is missing.');
let result;
try {
  writeFileSync(source, original.replace(anchor, '        await Bun.write(path, new Uint8Array(0));'));
  result = Bun.spawnSync({ cmd: [process.execPath, 'test', 'src/test/wire/domainEventRecovery.integration.test.ts',
    '--test-name-pattern', 'domain recovery.*sqlite'], cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, TASKER_REAL_INTEGRATION: '1', TASKER_MYSQL_INTEGRATION: '0', STANDALONE: 'true' },
    stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
} finally {
  writeFileSync(source, original);
  if (readFileSync(source, 'utf8') !== original) throw new Error('Backup fixture source restoration failed.');
}
const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
const observations = output.split('\n').flatMap(line => {
  const at = line.indexOf('{"kind":"runbook-backup-observation"');
  if (at < 0) return [];
  try { return [JSON.parse(line.slice(at))]; } catch { return []; }
});
const empty = observations.find(value => value.driver === 'sqlite' && value.tasks === 0 && value.events === 0
  && value.deliveries === 0 && value.matched === false);
console.log(JSON.stringify({ kind: 'runbook-backup-fault', exitCode: result.exitCode, emptyRestoreObserved: Boolean(empty) }));
if (result.exitCode !== 1 || !empty || !output.includes('expect(restoredBackup.tasks).toEqual(expectedBackup.tasks)')
  || !output.includes('1 fail') || output.includes('"cleanupErrors"')) {
  throw new Error('Empty backup did not fail its intended restored-task identity assertion.');
}
console.log('Actual empty SQLite restore fails the intended identity oracle; source restored byte-for-byte.');
