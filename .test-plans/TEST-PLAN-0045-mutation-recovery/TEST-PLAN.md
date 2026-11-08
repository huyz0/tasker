# M45 mutation recovery scenarios

## Database access (T02)

- Given an async transaction that inserted a task then pauses, when another
  request reads through the same SQLite handle, then the read waits; after a
  rollback it sees no provisional task.
- Given a transaction that fails after several writes, when the caller retries,
  then counters, task rows and assignments are all rolled back.
- Given nested operations, when an outer operation fails, then every nested
  write rolls back and no queued event is published.
- Given synchronous nested SQLite transaction code, when run inside an async
  unit, then it stays atomic and its result stays synchronous.
- Given a synchronous read during another caller's active unit, then it fails
  closed rather than reading provisional rows.

Run: `cd apps/backend && bun test src/db/access.test.ts`.

## Idempotency (T03)

- Given overlapping requests with the same principal/method/key/payload, when
  they finish, then at most one mutation commits and a retry returns its result.
- Given a reused key with another payload, then InvalidArgument is returned.
- Given a response write failure after the domain insert, then neither the
  domain insert nor the key is committed.
- Given a completed pre-hash record, then current authorization still gates its
  compatible replay.
- Given no retry key, then the same multi-statement operation is still atomic.

Run: `cd apps/backend && bun test src/lib/idempotency.test.ts src/modules/tasks/tasks.test.ts src/modules/tasks/workQueue.test.ts`.

## Workflow and interruption (T04–T05)

- Given a workflow failing at any step, then no partial graph or task event is
  visible to another caller.
- Given two processes using the same key against one file/database, then only
  one outcome commits; transient reservation/deadlock refusals are retryable.
- Given a process killed after a domain write but before response persistence,
  when another process retries the key, then only one complete outcome exists.

Run the cross-process recovery harness against SQLite and real MySQL, then
`moon check --all` and the real wire/broker tests. Retain exact counts and
commands in PROGRESS.md; do not infer crash safety from Promise.all alone.
