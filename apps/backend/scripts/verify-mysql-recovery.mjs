import mysql from 'mysql2/promise';

const files = [
  'src/test/wire/atomicRecovery.integration.test.ts',
  'src/test/wire/domainEventRecovery.integration.test.ts',
  'src/test/wire/scheduleRecovery.integration.test.ts',
  'src/test/wire/durableEvents.integration.test.ts',
  'src/test/wire/twoInstance.integration.test.ts',
];
// Even fixtures that historically relied on an external DB_NAME receive only
// this generated schema. Nested owned fixtures retain their own isolation.
const database = 'tasker_ci_recovery_' + crypto.randomUUID().replaceAll('-', '');
let admin, created = false;
try {
  admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
  await admin.query('SELECT 1');
  await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4');created = true;
  const result = Bun.spawnSync({ cmd: [process.execPath, 'test', ...files],
    env: { ...process.env, DB_NAME: database, STANDALONE: 'false', TASKER_REAL_INTEGRATION: '1', TASKER_MYSQL_INTEGRATION: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
    stdout: 'pipe', stderr: 'pipe', timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
  const decode = new TextDecoder(), out = decode.decode(result.stdout), errors = decode.decode(result.stderr), report = out + '\n' + errors;
  process.stdout.write(out);process.stderr.write(errors);
  const count = label => Number(new RegExp('(?:^|\\n)\\s*(\\d+)\\s+' + label + '\\b').exec(report)?.[1] ?? 0);
  if (result.exitCode !== 0 || count('pass') === 0 || count('fail') !== 0 || count('skip') !== 0) {
    throw new Error('Required MySQL recovery must execute every selected case without skips or failures.');
  }
} finally {
  try { if (created) await admin.query('DROP DATABASE ' + database); }
  finally { await admin?.end(); }
}
