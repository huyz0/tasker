import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('rejects credential-bearing API configuration before emitting public assets or reflecting its value', () => {
  const output = mkdtempSync(join(tmpdir(), 'tasker-api-config-'));
  const synthetic = 'synthetic_build_credential_not_real';
  try {
    const result = spawnSync('bunx', ['vite', 'build', '--outDir', output], {
      cwd: root,
      env: { ...process.env, VITE_BACKEND_URL: `https://review-user:${synthetic}@api.example.com` },
      encoding: 'utf8', timeout: 45_000,
    });
    const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    assert.ok(!result.error, 'Builder must reach configuration validation.');
    assert.notEqual(result.status, 0, 'Invalid API configuration must stop the build.');
    assert.ok(log.includes('Invalid Tasker API configuration.'), 'The error must be sanitized and specific.');
    assert.equal(log.includes(synthetic), false, 'Diagnostics must not reflect the configured credential.');
    const assets = readdirSync(output, { recursive: true }).filter(path => path.endsWith('.js'));
    assert.equal(assets.some(path => readFileSync(join(output, path), 'utf8').includes(synthetic)), false,
      'A rejected credential must not be embedded in public JavaScript.');
  } finally { rmSync(output, { recursive: true, force: true }); }
});
