import { describe, it, expect, beforeEach } from 'bun:test';
import { recordHttpRequest, getHttpRequestCounts, resetHttpMetrics } from './httpMetrics';

beforeEach(() => {
  resetHttpMetrics();
});

describe('httpMetrics', () => {
  it('starts with no recorded requests', () => {
    expect(getHttpRequestCounts()).toEqual([]);
  });

  it('counts a repeated method/path/status combination', () => {
    recordHttpRequest('GET', '/api/auth/session', 200);
    recordHttpRequest('GET', '/api/auth/session', 200);
    expect(getHttpRequestCounts()).toEqual([{ method: 'GET', path: '/api/auth/session', status: 200, count: 2 }]);
  });

  it('keeps distinct statuses for the same method/path separate', () => {
    recordHttpRequest('POST', '/api/client-errors', 204);
    recordHttpRequest('POST', '/api/client-errors', 400);
    const counts = getHttpRequestCounts();
    expect(counts).toHaveLength(2);
    expect(counts.find((c) => c.status === 204)?.count).toBe(1);
    expect(counts.find((c) => c.status === 400)?.count).toBe(1);
  });

  it('sorts counts descending', () => {
    recordHttpRequest('GET', '/rare', 200);
    recordHttpRequest('GET', '/common', 200);
    recordHttpRequest('GET', '/common', 200);
    recordHttpRequest('GET', '/common', 200);
    expect(getHttpRequestCounts()[0]).toEqual({ method: 'GET', path: '/common', status: 200, count: 3 });
  });

  it('resetHttpMetrics clears all recorded counts', () => {
    recordHttpRequest('GET', '/api/auth/session', 200);
    resetHttpMetrics();
    expect(getHttpRequestCounts()).toEqual([]);
  });
});
