import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const file = join(import.meta.dir, 'measurement-transport.ts');
const original = readFileSync(file, 'utf8');
const cases = [
  { mode: 'deadline', name: 'settles a real stalled RPC at its configured deadline' },
  { mode: 'cancellation', name: 'cancels a real in-flight stalled RPC when the controller aborts' },
];
for (const { mode, name } of cases) {
  let broken = original;
  if (mode === 'deadline') {
    broken = broken.replace('defaultTimeoutMs: timeoutMs', 'defaultTimeoutMs: undefined')
      .replace("const timer = setTimeout(() => deadline.abort(new ConnectError('Measurement request deadline exceeded.', Code.DeadlineExceeded)), timeoutMs);",
        'const timer = setTimeout(() => {}, timeoutMs);');
  } else {
    broken = broken.replace('[request.signal, options.signal, deadline.signal]', '[request.signal, new AbortController().signal, deadline.signal]');
  }
  if (broken === original) throw new Error('Transport proof source anchor is missing.');
  try {
    writeFileSync(file, broken);
    const child = Bun.spawnSync({ cmd: [process.execPath, 'test', 'src/test/measurementTransport.test.ts', '--test-name-pattern', name],
      cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: 8000 });
    const output = new TextDecoder().decode(child.stdout) + new TextDecoder().decode(child.stderr);
    const observations = output.split('\n').flatMap(line => {
      const at = line.indexOf('{"kind":"measurement-transport-observation"');
      if (at < 0) return [];
      try { return [JSON.parse(line.slice(at))]; } catch { return []; }
    });
    const observed = observations.find(value => value.scenario === mode && value.received === true && value.settled === false);
    console.log(JSON.stringify({ kind: 'measurement-transport-fault', mode, exitCode: child.exitCode,
      received: Boolean(observed?.received), settled: observed?.settled ?? null }));
    if (child.exitCode !== 1 || !observed || !output.includes('(fail) ' + name) || !/1 fail/.test(output)) {
      throw new Error('Transport fault did not fail its intended real stalled-RPC assertion.');
    }
  } finally {
    writeFileSync(file, original);
    if (readFileSync(file, 'utf8') !== original) throw new Error('Transport source restoration failed.');
  }
  console.log('Real stalled-RPC ' + mode + ' fault fails its intended assertion; source restored byte-for-byte.');
}
