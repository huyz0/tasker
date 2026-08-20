import { describe, it, expect } from 'bun:test';
import { runWithRequestContext, getRequestContext, setRequestActor, getPolicyCache } from './requestContext';

describe('setRequestActor', () => {
  it('records the actor on the context already open for this request', () => {
    // The logging interceptor opens the context knowing only a session user
    // id — it runs before a database handle exists, and resolving the full
    // principal there would put a query in front of every log line. The
    // session interceptor resolves it a moment later and fills this in, on
    // the same object, so everything after it in the async scope sees it.
    runWithRequestContext({ requestId: 'req-1' }, () => {
      setRequestActor({ kind: 'agent', agentId: 'agt-1' });
      expect(getRequestContext()?.actor).toEqual({ kind: 'agent', agentId: 'agt-1' });
    });
  });

  it('is visible to code further down the same async scope', () => {
    // The property that makes this work at all: `withRequestCorrelation`
    // reads the actor long after the interceptor that set it returned.
    return runWithRequestContext({ requestId: 'req-2' }, async () => {
      setRequestActor({ kind: 'user', userId: 'usr-1' });
      await Promise.resolve();
      expect(getRequestContext()?.actor).toEqual({ kind: 'user', userId: 'usr-1' });
    });
  });

  it('is a no-op outside a request rather than throwing', () => {
    // A script, or a test calling a handler directly, has no context and must
    // behave exactly as it did before this existed.
    expect(() => setRequestActor({ kind: 'user', userId: 'u1' })).not.toThrow();
  });
});

describe('getPolicyCache', () => {
  it('returns null outside a request, which can() reads as "query fresh"', () => {
    expect(getPolicyCache()).toBeNull();
  });

  it('creates one lazily and returns the same instance within a request', () => {
    runWithRequestContext({ requestId: 'req-3' }, () => {
      const first = getPolicyCache();
      expect(first).not.toBeNull();
      expect(getPolicyCache()).toBe(first);
    });
  });
});
