import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpcStream } from '../test/mockRpc';
import { useLiveEvents } from './useLiveEvents';

// M12-T01. No mock of `@connectrpc/connect`/`health_pb` here — the hook's own
// `client` option is the seam most of these tests use (it exists in the
// hook's real API, for exactly this: exercising reconnect/backoff/
// invalidation logic without a socket, the same way a component under test
// takes real props). Constructing the hook's *default* client against the
// real transport is now safe too, because MSW intercepts the fetch it makes —
// see the last test below, which deliberately omits `client` to prove the
// real Connect streaming envelope parses correctly end to end.

// Module-scope so the hook's effect deps stay stable across renders. An inline
// array would be a new identity every render and re-open the stream each time.
const FAST_BACKOFF = [1, 1, 1, 1];

/** A stream the test feeds by hand, and can end or fail on demand. */
function fakeStream() {
  const queue: any[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  let failure: Error | null = null;

  return {
    push(subject: string) {
      queue.push({ subject, orgId: 'org-1', occurredAt: '2026-08-20T10:00:00.000Z' });
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
    fail(err: Error) {
      failure = err;
      wake?.();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (queue.length) yield queue.shift();
        if (failure) throw failure;
        if (ended) return;
        await new Promise<void>((resolve) => {
          wake = () => {
            wake = null;
            resolve();
          };
        });
      }
    },
  };
}

function setup(streams: any[], extra: Record<string, any> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => Promise.resolve());
  let opened = 0;
  const client = {
    subscribeEvents: vi.fn((_req: any, _opts: any) => {
      const stream = streams[Math.min(opened, streams.length - 1)];
      opened += 1;
      return stream;
    }),
  };

  const view = renderHook(() => useLiveEvents({ client, backoffMs: FAST_BACKOFF, ...extra }), {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });

  return { ...view, invalidate, client, openCount: () => opened };
}

describe('useLiveEvents', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it('starts out connecting rather than claiming to be live', async () => {
    const { result } = setup([fakeStream()]);
    expect(result.current.status).toBe('connecting');
  });

  it("goes live on the server's ready frame, not merely on opening a stream", async () => {
    // An opened stream proves nothing — a wedged server looks identical from
    // here. The ready frame is what makes the indicator honest.
    const stream = fakeStream();
    const { result } = setup([stream]);

    act(() => stream.push('stream.ready'));
    await waitFor(() => expect(result.current.status).toBe('live'));
  });

  it('invalidates only the queries an event touches', async () => {
    const stream = fakeStream();
    const { invalidate } = setup([stream]);

    act(() => stream.push('domain.task.created'));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    // Never the everything-form for an ordinary event.
    expect(invalidate).not.toHaveBeenCalledWith();
  });

  it('drops the whole cache only for an event whose blast radius really is everything', async () => {
    const stream = fakeStream();
    const { invalidate } = setup([stream]);

    act(() => stream.push('domain.retention.swept'));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
  });

  it('invalidates nothing on a heartbeat', async () => {
    const stream = fakeStream();
    const { invalidate, result } = setup([stream]);

    act(() => stream.push('stream.heartbeat'));
    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('reconnects after the stream drops', async () => {
    const first = fakeStream();
    const second = fakeStream();
    const { result, openCount } = setup([first, second]);

    act(() => first.push('stream.ready'));
    await waitFor(() => expect(result.current.status).toBe('live'));

    act(() => first.fail(new Error('connection reset')));
    await waitFor(() => expect(openCount()).toBe(2));

    act(() => second.push('stream.ready'));
    await waitFor(() => expect(result.current.status).toBe('live'));
  });

  it('does not declare an outage on the first drop, because that is usually a deploy', async () => {
    // Falling back to polling immediately would make every deploy turn the app
    // back into the timer-based refreshing this feed exists to remove.
    const first = fakeStream();
    const second = fakeStream();
    const { result } = setup([first, second]);

    act(() => first.fail(new Error('server restarting')));
    await waitFor(() => expect(result.current.status).toBe('reconnecting'));
  });

  it('gives up on the stream after repeated failures and says so', async () => {
    const { result } = setup([{ async *[Symbol.asyncIterator]() { throw new Error('down'); } }]);
    await waitFor(() => expect(result.current.status).toBe('offline'), { timeout: 2000 });
  });

  it('polls while offline so the screen keeps updating without a stream', async () => {
    const { result, invalidate } = setup(
      [{ async *[Symbol.asyncIterator]() { throw new Error('down'); } }],
      { pollIntervalMs: 20 },
    );
    await waitFor(() => expect(result.current.status).toBe('offline'), { timeout: 2000 });

    invalidate.mockClear();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(), { timeout: 2000 });
  });

  it('stops polling once the stream comes back, rather than running both', async () => {
    const failing = { async *[Symbol.asyncIterator]() { throw new Error('down'); } };
    const good = fakeStream();
    const { result, invalidate } = setup([failing, failing, failing, good], { pollIntervalMs: 20 });

    await waitFor(() => expect(result.current.status).toBe('offline'), { timeout: 2000 });
    act(() => good.push('stream.ready'));
    await waitFor(() => expect(result.current.status).toBe('live'), { timeout: 2000 });

    invalidate.mockClear();
    await new Promise((r) => setTimeout(r, 60));
    expect(invalidate).not.toHaveBeenCalledWith();
  });

  it('passes the active scope to the server so the feed is narrowed there', async () => {
    // Filtering client-side would mean every tab receives every event its user
    // may see, which is the traffic this narrowing exists to avoid.
    const { client } = setup([fakeStream()], { orgId: 'org-1', projectId: 'proj-1' });
    await waitFor(() =>
      expect(client.subscribeEvents).toHaveBeenCalledWith(
        { orgId: 'org-1', projectId: 'proj-1' },
        expect.objectContaining({ signal: expect.anything() }),
      ),
    );
  });

  it('omits an empty scope rather than sending a blank string', async () => {
    const { client } = setup([fakeStream()], { orgId: '', projectId: '' });
    await waitFor(() =>
      expect(client.subscribeEvents).toHaveBeenCalledWith(
        { orgId: undefined, projectId: undefined },
        expect.anything(),
      ),
    );
  });

  it('opens nothing at all when disabled', async () => {
    const { result, client } = setup([fakeStream()], { enabled: false });
    expect(result.current.status).toBe('offline');
    expect(client.subscribeEvents).not.toHaveBeenCalled();
  });

  it('closes the stream when the component unmounts', async () => {
    const stream = fakeStream();
    const { unmount, client } = setup([stream]);
    await waitFor(() => expect(client.subscribeEvents).toHaveBeenCalled());

    const signal = client.subscribeEvents.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('reopens the stream when the active scope changes', async () => {
    const queryClient = new QueryClient();
    const client = { subscribeEvents: vi.fn((_req: any, _opts: any) => fakeStream()) };
    const { rerender } = renderHook(
      ({ orgId }: { orgId: string }) => useLiveEvents({ client, backoffMs: FAST_BACKOFF, orgId }),
      {
        initialProps: { orgId: 'org-1' },
        wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
      },
    );

    await waitFor(() => expect(client.subscribeEvents).toHaveBeenCalledTimes(1));
    rerender({ orgId: 'org-2' });
    await waitFor(() => expect(client.subscribeEvents).toHaveBeenCalledTimes(2));
    expect(client.subscribeEvents.mock.calls[1][0]).toEqual({ orgId: 'org-2', projectId: undefined });
  });

  it('parses the real Connect streaming envelope, with no client override at all', async () => {
    // Every other test in this file drives the hook through its own DI seam.
    // This one does not — it lets the hook build its default client against
    // the real transport, and MSW answers with the real length-delimited
    // frame format Connect actually sends. `fakeStream()` above hands the
    // hook JS objects directly; this proves the hook's *parsing* of real
    // bytes off the wire is correct, which nothing else in this file can.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => Promise.resolve());
    mockRpcStream(EventService, 'SubscribeEvents', [
      { subject: 'stream.ready', orgId: '', occurredAt: '2026-08-20T10:00:00.000Z' },
      { subject: 'domain.task.created', orgId: 'org-1', occurredAt: '2026-08-20T10:00:00.000Z' },
    ]);

    const { result } = renderHook(() => useLiveEvents({ backoffMs: FAST_BACKOFF }), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    });

    await waitFor(() => expect(result.current.status).toBe('live'));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] }));
  });
});
