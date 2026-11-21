import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const available = Array.from(new Bun.Glob('src/**/*.mysql.test.ts').scanSync({ cwd: root })).sort();
const requested = process.argv.slice(2);
if (!available.length || requested.some(file => !available.includes(file))) throw new Error('Select existing native MySQL test files only.');
const files = requested.length ? Array.from(new Set(requested)) : available;
const password = process.env.DB_PASSWORD;
const redact = text => password && password.length >= 4 ? text.replaceAll(password, '[redacted]') : text;
const decoder = new TextDecoder();
const number = (text, label) => Number(new RegExp('(?:^|\\n)\\s*(\\d+)\\s+' + label + '\\b').exec(text)?.[1] ?? 0);

async function main() {
  let admin;
  try {
    admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root', password });
    await admin.query('SELECT 1');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'unavailable';
    throw new Error('Required MySQL readiness check failed: ' + code);
  }
  const results = [];
  try {
    const [version] = await admin.query('SELECT VERSION() AS version');
    for (const file of files) {
      // Never accept a caller's schema name or remove an existing deployment.
      const database = 'tasker_ci_mysql_' + crypto.randomUUID().replaceAll('-', '');
      let created = false;
      const started = performance.now();
      try {
        await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4');created = true;
        const child = Bun.spawnSync({ cmd: [process.execPath, 'test', file], cwd: root,
          env: { ...process.env, STANDALONE: 'false', TASKER_MYSQL_INTEGRATION: '1',
            TASKER_REAL_INTEGRATION: '1', DB_NAME: database, FORCE_COLOR: '0', NO_COLOR: '1' },
          stdout: 'pipe', stderr: 'pipe', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
        const out = decoder.decode(child.stdout), errors = decoder.decode(child.stderr), report = out + '\n' + errors;
        process.stdout.write(redact(out));process.stderr.write(redact(errors));
        const passed = number(report, 'pass'), failed = number(report, 'fail'), skipped = number(report, 'skip');
        if (child.exitCode !== 0 || failed !== 0 || passed === 0 || skipped !== 0) {
          throw new Error('Required native MySQL file did not fully pass: ' + file);
        }
        results.push({ file, passed, failed, skipped, milliseconds: Math.round(performance.now() - started) });
      } finally {
        if (created) await admin.query('DROP DATABASE ' + database);
      }
    }
    console.log(JSON.stringify({ kind: 'required-mysql', version: version[0].version, files: results, passed: results.reduce((sum, row) => sum + row.passed, 0) }));
  } finally { await admin.end(); }
}
await main().catch(error => { console.error(redact(error instanceof Error ? error.message : 'Required MySQL verification failed.'));process.exitCode = 1; });
