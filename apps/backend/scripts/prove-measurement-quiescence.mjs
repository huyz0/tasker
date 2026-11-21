import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('./measure-concurrency.ts', import.meta.url)), original = readFileSync(path, 'utf8');
const marker = '    const recoveryMs = performance.now() - tailStart;';
if (original.split(marker).length !== 2) throw new Error('Review the late SQL fault after the phase boundary changed.');
const injected = [
  '    const lateSqlProofConnection = await mysql.createConnection({ ...adminConfig, database });',
  '    await lateSqlProofConnection.beginTransaction();',
  "    await lateSqlProofConnection.query({ sql: 'INSERT INTO tasks (id, project_id, display_id, title, status) VALUES (?, ?, ?, ?, ?)', values: ['tsk-' + crypto.randomUUID(), projectId, 'LATE-PROOF', prefix + 'unattempted-late-commit', 'todo'], timeout: 5000 });",
  "    setTimeout(() => { void lateSqlProofConnection.commit().then(async () => { await Bun.write(Bun.stderr, 'late-sql-proof:committed\\n'); }).finally(() => lateSqlProofConnection.destroy()); }, 2000);",
].join('\n');
let result;
try {
  writeFileSync(path, original.replace(marker, marker + '\n' + injected));
  result = Bun.spawnSync({ cmd: [process.execPath, 'run', path, '--concurrency', '1', '--duration', '1', '--fixture', '0', '--instances', '1', '--seed', '7', '--max-operations', '1'],
    cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    stdout: 'pipe', stderr: 'pipe', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
} finally {
  writeFileSync(path, original);
  if (readFileSync(path, 'utf8') !== original) throw new Error('Measurement source was not restored byte-for-byte.');
}
const decoder = new TextDecoder(), out = decoder.decode(result.stdout), errors = decoder.decode(result.stderr);
const line = out.split('\n').find(line => line.startsWith('{"kind":"tasker-http-concurrency-v1"'));
const report = line ? JSON.parse(line) : null;
console.log(JSON.stringify({ kind: 'measurement-quiescence-proof-observation', exitCode: result.exitCode,
  committed: errors.includes('late-sql-proof:committed'), checked: report?.correctness?.checked ?? false,
  unexpected: report?.correctness?.unexpected ?? null, valid: report?.correctness?.ok ?? null,
  cleanupFailures: report?.cleanupFailures ?? null }));
if (result.exitCode !== 1 || !errors.includes('late-sql-proof:committed') || !report?.correctness?.checked
  || report.correctness.ok !== false || !(report.correctness.unexpected > 0) || report.cleanupFailures !== 0) {
  throw new Error('Late SQL commit escaped the final outcome oracle or the probe did not reach its intended assertion.');
}
console.log('An actual late SQL commit fails the final outcome oracle; source restored byte-for-byte.');
