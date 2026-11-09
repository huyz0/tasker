# M53 — Workflow Correctness progress

## M53-T01 — Design canonical navigation and pending/history interaction

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Define authorized resource scope, one-entry navigation normalization, complete pending/history paging and all-exit task-keyed summary drafts before implementation.
- **Verified**: M28/M51 dependencies are published. Isolated worktree starts at final M47 candidatee34924e while PR #5 CI runs; no M53 publication until M47 base/ledger reconciliation. Existing source and independent preliminary human-workflow review expose concrete scope-close, tier, paging and draft/save races.
- **Notes**: Heavy design task produces UX and executable acceptance plan; ADR-0047 records additive authorized metadata/closed selectors; no new storage/executor or authorization scheme. Existing ADR-0025 URL ownership is retained with authorized entity normalization. Frontend/security standards selected; TDD applies to later implementation. Static design documents have no runtime behavior to drive. Independent research/system decisions from M51 remain the typography/token baseline; do not copy repo design prose uncritically.
- **Next**: Review proposed ADR-0047, UX and TC-001–011. Source-driven plan expansion includes bounded authorized ownership metadata (GetTaskResponse3, GetArtifactResponse2/3) and SQL closed selectors; existing APIs cannot safely supply these through capped client pages or folder scans.

### T01 design review refinement

Independent backend/agent reviews approve the boundary, with explicit coverage
for cursor *position* binding (extraCacheKey previously guards only count), MCP
closed selectors and other required strings. Human review rejects missing
switcher/projectless interaction; design now covers settled auto-selection,
reload/history and deliberate project/org changes, clean-content dirty semantics
and existing URL-backed origin state. Add a real-interceptor stale-approval
regression because direct-handler tests may hide rollback to pending. No
implementation begins before corrected design approval.

Corrected design receives independent v2 approval from human, reliability and
agent-workflow reviewers. ADR-0047 and11 executable acceptance scenarios are
accepted; no implementation has begun. Fresh-source full gates run before T01
closure; M47 final-head real integration is green while remaining CI jobs wait.

Fresh-worktree GUI 1360/95.34% branches passes. Initial full check stops at a
new extra blank line in STATE.md; the ledger formatting is corrected and full
gates rerun without changing production source or coverage thresholds.

T01 final checks pass all35 tasks (33 cached after the fresh full run): baseline
backend2175/zero failures, GUI1360/95.34% branches and CLI gate93.8%. Design
acceptance is reviewed against current readers/switcher/pagination/mutation
boundaries; no runtime implementation is claimed. Next M53-T02 writes the
canonical ownership regressions before API/GUI changes. Overall37 tasks remain.
