# M49 progress

## M49-T06 — Restore the security-patched Go runtime

- **Status**: done
- **Date**: 2026-11-21
- **Changed**: Synchronize the CLI module minimum and proto runtime pin with the fixed Go1.26 security patch; update current toolchain documentation.
- **Verified**: Main9be092b post-publication CI44885312900 fails its actual Go audit on GO-2026-6859 (job136789215298, exit3), found in1.26.10 and fixed in1.26.11. All other nine post-main jobs pass. The official golang/vulndb advisory confirms that fix; it appeared after the earlier PR verification. No advisory suppression is proposed.
- **Notes**: Dependency/security standards and TDD apply. Pure version configuration and static documentation have no product behavior to drive with new tests; the unchanged real vulnerability audit provides the observed failure. Workspace startup is still pending, so prepare this isolated draft through the connected Git provider, preserving all local M58-T04 edits. This journal is written before the source pin change. Do not call the task complete until the audit, CLI checks, repository checks and final publication gates actually pass.
- **Next**: Update both pins and current docs, run hosted candidate CI while startup continues, then reconcile the local isolated checkout, run required checks and complete/publish the task. Resume M58-T04 afterwards; original M49-T01–T05 remain pending.

### Candidate verification while Cloud startup remains pending

- The connected provider preserves the in-progress checkpoint and draft PR #15,
  initially at94dea617. The Go module minimum and proto pin both use1.26.11;
  the current toolchain rows and security-patch paragraph agree. No production
  module dependency, advisory exception or product behavior is added.
- Extend the existing CLI job to execute the exact `moon check --all` gate for
  runtime or CI configuration changes. The base SHA is read from an environment
  value, validated and checked before diffing; an unavailable/invalid base runs
  the full gate rather than skipping it. Unchanged application-only PRs retain
  their existing independent checks. This makes the actual required repository
  command verifiable on the hosted runner while the local Cloud executor is
  unavailable; it is not an inferred local pass. Keep the task unchecked until
  the actual new candidate checks and source review complete.

### T06 verified checkpoint

- Candidate debb00ba passes the unchanged Go vulnerability audit and all seven
  CLI checks. The new conditional hosted gate executes `moon check --all`
  and passes all 36 checks (7 cached) in 4m42.071s: 1,764 GUI cases, 2,421
  backend cases with zero failures, 1,158 contract cases and production/
  standalone builds. Job 136796806687 retains the actual command/results.
  This is a hosted execution; the Cloud workspace is still starting and no
  local execution is claimed.
- Independent CODE-REVIEW-v1 approves the reviewed source. Persist its limits
  alongside this closure. The patch adds no production module, exception or
  data migration; the existing audit now passes on the fixed standard library.
- Check T06 only. M49 is 1/6 and its original production recovery/load tasks
  remain pending. The program is 399 tasks, 389 done, one dropped, nine pending.
  Final-head hosted CI and publication still gate the merge of PR #15.
  Resume preserved M58-T04 after publication; its dependent provider branch
  retains its own in-progress journal.

## M49-T01 — Required production-dependency checks

- **Status**: done
- **Date**: 2026-11-21
- **Changed**: Add an explicit isolated MySQL gate and extend the existing real JetStream job to committed recovery cases.
- **Verified**: M46/M47/M48 dependencies are published. M49-T06 publishes the patched runtime as main ed1b323 after all eight final-head checks, with identical tested/published tree. Permanent M58-T04 browser coverage proceeds separately in PR #16; preserve its remote and local drafts. Cloud startup remains pending, so use actual hosted dependency services and the exact repository gate.
- **Notes**: Testing/security plus TDD apply. Existing unit prerequisites remain explicit; the new required command must create only unique owned schemas, fail on unavailable services or skipped native files, and clean those schemas. Real tests precede any completion claim, and a restored MySQL claim-assertion fault must fail the required command. CI configuration/static comments need no artificial runtime unit test; the new orchestration is verified against real services.
- **Next**: Wire owned MySQL readiness/isolation and broker recovery, prove ordinary/fault paths on actual services, review source and run final hosted gates before completion/publication. M49-T02 still owns complete two-instance recovery, and T03/T04 still own measured load; no capacity claim is added here.

### First required service results

- The actual8.4 job136803571754 passes every native file and the restored
  claim-assertion proof. The8.0 job136803571688 reaches real MySQL but its fresh
  migration test hits Bun's implicit five-second default. Give this cold
  complete-schema bootstrap the existing wire-readiness30-second bound and
  close its pool in finally; keep all table assertions and native operational
  query latency budgets unchanged.
- Real NATS/recovery job136803474859 exposes an expired-key fixture assumption:
  the deterministic schedule clock is in early November, while generic keys
  use the actual current creation time. Its November13 purge cannot expire
  November21 keys, so the unchanged positive purge assertion correctly fails.
  Select actual stored creation timestamps, prove keys exist and the clock is
  finite, then advance beyond the declared TTL. Preserve the positive purge
  and exact same-task replay assertions; do not change production expiry.
- Both observed failures are recorded before correction. Re-run real services,
  restored faults and full hosted checks before completion; no inferred pass
  or capacity claim is made.

### T01 verified checkpoint and source reconciliation

- Corrected candidate f5023657 passes all10 CI44890697502 jobs and both
  Integration44890697419 jobs. MySQL8.0.46 and8.4.13 each run all12 native
  files/19 cases with zero skips, then prove the required command rejects
  the altered claim assertion and restores source byte-for-byte.
- Real NATS runs its live mutation/feed/audit case plus five committed recovery
  cases, zero failures. Four explicit MySQL process-recovery counterparts are
  still gated until T02; they are not claimed passed. The actual expired-key
  correction preserves positive GC and same-task replay after real key expiry.
- The exact hosted repository gate passes all36 checks (7 cached) in6m38.838s:
  GUI1764/backend2421/contract1158 and production/standalone builds. CODE-v2
  approves the current source and proof design. No local execution is claimed
  while Cloud startup remains pending.
- PR #16 publishes M58 as main2ebfc34 after all eight final-head checks; its
  tested/published tree is identical. Build this final candidate on that
  published tree plus only owned T01 changes, retaining the saved-view browser
  gates and all completed ledger entries. No branch is force-pushed.
- Check T01 and the real-dependency criterion. M49 is2/6; program399 total,
  391 done, one dropped, seven pending. Final combined-head CI/integration
  still gate PR #17 publication. T02 next proves MySQL two-instance recovery;
  load/capacity and operations documentation remain outstanding.

## M49-T02 — Two-instance recovery and authenticated boundaries

- **Status**: in-progress
- **Date**: 2026-11-21
- **Changed**: Exercise the existing recovery cases on both SQL dialects and add two independent API processes sharing a real MySQL schema and an owned JetStream broker.
- **Verified**: T01 source candidate passes both native versions, real SQLite/NATS recovery and the exact full repository command. Ready PR #17 final combined-head checks remain running. This dependent branch starts from0586a920 and preserves all published M58 behavior and records.
- **Notes**: Testing/security plus TDD apply. Own every temporary schema, broker, process and port; keep real human/agent credentials in memory. New persistent behavior is not introduced, so no product ADR or UI redesign is needed. The test plan precedes code. Real SQL/RPC/broker acknowledgements are independent oracles; intentional lost/duplicate audit faults must fail their own assertions and restore source before ordinary checks.
- **Next**: Add the real two-process scenario, enable existing MySQL recovery counterparts in required CI, prove lost/duplicate detection on owned fixtures, review and run full/final hosted gates. Load and capacity remain T03/T04 and are not inferred from these cases.

### Real candidate implementation

- Add the two HTTP API processes, real sessions/scoped workers, audit consumer
  and exclusively owned broker/schema/ports. SQL producer acknowledgement,
  explicit broker replay and consumer acknowledgement precede the logical
  audit count/identity oracle. Reconnect revocation keeps a valid user session
  while denying source reads and domain delivery through a real heartbeat.
- Enable all existing MySQL recovery counterparts in an uncached required
  command that rejects skips. Two temporary projector faults model acknowledged
  lost output and unstable identities that create duplicate rows; only their
  specific outcome failures count as proof, and source restores in finally.
- Parent PR #17 is published as main d7e2e45 after all12 final checks, with
  identical tested/published tree713f673. Include that main as a normal merge
  parent; no force push. Actual candidate checks still gate all completion.

### Rejected source checkpoint and observed regression

- Preserve rejected CODE-v4. Its P1 identifies the enabled atomic MySQL fixture's
  inherited default database, and actual job136812898549 reproduces
  ER_BAD_DB_ERROR / Unknown database tasker. The required recovery wrapper now
  creates and passes only a UUID outer schema, then drops only that schema;
  nested fixtures keep their separate owned schemas.
- Backend job136812898590 also catches a nullable denial assertion type. Add
  an explicit unexpected-success failure before checking the non-null error
  code; no denial outcome is broadened.
- P2 requires independently settled teardown and creation-attempt tracking.
  Write observable filesystem/environment cleanup regressions and an empty
  typed scaffold first; the dedicated hosted step must demonstrate the red
  before implementation. The task remains in progress and no cleanup safety
  or successful recovery pass is claimed yet.

### Cleanup red and correction

- Dedicated job136815090896 runs the new cleanup regressions against the empty
  typed scaffold and fails both real filesystem assertions: Expected false,
  Received true. Test finalizers remove those temporary directories and restore
  their own marker even on red. This establishes the red before implementation.
- Implement settled teardown that attempts every step, restores ambient test
  state in finally and returns aggregated failures. Use it for streams, each
  owned process, both SQL handles, schema, broker and directory. Track the
  broker attempt before Docker and discover only objects carrying this
  fixture's generated ownership label, including partially created containers.
- Fault proofs also reject cleanup aggregates, so an intended outcome failure
  cannot hide failed fixture teardown. The required outer recovery schema is
  already generated and passed explicitly; nested fixtures preserve their
  separate ownership. Re-run actual normal/fault/source gates before approval.

### Observed cold-bootstrap and observer corrections

- Candidate96f7a2a passes MySQL8.0 job136816096622: all12 native
  files/19 cases, all10 recovery cases with zero failures/skips, plus both
  acknowledged audit faults. Dedicated cleanup regressions also pass.
- Overall verification remains red: job136816096628 reproduces the search
  fixture's implicit5000ms cold-bootstrap timeout, followed by overlapping
  migration errors. Set only the required native integration runner's default
  case bound to30000ms; explicit operational latency assertions are unchanged.
  Earlier job136815090966 reproduced the same issue in task bootstrap.
- Job136815090992 reproduces SQLite database-is-locked in the durable-event
  observer. Retry only SQLite BUSY/LOCKED reads with a shared five-second audit
  observation deadline and a50ms observer busy timeout. Missing output and
  non-lock SQL errors still fail. Production settings and event assertions
  are unchanged.
- Job136816096604 passes cleanup behavior but strict types reject the nullable
  environment matcher. Compare the complete marker object, preserving both
  missing and string values without a cast or broadened expectation.
- Prior CODE-v5 source approval is retained separately from these observed
  results. Re-run the corrected source and record a new four-lens review;
  T02 remains in progress until the actual final gates pass.

## M49-T03 — Bounded HTTP concurrency evidence

- **Status**: in-progress
- **Date**: 2026-11-21
- **Changed**: Prepare a standalone bounded workload against disposable MySQL and
  an owned broker, with actual independent API processes and distinct scoped
  agent principals. The recovery candidate remains separately gated in PR #18.
- **Verified**: No load implementation or capacity result is claimed. The test
  plan precedes code; core configuration, observed latency and source-outcome
  reconciliation tests will first run against a typed empty scaffold.
- **Notes**: Testing/security plus TDD apply. Existing HTTP adapters, SQL, NATS,
  token generation and owned cleanup suffice; no new dependency or runtime
  protocol is introduced, so a product ADR and UX artifact are unnecessary.
  Concurrency/duration/fixture/instance/seed/operation bounds are explicit.
  Credentials stay in memory; only internally generated resources are removed.
- **Next**: Establish the actual failing core tests, implement the minimal
  harness and exercise a small correctness smoke. Separate T04 stages and
  published capacity claims require their own measured artifacts.

### Independent core-test feedback

- The core scaffold/tests import only Bun built-ins and the local helper.
  Their dedicated job therefore needs no package install, generated contract
  or service. Run it independently of the shared-contract queue, retaining
  all ordinary backend, native SQL, browser and full repository gates.
- This is still the failing-test checkpoint. No measurement implementation or
  passing red/green evidence is inferred from the job configuration.
