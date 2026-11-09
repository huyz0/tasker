---
timestamp: 2026-11-09T12:00:00Z
decision: rejected
---

# M47-T04 independent review

Reliability review finds manual project purge leaves schedules and occurrence
receipts (including frozen bodies) after removing the project. Retention's
shared cascade lacks the common atomic project lock required by ADR-0041.
TC-009 must cover cleanup rollback and purge versus admission/execution on both
dialects. No further backend/history/event/contract blocker was found.

Agent-workflow review finds stale discovery guidance: MCP run_schedule and CLI
run help promise immediate creation and omit each-call-new-intent semantics;
CLI delete help incorrectly promises history removal. Correct descriptions and
regenerate the CLI reference. Optional metadata remains wire-compatible.

T04 stays in progress. Full interim gates were stopped for these corrections;
no interrupted run is counted as verification.
