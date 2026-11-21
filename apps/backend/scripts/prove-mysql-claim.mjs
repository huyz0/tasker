import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../src/modules/tasks/tasks.mysql.test.ts', import.meta.url));
const original = readFileSync(file, 'utf8'), assertion = 'expect(fulfilled.length).toBe(1);';
if (original.split(assertion).length !== 2) throw new Error('Review the native claim fault after its assertion changed.');
let result;
try {
  writeFileSync(file, original.replace(assertion, 'expect(fulfilled.length).toBe(2);'));
  result = Bun.spawnSync({ cmd: [process.execPath, 'run', 'scripts/verify-mysql.mjs', 'src/modules/tasks/tasks.mysql.test.ts'],
    cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    stdout: 'pipe', stderr: 'pipe', timeout: 210_000 });
} finally {
  writeFileSync(file, original);
  if (readFileSync(file, 'utf8') !== original) throw new Error('Native claim source was not restored byte-for-byte.');
}
const output = new TextDecoder().decode(result.stdout) + '\n' + new TextDecoder().decode(result.stderr);
if (result.exitCode !== 1 || !/Expected:\s*2/.test(output) || !/Received:\s*1/.test(output) || !/\b1 fail\b/.test(output)) {
  throw new Error('The required MySQL command did not reject its intended claim assertion; prerequisite failure is not proof.');
}
console.log('The real MySQL claim assertion fails through the required command; original source restored byte-for-byte.');
