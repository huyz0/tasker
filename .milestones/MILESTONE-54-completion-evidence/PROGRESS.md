# M54 delivery journal

## M54-T01 — Define bounded evidence and provenance before contracts

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Design additive evidence limits, stored-representation prefixes, metadata-only opt-in digest authorization and human provenance states before implementation.
- **Verified**: M46/M53 dependencies are locally complete; M53 candidate c82fada has35 source checks/42 browser journeys and final story matrices, while PR #6 remote CI still gates its publication.
- **Notes**: API/security standards selected with TDD protocol. This task is static ADR/UX/acceptance design; no runtime behavior is added, so runtime TDD applies from T02. Heavy review uses existing reviewers. No contract field is changed or reserved until actual fresh-number verification. Original worktree/services remain preserved; new branch must reconcile onto published M53 before publication.
- **Next**: Inspect current boundedness/permissions/provenance, record alternatives and executable scenarios, independent review and full checks.

Independent initial reviews reject ambiguous folder permission wording and the
missing metadata path beyond the digest cap. ARCH-v1 and UX-v1 retain findings.
Amendments preserve agent-capable CreateFolder RPC, add paged evidence metadata,
pin precise/coarse size units and archived policy, use one mutable-reference
Evidence surface, sanitize unavailable nested names and require15s visible
current-page-chain refresh because existing events do not cover every link or
cross-project change. ARCH-v2/UX-v2 approve; TC001–009 bind implementation proof.

M53 PR #6 merges as53b47d6 after eight CI jobs on exact headc82fada and both
real-integration jobs pass. Published main has the same tree as the design base;
reconcile this branch before publication. Current T01 is static design only.

Accepted artifact map adds paged evidence metadata/provenance and nullable link
actor/time migrations in T02, beyond its initially listed handler/contract
paths. This necessary scope is additive and reviewed, not a new evidence store.
No implementation, generated field change or runtime scenario is marked passed.

T01 final baseline verification passes all35 local checks (onecached) in the
fresh worktree: GUI1475/95.43% branches, backend2207/57gated skips/zero failures,
CLI93.8%, contracts/wire/standalone and design/document checks. New static
artifacts add no runtime behavior; future TC001–009 are not claimed executed.
Task01 is complete:1/5 M54 tasks,366 done/30 pending overall. T02 begins with
observed bounded-read/paging/tool/provenance regressions after branch reconciliation.
