import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('./concurrency-core.ts', import.meta.url)), original = readFileSync(path, 'utf8');
const marker = 'export function measurementConfig(args: string[]): Config {';
if (original.split(marker).length !== 2) throw new Error('Review the configuration fault after the parser changed.');
let result;
try {
  const changed = original.replace(marker, 'function uncheckedMeasurementConfig(args: string[]): Config {')
    + '\nexport function measurementConfig(_args: string[]): Config { return { concurrency: 4, duration: 3, fixture: 20, instances: 2, seed: 1, maxOperations: 20 }; }\n';
  writeFileSync(path, changed);
  result = Bun.spawnSync({ cmd: [process.execPath, 'test', 'src/test/concurrencyMeasurement.test.ts'],
    cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    stdout: 'pipe', stderr: 'pipe', timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
} finally {
  writeFileSync(path, original);
  if (readFileSync(path, 'utf8') !== original) throw new Error('Measurement core source was not restored byte-for-byte.');
}
const decoder = new TextDecoder(), output = decoder.decode(result.stdout) + '\n' + decoder.decode(result.stderr);
if (result.exitCode === 0 || !output.includes('(fail) rejects unbounded, unknown, repeated and malformed measurement arguments') || !output.includes('toThrow')) {
  throw new Error('The unchecked configuration fault did not fail its actual invalid-input assertion.');
}
console.log('Unchecked measurement inputs fail their intended assertion; source restored byte-for-byte.');
