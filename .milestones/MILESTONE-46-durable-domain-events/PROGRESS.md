# M46 Progress

## M46-T01 — Transactional event design

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: ADR-0040, TEST-PLAN-0046 and refined capture/relay task outcomes.
- **Verified**: Source audit found 19 emitting RPC modules plus stalled-claim detection and schedule-run bookkeeping; auth HTTP routes emit no domain events. Existing emitters all use publishDomainEvent. `moon check --all`: 35 completed (33 cached); documentation and milestone truth gates pass.
- **Notes**: Capture webhook targets in the transaction rather than through a stale cache at relay time. Broker references keep large payloads in SQL; audit uses producer identity, not sequence. Standalone without an explicit broker projects locally. Pending source events never age out; delivered source retention is 14 days, exceeding broker retention.
- **Next**: M46-T02 failing atomic capture scenarios and migrations.

## M46-T02 — Capture events and webhook deliveries atomically

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: unit pre-commit phase, durable event schemas/migrations, publisher capture hook and webhook fanout.
- **Verified**: Initial red run: capture API absent. SQLite and real MySQL capture/replay: 11 pass. Shallow-copy fault corrupts the nested snapshot and fails; skipped pre-commit capture makes both storage-failure cases wrongly resolve and fail. Restored `moon check --all`: 35 completed, no backend failures. Corrected the existing webhook overlap fixture to freeze time after queuing pings. Review CODE-REVIEW-v1.md approved.
- **Notes**: Source capture is a library until the relay/projector wiring is ready in T04. Legacy direct publisher behavior remains for tests/scripts without durable capture installed.
- **Next**: M46-T03 fenced event relay.

## M46-T03 — Resume fenced durable event relay

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Port the preserved relay draft into the clean delivery worktree and prove bounded retry, fencing, drain and reference behavior.
- **Verified**: Initial red: relay module absent. Restored relay: nine SQLite tests and one real MySQL test pass; token-removal fault fails both stale-owner cases and early-return fault fails drain. Independent CODE-REVIEW-v2 approved; `moon check --all`: 35 completed (23 cached); backend suite 2124 tests with zero failures.
- **Notes**: ADR-0040 already owns the architecture; no new decision is needed. Runtime capture/projector activation remains T04. Original worktree WIP stays untouched.
- **Next**: M46-T04.

## M46-T04 — Activate durable capture, audit identity and worker lifecycle

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Producer-identity audit migrations/hydration, mutation interception with explicit external-I/O boundaries, background units, reconnecting broker/relay lifecycle and shutdown drain.
- **Verified**: Red→green regression evidence covers projection, external transaction boundaries, stalled rollback, schedule context, late admission and telemetry privacy. Final `moon check --all`: 35 completed (25 cached); backend 2111 pass / 40 explicitly gated skip / 0 fail. Real sockets: 11 pass, including authenticated broker feed logout. Real MySQL: four pass in fresh owned schemas; populated upgrades preserve legacy rows. Retained-sequence-index faults fail SQLite and MySQL. Independent v3 rejection and v4 approval record corrected drain/privacy findings.
- **Notes**: Implements and clarifies ADR-0040 and TEST-PLAN-0046; no new public contract or UX. Load API/security standards for transactional authorization and retained tenant routing. Unknown unary writes default to a unit; repository remote preparation and manual schedule fire own narrower units.
- **Next**: M46-T06 then T05 crash/operating closure.

## M46-T06 — Fence webhook owners and bound outbound attempts

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Add nullable delivery lease tokens in both dialects, fence result/counter writes atomically and enforce a total HTTP deadline including trickling bodies.
- **Verified**: Initial red: all six fencing/rollback/drain cases and trickling deadline failed. Restored implementation passes focused suites, real DNS/trickling HTTP, real MySQL fencing/counter rollback, and all 35 local gates (23 cached): backend 2120 pass / 41 explicitly gated skip / 0 fail. Removing tokens fails SQLite/MySQL; early-return worker and omitted-total-timer faults fail their regressions. Independent CODE-REVIEW-v5 approved.
- **Notes**: Deliver before T05 closure as planned. ADR-0040 already establishes fenced ownership; add the webhook-specific timeout/fanout boundaries. Keep signing, SSRF filtering and retry/disable policy. Admin notifications retain existing best-effort persistence; atomic guarantee covers result and endpoint state. No public contract/UX change.
- **Next**: M46-T05 real process/crash evidence and operating procedures.

## M46-T05 — Process recovery evidence and operating closure

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Add isolated broker/two-process commit/ACK/webhook recovery tests on both dialects; exercise large SQL-backed reference projection and broker outage; document inspection, retention and rollout.
- **Verified**: Current real process proof: two dialects pass, 56 assertions; socket/feed/broker suites: 12 pass. Standalone build/smoke pass. Final `moon check --all`: 35 completed (25 cached), backend 2122 pass / 43 gated skip / 0 fail. Isolated migration/capture/relay/webhook MySQL suite: five pass including SQLite upgrade. Consumer custom DB_PATH first failed and is corrected. Independent v6 review rejected raw relay retry messages retaining SQL payloads; body-exclusion regression and raw-message fault check pass; v7 approved. See reviews/RECOVERY-EVIDENCE.md. Remote run 42575396498 now passes bootstrap and has no failed jobs; actual complete remote CI is still required before closure/merge.
- **Notes**: Remote setup failed repeatedly on upstream installer HTTP 504s. CI now selects repository-pinned Bun and the official native Moon platform package, bringing that narrow part of M49-T05 forward without claiming M49 complete. Bunx launching Moon altered the Node test interpreter and was rejected by local verification; native Moon preserves it. Operating procedures document retry/retention/replay and incompatible old workers. Existing ADR/test plan owns recovery semantics; no new public contract or UX.
- **Next**: Close M46 only after real recovery and actual CI pass; M47 recoverable schedules follows.

## M46-T07 — Repair real provider integration database fixture

- **Status**: in-progress
- **Date**: 2026-11-09
- **Changed**: Replace the handcrafted read-only fake with the existing managed in-memory SQLite fixture and seeded authorization/repository rows. Remove unused sandbox mutation teardown from this read-only test.
- **Verified**: Red: remote GitHub integration job 129021858085 fails sync with `unit of work requires a managed database handle`; provider reads pass. Pending restored real CI and local gates.
- **Notes**: No ADR or UX: no production alternative or public flow changes. Existing transaction architecture requires a real managed handle; bypassing the unit for mocks would weaken the guarantee. Standards: testing/security.
- **Next**: Verify and close M46 after actual remote checks.
