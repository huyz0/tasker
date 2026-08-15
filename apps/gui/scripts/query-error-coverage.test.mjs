import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findUnhandled, report } from './query-error-coverage.mjs';

/** A features tree written to disk, so the check runs against real files. */
function fixture(sources) {
  const dir = mkdtempSync(join(tmpdir(), 'query-error-coverage-'));
  for (const [name, body] of Object.entries(sources)) {
    const full = join(dir, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

test('a view that renders its query error passes', () => {
  const dir = fixture({
    'Projects/index.tsx': 'const q = useQuery({}); return <ListState error={q.error} />;',
  });
  const result = findUnhandled({ srcDir: dir, exceptions: {} });
  assert.deepEqual(result.offenders, []);
  assert.equal(result.checked, 1);
});

test('a view that reads and never renders the error fails', () => {
  const dir = fixture({
    'Labels/index.tsx': 'const q = useQuery({}); return q.isLoading ? <p>Loading</p> : <p>No labels</p>;',
  });
  const { offenders } = findUnhandled({ srcDir: dir, exceptions: {} });
  assert.deepEqual(offenders, ['Labels/index.tsx']);
  assert.match(report({ offenders, stale: [] })[0], /never renders a query error/);
});

test('useInfiniteQuery counts as a read', () => {
  const dir = fixture({ 'Orgs/index.tsx': 'const q = useInfiniteQuery({});' });
  assert.deepEqual(findUnhandled({ srcDir: dir, exceptions: {} }).offenders, ['Orgs/index.tsx']);
});

test('a view that never reads is not checked at all', () => {
  const dir = fixture({ 'Static/index.tsx': 'export const Help = () => <p>Read the docs.</p>;' });
  const result = findUnhandled({ srcDir: dir, exceptions: {} });
  assert.deepEqual(result.offenders, []);
  assert.equal(result.checked, 0);
});

test('an exception excuses a single-query view', () => {
  const dir = fixture({ 'Agents/AgentTokens.tsx': 'const q = useQuery({}); if (!q.isSuccess) return null;' });
  const exceptions = { 'Agents/AgentTokens.tsx': 'a denial, gated on isSuccess' };
  assert.deepEqual(findUnhandled({ srcDir: dir, exceptions }).offenders, []);
});

test('an exception does NOT excuse the other queries in the same file', () => {
  // The case that matters: a view gets a permission-gated read excepted, then
  // grows an ordinary list that quietly inherits the excuse.
  const dir = fixture({
    'Organizations/index.tsx': 'const a = useQuery({}); const b = useInfiniteQuery({});',
  });
  const exceptions = { 'Organizations/index.tsx': 'invitationsQuery — a denial' };
  assert.deepEqual(findUnhandled({ srcDir: dir, exceptions }).offenders, ['Organizations/index.tsx']);
});

test('an exception for a view that no longer reads is reported as stale', () => {
  const dir = fixture({ 'Projects/index.tsx': 'const q = useQuery({}); <ListState />;' });
  const exceptions = { 'Gone/index.tsx': 'removed last year' };
  const { stale } = findUnhandled({ srcDir: dir, exceptions });
  assert.deepEqual(stale, ['Gone/index.tsx']);
  assert.match(report({ offenders: [], stale })[0], /no longer reads/);
});

test('tests of views are not themselves views', () => {
  const dir = fixture({ 'Projects/index.test.tsx': 'const q = useQuery({});' });
  assert.equal(findUnhandled({ srcDir: dir, exceptions: {} }).checked, 0);
});
