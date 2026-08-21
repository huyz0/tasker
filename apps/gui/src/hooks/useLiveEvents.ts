import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { EventService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../lib/connectTransport';
import { queryKeysForSubject, isControlFrame } from '../lib/eventQueryKeys';

/**
 * The live event feed, as the GUI consumes it (M08-T08, M08-T09).
 *
 * Replaces refetch-on-a-timer with refetch-on-what-actually-changed: the
 * backend streams the domain events this session may see, and each one
 * invalidates only the queries it makes stale (../lib/eventQueryKeys.ts).
 *
 * The connection is expected to break — deploys, sleeping laptops, proxies
 * with idle timeouts — so this reconnects with exponential backoff and, once
 * it has failed enough times to look like a real outage rather than a blip,
 * falls back to slow polling so the screen keeps updating without the stream.
 */

export type LiveStatus =
  /** No stream yet, and none has failed. The state a fresh mount is in. */
  | 'connecting'
  /** The server has acknowledged the stream. Events are flowing. */
  | 'live'
  /** The stream dropped and a retry is scheduled. */
  | 'reconnecting'
  /** Repeated failures. Polling is carrying the screen instead. */
  | 'offline';

/**
 * Backoff between reconnect attempts, in milliseconds.
 *
 * Starts at a second because the common case is a deploy — the server is back
 * in seconds and waiting longer just makes the app feel broken. Caps at 30s so
 * a browser tab left open against a downed backend does not hammer it.
 */
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * Failures before the feed is declared an outage and polling takes over.
 *
 * Three, not one: a single drop is usually a deploy and the retry succeeds
 * immediately. Polling from the first failure would mean every deploy briefly
 * turns the whole app into the timer-based refreshing this feed exists to
 * remove.
 */
const FAILURES_BEFORE_POLLING = 3;

/** How often to refetch while offline. Slow — this is a fallback, not a feed. */
const POLL_INTERVAL_MS = 30_000;

export interface UseLiveEventsOptions {
  orgId?: string;
  projectId?: string;
  /** Off by default in tests and stories, which have no backend to stream from. */
  enabled?: boolean;
  /** Test seams. Production never passes these. */
  backoffMs?: number[];
  pollIntervalMs?: number;
  client?: { subscribeEvents: (req: any, opts?: any) => AsyncIterable<any> };
}

function invalidate(queryClient: QueryClient, subject: string): void {
  const keys = queryKeysForSubject(subject);
  if (keys === null) {
    queryClient.invalidateQueries();
    return;
  }
  for (const queryKey of keys) queryClient.invalidateQueries({ queryKey });
}

export function useLiveEvents(options: UseLiveEventsOptions = {}): { status: LiveStatus } {
  const {
    orgId,
    projectId,
    enabled = true,
    backoffMs = BACKOFF_MS,
    pollIntervalMs = POLL_INTERVAL_MS,
    client,
  } = options;

  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>(enabled ? 'connecting' : 'offline');

  // Held in a ref so changing scope does not tear down and rebuild the client.
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }

    const controller = new AbortController();
    let stopped = false;
    let failures = 0;

    const eventClient = clientRef.current ?? createClient(EventService, transport);

    /** Resolves after `ms`, or immediately when the effect is torn down. */
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });

    (async () => {
      while (!stopped) {
        try {
          const stream = eventClient.subscribeEvents(
            { orgId: orgId || undefined, projectId: projectId || undefined },
            { signal: controller.signal },
          );

          for await (const event of stream) {
            if (stopped) return;
            // Any frame at all — including the server's `stream.ready` — proves
            // the stream is real. A stream that has merely been *opened* proves
            // nothing: a wedged server looks identical from here.
            failures = 0;
            setStatus('live');
            if (!isControlFrame(event.subject)) invalidate(queryClient, event.subject);
          }
        } catch {
          // Every failure is the same failure from here: the stream is gone and
          // the answer is to try again. Distinguishing them would only change
          // the log line.
        }

        if (stopped) return;
        failures += 1;
        setStatus(failures >= FAILURES_BEFORE_POLLING ? 'offline' : 'reconnecting');
        await wait(backoffMs[Math.min(failures - 1, backoffMs.length - 1)]);
      }
    })();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [enabled, orgId, projectId, queryClient, backoffMs, pollIntervalMs]);

  // The fallback. Only runs while offline, and stops the moment the stream is
  // back — two refresh mechanisms running at once is the thing to avoid.
  useEffect(() => {
    if (status !== 'offline' || !enabled) return;
    const timer = setInterval(() => queryClient.invalidateQueries(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [status, enabled, queryClient, pollIntervalMs]);

  return { status };
}
