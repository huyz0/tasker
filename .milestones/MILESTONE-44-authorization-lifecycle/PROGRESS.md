# M44 Progress

## M44-T01 — Record authorization and recovery design

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: M44–M50 plans, ADR-0037, TEST-PLAN-0044, STATE.md.
- **Verified**: `bun run scripts/doc-drift.ts` passes for 44 milestone files and their ledger.
- **Notes**: Seven milestones, 30 tasks. Design first; no behavior changed. Installed pinned Bun 1.3.11 locally; baseline backend suite: 2042 pass, 28 skip, 0 fail. `moon check --all` attempted; blocked on the environment's non-Go `/usr/bin/go` executable. Documentation task is verified; runtime work is not marked done.
- **Next**: M44-T02 authorization regression tests.

## M44-T02 — Authorize keyed task mutations before replay

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: task handler and replay authorization regression tests.
- **Verified**: Red: all 3 authorization regressions resolved when they should reject. Green: 21 task/queue/idempotency tests pass. `moon check --all`: 35 completed; backend 2051 pass / 28 skip; GUI 1324 pass; CLI, builds, typechecks, lint and doc gates pass. gh/act optional execution skipped because tools are absent.
- **Notes**: Keep existing current resource-policy checks; move them before cache access without changing key identity or terminal-task retry behavior.
- **Next**: M44-T03 stream lifecycle.

## M44-T03 — Bound event subscription authorization lifetime

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: event handler and lifecycle regression tests.
- **Verified**: Red: idle/busy streams continued instead of rejecting. Green: 34 feed tests pass, including real stored token revocation/expiry and session logout; handler coverage 100%. Full `moon check --all`: 35 completed, backend 2053 pass / 28 skip; existing real JetStream realtime integration: 1 pass.
- **Notes**: Connect HandlerContext already supplies requestHeader, so the handler can re-resolve original credentials directly without adding an interceptor context key. Tests inject a resolver and clock; production uses resolvePrincipal and Date.now. Corrected M49 to extend the existing NATS CI workflow instead of duplicating it.
- **Next**: M44-T04 complete verification and security review.

## M44-T04 — Verify authorization lifecycle and security review

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: wire subscription logout scenario, agent integration guide, four-lens review.
- **Verified**: `moon check --all`: 35 completed, backend 2053 pass / 29 skip, GUI 1324 pass. Real NATS mutation/feed/audit: 1 pass. Real socket suite: 10 pass, open feed closes after logout at ~30 seconds. Deliberately setting the production validation interval to an hour makes the socket test fail with Canceled instead of Unauthenticated; restoring 30 seconds yields 10 pass again. Typecheck and doc-drift pass.
- **Notes**: No authorization or credential payload added to the wire contract. Optional gh/act execution was skipped by the existing root task because those tools are absent; all 35 direct local tasks pass.
- **Next**: M45-T01 atomic mutation design. Review: reviews/CODE-REVIEW-v1.md approved across correctness, coverage, architecture and security.
