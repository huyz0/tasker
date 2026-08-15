# M03 — IAM Correctness & Scale · Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt. An entry is
opened `in-progress` before the work starts and closed in the commit that
completes the task.

---

## M03-T01 — Enforce viewer as read-only

- **Status**: done
- **Date**: 2026-08-15
- **Approach**: Add `assertOrgWriter` to `lib/authz.ts` and call it explicitly
  from every mutating handler, then prove the result with one contract-driven
  sweep test that denies by default — anything not on an explicit read allowlist
  must reject a viewer.
- **Weight**: heavy. It touches authorization and tenancy, so
  [ADR-0006](../../.specs/adr/ADR-0006-explicit-writer-assertion-over-a-mutation-interceptor.md)
  preceded the code and
  [a four-lens review](reviews/M03-T01-viewer-read-only-v1.md) preceded the box.
- **Changed**: `lib/authz.ts` (+`assertOrgWriter`, `WRITER_ROLES`), 31 methods
  across 9 handler files, and `lib/viewer-denial.test.ts` (new, 62 tests).
- **Verified**: `moon check --all` — 23 tasks, 395 backend tests pass.
  The sweep went **31 fail → 0** across the change, and the 31 failing names
  matched the 31 converted methods exactly.
- **Notes**: the gap was larger than "viewer can write a bit". Of 84 handler
  methods, 60 mutate, and **31 of them accepted a viewer** — including
  `createProject`, `createTask`, `updateTask`, `createComment`, `createLabel`,
  every artifact write, and `syncPullRequests`. `createProject` threw nothing at
  all: a viewer simply got a project. The rest were already admin-gated.

  Three things were proved rather than assumed:

  1. **The gate catches a future endpoint.** A `recolourEverything` method was
     added to the labels handler with no guard; the completeness case failed
     naming `labels.recolourEverything`, and green returned on removal. Adding
     RPC 85 without a guard breaks the build.
  2. **The suite is not vacuous.** Review found that all 59 denial cases would
     pass if `assertOrgWriter` denied *everyone*. A positive control — a
     `member` can still create a label, a comment and a folder — now
     distinguishes "viewer cannot write" from "nobody can write".
  3. **Fixture ids must resolve.** Handlers resolve the org through
     `getTaskOrgId` and friends before checking permission, so a bogus id
     returns NotFound and the test passes while proving nothing. The assertion
     rejects NotFound explicitly and says so in its failure message.
- **Divergence**: 11 of the initial failures were wrong request shapes in the
  test, not missing guards — Zod parses before the authorization check, so those
  calls never reached it. Corrected against the real schemas
  (`binRetentionDays` not `retentionDays`, `taskNoteId` not `noteId`, `apiToken`
  not `accessToken`, `id` not `templateId`/`taskTypeId`, and `syncPullRequests`
  takes a `projectId`). That validation-before-authorization ordering is
  recorded as a low finding in the review rather than changed across 31
  handlers inside this task.
- **Next**: M03-T02
