# M44 authorization acceptance scenarios

## Keyed mutation replay (M44-T02)

- Given a user who created a task with a key, when organization membership is removed and the same call is retried, then PermissionDenied is returned and no response data or extra task is returned.
- Given an admin who claimed a task with a key, when demoted to viewer and the call is retried, then current write policy denies it.
- Given an agent that claimed next with a key, when a replacement token lacks tasks:write and retries that call, then PermissionDenied is returned.
- Given an unchanged authorized caller, when the same request and key is retried, then the original response is returned without another mutation.
- Given a workflow caller with changed permissions, when a keyed workflow call is retried, then the existing pre-replay authorization remains effective.

Run: `cd apps/backend && bun test src/modules/tasks/replayAuthorization.test.ts src/lib/idempotency.test.ts src/modules/workflows/workflows.test.ts`.

## Subscription lifecycle (M44-T03)

- Given an open agent stream, when reauthentication reports token revocation, then the stream closes before a subsequent domain event is delivered after the 30-second deadline.
- Given an open human stream, when reauthentication reports session expiry or logout, then the stream closes within the same bound even if idle.
- Given continuous event traffic, when reauthentication loses events:read, then the next event after the elapsed deadline is refused.
- Given unchanged valid credentials, when periodic reauthentication succeeds, then events continue and current organization membership is used.
- Given a missed membership event, when the periodic refresh discovers removal, then the removed organization's events no longer reach the subscriber.
- Given request cancellation, when the subscriber is waiting for validation or an event, then its listener/timer is released.

Run: `cd apps/backend && bun test src/modules/events/events.handler.test.ts src/lib/authenticate.test.ts`. Tests shorten the interval through an explicit test seam; production keeps the documented default.

## Release verification (M44-T04)

- Given the complete backend suite, when it runs with coverage and typechecking, then all existing and new cases pass.
- Given a real RPC client connected with a credential, when that credential is revoked while its feed is held open, then the next validation closes that feed.
- Given the milestone records, when `bun run scripts/doc-drift.ts` runs, then frontmatter, checkboxes and ledger agree.
