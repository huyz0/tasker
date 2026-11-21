import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../src/consumers/auditProjector.ts', import.meta.url)), original = readFileSync(path, 'utf8');
const insert = '    await db.insert(table).values(row);';
const identity = original.split('\n').find(line => line.trimStart().startsWith('eventId: typeof event.payload.eventId'));
if (original.split(insert).length !== 2 || !identity) throw new Error('Review the audit fault after projection changed.');
for (const mode of ['lost', 'duplicate']) {
  let result;
  try {
    const changed = mode === 'lost' ? original.replace(insert, "    if (event.subject !== 'domain.task.created') await db.insert(table).values(row);")
      : original.replace(identity, '    eventId: randomUUID(),');
    writeFileSync(path, changed);
    result = Bun.spawnSync({ cmd: [process.execPath, 'test', 'src/test/wire/twoInstance.integration.test.ts'],
      cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env,
        TASKER_REAL_INTEGRATION: '1', TASKER_MYSQL_INTEGRATION: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
      stdout: 'pipe', stderr: 'pipe', timeout: 210_000, maxBuffer: 16 * 1024 * 1024 });
  } finally {
    writeFileSync(path, original);
    if (readFileSync(path, 'utf8') !== original) throw new Error('Audit source was not restored byte-for-byte.');
  }
  const decoder = new TextDecoder(), output = decoder.decode(result.stdout) + '\n' + decoder.decode(result.stderr);
  const intended = mode === 'lost' ? output.includes('Lost audit outcome after acknowledged delivery')
    : Number(/Duplicate audit outcome: (\d+) rows/.exec(output)?.[1] ?? 0) > 1;
  if (result.exitCode !== 1 || !/\b1 fail\b/.test(output) || !intended) throw new Error('The ' + mode + ' audit fault did not reach its actual acknowledged-outcome assertion.');
  console.log('Real two-instance ' + mode + ' audit fault fails its intended assertion; source restored byte-for-byte.');
}
