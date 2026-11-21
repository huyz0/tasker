import { expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settleOwnedCleanup } from './ownedCleanup';

it('attempts later owned cleanup and restores environment after a connection close fails', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tasker-cleanup-test-'));
  const previous = process.env.TASKER_CLEANUP_TEST_MARKER, failure = new Error('owned close failed');
  process.env.TASKER_CLEANUP_TEST_MARKER = 'temporary';
  const restore = () => { if (previous === undefined) delete process.env.TASKER_CLEANUP_TEST_MARKER;else process.env.TASKER_CLEANUP_TEST_MARKER = previous; };
  try {
    const failures = await settleOwnedCleanup([
      async () => { throw failure; },
      async () => { rmSync(directory, { recursive: true }); },
    ], restore);
    expect(existsSync(directory)).toBe(false);
    expect(process.env.TASKER_CLEANUP_TEST_MARKER).toBe(previous);
    expect(failures).toEqual([failure]);
  } finally { rmSync(directory, { recursive: true, force: true });restore(); }
});

it('returns restoration errors only after completing owned resource removal', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tasker-cleanup-test-')), failure = new Error('restore failed');
  try {
    const failures = await settleOwnedCleanup([async () => { rmSync(directory, { recursive: true }); }], () => { throw failure; });
    expect(existsSync(directory)).toBe(false);expect(failures).toEqual([failure]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
