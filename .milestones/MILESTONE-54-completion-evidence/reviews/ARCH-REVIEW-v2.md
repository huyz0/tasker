---
timestamp: 2026-11-09T20:06:02Z
decision: approved
---

# M54-T01 final architecture and acceptance review

Independent agent and reliability review approve the amended static design.
Correctness: every evidence page has a bounded metadata source beyond the digest
cap; binary SQL prefixes define Unicode/NUL/truncation behavior without full-body
length reads. Coarse legacy sizeBytes and exact new storedBytes are distinct.
Current archived artifact/folder policy remains readable; missing sources and
archived projects have explicit unavailable semantics.

Coverage: TC001–009 bind thin RPC counts, independent server bounds, SQL-before-
lookup paging, digest opt-in, forward provenance, stale/access-loss behavior,
mutable references, keyboard/layout and old-client/live proofs. These are future
implementation requirements, not claimed runtime passes for this static task.

Architecture: existing artifact ownership/store and one-RPC MCP boundary remain;
no runner, immutable version store, grading, completion gate or assumed event
family is introduced. Legacy omitted fields retain behavior. Paged response
metadata and visible current-page-chain refresh close the initial data-flow gaps.

Security: task-only digests request no artifact authority; opt-in reads require
current artifacts scope/permission. Same-org links do not grant access. Caller
fields cannot forge link actor/time, old rows remain unknown, unavailable nested
names are sanitized and known access loss stops automatic cache reuse. Existing
CreateFolder agent authorization is preserved; only its MCP adapter is omitted.

The fresh field map is verified against M53c82fada, whose tree equals published
main53b47d6. Recheck again before changing/generating contracts. Rejected v1 is
retained. Full local checks still gate task completion; runtime/both-dialect/
compatibility/browser proofs remain mandatory for T02–T05.

```yaml
findings: []
```
