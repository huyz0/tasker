# M55 — Attention Center progress

## M55-T01 — Define actionable source truth and grouped flow

- **Status**: in-progress
- **Date**: 2026-11-09
- **Changed**: Define grouped questions, approvals, current-user reviews and stalled claims with source identities, scoped bounded SQL selectors, current permissions and existing resolution paths before code.
- **Verified**: M48/M53 are published; M54 is locally closed as0682bab after all35 checks and reviewed real handoff/database/browser proof. Its final-head CI still gates main publication.
- **Notes**: API/security standards plus TDD selected. Heavy task needs a fresh ADR, UX and executable acceptance plan; static design has no runtime behavior to drive. Reserve existing ADR0043/0044 for planned M57/M58; current highest47 makes ADR0048 available for this boundary. Do not treat capped Dashboard/Reports panels as queues or create another inbox/state machine. Independent source preflight/external design references precede acceptance.
- **Next**: Inspect exact source eligibility/action permissions/archive semantics, record viable alternatives and grouped-navigation judgment, then independent architecture/UX review and full source verification before completion.

Initial static design/preflight proposes ADR0048, UX and TC001–012. Independent
review finds no architectural/visual-direction blocker but requests two precise
acceptance amendments; ARCH-v1/UX-v1 retain them. Current GUI only answers a
question; cancellation is an authorized CLI/RPC/other-client drain path, not a
Cancel question control. Shared organization task-read loss must also fence a
pre-denial in-flight sibling success and same-org cached project switching until
post-denial explicit Retry. Project NotFound is local unavailability, not proof
of organization permission loss. Amendments are written; acceptance review and
full source checks remain pending. No runtime implementation exists.

M54 is published as858e2cf via PR #7 after all8 final-head jobs42715671413 pass.
Its final0682bab source tree equals fetched main exactly. This isolated M55 WIP
is checkpointed before rebasing onto that published base; no user work/services
are reset.26 tasks remain and M55-T01 stays in-progress.
