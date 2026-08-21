import { describe, it, expect } from 'bun:test';
import { Lifecycle } from './lifecycle';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('readiness', () => {
  it('is not ready before the server is listening', () => {
    // The window where the process exists but the port is not open. Reporting
    // ready here sends it traffic it cannot answer.
    const lifecycle = new Lifecycle();
    expect(lifecycle.readiness()).toMatchObject({ ready: false, state: 'starting' });
  });

  it('becomes ready once listening', () => {
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    expect(lifecycle.readiness().ready).toBe(true);
  });

  it('stops being ready the moment a drain begins', async () => {
    // This is what takes the instance out of the load balancer, and it has to
    // happen before the wait rather than after it.
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    void lifecycle.drain(50);
    expect(lifecycle.readiness()).toMatchObject({ ready: false, state: 'draining', reason: 'shutting down' });
  });

  it('does not become ready again once draining has started', async () => {
    // A late markReady — a listener callback firing during shutdown — must not
    // put the instance back in the load balancer it just left.
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    void lifecycle.drain(50);
    lifecycle.markReady();
    expect(lifecycle.readiness().ready).toBe(false);
  });

  it('says why it is not ready, so a stuck rollout is diagnosable', () => {
    expect(new Lifecycle().readiness().reason).toBe('still starting');
  });
});

describe('liveness', () => {
  it('stays live while draining', () => {
    // A pod being asked to stop is healthy. Reporting it dead invites the
    // platform to SIGKILL it mid-request instead of letting the drain finish.
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    void lifecycle.drain(50);
    expect(lifecycle.isLive()).toBe(true);
  });

  it('is live before it is ready', () => {
    // Liveness that waited for readiness would kill a slow-starting container
    // instead of waiting for it.
    expect(new Lifecycle().isLive()).toBe(true);
  });
});

describe('draining', () => {
  it('returns immediately when nothing is in flight', async () => {
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    expect(await lifecycle.drain(1000)).toBe('drained');
  });

  it('waits for an in-flight request, then reports a clean drain', async () => {
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    const request = deferred();
    const tracked = lifecycle.track(() => request.promise);

    const draining = lifecycle.drain(1000);
    expect(lifecycle.inFlightCount).toBe(1);

    request.resolve();
    await tracked;
    expect(await draining).toBe('drained');
  });

  it('waits for all of several in-flight requests', async () => {
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    const a = deferred();
    const b = deferred();
    const tracked = Promise.all([lifecycle.track(() => a.promise), lifecycle.track(() => b.promise)]);

    const draining = lifecycle.drain(1000);
    a.resolve();
    // One of two finishing must not be mistaken for the drain being done.
    await new Promise((r) => setTimeout(r, 10));
    expect(lifecycle.inFlightCount).toBe(1);

    b.resolve();
    await tracked;
    expect(await draining).toBe('drained');
  });

  it('gives up after the timeout rather than holding a deploy open forever', async () => {
    // A platform that stopped waiting would SIGKILL anyway; exiting
    // deliberately at least says so.
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    const stuck = deferred();
    void lifecycle.track(() => stuck.promise);

    expect(await lifecycle.drain(20)).toBe('timed-out');
    stuck.resolve();
  });

  it('stops counting a request that threw, rather than draining forever', async () => {
    // A failed request is a finished request. Counting it as in-flight would
    // make every drain after the first error hit the timeout.
    const lifecycle = new Lifecycle();
    lifecycle.markReady();
    await expect(lifecycle.track(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(lifecycle.inFlightCount).toBe(0);
    expect(await lifecycle.drain(20)).toBe('drained');
  });
});

describe('track', () => {
  it('returns whatever the request returned', () => {
    return expect(new Lifecycle().track(async () => 'result')).resolves.toBe('result');
  });

  it('counts concurrent requests, not just one at a time', async () => {
    const lifecycle = new Lifecycle();
    const a = deferred();
    const b = deferred();
    void lifecycle.track(() => a.promise);
    void lifecycle.track(() => b.promise);
    expect(lifecycle.inFlightCount).toBe(2);
    a.resolve();
    b.resolve();
  });
});
