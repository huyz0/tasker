---
timestamp: 2026-11-09T11:41:00Z
decision: approved
---

# M47-T04 corrected cleanup and guidance

Independent reliability re-review approves common project units/current locks,
current child reads, manual authorization/empty checks inside the boundary, and
current organization retention eligibility. New restore-wins regressions fail
before correction; restored41 focused tests /170 assertions pass. The process
fixture explicitly recognizes permitted reservation conflict in claim/execution;
startup connections are gated before contention so migration-lock failures are
not misreported as recovery evidence. No remaining source blocker found.

Independent agent-workflow re-review approves corrected MCP/CLI/contract help and
the regenerated reference. The first generation used an old local binary; the
corrected reference is generated after building the changed source.

Product/architecture review finds no further defect after ADR wording recognizes
automatic archived-parent retention purge. Actual final browser/Storybook/full
and both-dialect process evidence remain mandatory completion gates.
