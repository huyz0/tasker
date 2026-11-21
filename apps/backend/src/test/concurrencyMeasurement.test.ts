import { expect, it } from 'bun:test';
import { measurementConfig, latencySummary, reconcileOutcomes } from '../../scripts/concurrency-core';

it('rejects unbounded, unknown, repeated and malformed measurement arguments', () => {
  for (const args of [
    ['--concurrency', '0'], ['--concurrency', '1001'], ['--duration', '121'],
    ['--fixture', '-1'], ['--instances', '5'], ['--seed', 'NaN'],
    ['--max-operations', '50001'], ['--duration', '1.5'], ['--endpoint', 'https://production.invalid'],
    ['--instances', '2', '--instances', '3'], ['--seed'],
  ]) expect(() => measurementConfig(args)).toThrow();
});

it('retains all explicit bounded workload dimensions', () => {
  expect(measurementConfig(['--concurrency', '100', '--duration', '15', '--fixture', '1000', '--instances', '2', '--seed', '42', '--max-operations', '3000']))
    .toEqual({ concurrency: 100, duration: 15, fixture: 1000, instances: 2, seed: 42, maxOperations: 3000 });
});

it('reports observed nearest-rank tail latency without changing the input', () => {
  const input = [50, 10, 40, 20, 30];
  expect(latencySummary(input)).toEqual({ count: 5, p50: 30, p95: 50, p99: 50 });
  expect(input).toEqual([50, 10, 40, 20, 30]);
  expect(latencySummary([])).toEqual({ count: 0, p50: null, p95: null, p99: null });
});

it('fails a lost accepted write while retaining uncertain non-writes separately', () => {
  const result = reconcileOutcomes([
    { key: 'accepted', acceptedId: 'task-a' }, { key: 'timed-out' },
  ], []);
  expect(result.lost).toBe(1);
  expect(result.unresolvedNotWritten).toBe(1);
});

it('detects duplicate logical rows and a mismatched accepted identity', () => {
  const result = reconcileOutcomes([{ key: 'a', acceptedId: 'task-a' }], [
    { key: 'a', id: 'task-b' }, { key: 'a', id: 'task-c' },
  ]);
  expect(result.duplicates).toBe(1);
  expect(result.identityMismatch).toBe(1);
});

it('reconciles uncertain committed writes without inventing an acceptance response', () => {
  expect(reconcileOutcomes([{ key: 'unknown' }, { key: 'accepted', acceptedId: 'task-a' }], [
    { key: 'accepted', id: 'task-a' }, { key: 'unknown', id: 'task-b' },
  ])).toEqual({ lost: 0, duplicates: 0, identityMismatch: 0, unexpected: 0, unresolvedCommitted: 1, unresolvedNotWritten: 0 });
});

it('rejects source rows outside attempted logical operations', () => {
  expect(reconcileOutcomes([], [{ key: 'never-requested', id: 'unexpected' }]).unexpected).toBe(1);
});
