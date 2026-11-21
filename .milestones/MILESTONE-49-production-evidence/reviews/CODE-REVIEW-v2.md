---
date: 2026-11-21
decision: approved
reviewed_head: f502365735fe3ab3f812b7bb6704884242ed734a
---

# M49-T01 independent source review

Approved. No blocking findings.

- **Correctness/security:** The MySQL runner validates requested native test paths, requires a real connection, generates each outer schema name internally, overrides inherited DB_NAME, and drops only schemas it successfully created. Failed processes, zero passing cases and skipped native cases fail the command. Cleanup runs after child failures; readiness diagnostics avoid arbitrary driver messages.
- **Proof quality:** The claim proof requires one exact source assertion, restores it in finally, verifies restoration, and requires Expected 2 / Received 1 with one failed case through the required runner. Missing prerequisites alone cannot satisfy the proof.
- **CI/architecture:** Explicit MySQL and recovery tasks disable Moon caching. Both matrix versions run independently. Main-targeting PRs exercise the existing real JetStream workflow. GitHub-provider secret conditions remain unchanged.
- **Fixture corrections:** The 30-second bound applies to cold schema bootstrap, preserving table assertions and operational latency budgets. Schedule recovery derives expiry from actual persisted key timestamps plus the declared TTL; positive purge and exact same-task replay assertions remain intact.
- **Delivery truth:** At review time T01 remained in progress. Deferred MySQL cross-process recovery, load experiments and capacity claims were not represented as delivered.

The reviewer independently inspected exact-head results: MySQL 8.0 and 8.4 native jobs, including restored claim proofs, passed. Real Integration run 44890697419 passed. Its explicit MySQL recovery-counterpart skips remain outside T01 and must not be counted as MySQL process-recovery evidence.

Other full/browser checks remained underway at review time. This approves source, not task closure or merge readiness; require successful final-head gates before publication.

GitHub-only read review. No edits, tests, services or remote reviews were mutated.
