# M48 client recovery scenarios

## Reconnect (T01)

- Given initial ready/heartbeat frames, then the hook becomes live without a
  redundant global refetch. Given a disconnect followed by an unseen mutation,
  then the first accepted frame on reconnect refetches active queries once,
  including active scoped data; inactive data becomes stale without a network
  request until it is needed. Later heartbeats do not refetch again.
- Given a pre-outage initial read that has not returned, then reconciliation
  cancels its query retryer and starts a fresh source read. Its eventual old
  response cannot replace the fresh result. Cancellation does not wait for the
  underlying network request to finish.
- Given deterministic random samples at either bound, then reconnect waits
  between half and all of its backoff tier, capped at the existing 30 seconds.
  Given repeated failures, then the tier increases and polling starts after the
  existing threshold. Given a successful frame, then failure count resets.
- Given unmount or scope change while waiting/streaming, then old work cannot
  reconnect or invalidate the new scope. Existing offline polling stops after
  recovery and disabled mode never opens a stream.

Run `bun run --cwd apps/gui test -- src/hooks/useLiveEvents.test.tsx` and the
full GUI coverage/type/lint gates.

## Overflow (T02)

- Given a tiny authorized feed queue that drops one entity's event while another
  survives, then a tenant-safe control frame tells the GUI to reconcile all
  active source queries. It must not reveal another tenant's event or body.
- Given repeated overflow before consumption, then bounded state coalesces the
  resync indication rather than growing another queue. Current credentials and
  membership still govern every domain event yielded.
- Given a dropped membership-removal event followed by queued task data, then
  membership refresh at resync prevents that data from being delivered. Given
  only another org/project's domain traffic, then it does not fill this queue
  or cause a false gap. Expired credentials fail before a queued resync frame.
- Given a burst of foreign membership events, then separate internal scope
  refresh coalesces without displacing an authorized event or emitting resync.
  Given the caller actually joins an organization, then resync and later data
  reflect that new authorized set.
- Given periodic revalidation discovers an organization-set change without its
  membership event, then it also requests resync rather than silently losing
  the refresh indication before comparing scope again.
- Given an initial source read still pending at resync, then the same explicit
  cancellation/reconciliation used after reconnect replaces its stale snapshot.

## CLI (T03)

- Given a server accepting a unary call without answering, then a documented
  configurable command deadline terminates the call. Given command cancellation,
  then the request is cancelled promptly and output/error exit conventions hold.
- Given MCP stdio or an event subscription, then the process remains long-lived;
  individual unary requests have bounded lifetimes and cancellation propagates.
  Generated CLI reference matches flags/defaults.

## Journeys (T04)

- Given a browser with active scoped task data, drop the feed, change the task
  while disconnected, reconnect without another domain event and observe the
  updated task. Exercise scope change and offline fallback without stale writes.
- Run actual CLI binaries against stalled/cancellable servers; run full GUI/CLI
  suites, backend feed tests, reference generation and all local gates. Record a
  four-lens review and limits; do not infer a browser journey from hook tests.
