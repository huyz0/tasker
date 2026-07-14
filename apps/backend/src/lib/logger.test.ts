import { describe, it, expect, afterEach } from 'bun:test';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The logger is a module-level singleton configured from LOG_FILE at import
// time, so (like config.ts) the only reliable way to exercise different
// LOG_FILE values is a fresh subprocess per scenario.
async function logInSubprocess(env: Record<string, string | undefined>, message: string) {
  const proc = Bun.spawn({
    cmd: ['bun', '-e', `import("./src/lib/logger.ts").then(({ logger }) => logger.info(${JSON.stringify(message)}))`],
    cwd: import.meta.dir + '/../..',
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await proc.exited;
}

describe('logger LOG_FILE opt-in', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('writes log lines to the file at LOG_FILE when set, surviving process exit', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tasker-log-test-'));
    const logFilePath = join(tmpDir, 'nested', 'backend.log');

    await logInSubprocess({ LOG_FILE: logFilePath, LOG_LEVEL: 'info', NODE_ENV: 'development' }, 'hello from logger test');

    expect(existsSync(logFilePath)).toBe(true);
    const contents = readFileSync(logFilePath, 'utf-8');
    expect(contents).toContain('hello from logger test');
  });

  it('does not write a file when LOG_FILE is unset (stdout-only, prior behavior)', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tasker-log-test-'));
    const logFilePath = join(tmpDir, 'should-not-exist.log');

    await logInSubprocess({ LOG_FILE: undefined, LOG_LEVEL: 'info', NODE_ENV: 'development' }, 'no file expected');

    expect(existsSync(logFilePath)).toBe(false);
  });
});
