import { describe, it, expect, beforeEach } from 'bun:test';
import { recordRpcDuration, getRpcMethodStats, resetRpcMetrics } from './rpcMetrics';

describe('rpcMetrics', () => {
  beforeEach(() => resetRpcMetrics());

  it('aggregates count/min/p50/p99/max per service+method', () => {
    for (const ms of [10, 20, 30, 40, 100]) {
      recordRpcDuration('TaskService', 'ListTasks', ms, false);
    }

    const stats = getRpcMethodStats();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      method: 'TaskService/ListTasks',
      count: 5,
      minMs: 10,
      maxMs: 100,
    });
  });

  it('tracks errorCount separately from successful calls', () => {
    recordRpcDuration('TaskService', 'CreateTask', 5, false);
    recordRpcDuration('TaskService', 'CreateTask', 8, true);
    recordRpcDuration('TaskService', 'CreateTask', 12, true);

    const stats = getRpcMethodStats();
    expect(stats[0]!.count).toBe(3);
    expect(stats[0]!.errorCount).toBe(2);
  });

  it('keeps methods separate from each other', () => {
    recordRpcDuration('TaskService', 'ListTasks', 10, false);
    recordRpcDuration('OrgService', 'ListOrgs', 20, false);

    const stats = getRpcMethodStats();
    const methods = stats.map((s) => s.method).sort();
    expect(methods).toEqual(['OrgService/ListOrgs', 'TaskService/ListTasks']);
  });

  it('caps retained samples per method so memory does not grow unbounded', () => {
    for (let i = 0; i < 1000; i++) {
      recordRpcDuration('TaskService', 'ListTasks', i, false);
    }

    const stats = getRpcMethodStats();
    expect(stats[0]!.count).toBe(500);
    // Only the most recent 500 samples (500..999) should be retained.
    expect(stats[0]!.maxMs).toBe(999);
    expect(stats[0]!.minMs).toBe(500);
  });

  it('returns an empty list when nothing has been recorded', () => {
    expect(getRpcMethodStats()).toEqual([]);
  });
});
